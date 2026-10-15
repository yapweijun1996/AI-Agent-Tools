// Disposable Stage 0 feasibility only. Not a product supervisor or security certification.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class AngitWindowsProbe
{
    const uint WAIT_OBJECT_0 = 0, WAIT_TIMEOUT = 258;
    const uint QUERY = 0x1000, SYNCHRONIZE = 0x100000, TOKEN_QUERY = 8, TOKEN_DUPLICATE = 2;
    const uint CREATE_SUSPENDED = 4, KILL_ON_JOB_CLOSE = 0x2000;
    static readonly IntPtr Invalid = new IntPtr(-1);
    const int DeadlineMs = 5000;
    static readonly string[] Required = {
        "canonical_directory_identity", "canonical_file_identity", "pipe_acl_readback",
        "pipe_owner_admission", "pipe_nonowner_restricted_token_denied", "pipe_connected_peer_identity",
        "pipe_remote_rejection_enabled", "job_limits_no_breakaway", "job_breakaway_denied", "process_created_before_execution",
        "job_assigned_before_resume", "launch_arguments_roundtrip", "descendant_job_ownership",
        "root_exit_distinct_from_creation", "descendant_retained_after_root_exit",
        "identity_mismatch_rejected", "kill_on_job_close_descendant_exit", "job_stop_root_and_descendant",
        "unrelated_fixture_survives", "fixture_cleanup"
    };

    [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int length; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
        public int cb; public string reserved, desktop, title; public uint x, y, xSize, ySize, xCount, yCount, fill, flags;
        public ushort show, reserved2; public IntPtr reservedPtr, stdin, stdout, stderr;
    }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint low, high; }
    [StructLayout(LayoutKind.Sequential)] struct BY_HANDLE_FILE_INFORMATION {
        public uint attributes; public FILETIME created, accessed, written; public uint volume, sizeHigh, sizeLow, links, indexHigh, indexLow;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMITS {
        public long processTime, jobTime; public uint flags; public UIntPtr minWorkingSet, maxWorkingSet;
        public uint activeLimit; public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMITS {
        public BASIC_LIMITS basic; public IO_COUNTERS io; public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct OVERLAPPED { public UIntPtr internalValue, internalHigh; public uint offset, offsetHigh; public IntPtr evt; }
    [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr sid; public uint attributes; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct OSVERSION {
        public uint size, major, minor, build, platform; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string servicePack;
        public ushort serviceMajor, serviceMinor, suite; public byte product, reserved;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sa, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(IntPtr handle, out BY_HANDLE_FILE_INFORMATION info);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandleW(IntPtr handle, StringBuilder path, uint length, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DeviceIoControl(IntPtr handle, uint code, byte[] input, int inputLength, IntPtr output, int outputLength, out int returned, IntPtr overlapped);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateNamedPipeW(string name, uint openMode, uint pipeMode, uint instances, uint outSize, uint inSize, uint timeout, ref SECURITY_ATTRIBUTES sa);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ConnectNamedPipe(IntPtr pipe, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadFile(IntPtr handle, IntPtr buffer, uint length, out uint read, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool WriteFile(IntPtr handle, byte[] buffer, uint length, out uint written, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetOverlappedResult(IntPtr handle, IntPtr overlapped, out uint transferred, bool wait);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CancelIoEx(IntPtr handle, IntPtr overlapped);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateEventW(IntPtr sa, bool manual, bool initial, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint pid);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool ImpersonateNamedPipeClient(IntPtr pipe);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool RevertToSelf();
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool ImpersonateLoggedOnUser(IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr token, uint flags, uint disableCount, IntPtr disable, uint deleteCount, IntPtr delete, uint restrictedCount, [In] SID_AND_ATTRIBUTES[] restricted, out IntPtr result);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr data, uint length, out uint returned);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityInfo(IntPtr handle, int objectType, uint info, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr ptr);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessW(string executable, StringBuilder commandLine, IntPtr processSa, IntPtr threadSa, bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPINFO startup, out PROCESS_INFORMATION info);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr sa, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref EXTENDED_LIMITS info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint size, out uint returned);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out FILETIME created, out FILETIME exited, out FILETIME kernel, out FILETIME user);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("ntdll.dll", CharSet = CharSet.Unicode)] static extern int RtlGetVersion(ref OSVERSION version);

    sealed class Owned : IDisposable {
        public PROCESS_INFORMATION Info;
        public ulong Created;
        public bool Assigned;
        public void Dispose() {
            if (Info.process != IntPtr.Zero) {
                // Assigned fixtures are stopped by closing their owned kill-on-close job.
                // Observe that asynchronous termination before disposing the retained handle.
                if (Assigned) {
                    Need(WaitForSingleObject(Info.process, DeadlineMs) == WAIT_OBJECT_0, "cleanup owned job fixture exit deadline");
                } else if (WaitForSingleObject(Info.process, 0) == WAIT_TIMEOUT) {
                    Need(TerminateProcess(Info.process, 91), "cleanup TerminateProcess owned unassigned fixture");
                    Need(WaitForSingleObject(Info.process, DeadlineMs) == WAIT_OBJECT_0, "cleanup fixture exit deadline");
                }
                CloseHandle(Info.process); Info.process = IntPtr.Zero;
            }
            if (Info.thread != IntPtr.Zero) { CloseHandle(Info.thread); Info.thread = IntPtr.Zero; }
        }
    }
    sealed class Checks {
        public List<Dictionary<string, object>> Items = new List<Dictionary<string, object>>();
        public void Add(string id, bool pass, object detail) { AddStatus(id, pass ? "pass" : "fail", detail, true); }
        public void AddStatus(string id, string status, object detail, bool required) {
            Items.Add(new Dictionary<string, object> { { "id", id }, { "status", status }, { "required", required }, { "details", detail } });
        }
        public void Error(string id, Exception ex) {
            Win32Exception native = ex as Win32Exception;
            AddStatus(id, "fail", new { message = ex.Message, exception = ex.GetType().FullName, win32Error = native == null ? (int?)null : native.NativeErrorCode }, true);
        }
        public bool Complete() {
            foreach (string id in Required) if (!Items.Exists(x => (string)x["id"] == id))
                AddStatus(id, "blocked", "Prerequisite failed; no success inferred.", true);
            return !Items.Exists(x => (bool)x["required"] && (string)x["status"] != "pass");
        }
    }
    static void Need(bool ok, string operation) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); }
    static ulong Stamp(FILETIME t) { return ((ulong)t.high << 32) | t.low; }
    static ulong Created(IntPtr process) {
        FILETIME c, e, k, u; Need(GetProcessTimes(process, out c, out e, out k, out u), "GetProcessTimes"); return Stamp(c);
    }
    static string Sid(IntPtr process) {
        IntPtr token; Need(OpenProcessToken(process, TOKEN_QUERY, out token), "OpenProcessToken");
        try {
            uint size; GetTokenInformation(token, 1, IntPtr.Zero, 0, out size);
            IntPtr data = Marshal.AllocHGlobal((int)size);
            try { Need(GetTokenInformation(token, 1, data, size, out size), "GetTokenInformation(TokenUser)"); return new SecurityIdentifier(Marshal.ReadIntPtr(data)).Value; }
            finally { Marshal.FreeHGlobal(data); }
        } finally { CloseHandle(token); }
    }
    // Windows CRT argument encoding, with lpApplicationName separately supplied: no shell.
    static string Quote(string value) {
        StringBuilder b = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { b.Append('\\', slashes * 2 + 1); b.Append(c); }
            else { b.Append('\\', slashes); b.Append(c); }
            slashes = 0;
        }
        b.Append('\\', slashes * 2); b.Append('"'); return b.ToString();
    }
    static Owned Spawn(string exe, string cwd, params string[] args) {
        StringBuilder command = new StringBuilder(Quote(exe)); foreach (string arg in args) command.Append(' ').Append(Quote(arg));
        STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); PROCESS_INFORMATION pi;
        Need(CreateProcessW(exe, command, IntPtr.Zero, IntPtr.Zero, false, CREATE_SUSPENDED, IntPtr.Zero, cwd, ref si, out pi), "CreateProcessW CREATE_SUSPENDED");
        Owned p = new Owned { Info = pi };
        try { p.Created = Created(pi.process); return p; } catch { p.Dispose(); throw; }
    }
    static IntPtr NewJob() {
        IntPtr job = CreateJobObjectW(IntPtr.Zero, null); Need(job != IntPtr.Zero, "CreateJobObjectW");
        try {
            EXTENDED_LIMITS limits = new EXTENDED_LIMITS(); limits.basic.flags = KILL_ON_JOB_CLOSE;
            Need(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(EXTENDED_LIMITS))), "SetInformationJobObject kill-on-close"); return job;
        } catch { CloseHandle(job); throw; }
    }
    static void AssignAndResume(Owned p, IntPtr job) {
        Need(AssignProcessToJobObject(job, p.Info.process), "AssignProcessToJobObject (nested-job compatibility required)"); p.Assigned = true;
        Need(ResumeThread(p.Info.thread) == 1, "ResumeThread expected suspended count 1");
    }
    static bool InJob(IntPtr process, IntPtr job) { bool yes; Need(IsProcessInJob(process, job, out yes), "IsProcessInJob"); return yes; }
    static List<uint> JobPids(IntPtr job) {
        const int bytes = 4096; IntPtr buffer = Marshal.AllocHGlobal(bytes);
        try {
            uint returned; Need(QueryInformationJobObject(job, 3, buffer, bytes, out returned), "QueryInformationJobObject process ID list");
            int assigned = Marshal.ReadInt32(buffer), count = Marshal.ReadInt32(buffer, 4);
            if (count < 0 || count > 32 || assigned != count) throw new InvalidOperationException("Incomplete or unexpectedly large fixture job process list.");
            List<uint> ids = new List<uint>();
            for (int i = 0; i < count; i++) ids.Add((uint)Marshal.ReadIntPtr(buffer, 8 + i * IntPtr.Size).ToInt64()); return ids;
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    static void Until(Func<bool> condition, string description) {
        Stopwatch clock = Stopwatch.StartNew();
        while (!condition()) { if (clock.ElapsedMilliseconds >= DeadlineMs) throw new TimeoutException(description); Thread.Sleep(20); }
    }
    static void WaitFile(string path) {
        Until(() => {
            foreach (string failure in new[] { path + ".error.json", Path.Combine(Path.GetDirectoryName(path), "fixture-error.json") })
                if (File.Exists(failure)) throw new InvalidOperationException("Exact inert fixture failure: " + File.ReadAllText(failure));
            return File.Exists(path);
        }, "Fixture receipt deadline: " + Path.GetFileName(path));
    }
    static void Receipt(string path, string value) {
        string temporary = path + ".pending"; File.WriteAllText(temporary, value); File.Move(temporary, path);
    }
    static Dictionary<string, object> Identity(string path) {
        IntPtr h = CreateFileW(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero); Need(h != Invalid, "Open canonical filesystem identity");
        try {
            BY_HANDLE_FILE_INFORMATION info; Need(GetFileInformationByHandle(h, out info), "GetFileInformationByHandle");
            StringBuilder final = new StringBuilder(32768); uint n = GetFinalPathNameByHandleW(h, final, (uint)final.Capacity, 0);
            Need(n > 0 && n < final.Capacity, "GetFinalPathNameByHandleW bounded path");
            return new Dictionary<string, object> { { "volumeSerial", info.volume }, { "fileId", ((ulong)info.indexHigh << 32 | info.indexLow).ToString("x16") }, { "finalPath", final.ToString() } };
        } finally { CloseHandle(h); }
    }
    static bool EqualId(Dictionary<string, object> a, Dictionary<string, object> b) { return a["volumeSerial"].Equals(b["volumeSerial"]) && a["fileId"].Equals(b["fileId"]); }
    static void Junction(string alias, string target) {
        Directory.CreateDirectory(alias);
        byte[] substitute = Encoding.Unicode.GetBytes("\\??\\" + target), print = Encoding.Unicode.GetBytes(target);
        byte[] data = new byte[16 + substitute.Length + 2 + print.Length + 2];
        Buffer.BlockCopy(BitConverter.GetBytes(0xa0000003u), 0, data, 0, 4);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)(data.Length - 8)), 0, data, 4, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)substitute.Length), 0, data, 10, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)(substitute.Length + 2)), 0, data, 12, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)print.Length), 0, data, 14, 2);
        Buffer.BlockCopy(substitute, 0, data, 16, substitute.Length); Buffer.BlockCopy(print, 0, data, 18 + substitute.Length, print.Length);
        IntPtr h = CreateFileW(alias, 0x40000000, 0, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero); Need(h != Invalid, "Open junction fixture");
        try { int returned; Need(DeviceIoControl(h, 0x900a4, data, data.Length, IntPtr.Zero, 0, out returned, IntPtr.Zero), "FSCTL_SET_REPARSE_POINT junction"); }
        finally { CloseHandle(h); }
    }
    static void Filesystem(Checks c, string root) {
        string target = Path.Combine(root, "Mixed Case Directory"), alias = Path.Combine(root, "Junction Alias");
        try {
            Directory.CreateDirectory(target); File.WriteAllText(Path.Combine(target, "Identity File.txt"), "fixed inert identity fixture"); Junction(alias, target);
            Dictionary<string, object> direct = Identity(target), junction = Identity(alias), casing = Identity(target.ToUpperInvariant());
            c.Add("canonical_directory_identity", EqualId(direct, junction) && EqualId(direct, casing), new { direct, junction, caseAlias = casing });
            direct = Identity(Path.Combine(target, "Identity File.txt")); junction = Identity(Path.Combine(alias, "Identity File.txt")); casing = Identity(Path.Combine(target, "Identity File.txt").ToUpperInvariant());
            c.Add("canonical_file_identity", EqualId(direct, junction) && EqualId(direct, casing), new { direct, junction, caseAlias = casing });
        } catch (Exception ex) { c.Error("filesystem_probe_error", ex); }
        finally { try { if (Directory.Exists(alias)) Directory.Delete(alias, false); } catch (Exception ex) { c.Error("junction_cleanup", ex); } }
    }

    sealed class AsyncPipe : IDisposable {
        public IntPtr Handle, Event, Overlap, Buffer;
        public AsyncPipe(IntPtr handle) {
            Handle = handle; Event = CreateEventW(IntPtr.Zero, true, false, null); Need(Event != IntPtr.Zero, "CreateEventW pipe deadline");
            Overlap = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(OVERLAPPED)));
            Buffer = Marshal.AllocHGlobal(1);
            Marshal.StructureToPtr(new OVERLAPPED { evt = Event }, Overlap, false);
        }
        public void Finish(bool immediate, int error, bool connected) {
            if (immediate || (connected && error == 535)) return;
            if (error != 997) throw new Win32Exception(error, "Overlapped pipe operation");
            Need(WaitForSingleObject(Event, DeadlineMs) == WAIT_OBJECT_0, "Named pipe operation deadline");
            uint done; Need(GetOverlappedResult(Handle, Overlap, out done, false), "GetOverlappedResult pipe");
        }
        public void Dispose() {
            // Closing the handle cancels pending I/O; do not free its OVERLAPPED before cancellation completes.
            CancelIoEx(Handle, Overlap);
            uint done;
            bool incomplete = !GetOverlappedResult(Handle, Overlap, out done, false) && Marshal.GetLastWin32Error() == 996;
            bool completed = !incomplete || WaitForSingleObject(Event, DeadlineMs) == WAIT_OBJECT_0;
            CloseHandle(Handle); Handle = IntPtr.Zero;
            if (!completed) throw new TimeoutException("Pipe cancellation deadline exceeded; pending native allocations retained until fresh process exits.");
            Marshal.FreeHGlobal(Overlap); Marshal.FreeHGlobal(Buffer); CloseHandle(Event);
        }
    }
    static void Pipe(Checks c, string exe, string root) {
        IntPtr sd = IntPtr.Zero, server = IntPtr.Zero, job = IntPtr.Zero; Owned peer = null; AsyncPipe pending = null;
        try {
            string ownerSid = Sid(GetCurrentProcess()), pipeName = "\\\\.\\pipe\\angit-stage0-" + Guid.NewGuid().ToString("N"); uint sdSize;
            Need(ConvertStringSecurityDescriptorToSecurityDescriptorW("O:" + ownerSid + "D:P(A;;GA;;;" + ownerSid + ")", 1, out sd, out sdSize), "Build protected owner-only pipe descriptor");
            SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES { length = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)), descriptor = sd };
            // PIPE_REJECT_REMOTE_CLIENTS (8), FILE_FLAG_FIRST_PIPE_INSTANCE and no inheritable handles.
            server = CreateNamedPipeW(pipeName, 3 | 0x40000000 | 0x00080000, 8, 1, 1024, 1024, 1000, ref sa);
            Need(server != Invalid, "CreateNamedPipeW PIPE_REJECT_REMOTE_CLIENTS");
            c.Add("pipe_remote_rejection_enabled", true, new { pipeMode = "PIPE_TYPE_BYTE | PIPE_REJECT_REMOTE_CLIENTS", nativeCreateAccepted = true, remoteHostChallenge = "not performed; no remote host or network service is authorized" });
            c.AddStatus("pipe_remote_host_challenge", "unsupported", "No authorized remote fixture host; enabling the native reject flag is proven, a cross-host negative challenge is not.", false);
            IntPtr owner, group, dacl, sacl, observed; uint code = GetSecurityInfo(server, 6, 1 | 4, out owner, out group, out dacl, out sacl, out observed);
            if (code != 0) throw new Win32Exception((int)code, "GetSecurityInfo pipe owner/DACL");
            try {
                byte[] bytes = new byte[GetSecurityDescriptorLength(observed)]; Marshal.Copy(observed, bytes, 0, bytes.Length);
                RawSecurityDescriptor descriptor = new RawSecurityDescriptor(bytes, 0); bool onlyOwner = descriptor.DiscretionaryAcl != null && descriptor.DiscretionaryAcl.Count == 1;
                CommonAce ace = onlyOwner ? descriptor.DiscretionaryAcl[0] as CommonAce : null;
                onlyOwner = onlyOwner && ace != null && ace.AceQualifier == AceQualifier.AccessAllowed && ace.SecurityIdentifier.Value == ownerSid &&
                    ((ace.AccessMask & 0x10000000) != 0 || (ace.AccessMask & 0x0012019f) == 0x0012019f);
                c.Add("pipe_acl_readback", descriptor.Owner.Value == ownerSid && onlyOwner && (descriptor.ControlFlags & ControlFlags.DiscretionaryAclProtected) != 0,
                    new { expectedOwnerSid = ownerSid, observedOwnerSid = descriptor.Owner.Value, sddl = descriptor.GetSddlForm(AccessControlSections.Owner | AccessControlSections.Access), onlyOwnerAllowAce = onlyOwner });
            } finally { LocalFree(observed); }
            IntPtr token = IntPtr.Zero, restricted = IntPtr.Zero, everyone = IntPtr.Zero, deniedHandle = Invalid;
            try {
                Need(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_DUPLICATE, out token), "OpenProcessToken restricted challenge");
                SecurityIdentifier sid = new SecurityIdentifier(WellKnownSidType.WorldSid, null); byte[] bytes = new byte[sid.BinaryLength]; sid.GetBinaryForm(bytes, 0);
                everyone = Marshal.AllocHGlobal(bytes.Length); Marshal.Copy(bytes, 0, everyone, bytes.Length);
                Need(CreateRestrictedToken(token, 1, 0, IntPtr.Zero, 0, IntPtr.Zero, 1, new[] { new SID_AND_ATTRIBUTES { sid = everyone } }, out restricted), "CreateRestrictedToken deny fixture");
                int error = 0; Need(ImpersonateLoggedOnUser(restricted), "Impersonate restricted admission fixture");
                try { deniedHandle = CreateFileW(pipeName, 0xc0000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero); error = Marshal.GetLastWin32Error(); }
                finally { Need(RevertToSelf(), "RevertToSelf restricted fixture"); }
                c.Add("pipe_nonowner_restricted_token_denied", deniedHandle == Invalid && error == 5,
                    new { win32Error = error, restrictionSid = sid.Value, actualAccountSid = ownerSid, scope = "Actual denied CreateFile under a restricting non-owner SID; no second account was created." });
            } finally { if (deniedHandle != Invalid) CloseHandle(deniedHandle); if (restricted != IntPtr.Zero) CloseHandle(restricted); if (token != IntPtr.Zero) CloseHandle(token); if (everyone != IntPtr.Zero) Marshal.FreeHGlobal(everyone); }
            pending = new AsyncPipe(server); server = IntPtr.Zero;
            bool connected = ConnectNamedPipe(pending.Handle, pending.Overlap); int connectError = Marshal.GetLastWin32Error();
            job = NewJob(); peer = Spawn(exe, root, "--pipe-peer", pipeName, Path.Combine(root, "pipe-fixture-error.json")); AssignAndResume(peer, job);
            pending.Finish(connected, connectError, true);
            c.Add("pipe_owner_admission", true, new { pid = peer.Info.pid, ownerSid });
            // Reuse a fresh event/OVERLAPPED for the read after the connect has completed.
            CloseHandle(pending.Event); pending.Event = CreateEventW(IntPtr.Zero, true, false, null); Need(pending.Event != IntPtr.Zero, "CreateEvent read");
            Marshal.StructureToPtr(new OVERLAPPED { evt = pending.Event }, pending.Overlap, false);
            uint read; bool immediate = ReadFile(pending.Handle, pending.Buffer, 1, out read, pending.Overlap); int readError = Marshal.GetLastWin32Error(); pending.Finish(immediate, readError, false);
            byte marker = Marshal.ReadByte(pending.Buffer);
            uint clientPid; Need(GetNamedPipeClientProcessId(pending.Handle, out clientPid), "GetNamedPipeClientProcessId");
            string processSid = Sid(peer.Info.process), impersonatedSid;
            Need(ImpersonateNamedPipeClient(pending.Handle), "ImpersonateNamedPipeClient actual message");
            try { using (WindowsIdentity identity = WindowsIdentity.GetCurrent(true)) { if (identity == null) throw new InvalidOperationException("No actual impersonation token."); impersonatedSid = identity.User.Value; } }
            finally { Need(RevertToSelf(), "RevertToSelf connected peer"); }
            c.Add("pipe_connected_peer_identity", clientPid == peer.Info.pid && Created(peer.Info.process) == peer.Created && processSid == ownerSid && impersonatedSid == ownerSid && marker == 0x41,
                new { clientPid, expectedFixturePid = peer.Info.pid, processTokenSid = processSid, impersonatedSid, ownerSid, creationFileTime = peer.Created.ToString(), readMarker = marker });
        } catch (Exception ex) { c.Error("pipe_probe_error", ex); }
        finally {
            string errorReceipt = Path.Combine(root, "pipe-fixture-error.json");
            if (File.Exists(errorReceipt)) c.Add("pipe_fixture_native_failure", false, File.ReadAllText(errorReceipt));
            if (pending != null) try { pending.Dispose(); } catch (Exception ex) { c.Error("pipe_io_cleanup", ex); }
            else if (server != IntPtr.Zero && server != Invalid) CloseHandle(server);
            if (sd != IntPtr.Zero) LocalFree(sd);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (peer != null) try { peer.Dispose(); } catch (Exception ex) { c.Error("pipe_fixture_cleanup", ex); }
        }
    }

    static IntPtr Descendant(Owned parent, IntPtr job, string receipt) {
        WaitFile(receipt); string[] values = File.ReadAllText(receipt).Split('|'); uint pid = uint.Parse(values[0]); ulong stamp = ulong.Parse(values[1]);
        if (!JobPids(job).Contains(pid)) throw new InvalidOperationException("Reported descendant PID not in owned job.");
        IntPtr h = OpenProcess(QUERY | SYNCHRONIZE, false, pid); Need(h != IntPtr.Zero, "OpenProcess owned job descendant (query/synchronize only)");
        try { if (!InJob(h, job) || Created(h) != stamp || pid == parent.Info.pid) throw new InvalidOperationException("Descendant identity mismatch."); return h; }
        catch { CloseHandle(h); throw; }
    }
    static bool RejectStopIdentity(IntPtr process, IntPtr job, uint expectedPid, ulong expectedCreation, uint actualPid) {
        // The stop guard is deliberately separate from cleanup; mismatch can never reach a native signal.
        if (expectedPid != actualPid || Created(process) != expectedCreation || !InJob(process, job)) return true;
        throw new InvalidOperationException("Mismatch fixture unexpectedly satisfied stop authorization.");
    }
    static void Jobs(Checks c, string exe, string root) {
        IntPtr job = IntPtr.Zero, unrelatedJob = IntPtr.Zero, secondJob = IntPtr.Zero, descendant = IntPtr.Zero, secondDescendant = IntPtr.Zero;
        Owned parent = null, unrelated = null, secondParent = null;
        string launchValue = "argument with spaces \"quoted\" Unicode-\u03a9 trailing\\";
        try {
            unrelatedJob = NewJob(); unrelated = Spawn(exe, root, "--idle"); AssignAndResume(unrelated, unrelatedJob);
            job = NewJob();
            IntPtr limitsBuffer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(EXTENDED_LIMITS)));
            try {
                uint returned; Need(QueryInformationJobObject(job, 9, limitsBuffer, (uint)Marshal.SizeOf(typeof(EXTENDED_LIMITS)), out returned), "Query job limits readback");
                EXTENDED_LIMITS limits = (EXTENDED_LIMITS)Marshal.PtrToStructure(limitsBuffer, typeof(EXTENDED_LIMITS));
                c.Add("job_limits_no_breakaway", (limits.basic.flags & KILL_ON_JOB_CLOSE) != 0 && (limits.basic.flags & (0x800 | 0x1000)) == 0,
                    new { flags = limits.basic.flags, killOnClose = true, breakawayAllowed = (limits.basic.flags & 0x800) != 0, silentBreakawayAllowed = (limits.basic.flags & 0x1000) != 0 });
            } finally { Marshal.FreeHGlobal(limitsBuffer); }
            string first = Path.Combine(root, "first fixture"); Directory.CreateDirectory(first);
            parent = Spawn(exe, root, "--tree-root", first, launchValue);
            c.Add("process_created_before_execution", parent.Created != 0 && WaitForSingleObject(parent.Info.process, 0) == WAIT_TIMEOUT && !File.Exists(Path.Combine(first, "started")),
                new { pid = parent.Info.pid, creationFileTime = parent.Created.ToString(), creationFlags = "CREATE_SUSPENDED", executionMarkerAbsent = !File.Exists(Path.Combine(first, "started")), processAlive = WaitForSingleObject(parent.Info.process, 0) == WAIT_TIMEOUT });
            Need(AssignProcessToJobObject(job, parent.Info.process), "Assign suspended root before ResumeThread"); parent.Assigned = true;
            c.Add("job_assigned_before_resume", InJob(parent.Info.process, job) && JobPids(job).Contains(parent.Info.pid) && !File.Exists(Path.Combine(first, "started")),
                new { pid = parent.Info.pid, jobPids = JobPids(job), executionMarkerAbsent = !File.Exists(Path.Combine(first, "started")) });
            Need(ResumeThread(parent.Info.thread) == 1, "Resume root only after owned job admission");
            WaitFile(Path.Combine(first, "started"));
            string observedArgument = File.ReadAllText(Path.Combine(first, "started"));
            c.Add("launch_arguments_roundtrip", observedArgument == launchValue && exe.Contains(" ") && first.Contains(" "),
                new { executablePathHasSpaces = exe.Contains(" "), argument = observedArgument, exactMatch = observedArgument == launchValue, shell = false, lpApplicationName = exe });
            WaitFile(Path.Combine(first, "breakaway"));
            int breakawayError = int.Parse(File.ReadAllText(Path.Combine(first, "breakaway")));
            c.Add("job_breakaway_denied", breakawayError == 5, new { win32Error = breakawayError, requestedFlags = "CREATE_SUSPENDED | CREATE_BREAKAWAY_FROM_JOB", fixtureExecuted = false });
            descendant = Descendant(parent, job, Path.Combine(first, "descendant"));
            List<uint> ids = JobPids(job); uint descendantPid = uint.Parse(File.ReadAllText(Path.Combine(first, "descendant")).Split('|')[0]);
            c.Add("descendant_job_ownership", ids.Contains(parent.Info.pid) && ids.Contains(descendantPid) && InJob(descendant, job),
                new { rootPid = parent.Info.pid, descendantPid, descendantCreationFileTime = Created(descendant).ToString(), jobPids = ids, handleOpenedOnlyAfterJobMembership = true });
            bool wrongPid = RejectStopIdentity(unrelated.Info.process, job, parent.Info.pid, parent.Created, unrelated.Info.pid);
            bool wrongStamp = RejectStopIdentity(parent.Info.process, job, parent.Info.pid, parent.Created + 1, parent.Info.pid);
            bool wrongJob = RejectStopIdentity(unrelated.Info.process, job, unrelated.Info.pid, unrelated.Created, unrelated.Info.pid);
            c.Add("identity_mismatch_rejected", wrongPid && wrongStamp && wrongJob && WaitForSingleObject(unrelated.Info.process, 0) == WAIT_TIMEOUT,
                new { wrongPidRejected = wrongPid, wrongCreationTimeRejected = wrongStamp, outsideJobRejected = wrongJob, signalIssued = false, unrelatedFixturePid = unrelated.Info.pid });
            File.WriteAllText(Path.Combine(first, "root-exit"), "fixed controlled exit");
            Need(WaitForSingleObject(parent.Info.process, DeadlineMs) == WAIT_OBJECT_0, "Observe root exit separately from process creation");
            uint exitCode; Need(GetExitCodeProcess(parent.Info.process, out exitCode), "GetExitCodeProcess root");
            c.Add("root_exit_distinct_from_creation", exitCode == 0 && Created(parent.Info.process) == parent.Created,
                new { pid = parent.Info.pid, creationObservedFirst = true, exitedHandleSignaled = true, exitCode });
            Until(() => !JobPids(job).Contains(parent.Info.pid), "Exited root removed from job process list");
            ids = JobPids(job);
            c.Add("descendant_retained_after_root_exit", WaitForSingleObject(descendant, 0) == WAIT_TIMEOUT && ids.Contains(descendantPid) && !ids.Contains(parent.Info.pid),
                new { rootExited = true, descendantStillAlive = WaitForSingleObject(descendant, 0) == WAIT_TIMEOUT, jobPids = ids });
            CloseHandle(job); job = IntPtr.Zero;
            c.Add("kill_on_job_close_descendant_exit", WaitForSingleObject(descendant, DeadlineMs) == WAIT_OBJECT_0 && WaitForSingleObject(parent.Info.process, 0) == WAIT_OBJECT_0,
                new { retainedDescendantHandleSignaled = WaitForSingleObject(descendant, 0) == WAIT_OBJECT_0, rootHandleSignaled = true, finalJobHandleClosed = true });
            // A second independent tree proves explicit stop observes BOTH processes, not just an exited root.
            string second = Path.Combine(root, "second fixture"); Directory.CreateDirectory(second);
            secondJob = NewJob(); secondParent = Spawn(exe, root, "--tree-root", second, launchValue); AssignAndResume(secondParent, secondJob);
            secondDescendant = Descendant(secondParent, secondJob, Path.Combine(second, "descendant"));
            bool bothAlive = WaitForSingleObject(secondParent.Info.process, 0) == WAIT_TIMEOUT && WaitForSingleObject(secondDescendant, 0) == WAIT_TIMEOUT;
            Need(TerminateJobObject(secondJob, 92), "TerminateJobObject owned second fixture tree");
            bool rootExited = WaitForSingleObject(secondParent.Info.process, DeadlineMs) == WAIT_OBJECT_0;
            bool descendantExited = WaitForSingleObject(secondDescendant, DeadlineMs) == WAIT_OBJECT_0;
            Until(() => JobPids(secondJob).Count == 0, "Owned job empty after both process exits");
            c.Add("job_stop_root_and_descendant", bothAlive && rootExited && descendantExited,
                new { bothObservedAliveBeforeStop = bothAlive, rootHandleSignaled = rootExited, descendantHandleSignaled = descendantExited, jobPidsAfterStop = JobPids(secondJob) });
            c.Add("unrelated_fixture_survives", WaitForSingleObject(unrelated.Info.process, 0) == WAIT_TIMEOUT && InJob(unrelated.Info.process, unrelatedJob),
                new { unrelatedFixturePid = unrelated.Info.pid, stillAlive = WaitForSingleObject(unrelated.Info.process, 0) == WAIT_TIMEOUT, distinctOwnedCleanupJob = true });
        } catch (Exception ex) { c.Error("job_probe_error", ex); }
        finally {
            if (job != IntPtr.Zero) CloseHandle(job); if (secondJob != IntPtr.Zero) CloseHandle(secondJob); if (unrelatedJob != IntPtr.Zero) CloseHandle(unrelatedJob);
            if (descendant != IntPtr.Zero) { if (WaitForSingleObject(descendant, DeadlineMs) != WAIT_OBJECT_0) c.Add("descendant_cleanup", false, "Owned job descendant exit deadline exceeded."); CloseHandle(descendant); }
            if (secondDescendant != IntPtr.Zero) { if (WaitForSingleObject(secondDescendant, DeadlineMs) != WAIT_OBJECT_0) c.Add("second_descendant_cleanup", false, "Owned job descendant exit deadline exceeded."); CloseHandle(secondDescendant); }
            foreach (Owned p in new[] { parent, secondParent, unrelated }) if (p != null) try { p.Dispose(); } catch (Exception ex) { c.Error("owned_process_cleanup", ex); }
        }
    }

    public static string Run(string exe, string root) {
        Checks checks = new Checks();
        OSVERSION os = new OSVERSION(); os.size = (uint)Marshal.SizeOf(typeof(OSVERSION)); int osResult = RtlGetVersion(ref os);
        if (!Environment.Is64BitProcess || !Environment.Is64BitOperatingSystem) {
            checks.AddStatus("windows_x64", "unsupported", "The probe requires a Windows x64 process and OS.", true);
        } else {
            Filesystem(checks, root); Pipe(checks, exe, root); Jobs(checks, exe, root);
        }
        bool cleanupErrors = checks.Items.Exists(x => ((string)x["id"]).Contains("cleanup") && (string)x["status"] != "pass");
        checks.Add("fixture_cleanup", !cleanupErrors, new { ownedProcessHandlesOnly = true, descendantSignalsViaOwnedJobsOnly = true, junctionRemovedBeforeDirectoryCleanup = true, disposableDirectoryCleanup = "PowerShell wrapper finally; reported separately" });
        bool pass = checks.Complete();
        return new JavaScriptSerializer().Serialize(new {
            schemaVersion = 1, probe = "windows-primitives", status = pass ? "pass" : "fail", checks = checks.Items,
            runtime = new { framework = Environment.Version.ToString(), processArchitecture = IntPtr.Size == 8 ? "x64" : "x86", osVersionApi = "RtlGetVersion", osQueryStatus = osResult, windowsMajor = os.major, windowsMinor = os.minor, windowsBuild = os.build },
            limitations = new[] { "NOT PRODUCT SECURITY CERTIFICATION", "Cooperative same-account model only; Job Objects are not filesystem/network sandboxes.", "No hostile same-SID isolation, persistent reattachment, crash recovery, product CLI, real provider, remote host or second-account challenge is established.", "File identities are handle observations on this disposable filesystem, not a concurrent-replacement defense." }
        });
    }

    public static int Main(string[] args) {
        // Only these inert, bounded fixtures are executable. The controller runs in the PowerShell process.
        try {
            if (args.Length == 1 && args[0] == "--idle") { Thread.Sleep(60000); return 0; }
            if (args.Length == 2 && args[0] == "--descendant") {
                Receipt(args[1], Process.GetCurrentProcess().Id + "|" + Created(GetCurrentProcess())); Thread.Sleep(60000); return 0;
            }
            if (args.Length == 3 && args[0] == "--tree-root") {
                string folder = args[1]; Receipt(Path.Combine(folder, "started"), args[2]);
                string exe = Process.GetCurrentProcess().MainModule.FileName;
                STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); PROCESS_INFORMATION escaped;
                bool launched = CreateProcessW(exe, new StringBuilder(Quote(exe) + " " + Quote("--idle")), IntPtr.Zero, IntPtr.Zero, false,
                    CREATE_SUSPENDED | 0x01000000, IntPtr.Zero, folder, ref si, out escaped);
                int breakawayError = launched ? 0 : Marshal.GetLastWin32Error();
                if (launched) {
                    // Unexpected success still cannot run: clean only the retained, known suspended fixture.
                    using (Owned failedAdmission = new Owned { Info = escaped }) { }
                }
                Receipt(Path.Combine(folder, "breakaway"), breakawayError.ToString());
                using (Owned child = Spawn(exe, folder, "--descendant", Path.Combine(folder, "descendant"))) {
                    // Descendants inherit the parent's job; no CREATE_BREAKAWAY_FROM_JOB is used.
                    Need(ResumeThread(child.Info.thread) == 1, "Resume inert descendant");
                    Stopwatch timer = Stopwatch.StartNew(); while (!File.Exists(Path.Combine(folder, "root-exit")) && timer.ElapsedMilliseconds < 60000) Thread.Sleep(20);
                    // Intentionally retain descendant after root exits. Closing process handles does not signal it.
                    CloseHandle(child.Info.process); child.Info.process = IntPtr.Zero; CloseHandle(child.Info.thread); child.Info.thread = IntPtr.Zero;
                }
                return 0;
            }
            if (args.Length == 3 && args[0] == "--pipe-peer") {
                IntPtr pipe = CreateFileW(args[1], 0xc0000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero); Need(pipe != Invalid, "Inert owner pipe fixture connect");
                try { uint done; Need(WriteFile(pipe, new byte[] { 0x41 }, 1, out done, IntPtr.Zero) && done == 1, "Inert peer marker"); Thread.Sleep(60000); }
                finally { CloseHandle(pipe); } return 0;
            }
            return 64;
        } catch (Exception ex) {
            try {
                string failurePath = null;
                if (args.Length == 3 && args[0] == "--tree-root") failurePath = Path.Combine(args[1], "fixture-error.json");
                if (args.Length == 2 && args[0] == "--descendant") failurePath = args[1] + ".error.json";
                if (args.Length == 3 && args[0] == "--pipe-peer") failurePath = args[2];
                if (failurePath != null) {
                    Win32Exception native = ex as Win32Exception;
                    Receipt(failurePath, new JavaScriptSerializer().Serialize(new { message = ex.Message, exception = ex.GetType().FullName, win32Error = native == null ? (int?)null : native.NativeErrorCode }));
                }
            } catch { /* Exit 70 remains observable if even the local failure receipt cannot be written. */ }
            return 70;
        }
    }
}
