// MIT. Cooperative owner-scoped broker and retained-handle Windows Job supervision.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

internal static class Execution {
    const int MaxFrame = 8388608;
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    static readonly object OutputLock = new object();
    static Stream Output;
    sealed class Failure : Exception { public readonly string Code; public Failure(string code) { Code = code; } }
    static void Need(bool ok, string code) { if (!ok) throw new Failure(code); }
    static void Win(bool ok) { Need(ok, "NATIVE_EXECUTION_UNKNOWN"); }
    static Dictionary<string, object> Obj(object value) { var result = value as Dictionary<string, object>; Need(result != null, "INVALID_NATIVE_REQUEST"); return result; }
    static string Text(Dictionary<string, object> value, string key) { object v; Need(value.TryGetValue(key, out v) && v is string, "INVALID_NATIVE_REQUEST"); return (string)v; }
    static long Number(Dictionary<string, object> value, string key, long max) { object v; Need(value.TryGetValue(key, out v) && v is long && (long)v > 0 && (long)v <= max, "INVALID_NATIVE_REQUEST"); return (long)v; }
    static void Keys(Dictionary<string, object> value, params string[] keys) { Need(value.Count == keys.Length, "INVALID_NATIVE_REQUEST"); foreach (string key in keys) Need(value.ContainsKey(key), "INVALID_NATIVE_REQUEST"); }
    static string Hex(Dictionary<string, object> value, string key) { string s = Text(value, key); Need(s.Length == 64, "INVALID_NATIVE_REQUEST"); foreach (char c in s) Need(c >= '0' && c <= '9' || c >= 'a' && c <= 'f', "INVALID_NATIVE_REQUEST"); return s; }
    static string Id(Dictionary<string, object> value, string key) { string s = Text(value, key); Need(s.Length > 0 && s.Length <= 200, "INVALID_NATIVE_REQUEST"); foreach (char c in s) Need(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == ':' || c == '.', "INVALID_NATIVE_REQUEST"); return s; }
    static string Hash(byte[] bytes) { using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
    static string HashText(string text) { return Hash(Utf8.GetBytes(text)); }
    static string Fresh() { byte[] b = new byte[32]; using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(b); return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant(); }
    static bool EqualSecret(string a, string b) { int difference = a.Length ^ b.Length; for (int i = 0; i < a.Length; i++) difference |= a[i] ^ (i < b.Length ? b[i] : 0); return difference == 0; }
    static Dictionary<string, object> Map(params object[] pairs) { var result = new Dictionary<string, object>(StringComparer.Ordinal); for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]); return result; }
    sealed class NumberLiteral { public readonly string Text; public NumberLiteral(string text) { Text = text; } }
    static string Json(object value) {
        if (value == null) return "null";
        if (value is string) return Platform.Quote((string)value);
        if (value is bool) return (bool)value ? "true" : "false";
        var map = value as Dictionary<string, object>;
        if (map != null) { var b = new StringBuilder("{"); bool first = true; foreach (var pair in map) { if (!first) b.Append(','); first = false; b.Append(Platform.Quote(pair.Key)).Append(':').Append(Json(pair.Value)); } return b.Append('}').ToString(); }
        var list = value as List<object>;
        if (list != null) { var b = new StringBuilder("["); for (int i = 0; i < list.Count; i++) { if (i != 0) b.Append(','); b.Append(Json(list[i])); } return b.Append(']').ToString(); }
        if (value is NumberLiteral) return ((NumberLiteral)value).Text;
        Need(value is long || value is int || value is uint, "INVALID_NATIVE_REQUEST"); return Convert.ToString(value, CultureInfo.InvariantCulture);
    }
    // Strict generic frames: duplicate decoded keys, non-finite numbers, malformed UTF-16 and depth overflow are rejected.
    sealed class Parser {
        readonly string text; int at;
        public Parser(string text) { this.text = text; }
        void Space() { while (at < text.Length && (text[at] == ' ' || text[at] == '\r' || text[at] == '\n' || text[at] == '\t')) at++; }
        void Take(char c) { Space(); Need(at < text.Length && text[at++] == c, "INVALID_NATIVE_REQUEST"); }
        string String() {
            Take('"'); var b = new StringBuilder(); bool closed = false;
            while (at < text.Length) {
                char c = text[at++]; if (c == '"') { closed = true; break; } Need(c >= 32, "INVALID_NATIVE_REQUEST");
                if (c == '\\') { Need(at < text.Length, "INVALID_NATIVE_REQUEST"); c = text[at++]; switch (c) {
                    case '"': case '\\': case '/': break; case 'b': c = '\b'; break; case 'f': c = '\f'; break; case 'n': c = '\n'; break; case 'r': c = '\r'; break; case 't': c = '\t'; break;
                    case 'u': ushort n; Need(at + 4 <= text.Length && ushort.TryParse(text.Substring(at, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out n), "INVALID_NATIVE_REQUEST"); n = ushort.Parse(text.Substring(at, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture); at += 4; c = (char)n; break;
                    default: throw new Failure("INVALID_NATIVE_REQUEST");
                }} b.Append(c);
            }
            Need(closed, "INVALID_NATIVE_REQUEST"); string s = b.ToString(); for (int i = 0; i < s.Length; i++) { if (char.IsHighSurrogate(s[i])) { Need(i + 1 < s.Length && char.IsLowSurrogate(s[++i]), "INVALID_NATIVE_REQUEST"); } else Need(!char.IsLowSurrogate(s[i]), "INVALID_NATIVE_REQUEST"); } return s;
        }
        object Value(int depth) {
            Need(depth < 32, "INVALID_NATIVE_REQUEST"); Space(); Need(at < text.Length, "INVALID_NATIVE_REQUEST"); char c = text[at];
            if (c == '"') return String();
            if (c == '{') { at++; var m = new Dictionary<string, object>(StringComparer.Ordinal); Space(); if (at < text.Length && text[at] == '}') { at++; return m; } while (true) { string k = String(); Need(!m.ContainsKey(k), "INVALID_NATIVE_REQUEST"); Take(':'); m.Add(k, Value(depth + 1)); Space(); Need(at < text.Length, "INVALID_NATIVE_REQUEST"); c = text[at++]; if (c == '}') return m; Need(c == ',', "INVALID_NATIVE_REQUEST"); } }
            if (c == '[') { at++; var a = new List<object>(); Space(); if (at < text.Length && text[at] == ']') { at++; return a; } while (true) { a.Add(Value(depth + 1)); Space(); Need(at < text.Length, "INVALID_NATIVE_REQUEST"); c = text[at++]; if (c == ']') return a; Need(c == ',', "INVALID_NATIVE_REQUEST"); } }
            foreach (string literal in new[] { "true", "false", "null" }) if (at + literal.Length <= text.Length && text.Substring(at, literal.Length) == literal) { at += literal.Length; return literal == "null" ? null : (object)(literal == "true"); }
            int start = at; if (c == '-') at++; Need(at < text.Length && text[at] >= '0' && text[at] <= '9', "INVALID_NATIVE_REQUEST"); if (text[at++] != '0') while (at < text.Length && text[at] >= '0' && text[at] <= '9') at++;
            bool integral = true;
            if (at < text.Length && text[at] == '.') { integral = false; at++; int digits = at; while (at < text.Length && text[at] >= '0' && text[at] <= '9') at++; Need(at > digits, "INVALID_NATIVE_REQUEST"); }
            if (at < text.Length && (text[at] == 'e' || text[at] == 'E')) { integral = false; at++; if (at < text.Length && (text[at] == '+' || text[at] == '-')) at++; int digits = at; while (at < text.Length && text[at] >= '0' && text[at] <= '9') at++; Need(at > digits, "INVALID_NATIVE_REQUEST"); }
            string literalNumber = text.Substring(start, at - start);
            if (integral) { long n; Need(long.TryParse(literalNumber, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out n) && n >= -9007199254740991L && n <= 9007199254740991L, "INVALID_NATIVE_REQUEST"); return n; }
            double number; Need(double.TryParse(literalNumber, NumberStyles.Float, CultureInfo.InvariantCulture, out number) && !double.IsInfinity(number) && !double.IsNaN(number), "INVALID_NATIVE_REQUEST"); return new NumberLiteral(literalNumber);
        }
        public object Parse() { object v = Value(0); Space(); Need(at == text.Length, "INVALID_NATIVE_REQUEST"); return v; }
    }
    static bool ReadExact(Stream stream, byte[] b, bool allowEof) { int at = 0; while (at < b.Length) { int n = stream.Read(b, at, b.Length - at); if (n == 0) { if (allowEof && at == 0) return false; throw new EndOfStreamException(); } at += n; } return true; }
    static object ReadFrame(Stream stream, int limit = MaxFrame) { byte[] h = new byte[4]; if (!ReadExact(stream, h, true)) return null; uint size = (uint)h[0] << 24 | (uint)h[1] << 16 | (uint)h[2] << 8 | h[3]; Need(size > 0 && size <= limit, "NATIVE_PROTOCOL_ERROR"); byte[] b = new byte[(int)size]; ReadExact(stream, b, false); object value = new Parser(Utf8.GetString(b)).Parse(); Need(value != null, "NATIVE_PROTOCOL_ERROR"); return value; }
    static void WriteFrame(Stream stream, object value) { byte[] b = Utf8.GetBytes(Json(value)); Need(b.Length > 0 && b.Length <= MaxFrame, "NATIVE_PROTOCOL_ERROR"); byte[] h = new[] { (byte)(b.Length >> 24), (byte)(b.Length >> 16), (byte)(b.Length >> 8), (byte)b.Length }; stream.Write(h, 0, h.Length); stream.Write(b, 0, b.Length); stream.Flush(); }
    static void Emit(object value) { lock (OutputLock) WriteFrame(Output, value); }
    sealed class Control {
        readonly Stream input; readonly Queue<Dictionary<string, object>> queue = new Queue<Dictionary<string, object>>();
        public volatile bool Eof; public volatile bool Invalid;
        readonly Thread thread;
        public Control(Stream input) { this.input = input; thread = new Thread(Read); thread.IsBackground = true; thread.Start(); }
        // Only complete frames enter the queue; a truncated frame is parent EOF, not a command.
        void Read() { try { bool first = true; while (true) { object value = ReadFrame(input, first ? MaxFrame : 2097152); first = false; if (value == null) break; lock (queue) { Need(queue.Count < 32, "NATIVE_PROTOCOL_ERROR"); queue.Enqueue(Obj(value)); } } } catch (EndOfStreamException) { } catch { Invalid = true; } finally { Eof = true; } }
        public Dictionary<string, object> Next() { lock (queue) return queue.Count == 0 ? null : queue.Dequeue(); }
        public Dictionary<string, object> Await(int timeout) { Stopwatch clock = Stopwatch.StartNew(); while (true) { var value = Next(); if (value != null) return value; Need(!Eof && clock.ElapsedMilliseconds < timeout, "NATIVE_PROTOCOL_ERROR"); Thread.Sleep(10); } }
        public void Close() { input.Dispose(); thread.Join(1000); }
    }
    [StructLayout(LayoutKind.Sequential)] struct SA { public int length; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct SI { public int cb; public string reserved, desktop, title; public uint x, y, xSize, ySize, xCount, yCount, fill, flags; public ushort show, reserved2; public IntPtr reservedPtr, stdin, stdout, stderr; }
    [StructLayout(LayoutKind.Sequential)] struct SIX { public SI startup; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)] struct FT { public uint low, high; }
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)] struct Basic { public long processTime, jobTime; public uint flags; public UIntPtr min, max; public uint active; public UIntPtr affinity; public uint priority, scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct Limits { public Basic basic; public IO io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob; }
    [StructLayout(LayoutKind.Sequential)] struct Accounting { public long userTime, kernelTime, periodUserTime, periodKernelTime; public uint faults, total, active, terminated; }
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr sa, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref Limits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting data, uint size, out uint returned);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool yes);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out FT created, out FT exited, out FT kernel, out FT user);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder text, ref uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessW(string exe, StringBuilder command, IntPtr processSA, IntPtr threadSA, bool inherit, uint flags, IntPtr environment, string cwd, ref SIX startup, out PI process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SA sa, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateNamedPipeW(string name, uint open, uint mode, uint instances, uint outSize, uint inSize, uint timeout, ref SA sa);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool ImpersonateNamedPipeClient(IntPtr pipe);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool RevertToSelf();
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateMutexW(ref SA attributes, bool owner, string name);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenMutexW(uint access, bool inherit, string name);
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityInfo(IntPtr handle, int type, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    static void OwnerAcl(IntPtr handle, int type, string sid) {
        IntPtr owner, group, dacl, sacl, descriptor; Win(GetSecurityInfo(handle, type, 1 | 4, out owner, out group, out dacl, out sacl, out descriptor) == 0);
        try { uint size = GetSecurityDescriptorLength(descriptor); Need(size > 0 && size <= 65536, "BROKER_PEER_DENIED"); byte[] bytes = new byte[(int)size]; Marshal.Copy(descriptor, bytes, 0, bytes.Length); var security = new RawSecurityDescriptor(bytes, 0);
            Need(security.Owner != null && security.Owner.Value == sid && security.DiscretionaryAcl != null && security.DiscretionaryAcl.Count == 1 && (security.ControlFlags & ControlFlags.DiscretionaryAclProtected) != 0, "BROKER_PEER_DENIED");
            var ace = security.DiscretionaryAcl[0] as CommonAce; Need(ace != null && !ace.IsCallback && ace.AceQualifier == AceQualifier.AccessAllowed && ace.SecurityIdentifier.Value == sid && ((ace.AccessMask & 0x10000000) != 0 || (ace.AccessMask & 0x1f0001) == 0x1f0001), "BROKER_PEER_DENIED");
        } finally { LocalFree(descriptor); }
    }
    static string InstanceName(Dictionary<string, object> spec) {
        var authority = Obj(spec["authority"]); var ordered = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (string key in new[] { "projectId", "authorityIncarnation", "coordinatorEpoch", "resourceKey", "fencingToken", "ownerId" }) ordered.Add(key, authority[key]);
        return @"Local\angit-supervisor-" + HashText(Json(Map("authority", ordered, "supervisorId", spec["supervisorId"], "launchIdentity", spec["launchIdentity"])));
    }
    static bool EqualFields(object actual, object expected) {
        var a = Obj(actual); var b = Obj(expected); if (a.Count != b.Count) return false;
        foreach (var field in a) { object value; if (!b.TryGetValue(field.Key, out value) || Json(field.Value) != Json(value)) return false; } return true;
    }
    static IntPtr Lifetime(string name) {
        IntPtr descriptor; uint size; string sid = Platform.OwnerSid(); Win(ConvertStringSecurityDescriptorToSecurityDescriptorW("O:" + sid + "D:P(A;;GA;;;" + sid + ")", 1, out descriptor, out size));
        try { var sa = new SA(); sa.length = Marshal.SizeOf(typeof(SA)); sa.descriptor = descriptor; IntPtr mutex = CreateMutexW(ref sa, false, name); int error = Marshal.GetLastWin32Error(); Need(mutex != IntPtr.Zero, "NATIVE_EXECUTION_UNKNOWN"); try { Need(error != 183, "NATIVE_EXECUTION_UNKNOWN"); OwnerAcl(mutex, 6, sid); return mutex; } catch { CloseHandle(mutex); throw; } }
        finally { LocalFree(descriptor); }
    }
    static string Mac(byte[] key, Dictionary<string, object> value) { using (var mac = new HMACSHA256(key)) return BitConverter.ToString(mac.ComputeHash(Utf8.GetBytes(Json(value)))).Replace("-", "").ToLowerInvariant(); }
    static byte[] ReadBounded(string path, int cap) { using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) { Need(file.Length > 0 && file.Length <= cap, "NATIVE_EXECUTION_UNKNOWN"); byte[] bytes = new byte[(int)file.Length]; ReadExact(file, bytes, false); return bytes; } }
    static void Reconcile(Dictionary<string, object> init) {
        Keys(init, "spec", "process", "receiptPath", "helperHash"); var spec = Obj(init["spec"]); var authority = Obj(spec["authority"]); Authority(authority); string directory = Platform.OrdinaryPath(Text(spec, "artifactDirectory")), path = Platform.OrdinaryPath(Text(init, "receiptPath")); Need(path == System.IO.Path.Combine(directory, "termination.json"), "NATIVE_EXECUTION_UNKNOWN"); string sid = Platform.OwnerSid(); Platform.Inspect(directory, "assertPrivateDirectory", sid); Platform.Inspect(path, "assertPrivateFile", sid);
        string instance = InstanceName(spec); IntPtr live = OpenMutexW(0x00100000, false, instance); int error = Marshal.GetLastWin32Error(); if (live != IntPtr.Zero) { CloseHandle(live); throw new Failure("NATIVE_EXECUTION_UNKNOWN"); } Need(error == 2, "NATIVE_EXECUTION_UNKNOWN");
        var receipt = Obj(new Parser(Utf8.GetString(ReadBounded(path, 65536))).Parse());
        Keys(receipt, "process", "authority", "writerTreeTerminated", "rootExitCode", "observedAtMs", "reason", "stopOperationId", "stdout", "stderr", "receiptPath", "helperHash", "helperProcess", "terminationReceiptHash", "receiptMac");
        Need(EqualFields(receipt["process"], init["process"]) && EqualFields(receipt["authority"], authority) && Text(receipt, "helperHash") == Hex(init, "helperHash") && receipt["writerTreeTerminated"] is bool && (bool)receipt["writerTreeTerminated"] && Text(Obj(receipt["helperProcess"]), "instanceName") == instance, "NATIVE_EXECUTION_UNKNOWN");
        var unsigned = new Dictionary<string, object>(StringComparer.Ordinal); foreach (string k in new[] { "process", "authority", "writerTreeTerminated", "rootExitCode", "observedAtMs", "reason", "stopOperationId", "stdout", "stderr", "receiptPath", "helperHash", "helperProcess" }) unsigned.Add(k, receipt[k]); Need(HashText(Json(unsigned)) == Hex(receipt, "terminationReceiptHash"), "NATIVE_EXECUTION_UNKNOWN"); unsigned.Add("terminationReceiptHash", receipt["terminationReceiptHash"]);
        string keyPath = System.IO.Path.Combine(directory, "receipt.key"); Platform.Inspect(keyPath, "assertPrivateFile", sid); byte[] key = ReadBounded(keyPath, 32); Need(key.Length == 32 && EqualSecret(Mac(key, unsigned), Hex(receipt, "receiptMac")), "NATIVE_EXECUTION_UNKNOWN"); Array.Clear(key, 0, key.Length);
        uint helperPid = (uint)Number(Obj(receipt["helperProcess"]), "pid", uint.MaxValue); IntPtr helper = OpenProcess(0x1000 | 0x100000, false, helperPid); int helperError = Marshal.GetLastWin32Error();
        if (helper != IntPtr.Zero) { try { if (WaitForSingleObject(helper, 0) != 0) Need(ProcessIdentity(helper, helperPid, Hex(init, "helperHash")) != Hex(Obj(receipt["helperProcess"]), "startIdentity"), "NATIVE_EXECUTION_UNKNOWN"); } finally { CloseHandle(helper); } } else Need(helperError == 87, "NATIVE_EXECUTION_UNKNOWN");
        Emit(Map("type", "reconciled", "terminationReceiptHash", receipt["terminationReceiptHash"]));
    }
    static ulong Created(IntPtr process) { FT c, e, k, u; Win(GetProcessTimes(process, out c, out e, out k, out u)); return (ulong)c.high << 32 | c.low; }
    static string ProcessSid(IntPtr process) { IntPtr token; Win(OpenProcessToken(process, 8, out token)); try { using (var identity = new WindowsIdentity(token)) { Need(identity.User != null, "BROKER_PEER_DENIED"); return identity.User.Value; } } finally { CloseHandle(token); } }
    static string ProcessIdentity(IntPtr process, uint pid, string executableHash) { var b = new StringBuilder(4097); uint size = (uint)b.Capacity; Win(QueryFullProcessImageNameW(process, 0, b, ref size)); string path = Platform.OrdinaryPath(b.ToString()); string fileIdentity = Platform.Inspect(path, "identify", Platform.OwnerSid()); return HashText(pid.ToString(CultureInfo.InvariantCulture) + ":" + Created(process).ToString(CultureInfo.InvariantCulture) + ":" + fileIdentity + ":" + executableHash); }
    static string Arg(string value) { Need(value.IndexOf('\0') < 0, "INVALID_NATIVE_REQUEST"); var b = new StringBuilder("\""); int slashes = 0; foreach (char c in value) { if (c == '\\') { slashes++; continue; } b.Append('\\', c == '"' ? slashes * 2 + 1 : slashes).Append(c); slashes = 0; } return b.Append('\\', slashes * 2).Append('"').ToString(); }
    static int Active(IntPtr job) { Accounting data; uint size; Win(QueryInformationJobObject(job, 1, out data, 48, out size)); return checked((int)data.active); }
    static void Authority(Dictionary<string, object> value) { Keys(value, "projectId", "authorityIncarnation", "coordinatorEpoch", "resourceKey", "fencingToken", "ownerId"); Id(value, "projectId"); Hex(value, "authorityIncarnation"); Number(value, "coordinatorEpoch", 9007199254740991L); Id(value, "resourceKey"); Number(value, "fencingToken", 9007199254740991L); Id(value, "ownerId"); }
    sealed class Capture : IDisposable {
        readonly object gate; readonly FileStream input, artifact; readonly long cap; readonly Action exceeded; readonly Thread thread; readonly CaptureBudget total;
        public readonly string Path; public long Bytes; public volatile bool Failed;
        public Capture(IntPtr handle, string path, CaptureBudget total, long cap, Action exceeded) { Path = path; this.total = total; gate = total; this.cap = cap; this.exceeded = exceeded; input = new FileStream(new SafeFileHandle(handle, true), FileAccess.Read, 4096, false); artifact = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough); thread = new Thread(Drain); thread.IsBackground = true; thread.Start(); }
        void Drain() { try { byte[] b = new byte[8192]; int count; while ((count = input.Read(b, 0, b.Length)) != 0) { int keep; lock (gate) { keep = (int)Math.Min(count, Math.Max(0, cap - total.Bytes)); total.Bytes += keep; } if (keep > 0) { artifact.Write(b, 0, keep); Bytes += keep; } if (keep != count) exceeded(); } artifact.Flush(true); } catch { Failed = true; exceeded(); } }
        public Dictionary<string, object> Finish(int deadline) { Need(thread.Join(deadline) && !Failed, "NATIVE_EXECUTION_UNKNOWN"); artifact.Flush(true); using (var stream = new FileStream(Path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) using (var sha = SHA256.Create()) return Map("path", Path, "bytes", Bytes, "sha256", BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant()); }
        public void Dispose() { input.Dispose(); thread.Join(1000); artifact.Dispose(); }
    }
    sealed class CaptureBudget { public long Bytes; }
    static void Supervise(Control control, Dictionary<string, object> init) {
        Keys(init, "spec", "controlNonce", "helperHash"); string nonce = Hex(init, "controlNonce"), helperHash = Hex(init, "helperHash"); var spec = Obj(init["spec"]);
        Keys(spec, "executable", "executableHash", "args", "input", "cwd", "environment", "supervisorId", "launchIdentity", "authority", "budget", "artifactDirectory");
        string exe = Platform.OrdinaryPath(Text(spec, "executable")), cwd = Platform.OrdinaryPath(Text(spec, "cwd")), expected = Hex(spec, "executableHash");
        string basename = System.IO.Path.GetFileName(exe).ToLowerInvariant(); Need(System.IO.Path.GetExtension(exe).Equals(".exe", StringComparison.OrdinalIgnoreCase) && basename != "cmd.exe" && basename != "powershell.exe" && basename != "pwsh.exe" && basename != "wscript.exe" && basename != "cscript.exe" && basename != "mshta.exe" && basename != "bash.exe" && basename != "sh.exe", "EXECUTABLE_DENIED");
        string supervisor = Id(spec, "supervisorId"), launch = Id(spec, "launchIdentity"); var authority = Obj(spec["authority"]); Authority(authority);
        var budget = Obj(spec["budget"]); Keys(budget, "timeoutMs", "maxOutputBytes", "maxProcesses", "heartbeatMs", "stopTimeoutMs"); long timeout = Number(budget, "timeoutMs", 2147483647), cap = Number(budget, "maxOutputBytes", 1073741824), heartbeat = Number(budget, "heartbeatMs", 2147483647); int maxProcesses = (int)Number(budget, "maxProcesses", 1024), stopTimeout = (int)Number(budget, "stopTimeoutMs", 60000);
        string directory = Platform.OrdinaryPath(Text(spec, "artifactDirectory")); Platform.Inspect(directory, "assertPrivateDirectory", Platform.OwnerSid());
        var args = spec["args"] as List<object>; Need(args != null && args.Count <= 256, "INVALID_NATIVE_REQUEST"); var command = new StringBuilder(Arg(exe)); foreach (object argument in args) { Need(argument is string, "INVALID_NATIVE_REQUEST"); command.Append(' ').Append(Arg((string)argument)); } Need(command.Length < 32767, "INVALID_NATIVE_REQUEST");
        var env = Obj(spec["environment"]); var names = new List<string>(env.Keys); names.Sort(StringComparer.OrdinalIgnoreCase); var environment = new StringBuilder(); string prior = null; foreach (string name in names) { Need(name.Length > 0 && name.IndexOfAny(new[] { '=', '\0' }) < 0 && (prior == null || !name.Equals(prior, StringComparison.OrdinalIgnoreCase)) && env[name] is string, "INVALID_NATIVE_REQUEST"); string v = (string)env[name]; Need(v.IndexOf('\0') < 0, "INVALID_NATIVE_REQUEST"); environment.Append(name).Append('=').Append(v).Append('\0'); prior = name; } environment.Append('\0'); if (names.Count == 0) environment.Append('\0'); Need(environment.Length <= 32767, "INVALID_NATIVE_REQUEST");
        byte[] providerInput = Utf8.GetBytes(Text(spec, "input")); Need(providerInput.Length <= 1048576, "INVALID_NATIVE_REQUEST");
        IntPtr job = IntPtr.Zero, stdin = IntPtr.Zero, inputWrite = IntPtr.Zero, outRead = IntPtr.Zero, outWrite = IntPtr.Zero, errRead = IntPtr.Zero, errWrite = IntPtr.Zero, list = IntPtr.Zero, handles = IntPtr.Zero, envPointer = IntPtr.Zero; PI process = new PI(); bool assigned = false; Capture stdout = null, stderr = null; FileStream providerStdin = null; Thread inputThread = null; int outputExceeded = 0;
        IntPtr lifetime = IntPtr.Zero; byte[] receiptKey = new byte[32]; var helperProcess = Map("pid", GetCurrentProcessId(), "startIdentity", ProcessIdentity(GetCurrentProcess(), GetCurrentProcessId(), helperHash), "instanceName", InstanceName(spec));
        try {
            lifetime = Lifetime(Text(helperProcess, "instanceName")); using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(receiptKey);
            string keyPath = System.IO.Path.Combine(directory, "receipt.key"); using (var key = new FileStream(keyPath, FileMode.CreateNew, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough)) { key.Write(receiptKey, 0, receiptKey.Length); key.Flush(true); } Platform.Inspect(keyPath, "assertPrivateFile", Platform.OwnerSid());
            // Retain a deny-write/delete executable handle through process creation and termination.
            using (var executable = new FileStream(exe, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                Need(executable.Length > 0 && executable.Length <= 268435456, "EXECUTABLE_DENIED"); using (var sha = SHA256.Create()) Need(BitConverter.ToString(sha.ComputeHash(executable)).Replace("-", "").ToLowerInvariant() == expected, "EXECUTABLE_IDENTITY_MISMATCH");
                job = CreateJobObjectW(IntPtr.Zero, null); Win(job != IntPtr.Zero); var limits = new Limits(); limits.basic.flags = 0x2000 | 8; limits.basic.active = (uint)maxProcesses; Win(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(Limits))));
                SA sa = new SA(); sa.length = Marshal.SizeOf(typeof(SA)); sa.inherit = 1;
                Win(CreatePipe(out outRead, out outWrite, ref sa, 0)); Win(CreatePipe(out errRead, out errWrite, ref sa, 0)); Win(CreatePipe(out stdin, out inputWrite, ref sa, 0)); Win(SetHandleInformation(outRead, 1, 0)); Win(SetHandleInformation(errRead, 1, 0)); Win(SetHandleInformation(inputWrite, 1, 0));
                IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size); Need(size.ToInt64() > 0 && size.ToInt64() < 65536, "NATIVE_EXECUTION_UNKNOWN"); list = Marshal.AllocHGlobal(size); Win(InitializeProcThreadAttributeList(list, 1, 0, ref size)); handles = Marshal.AllocHGlobal(IntPtr.Size * 3); Marshal.WriteIntPtr(handles, stdin); Marshal.WriteIntPtr(handles, IntPtr.Size, outWrite); Marshal.WriteIntPtr(handles, IntPtr.Size * 2, errWrite); Win(UpdateProcThreadAttribute(list, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
                var si = new SIX(); si.startup.cb = Marshal.SizeOf(typeof(SIX)); si.startup.flags = 0x100; si.startup.stdin = stdin; si.startup.stdout = outWrite; si.startup.stderr = errWrite; si.attributes = list; envPointer = Marshal.StringToHGlobalUni(environment.ToString());
                Win(CreateProcessW(exe, command, IntPtr.Zero, IntPtr.Zero, true, 4 | 0x80000 | 0x400 | 0x08000000, envPointer, cwd, ref si, out process));
                Win(AssignProcessToJobObject(job, process.process)); assigned = true; bool inJob; Win(IsProcessInJob(process.process, job, out inJob)); Need(inJob, "NATIVE_EXECUTION_UNKNOWN");
                CloseHandle(outWrite); outWrite = IntPtr.Zero; CloseHandle(errWrite); errWrite = IntPtr.Zero; CloseHandle(stdin); stdin = IntPtr.Zero;
                var total = new CaptureBudget(); Action exceeded = delegate { Interlocked.Exchange(ref outputExceeded, 1); };
                providerStdin = new FileStream(new SafeFileHandle(inputWrite, true), FileAccess.Write, 4096, false); inputWrite = IntPtr.Zero;
                stdout = new Capture(outRead, System.IO.Path.Combine(directory, "stdout.bin"), total, cap, exceeded); outRead = IntPtr.Zero; stderr = new Capture(errRead, System.IO.Path.Combine(directory, "stderr.bin"), total, cap, exceeded); errRead = IntPtr.Zero;
                var receipt = Map("supervisorId", supervisor, "launchIdentity", launch, "pid", process.pid, "startIdentity", ProcessIdentity(process.process, process.pid, expected), "executableHash", expected, "descendantScopeHash", HashText(Json(Map("supervisorId", supervisor, "launchIdentity", launch, "authority", authority, "rootCreated", Created(process.process).ToString(CultureInfo.InvariantCulture), "maxProcesses", maxProcesses, "jobLimits", "active-process-cap;kill-on-close;no-breakaway"))));
                Stopwatch clock = Stopwatch.StartNew(); long lastPulse = 0; bool resumed = false, stopped = false; long stopAt = 0; string reason = "exit", stopOperation = null;
                try { Emit(Map("type", "started", "process", receipt)); } catch (IOException) { stopped = true; reason = "control_loss"; }
                while (true) {
                    var message = stopped ? null : control.Next(); while (message != null && !stopped && !control.Invalid) {
                        try {
                            Need(EqualSecret(Hex(message, "controlNonce"), nonce), "NATIVE_PROTOCOL_ERROR"); string op = Text(message, "op");
                            if (op == "pulse") { Keys(message, "op", "controlNonce"); lastPulse = clock.ElapsedMilliseconds; }
                            else if (op == "stop") { Keys(message, "op", "controlNonce", "stopOperationId"); stopOperation = Id(message, "stopOperationId"); reason = "stop"; stopped = true; }
                            else if (op == "resume") {
                                Keys(message, "op", "controlNonce"); Need(!resumed, "NATIVE_PROTOCOL_ERROR"); Win(ResumeThread(process.thread) == 1); resumed = true;
                                inputThread = new Thread(delegate() { try { providerStdin.Write(providerInput, 0, providerInput.Length); providerStdin.Flush(); } catch (IOException) { } finally { providerStdin.Dispose(); } }); inputThread.IsBackground = true; inputThread.Start();
                                try { Emit(Map("type", "resumed")); } catch (IOException) { stopped = true; reason = "control_loss"; }
                            }
                            else if (op == "start_callback_failure") { Keys(message, "op", "controlNonce"); reason = "start_callback_failure"; stopped = true; }
                            else throw new Failure("NATIVE_PROTOCOL_ERROR");
                        } catch (Failure error) {
                            if (error.Code != "NATIVE_PROTOCOL_ERROR" && error.Code != "INVALID_NATIVE_REQUEST") throw;
                            stopped = true; reason = "control_loss";
                        }
                        message = stopped ? null : control.Next();
                    }
                    if (!stopped && control.Invalid) { stopped = true; reason = "control_loss"; }
                    if (!stopped && control.Eof) { stopped = true; reason = control.Invalid ? "control_loss" : "parent_eof"; }
                    if (!stopped && clock.ElapsedMilliseconds - lastPulse >= heartbeat) { stopped = true; reason = "heartbeat"; }
                    if (!stopped && clock.ElapsedMilliseconds >= timeout) { stopped = true; reason = "timeout"; }
                    if (!stopped && Interlocked.CompareExchange(ref outputExceeded, 0, 0) != 0) { stopped = true; reason = "output_limit"; }
                    if (stopped && stopAt == 0) { Win(TerminateJobObject(job, 125)); stopAt = clock.ElapsedMilliseconds + 1; }
                    bool rootEnded = WaitForSingleObject(process.process, 0) == 0; int active = Active(job); Need(active >= 0 && active <= maxProcesses, "NATIVE_EXECUTION_UNKNOWN");
                    if (rootEnded && active == 0) break;
                    Need(stopAt == 0 || clock.ElapsedMilliseconds - stopAt < stopTimeout, "NATIVE_EXECUTION_UNKNOWN"); Thread.Sleep(10);
                }
                uint exitCode; Win(GetExitCodeProcess(process.process, out exitCode)); var outReceipt = stdout.Finish(stopTimeout); var errReceipt = stderr.Finish(stopTimeout); Need(WaitForSingleObject(process.process, 0) == 0 && Active(job) == 0, "NATIVE_EXECUTION_UNKNOWN");
                if (reason == "exit" && Interlocked.CompareExchange(ref outputExceeded, 0, 0) != 0) reason = "output_limit";
                if (inputThread != null) Need(inputThread.Join(stopTimeout), "NATIVE_EXECUTION_UNKNOWN");
                string receiptPath = System.IO.Path.Combine(directory, "termination.json"); var final = Map("process", receipt, "authority", authority, "writerTreeTerminated", true, "rootExitCode", exitCode, "observedAtMs", (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds, "reason", reason, "stopOperationId", stopOperation, "stdout", outReceipt, "stderr", errReceipt, "receiptPath", receiptPath, "helperHash", helperHash);
                final.Add("helperProcess", helperProcess);
                final.Add("terminationReceiptHash", HashText(Json(final))); final.Add("receiptMac", Mac(receiptKey, final)); byte[] bytes = Utf8.GetBytes(Json(final)); using (var file = new FileStream(receiptPath, FileMode.CreateNew, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); } Platform.Inspect(receiptPath, "assertPrivateFile", Platform.OwnerSid());
                // EOF can remove the parent reader: durability, not successful delivery, is the proof source.
                try { Emit(Map("type", "terminated", "receipt", final)); } catch (IOException) { }
            }
        } finally {
            if (process.process != IntPtr.Zero && WaitForSingleObject(process.process, 0) != 0) { if (assigned) TerminateJobObject(job, 126); else TerminateProcess(process.process, 126); WaitForSingleObject(process.process, (uint)stopTimeout); }
            if (job != IntPtr.Zero) CloseHandle(job);
            if (stdout != null) stdout.Dispose(); if (stderr != null) stderr.Dispose();
            if (providerStdin != null) providerStdin.Dispose(); if (inputThread != null) inputThread.Join(stopTimeout);
            foreach (IntPtr h in new[] { process.thread, process.process, stdin, inputWrite, outRead, outWrite, errRead, errWrite }) if (h != IntPtr.Zero && h != new IntPtr(-1)) CloseHandle(h);
            if (list != IntPtr.Zero) { DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); } if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles); if (envPointer != IntPtr.Zero) Marshal.FreeHGlobal(envPointer);
            if (lifetime != IntPtr.Zero) CloseHandle(lifetime); Array.Clear(receiptKey, 0, receiptKey.Length);
        }
    }
    static void Descriptor(Dictionary<string, object> d) { Keys(d, "pipeName", "scopeHandle", "ownerSid", "projectId", "authorityIncarnation", "coordinatorEpoch"); string name = Id(d, "pipeName"); Need(name.StartsWith("angit-", StringComparison.Ordinal) && name.Length <= 180, "INVALID_NATIVE_REQUEST"); Hex(d, "scopeHandle"); Need(Text(d, "ownerSid") == Platform.OwnerSid(), "BROKER_PEER_DENIED"); Id(d, "projectId"); Hex(d, "authorityIncarnation"); Number(d, "coordinatorEpoch", 9007199254740991L); }
    static Dictionary<string, object> Binding(Dictionary<string, object> d, string client, string server) { return Map("projectId", d["projectId"], "authorityIncarnation", d["authorityIncarnation"], "coordinatorEpoch", d["coordinatorEpoch"], "clientNonce", client, "serverNonce", server); }
    static void CheckBinding(Dictionary<string, object> message, Dictionary<string, object> d, string client, string server) { Keys(message, "projectId", "authorityIncarnation", "coordinatorEpoch", "clientNonce", "serverNonce"); Need(EqualFields(message, Binding(d, client, server)), "BROKER_SCOPE_DENIED"); }
    static NamedPipeServerStream NewPipe(Dictionary<string, object> d) {
        string sid = Text(d, "ownerSid"); IntPtr descriptor; uint size; Win(ConvertStringSecurityDescriptorToSecurityDescriptorW("O:" + sid + "D:P(A;;GA;;;" + sid + ")", 1, out descriptor, out size));
        try { var sa = new SA(); sa.length = Marshal.SizeOf(typeof(SA)); sa.descriptor = descriptor; IntPtr pipe = CreateNamedPipeW("\\\\.\\pipe\\" + Text(d, "pipeName"), 3 | 0x40000000 | 0x80000, 8, 1, 65540, 65540, 5000, ref sa); Need(pipe != new IntPtr(-1), "BROKER_BIND_DENIED"); var safe = new SafePipeHandle(pipe, true); try { OwnerAcl(pipe, 1, sid); return new NamedPipeServerStream(PipeDirection.InOut, true, false, safe); } catch { safe.Dispose(); throw; } }
        finally { LocalFree(descriptor); }
    }
    static object BoundedPipeRead(PipeStream pipe, Control control, int deadline) {
        object value = null; Exception failure = null; var thread = new Thread(delegate() { try { value = ReadFrame(pipe, 2097152); } catch (Exception ex) { failure = ex; } }); thread.IsBackground = true; thread.Start(); Stopwatch clock = Stopwatch.StartNew(); while (!thread.Join(10)) if (control.Eof || clock.ElapsedMilliseconds >= deadline) { pipe.Dispose(); thread.Join(1000); throw new Failure("BROKER_REQUEST_DENIED"); } Need(failure == null && value != null, "BROKER_REQUEST_DENIED"); return value;
    }
    static void Server(Control control, Dictionary<string, object> init) {
        Keys(init, "descriptor"); var d = Obj(init["descriptor"]); Descriptor(d); bool first = true;
        while (!control.Eof) using (var pipe = NewPipe(d)) {
            IAsyncResult connect = pipe.BeginWaitForConnection(null, null); if (first) { Emit(Map("type", "ready")); first = false; }
            while (!connect.AsyncWaitHandle.WaitOne(20)) { var close = control.Next(); if (close != null) { Keys(close, "op"); Need(Text(close, "op") == "close", "NATIVE_PROTOCOL_ERROR"); return; } if (control.Eof) return; }
            pipe.EndWaitForConnection(connect); IntPtr peer = IntPtr.Zero;
            try {
                var hello = Obj(BoundedPipeRead(pipe, control, 5000)); Keys(hello, "scopeHandle", "clientNonce", "projectId", "authorityIncarnation", "coordinatorEpoch");
                Need(EqualSecret(Hex(hello, "scopeHandle"), Text(d, "scopeHandle")) && Text(hello, "projectId") == Text(d, "projectId") && Text(hello, "authorityIncarnation") == Text(d, "authorityIncarnation") && Number(hello, "coordinatorEpoch", 9007199254740991L) == Number(d, "coordinatorEpoch", 9007199254740991L), "BROKER_SCOPE_DENIED");
                uint pid; Win(GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out pid)); peer = OpenProcess(0x1000 | 0x100000, false, pid); Win(peer != IntPtr.Zero); Need(ProcessSid(peer) == Text(d, "ownerSid"), "BROKER_PEER_DENIED");
                Win(ImpersonateNamedPipeClient(pipe.SafePipeHandle.DangerousGetHandle())); try { using (var identity = WindowsIdentity.GetCurrent(true)) Need(identity != null && identity.User != null && identity.User.Value == Text(d, "ownerSid"), "BROKER_PEER_DENIED"); } finally { Win(RevertToSelf()); }
                string start = ProcessIdentity(peer, pid, ""), client = Hex(hello, "clientNonce"), server = Fresh(); var binding = Binding(d, client, server); WriteFrame(pipe, binding); CheckBinding(Obj(BoundedPipeRead(pipe, control, 5000)), d, client, server);
                var request = Obj(BoundedPipeRead(pipe, control, 5000)); Keys(request, "requestId", "request"); string requestId = Hex(request, "requestId"); Need(WaitForSingleObject(peer, 0) == 258 && ProcessIdentity(peer, pid, "") == start, "BROKER_PEER_DENIED");
                Emit(Map("type", "request", "requestId", requestId, "peerSid", Text(d, "ownerSid"), "clientPid", pid, "clientStartIdentity", start, "request", request["request"]));
                Stopwatch clock = Stopwatch.StartNew(); Dictionary<string, object> reply = null;
                while (reply == null) {
                    Need(!control.Eof && clock.ElapsedMilliseconds < 30000, "BROKER_REQUEST_DENIED"); var candidate = control.Next();
                    if (candidate != null) {
                        string op = Text(candidate, "op"); if (op == "close") return;
                        Keys(candidate, "op", "requestId", "reply"); Need(op == "reply", "NATIVE_PROTOCOL_ERROR");
                        if (Text(candidate, "requestId") == requestId) reply = candidate;
                    }
                    Thread.Sleep(10);
                }
                if (Text(reply, "op") == "close") return;
                Keys(reply, "op", "requestId", "reply"); Need(Text(reply, "op") == "reply" && Text(reply, "requestId") == requestId, "NATIVE_PROTOCOL_ERROR"); WriteFrame(pipe, Map("requestId", requestId, "reply", reply["reply"]));
            } catch (Failure) { try { WriteFrame(pipe, Map("error", "BROKER_REQUEST_DENIED")); } catch { } }
            catch (IOException) { }
            finally { if (peer != IntPtr.Zero) CloseHandle(peer); }
        }
    }
    static Dictionary<string, object> PipeReply(object value) {
        var reply = Obj(value); object error;
        if (reply.TryGetValue("error", out error)) {
            Keys(reply, "error"); Need(error is string && (string)error == "BROKER_REQUEST_DENIED", "NATIVE_PROTOCOL_ERROR");
            throw new Failure("BROKER_REQUEST_DENIED");
        }
        return reply;
    }
    static void Client(Control control, Dictionary<string, object> init) {
        Keys(init, "descriptor", "request"); var d = Obj(init["descriptor"]); Descriptor(d);
        using (var pipe = new NamedPipeClientStream(".", Text(d, "pipeName"), PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification)) {
            pipe.Connect(5000); uint serverPid; Win(GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out serverPid)); IntPtr server = OpenProcess(0x1000 | 0x100000, false, serverPid); Win(server != IntPtr.Zero);
            try { Need(ProcessSid(server) == Text(d, "ownerSid"), "BROKER_PEER_DENIED"); string client = Fresh(); WriteFrame(pipe, Map("scopeHandle", d["scopeHandle"], "clientNonce", client, "projectId", d["projectId"], "authorityIncarnation", d["authorityIncarnation"], "coordinatorEpoch", d["coordinatorEpoch"])); var binding = PipeReply(BoundedPipeRead(pipe, control, 5000)); string nonce = Hex(binding, "serverNonce"); CheckBinding(binding, d, client, nonce); WriteFrame(pipe, Binding(d, client, nonce)); string request = Fresh(); WriteFrame(pipe, Map("requestId", request, "request", init["request"])); var response = PipeReply(BoundedPipeRead(pipe, control, 30000)); Keys(response, "requestId", "reply"); Need(Text(response, "requestId") == request, "NATIVE_PROTOCOL_ERROR"); Emit(Map("type", "reply", "reply", response["reply"])); }
            finally { CloseHandle(server); }
        }
    }
    public static int Main(string[] args) {
        Control control = null;
        try { Need(Environment.OSVersion.Platform == PlatformID.Win32NT && IntPtr.Size == 8, "UNSUPPORTED_PLATFORM"); Need(args.Length == 1 && (args[0] == "--broker-v1" || args[0] == "--client-v1" || args[0] == "--supervisor-v1" || args[0] == "--receipt-v1"), "INVALID_NATIVE_REQUEST"); Output = Console.OpenStandardOutput(); control = new Control(Console.OpenStandardInput()); var init = control.Await(5000); if (args[0] == "--supervisor-v1") Supervise(control, init); else if (args[0] == "--broker-v1") Server(control, init); else if (args[0] == "--receipt-v1") Reconcile(init); else Client(control, init); return 0; }
        catch (Exception error) { string code = error is Failure ? ((Failure)error).Code : "NATIVE_EXECUTION_UNKNOWN"; try { Emit(Map("type", "error", "code", code)); } catch { } return 2; }
        finally { if (control != null) control.Close(); if (Output != null) Output.Dispose(); }
    }
}
