using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

// Inert test consumer only. Never shipped or selected by a production profile.
internal static class ExecutionFixture
{
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
    private static string observations;
    private static string prefix;
    [StructLayout(LayoutKind.Sequential)] private struct SidAttributes { public IntPtr sid; public uint attributes; }
    [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool CreateRestrictedToken(IntPtr token, uint flags, uint disableCount, IntPtr disable, uint deleteCount, IntPtr delete, uint restrictedCount, [In] SidAttributes[] restricted, out IntPtr result);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool ImpersonateLoggedOnUser(IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool RevertToSelf();

    private static int RestrictedPipe(string name)
    {
        if (!name.StartsWith("angit-", StringComparison.Ordinal) || name.Length > 180) return 64;
        foreach (char c in name) if (!(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-')) return 64;
        IntPtr token = IntPtr.Zero, restricted = IntPtr.Zero, sidPointer = IntPtr.Zero, pipe = new IntPtr(-1);
        try
        {
            if (!OpenProcessToken(GetCurrentProcess(), 0x0008 | 0x0002, out token)) throw new InvalidOperationException("Token query failed.");
            SecurityIdentifier sid = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
            byte[] bytes = new byte[sid.BinaryLength]; sid.GetBinaryForm(bytes, 0);
            sidPointer = Marshal.AllocHGlobal(bytes.Length); Marshal.Copy(bytes, 0, sidPointer, bytes.Length);
            if (!CreateRestrictedToken(token, 1, 0, IntPtr.Zero, 0, IntPtr.Zero, 1, new[] { new SidAttributes { sid = sidPointer } }, out restricted)) throw new InvalidOperationException("Restricted token creation failed.");
            if (!ImpersonateLoggedOnUser(restricted)) throw new InvalidOperationException("Restricted impersonation failed.");
            int error;
            try { pipe = CreateFileW(@"\\.\pipe\" + name, 0xc0000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero); error = Marshal.GetLastWin32Error(); }
            finally { if (!RevertToSelf()) throw new InvalidOperationException("Restricted impersonation could not end."); }
            bool denied = pipe == new IntPtr(-1) && error == 5;
            Console.WriteLine("{\"accessDenied\":" + (denied ? "true" : "false") + ",\"win32Error\":" + error + ",\"restrictedSid\":\"S-1-1-0\"}");
            return denied ? 0 : 1;
        }
        finally
        {
            if (pipe != new IntPtr(-1)) CloseHandle(pipe);
            if (restricted != IntPtr.Zero) CloseHandle(restricted);
            if (token != IntPtr.Zero) CloseHandle(token);
            if (sidPointer != IntPtr.Zero) Marshal.FreeHGlobal(sidPointer);
        }
    }

    private static string Quote(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append(c); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"');
        return result.ToString();
    }

    private static string Hash(string path)
    {
        using (SHA256 hash = SHA256.Create())
        using (FileStream stream = File.OpenRead(path))
            return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    private static void Observe(string suffix, string value)
    {
        File.WriteAllText(Path.Combine(observations, prefix + "." + suffix), value, Utf8);
    }

    private static void Git(string executable, string digest, params string[] arguments)
    {
        if (!Path.IsPathRooted(executable) || !String.Equals(Hash(executable), digest, StringComparison.Ordinal))
            throw new InvalidOperationException("Approved Git executable identity mismatch.");
        StringBuilder argv = new StringBuilder();
        string[] controls = { "-c", "core.hooksPath=NUL", "-c", "core.fsmonitor=false", "-c", "commit.gpgSign=false", "-c", "tag.gpgSign=false", "-c", "user.name=Angit Inert Fixture", "-c", "user.email=fixture@example.invalid" };
        foreach (string arg in controls) argv.Append(Quote(arg)).Append(' ');
        foreach (string arg in arguments) argv.Append(Quote(arg)).Append(' ');
        ProcessStartInfo info = new ProcessStartInfo(executable, argv.ToString());
        info.UseShellExecute = false; info.CreateNoWindow = true;
        info.WorkingDirectory = Environment.CurrentDirectory;
        info.EnvironmentVariables.Clear();
        info.EnvironmentVariables["SystemRoot"] = Environment.GetEnvironmentVariable("SystemRoot");
        info.EnvironmentVariables["GIT_CONFIG_NOSYSTEM"] = "1";
        info.EnvironmentVariables["GIT_CONFIG_GLOBAL"] = "NUL";
        info.EnvironmentVariables["GIT_TERMINAL_PROMPT"] = "0";
        info.EnvironmentVariables["GIT_OPTIONAL_LOCKS"] = "0";
        using (Process process = Process.Start(info))
        {
            // The approved supervisor owns this process and every descendant, including Git.
            if (!process.WaitForExit(10000)) throw new InvalidOperationException("Fixture Git deadline exceeded.");
            if (process.ExitCode != 0) throw new InvalidOperationException("Fixture Git failed.");
        }
    }

    private static void Commit(string executable, string digest, bool outside)
    {
        string path = outside ? "protected/config.ts" : "src/index.ts";
        File.WriteAllText(path, outside ? "export const protectedValue = 2;\n" : "export const fixtureResult = 2;\n", Utf8);
        Git(executable, digest, "add", "--", path);
        Git(executable, digest, "commit", "--no-verify", "-m", "Inert fixture result");
    }

    private static Process Descendant()
    {
        string exe = Process.GetCurrentProcess().MainModule.FileName;
        ProcessStartInfo info = new ProcessStartInfo(exe, Quote("child") + " " + Quote(observations) + " " + Quote(Process.GetCurrentProcess().Id.ToString()));
        info.UseShellExecute = false; info.CreateNoWindow = true;
        info.WorkingDirectory = Environment.CurrentDirectory;
        info.EnvironmentVariables.Clear();
        info.EnvironmentVariables["SystemRoot"] = Environment.GetEnvironmentVariable("SystemRoot");
        Process child = Process.Start(info);
        string started = Path.Combine(observations, "child-" + child.Id + ".started");
        Stopwatch deadline = Stopwatch.StartNew();
        while (!File.Exists(started) || !File.Exists(Path.Combine(observations, "child-" + child.Id + ".heartbeat")))
        {
            if (child.HasExited || deadline.ElapsedMilliseconds > 5000) throw new InvalidOperationException("Fixture child failed to become ready.");
            Thread.Sleep(10);
        }
        Observe("child", child.Id.ToString());
        return child;
    }

    private static void Idle()
    {
        Stopwatch clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < 300000)
        {
            Observe("heartbeat", clock.ElapsedMilliseconds.ToString());
            Thread.Sleep(25);
        }
    }

    private static void ChildIdle(int parentPid)
    {
        // Retain the actual parent process handle while the root waits for readiness.
        // This is observation only; no fixture ever terminates a PID.
        using (Process parent = Process.GetProcessById(parentPid))
        {
            Stopwatch clock = Stopwatch.StartNew();
            while (clock.ElapsedMilliseconds < 300000)
            {
                if (parent.HasExited) Observe("parent-exited", "true");
                Observe("heartbeat", clock.ElapsedMilliseconds.ToString());
                Thread.Sleep(25);
            }
        }
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && args[0] == "version") { Console.WriteLine("angit-inert-execution-fixture/1"); return 0; }
            if (args.Length == 2 && args[0] == "restricted-pipe") return RestrictedPipe(args[1]);
            if (args.Length < 2 || !Path.IsPathRooted(args[1]) || !Directory.Exists(args[1])) return 64;
            string mode = args[0]; observations = args[1];
            using (Process own = Process.GetCurrentProcess())
                prefix = (mode == "child" ? "child-" : "root-") + own.Id;
            Observe("started", Process.GetCurrentProcess().Id + "|" + Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks + "|" + Environment.CurrentDirectory);
            if (mode == "child") { if (args.Length != 3) return 64; ChildIdle(Int32.Parse(args[2])); return 0; }
            if (mode == "idle") { Idle(); return 0; }
            if (mode == "root-descendant" || mode == "descendant-tail")
            {
                using (Process child = Descendant())
                {
                    if (mode == "root-descendant") Idle();
                    Observe("root-exiting", "0");
                    return 0;
                }
            }
            if (mode == "stdout-overflow" || mode == "stderr-overflow")
            {
                Stream stream = mode == "stdout-overflow" ? Console.OpenStandardOutput() : Console.OpenStandardError();
                byte[] block = new byte[4096];
                for (int i = 0; i < block.Length; i++) block[i] = (byte)'x';
                // Bounded producer even if supervision is broken: 256 KiB, then inert wait.
                for (int i = 0; i < 64; i++) { stream.Write(block, 0, block.Length); stream.Flush(); }
                Idle(); return 0;
            }
            if (mode == "nonzero") return 23;
            if (mode == "dirty") { File.WriteAllText("src/index.ts", "export const dirtyFixture = 3;\n", Utf8); return 0; }
            if (mode == "untracked") { File.WriteAllText("src/untracked.txt", "Inert untracked output\n", Utf8); return 0; }
            if (mode == "commit" || mode == "outscope" || mode == "delayed-commit" || mode == "retry-once" || mode == "commit-idle")
            {
                if (args.Length != 4) return 64;
                if (mode == "retry-once")
                {
                    string first = Path.Combine(observations, "first-attempt");
                    if (!File.Exists(first)) { using (FileStream file = new FileStream(first, FileMode.CreateNew, FileAccess.Write)) { } return 23; }
                }
                if (mode == "delayed-commit")
                {
                    Observe("waiting", "true");
                    Stopwatch gate = Stopwatch.StartNew();
                    while (!File.Exists(Path.Combine(observations, prefix + ".release")))
                    {
                        if (gate.ElapsedMilliseconds >= 300000) return 24;
                        Observe("heartbeat", gate.ElapsedMilliseconds.ToString());
                        Thread.Sleep(25);
                    }
                }
                Commit(args[2], args[3], mode == "outscope");
                if (mode == "commit-idle") { Observe("committed", "true"); Idle(); }
                return 0;
            }
            return 64;
        }
        catch (Exception error) { Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); return 70; }
    }
}
