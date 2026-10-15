// MIT. Stage 1 metadata/ACL primitives only; no process, Git or shell operations.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static class Platform {
    const string Version = "angit-native/v1";
    const int MaxFrame = 65536, MaxPath = 4096;
    const uint ReadControl = 0x00020000, Backup = 0x02000000, OpenReparse = 0x00200000;
    const uint DirectoryBit = 0x10, ReparseBit = 0x400, CloudBits = 0x1000 | 0x40000 | 0x100000 | 0x400000;
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    [StructLayout(LayoutKind.Sequential)] struct FileInfo {
        public uint attributes; public System.Runtime.InteropServices.ComTypes.FILETIME created, accessed, written;
        public uint volume, sizeHigh, sizeLow, links, indexHigh, indexLow;
    }
    [StructLayout(LayoutKind.Sequential)] struct FileIdInfo {
        public ulong volume; public ulong low, high;
    }
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {
        public int length; public IntPtr descriptor; public int inherit;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInfo info);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out FileIdInfo info, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder value, uint capacity, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool GetVolumePathNameW(string path, StringBuilder volume, uint capacity);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetDriveTypeW(string root);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool GetVolumeInformationW(string root, StringBuilder name, uint nameSize, out uint serial, out uint componentSize, out uint flags, StringBuilder filesystem, uint filesystemSize);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateDirectoryW(string path, ref SecurityAttributes attributes);
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityInfo(SafeFileHandle handle, int type, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid folder, uint flags, IntPtr token, out IntPtr path);

    sealed class Failure : Exception {
        public readonly string Code;
        public Failure(string code) : base(MessageFor(code)) { Code = code; }
    }
    static string MessageFor(string code) {
        switch (code) {
            case "UNSUPPORTED_PLATFORM": return "Windows x64 is required.";
            case "INVALID_NATIVE_REQUEST": return "Native metadata request is invalid.";
            case "INVALID_PATH": return "An absolute ordinary Windows path is required.";
            case "PATH_NOT_FOUND": return "The requested filesystem object does not exist.";
            case "ACCESS_DENIED": return "Filesystem metadata access was denied.";
            case "INSECURE_STATE": return "Owner-only local state protection is required.";
            case "UNSUPPORTED_FILESYSTEM": return "A local fixed NTFS or ReFS filesystem is required.";
            default: return "Native filesystem metadata inspection failed.";
        }
    }
    static void Need(bool value, string code) { if (!value) throw new Failure(code); }
    static void Win32Failure(int error) {
        if (error == 2 || error == 3) throw new Failure("PATH_NOT_FOUND");
        if (error == 5 || error == 1314) throw new Failure("ACCESS_DENIED");
        throw new Failure("NATIVE_IO_ERROR");
    }
    internal static string OwnerSid() {
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent(TokenAccessLevels.Query)) {
            Need(identity.User != null, "ACCESS_DENIED");
            return identity.User.Value;
        }
    }
    internal static string OrdinaryPath(string path) {
        Need(path != null && path.Length >= 3 && path.Length <= MaxPath, "INVALID_PATH");
        for (int i = 0; i < path.Length; i++) {
            char c = path[i];
            Need(!char.IsControl(c) && c != '"' && c != '<' && c != '>' && c != '|' && c != '?' && c != '*', "INVALID_PATH");
            if (char.IsHighSurrogate(c)) { Need(i + 1 < path.Length && char.IsLowSurrogate(path[i + 1]), "INVALID_PATH"); i++; }
            else Need(!char.IsLowSurrogate(c), "INVALID_PATH");
        }
        path = path.Replace('/', '\\');
        Need(((path[0] >= 'A' && path[0] <= 'Z') || (path[0] >= 'a' && path[0] <= 'z')) && path[1] == ':' && path[2] == '\\', "INVALID_PATH");
        Need(path.IndexOf(':', 2) < 0, "INVALID_PATH");
        string[] pieces = path.Substring(3).Split('\\');
        for (int i = 0; i < pieces.Length; i++) {
            string piece = pieces[i];
            if (piece.Length == 0) { Need(i == pieces.Length - 1, "INVALID_PATH"); continue; }
            Need(piece != "." && piece != ".." && !piece.EndsWith(".", StringComparison.Ordinal) && !piece.EndsWith(" ", StringComparison.Ordinal), "INVALID_PATH");
            string stem = piece.Split('.')[0].ToUpperInvariant();
            Need(stem != "CON" && stem != "PRN" && stem != "AUX" && stem != "NUL" && stem != "CLOCK$" && stem != "CONIN$" && stem != "CONOUT$", "INVALID_PATH");
            Need(!(stem.Length == 4 && (stem.StartsWith("COM", StringComparison.Ordinal) || stem.StartsWith("LPT", StringComparison.Ordinal)) && (stem[3] >= '1' && stem[3] <= '9' || stem[3] == '\u00b9' || stem[3] == '\u00b2' || stem[3] == '\u00b3')), "INVALID_PATH");
        }
        return path.Length > 3 ? path.TrimEnd('\\') : path;
    }
    static SafeFileHandle Open(string path, bool noFollow, bool allowMissing) {
        SafeFileHandle handle = CreateFileW("\\\\?\\" + path, ReadControl, 3, IntPtr.Zero, 3, Backup | (noFollow ? OpenReparse : 0), IntPtr.Zero);
        if (handle.IsInvalid) {
            int error = Marshal.GetLastWin32Error(); handle.Dispose();
            if (allowMissing && (error == 2 || error == 3)) return null;
            Win32Failure(error);
        }
        return handle;
    }
    static FileInfo Information(SafeFileHandle handle) {
        FileInfo info; if (!GetFileInformationByHandle(handle, out info)) Win32Failure(Marshal.GetLastWin32Error());
        return info;
    }
    static RawSecurityDescriptor Security(SafeFileHandle handle) {
        IntPtr owner, group, dacl, sacl, descriptor;
        uint error = GetSecurityInfo(handle, 1, 1 | 4, out owner, out group, out dacl, out sacl, out descriptor);
        if (error != 0) Win32Failure((int)error);
        try {
            uint length = GetSecurityDescriptorLength(descriptor); Need(length > 0 && length <= 65536, "NATIVE_IO_ERROR");
            byte[] bytes = new byte[(int)length]; Marshal.Copy(descriptor, bytes, 0, bytes.Length);
            return new RawSecurityDescriptor(bytes, 0);
        } finally { LocalFree(descriptor); }
    }
    static string FinalPath(SafeFileHandle handle) {
        StringBuilder result = new StringBuilder(MaxPath + 8);
        uint length = GetFinalPathNameByHandleW(handle, result, (uint)result.Capacity, 0);
        Need(length > 0 && length < result.Capacity, "NATIVE_IO_ERROR");
        string path = result.ToString();
        if (path.StartsWith("\\\\?\\", StringComparison.Ordinal)) path = path.Substring(4);
        return OrdinaryPath(path);
    }
    static bool LocalDisk(string canonicalPath) {
        StringBuilder volume = new StringBuilder(MaxPath + 1);
        if (!GetVolumePathNameW("\\\\?\\" + canonicalPath, volume, (uint)volume.Capacity)) return false;
        if (GetDriveTypeW(volume.ToString()) != 3) return false;
        uint serial, component, flags; StringBuilder fs = new StringBuilder(32);
        if (!GetVolumeInformationW(volume.ToString(), null, 0, out serial, out component, out flags, fs, (uint)fs.Capacity)) return false;
        return (flags & 0x8) != 0 && (fs.ToString() == "NTFS" || fs.ToString() == "ReFS");
    }
    static string IdentityJson(SafeFileHandle handle, bool reparse, bool cloud) {
        FileInfo info = Information(handle); FileIdInfo id;
        if (!GetFileInformationByHandleEx(handle, 18, out id, (uint)Marshal.SizeOf(typeof(FileIdInfo)))) Win32Failure(Marshal.GetLastWin32Error());
        Need(id.low != 0 || id.high != 0, "NATIVE_IO_ERROR");
        string final = FinalPath(handle); RawSecurityDescriptor security = Security(handle);
        Need(security.Owner != null, "NATIVE_IO_ERROR");
        return "{\"canonicalPath\":" + Quote(final) + ",\"identity\":" + Quote("win:" + id.volume.ToString("x16") + ":" + id.high.ToString("x16") + id.low.ToString("x16")) + ",\"ownerSid\":" + Quote(security.Owner.Value) + ",\"directory\":" + Bool((info.attributes & DirectoryBit) != 0) + ",\"reparsePoint\":" + Bool(reparse || (info.attributes & ReparseBit) != 0) + ",\"localDisk\":" + Bool(LocalDisk(final) && !cloud && (info.attributes & CloudBits) == 0) + "}";
    }
    static void Private(SafeFileHandle handle, bool directory, string sid) {
        FileInfo info = Information(handle);
        Need(((info.attributes & DirectoryBit) != 0) == directory && (info.attributes & (ReparseBit | CloudBits)) == 0, "INSECURE_STATE");
        Need(directory || info.links == 1, "INSECURE_STATE");
        Need(LocalDisk(FinalPath(handle)), "UNSUPPORTED_FILESYSTEM");
        RawSecurityDescriptor security = Security(handle);
        Need(security.Owner != null && security.Owner.Value == sid && security.DiscretionaryAcl != null && security.DiscretionaryAcl.Count > 0, "INSECURE_STATE");
        if (directory) Need((security.ControlFlags & ControlFlags.DiscretionaryAclProtected) != 0, "INSECURE_STATE");
        bool full = false, inheritedFull = false;
        foreach (GenericAce entry in security.DiscretionaryAcl) {
            CommonAce ace = entry as CommonAce;
            Need(ace != null && !ace.IsCallback && ace.AceQualifier == AceQualifier.AccessAllowed && ace.SecurityIdentifier.Value == sid, "INSECURE_STATE");
            if ((ace.AceFlags & AceFlags.InheritOnly) == 0 && (ace.AccessMask & 0x1f01ff) == 0x1f01ff) full = true;
            if ((ace.AceFlags & (AceFlags.ObjectInherit | AceFlags.ContainerInherit)) == (AceFlags.ObjectInherit | AceFlags.ContainerInherit) && (ace.AccessMask & 0x1f01ff) == 0x1f01ff) inheritedFull = true;
        }
        Need(full && (!directory || inheritedFull), "INSECURE_STATE");
    }
    static void Anchor(SafeFileHandle handle, string sid) {
        FileInfo info = Information(handle);
        Need((info.attributes & DirectoryBit) != 0 && (info.attributes & (ReparseBit | CloudBits)) == 0, "INSECURE_STATE");
        Need(LocalDisk(FinalPath(handle)), "UNSUPPORTED_FILESYSTEM");
        RawSecurityDescriptor security = Security(handle);
        Need(security.Owner != null && security.Owner.Value == sid && security.DiscretionaryAcl != null, "INSECURE_STATE");
        const int writeMask = 0x10000000 | 0x40000000 | 0x00010000 | 0x00040000 | 0x00080000 | 2 | 4 | 16 | 64 | 256;
        foreach (GenericAce entry in security.DiscretionaryAcl) {
            CommonAce ace = entry as CommonAce;
            Need(ace != null && !ace.IsCallback, "INSECURE_STATE");
            if (ace.AceQualifier != AceQualifier.AccessAllowed || (ace.AceFlags & AceFlags.InheritOnly) != 0 || (ace.AccessMask & writeMask) == 0) continue;
            string principal = ace.SecurityIdentifier.Value;
            // Ordinary owner folders may retain OS-administration rights, never broad user write rights.
            Need(principal == sid || principal == "S-1-5-18" || principal == "S-1-5-32-544", "INSECURE_STATE");
        }
    }
    static List<string> Components(string path) {
        List<string> result = new List<string>(); string current = path.Substring(0, 3); result.Add(current);
        if (path.Length > 3) foreach (string piece in path.Substring(3).Split('\\')) { current = Path.Combine(current, piece); result.Add(current); }
        return result;
    }
    static void CreatePrivate(string path, string sid) {
        IntPtr descriptor; uint size;
        Need(ConvertStringSecurityDescriptorToSecurityDescriptorW("O:" + sid + "D:P(A;OICI;FA;;;" + sid + ")", 1, out descriptor, out size), "NATIVE_IO_ERROR");
        try {
            SecurityAttributes attributes = new SecurityAttributes(); attributes.length = Marshal.SizeOf(typeof(SecurityAttributes)); attributes.descriptor = descriptor;
            if (!CreateDirectoryW("\\\\?\\" + path, ref attributes)) {
                int error = Marshal.GetLastWin32Error();
                // An independently created object must pass the same strict inspection; never repair it.
                if (error != 183) Win32Failure(error);
            }
        } finally { LocalFree(descriptor); }
    }
    internal static string Inspect(string path, string op, string sid) {
        path = OrdinaryPath(path);
        bool managed = op != "identify", reparse = false, cloud = false;
        List<SafeFileHandle> handles = new List<SafeFileHandle>();
        try {
            List<string> paths = Components(path);
            for (int i = 0; i < paths.Count; i++) {
                bool created = false;
                SafeFileHandle part = Open(paths[i], true, op == "preparePrivateDirectory");
                if (part == null) {
                    Need(i > 0 && op == "preparePrivateDirectory", "PATH_NOT_FOUND");
                    SafeFileHandle parent = handles[handles.Count - 1];
                    Anchor(parent, sid);
                    CreatePrivate(paths[i], sid); part = Open(paths[i], true, false);
                    created = true;
                }
                handles.Add(part);
                if (created) Private(part, true, sid);
                FileInfo info = Information(part);
                reparse |= (info.attributes & ReparseBit) != 0; cloud |= (info.attributes & CloudBits) != 0;
                if (managed) Need(!reparse && !cloud, "INSECURE_STATE");
                if (i < paths.Count - 1) Need((info.attributes & DirectoryBit) != 0, "INVALID_PATH");
            }
            SafeFileHandle target = handles[handles.Count - 1];
            if ((Information(target).attributes & ReparseBit) != 0) {
                target = Open(path, false, false); handles.Add(target);
            }
            if (managed && handles.Count > 1) Anchor(handles[handles.Count - 2], sid);
            if (managed) Private(target, op == "preparePrivateDirectory" || op == "assertPrivateDirectory", sid);
            return IdentityJson(target, reparse, cloud);
        } finally { for (int i = handles.Count - 1; i >= 0; i--) handles[i].Dispose(); }
    }
    static string Context(string sid) {
        IntPtr pointer;
        int error = SHGetKnownFolderPath(new Guid("F1B32785-6FBA-4FCF-9D55-7B8E7F157091"), 0, IntPtr.Zero, out pointer);
        Need(error == 0 && pointer != IntPtr.Zero, "NATIVE_IO_ERROR");
        string path;
        try { path = OrdinaryPath(Marshal.PtrToStringUni(pointer)); } finally { Marshal.FreeCoTaskMem(pointer); }
        // Observation only: context never creates state or repairs the owner's Known Folder.
        List<SafeFileHandle> handles = new List<SafeFileHandle>();
        try {
            foreach (string component in Components(path)) {
                SafeFileHandle handle = Open(component, true, false); handles.Add(handle);
                FileInfo info = Information(handle);
                Need((info.attributes & DirectoryBit) != 0 && (info.attributes & (ReparseBit | CloudBits)) == 0, "INSECURE_STATE");
            }
            SafeFileHandle folder = handles[handles.Count - 1];
            // Location observation is not state admission; private operations validate its anchor.
            Need(LocalDisk(FinalPath(folder)), "UNSUPPORTED_FILESYSTEM");
            path = FinalPath(folder);
            return "{\"sid\":" + Quote(sid) + ",\"stateRoot\":" + Quote(Path.Combine(path, "angit")) + "}";
        } finally { for (int i = handles.Count - 1; i >= 0; i--) handles[i].Dispose(); }
    }
    static string Bool(bool value) { return value ? "true" : "false"; }
    internal static string Quote(string value) {
        StringBuilder result = new StringBuilder(); result.Append('"');
        foreach (char c in value) {
            if (c == '"' || c == '\\') { result.Append('\\'); result.Append(c); }
            else if (c < 0x20) { result.Append("\\u"); result.Append(((int)c).ToString("x4")); }
            else result.Append(c);
        }
        result.Append('"'); return result.ToString();
    }
    // Closed, string-only request grammar. Duplicate (including escaped-equivalent) keys are errors.
    sealed class RequestParser {
        readonly string text; int position;
        public RequestParser(string value) { text = value; }
        void Space() { while (position < text.Length && (text[position] == ' ' || text[position] == '\t' || text[position] == '\r' || text[position] == '\n')) position++; }
        void Take(char c) { Space(); Need(position < text.Length && text[position++] == c, "INVALID_NATIVE_REQUEST"); }
        string String() {
            Take('"'); StringBuilder result = new StringBuilder(); bool closed = false;
            while (position < text.Length) {
                char c = text[position++]; if (c == '"') { closed = true; break; }
                Need(c >= 0x20, "INVALID_NATIVE_REQUEST");
                if (c == '\\') {
                    Need(position < text.Length, "INVALID_NATIVE_REQUEST"); c = text[position++];
                    switch (c) {
                        case '"': case '\\': case '/': break;
                        case 'b': c = '\b'; break; case 'f': c = '\f'; break; case 'n': c = '\n'; break; case 'r': c = '\r'; break; case 't': c = '\t'; break;
                        case 'u':
                            Need(position + 4 <= text.Length, "INVALID_NATIVE_REQUEST"); ushort value;
                            Need(ushort.TryParse(text.Substring(position, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out value), "INVALID_NATIVE_REQUEST");
                            position += 4; c = (char)value; break;
                        default: throw new Failure("INVALID_NATIVE_REQUEST");
                    }
                }
                result.Append(c); Need(result.Length <= MaxPath + 64, "INVALID_NATIVE_REQUEST");
            }
            Need(closed, "INVALID_NATIVE_REQUEST"); string valueString = result.ToString();
            for (int i = 0; i < valueString.Length; i++) {
                if (char.IsHighSurrogate(valueString[i])) { Need(i + 1 < valueString.Length && char.IsLowSurrogate(valueString[i + 1]), "INVALID_NATIVE_REQUEST"); i++; }
                else Need(!char.IsLowSurrogate(valueString[i]), "INVALID_NATIVE_REQUEST");
            }
            return valueString;
        }
        public Dictionary<string, string> Parse() {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal); Take('{');
            while (true) {
                string key = String(); Need(!result.ContainsKey(key) && result.Count < 4, "INVALID_NATIVE_REQUEST"); Take(':'); result.Add(key, String()); Space();
                Need(position < text.Length, "INVALID_NATIVE_REQUEST"); char c = text[position++];
                if (c == '}') break; Need(c == ',', "INVALID_NATIVE_REQUEST");
            }
            Space(); Need(position == text.Length, "INVALID_NATIVE_REQUEST"); return result;
        }
    }
    static string ReadRequest() {
        byte[] bytes = new byte[MaxFrame + 1]; int length = 0;
        using (Stream input = Console.OpenStandardInput()) {
            while (length < bytes.Length) { int count = input.Read(bytes, length, bytes.Length - length); if (count == 0) break; length += count; }
        }
        Need(length > 0 && length <= MaxFrame, "INVALID_NATIVE_REQUEST");
        for (int i = 0; i < length; i++) Need(bytes[i] != 13 && (bytes[i] != 10 || i == length - 1), "INVALID_NATIVE_REQUEST");
        try { return Utf8.GetString(bytes, 0, length); } catch (DecoderFallbackException) { throw new Failure("INVALID_NATIVE_REQUEST"); }
    }
    static bool Nonce(string value) {
        if (value.Length != 32) return false;
        foreach (char c in value) if (!(c >= '0' && c <= '9' || c >= 'a' && c <= 'f')) return false;
        return true;
    }
    public static int Main(string[] args) {
        string nonce = "", op = ""; string response; int exit = 0;
        try {
            Need(Environment.OSVersion.Platform == PlatformID.Win32NT && IntPtr.Size == 8, "UNSUPPORTED_PLATFORM");
            Need(args.Length == 1 && args[0] == "--stdio-v1", "INVALID_NATIVE_REQUEST");
            Dictionary<string, string> request = new RequestParser(ReadRequest()).Parse();
            string version, requestedNonce, requestedOp;
            Need(request.TryGetValue("schemaVersion", out version) && version == Version && request.TryGetValue("requestId", out requestedNonce) && Nonce(requestedNonce) && request.TryGetValue("op", out requestedOp), "INVALID_NATIVE_REQUEST");
            // Separate assignments avoid short-circuit definite-assignment ambiguity on the Framework compiler.
            nonce = request["requestId"]; requestedOp = request["op"];
            Need(requestedOp == "ownerContext" || requestedOp == "identify" || requestedOp == "preparePrivateDirectory" || requestedOp == "assertPrivateDirectory" || requestedOp == "assertPrivateFile", "INVALID_NATIVE_REQUEST");
            op = requestedOp;
            Need(request.Count == (op == "ownerContext" ? 3 : 4) && (op == "ownerContext" || request.ContainsKey("path")), "INVALID_NATIVE_REQUEST");
            string sid = OwnerSid(); string result = op == "ownerContext" ? Context(sid) : Inspect(request["path"], op, sid);
            response = "{\"schemaVersion\":" + Quote(Version) + ",\"requestId\":" + Quote(nonce) + ",\"op\":" + Quote(op) + ",\"ok\":true,\"result\":" + result + "}";
        } catch (Failure error) {
            exit = error.Code == "UNSUPPORTED_PLATFORM" ? 3 : 2;
            response = "{\"schemaVersion\":" + Quote(Version) + ",\"requestId\":" + Quote(nonce) + ",\"op\":" + Quote(op) + ",\"ok\":false,\"code\":" + Quote(error.Code) + ",\"message\":" + Quote(error.Message) + "}";
        } catch (Exception) {
            exit = 2; response = "{\"schemaVersion\":" + Quote(Version) + ",\"requestId\":" + Quote(nonce) + ",\"op\":" + Quote(op) + ",\"ok\":false,\"code\":\"NATIVE_IO_ERROR\",\"message\":\"Native filesystem metadata inspection failed.\"}";
        }
        byte[] output = Utf8.GetBytes(response + "\n");
        if (output.Length > MaxFrame) return 2;
        using (Stream stdout = Console.OpenStandardOutput()) { stdout.Write(output, 0, output.Length); stdout.Flush(); }
        return exit;
    }
}
