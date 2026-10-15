using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Isolated feasibility fixture, never part of the installed product runtime.
internal static class WorkerHandoffHost
{
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 8 };
    static string root, owner, requestHash, nonce;
    static Process coordinator;
    static long coordinatorTicks;
    static readonly object logLock = new object();
    static readonly StringBuilder diagnostics = new StringBuilder();
    static volatile bool drainFailed;

    static void Need(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    static string Hash(byte[] value) { using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(value)).Replace("-", "").ToLowerInvariant(); }
    static string HashFile(string path)
    {
        using (SHA256 hash = SHA256.Create())
        using (FileStream input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            return BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
    }
    static byte[] Read(string name)
    {
        string path = Path.Combine(root, name);
        string before = Platform.Inspect(path, "assertPrivateFile", owner);
        byte[] bytes;
        using (FileStream input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            Need(input.Length > 0 && input.Length <= 16384, "Bounded private fixture input required.");
            bytes = new byte[(int)input.Length]; int at = 0;
            while (at < bytes.Length) { int count = input.Read(bytes, at, bytes.Length - at); Need(count > 0, "Input changed during read."); at += count; }
            Need(input.ReadByte() == -1, "Input grew during read.");
        }
        Need(Platform.Inspect(path, "assertPrivateFile", owner) == before, "Private fixture identity changed.");
        return bytes;
    }
    static void Save(string name, object value)
    {
        byte[] bytes = Utf8.GetBytes(Json.Serialize(value) + "\n");
        Need(bytes.Length <= 16384, "Fixture output bound exceeded.");
        string target = Path.Combine(root, name), temporary = target + "." + Guid.NewGuid().ToString("N") + ".part";
        using (FileStream output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
        { output.Write(bytes, 0, bytes.Length); output.Flush(true); }
        File.Move(temporary, target);
    }
    static string Quote(string value)
    {
        StringBuilder output = new StringBuilder("\""); int slashes = 0;
        foreach (char ch in value)
        {
            if (ch == '\\') { slashes++; continue; }
            if (ch == '"') output.Append('\\', slashes * 2 + 1); else output.Append('\\', slashes);
            output.Append(ch); slashes = 0;
        }
        output.Append('\\', slashes * 2); return output.Append('"').ToString();
    }
    static string Text(Dictionary<string, object> data, string name)
    { object value; Need(data.TryGetValue(name, out value) && value is string, "Closed fixture request field missing."); return (string)value; }
    static byte[] Hex(string value)
    {
        Need(value.Length == 64, "Fixture nonce/hash length differs."); byte[] result = new byte[32];
        for (int i = 0; i < result.Length; i++) result[i] = Convert.ToByte(value.Substring(i * 2, 2), 16);
        return result;
    }
    static void Receipt(string kind, int exitCode)
    {
        using (Process host = Process.GetCurrentProcess())
        {
            string hostTicks = host.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);
            string ticks = coordinatorTicks.ToString(System.Globalization.CultureInfo.InvariantCulture);
            string transcript = String.Join("\n", new[] { "angit-worker-host-probe/v1", kind, host.Id.ToString(), hostTicks, coordinator.Id.ToString(), ticks, exitCode.ToString(), requestHash }) + "\n";
            string mac;
            using (HMACSHA256 hmac = new HMACSHA256(Hex(nonce))) mac = BitConverter.ToString(hmac.ComputeHash(Utf8.GetBytes(transcript))).Replace("-", "").ToLowerInvariant();
            Save("host-" + kind + ".json", new { schemaVersion = "angit-worker-host-probe/v1", kind, hostPid = host.Id, hostTicks, coordinatorPid = coordinator.Id, coordinatorTicks = ticks, exitCode, requestHash, mac });
        }
    }
    static void Drain(StreamReader input)
    {
        char[] buffer = new char[512]; int count;
        while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
        { lock (logLock) { if (diagnostics.Length + count > 8192) drainFailed = true; else diagnostics.Append(buffer, 0, count); } }
    }
    public static int Main(string[] args)
    {
        bool closed = false;
        try
        {
            if (args.Length == 2 && args[0] == "--identity")
            {
                using (Process observed = Process.GetProcessById(Int32.Parse(args[1])))
                {
                    IntPtr retained = observed.Handle;
                    Console.WriteLine(Json.Serialize(new { pid = observed.Id, ticks = observed.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture) }));
                }
                return 0;
            }
            if (args.Length == 3 && args[0] == "--absent")
            {
                int pid = Int32.Parse(args[1]); bool absent;
                try
                {
                    using (Process observed = Process.GetProcessById(pid))
                    {
                        IntPtr retained = observed.Handle;
                        absent = observed.HasExited || observed.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture) != args[2];
                    }
                }
                catch (ArgumentException) { absent = true; }
                Console.WriteLine(Json.Serialize(new { originalAbsent = absent })); return 0;
            }
            Need(args.Length == 2 && Environment.Is64BitProcess, "Explicit private case and request hash required.");
            root = Platform.OrdinaryPath(args[0]); owner = Platform.OwnerSid();
            Platform.Inspect(root, "assertPrivateDirectory", owner);
            requestHash = args[1]; Hex(requestHash);
            byte[] requestBytes = Read("request.json"); Need(Hash(requestBytes) == requestHash, "Fixture request digest mismatch.");
            Dictionary<string, object> request = Json.Deserialize<Dictionary<string, object>>(Utf8.GetString(requestBytes));
            Need(request.Count == 9, "Unknown fixture request field.");
            string node = Text(request, "node"), script = Text(request, "script"), mode = Text(request, "mode");
            string nodeHash = Text(request, "nodeHash"), scriptHash = Text(request, "scriptHash");
            nonce = Text(request, "nonce"); Hex(nonce);
            Need(Text(request, "schemaVersion") == "angit-worker-handoff-fixture/v1", "Wrong fixture request version.");
            Need(mode == "normal" || mode == "before-handoff-loss" || mode == "handoff-creator-crash" || mode == "handoff-marker-crash" || mode == "reply-loss" || mode == "coordinator-crash" || mode == "graceful-stop-failure", "Unknown inert fixture mode.");
            Platform.Inspect(node, "identify", owner); Platform.Inspect(script, "identify", owner);
            Need(HashFile(node) == nodeHash && HashFile(script) == scriptHash, "Pinned runtime/entrypoint changed.");
            int launcherPid = Int32.Parse(Text(request, "launcherPid")); long launcherTicks = Int64.Parse(Text(request, "launcherTicks"));
            using (Process launcher = Process.GetProcessById(launcherPid))
            {
                IntPtr retainedLauncherHandle = launcher.Handle;
                Need(launcher.StartTime.ToUniversalTime().Ticks == launcherTicks, "Launcher process identity changed.");
                ProcessStartInfo info = new ProcessStartInfo(node, Quote(script) + " --coordinator " + Quote(root));
                info.UseShellExecute = false; info.CreateNoWindow = true; info.WorkingDirectory = root;
                info.EnvironmentVariables.Clear(); info.EnvironmentVariables["SystemRoot"] = Environment.GetEnvironmentVariable("SystemRoot");
                info.RedirectStandardOutput = true; info.RedirectStandardError = true;
                coordinator = Process.Start(info); IntPtr retainedCoordinatorHandle = coordinator.Handle;
                coordinatorTicks = coordinator.StartTime.ToUniversalTime().Ticks;
                Save("coordinator-start.json", new { pid = coordinator.Id, ticks = coordinatorTicks.ToString(), nodeHash, scriptHash, requestHash });
                Thread output = new Thread(delegate() { try { Drain(coordinator.StandardOutput); } catch (Exception) { drainFailed = true; } }); output.IsBackground = true; output.Start();
                Thread errors = new Thread(delegate() { try { Drain(coordinator.StandardError); } catch (Exception) { drainFailed = true; } }); errors.IsBackground = true; errors.Start();
                Stopwatch clock = Stopwatch.StartNew(); bool handed = false, ready = false, creatorExitRecorded = false; int rejected = 0;
                while (!coordinator.HasExited)
                {
                    Need(clock.ElapsedMilliseconds < 90000, "Isolated host lifetime bound exceeded.");
                    Need(!drainFailed, "Inert Coordinator diagnostics failed or exceeded the bound.");
                    if (!handed && File.Exists(Path.Combine(root, "handoff.json")))
                    {
                        var handoff = Json.Deserialize<Dictionary<string, object>>(Utf8.GetString(Read("handoff.json")));
                        Need(handoff.Count == 2 && Text(handoff, "nonce") == nonce && Text(handoff, "requestHash") == requestHash, "Invalid fixture handoff.");
                        handed = true;
                    }
                    if (!handed && !creatorExitRecorded && launcher.HasExited)
                    {
                        Save("creator-exited.json", new { requestHash, launcherPid, launcherTicks = launcherTicks.ToString() });
                        creatorExitRecorded = true;
                    }
                    if (!ready && File.Exists(Path.Combine(root, "coordinator-ready.json")))
                    {
                        var state = Json.Deserialize<Dictionary<string, object>>(Utf8.GetString(Read("coordinator-ready.json")));
                        Need(Text(state, "requestHash") == requestHash && Text(state, "nonceHash") == Hash(Hex(nonce)) && Convert.ToInt32(state["epoch"]) == 2 && Convert.ToInt32(state["pid"]) == coordinator.Id, "Unbound Coordinator readiness.");
                        Need(handed, "Ready before authorized handoff."); Receipt("ready", -1); ready = true;
                    }
                    bool crash = File.Exists(Path.Combine(root, "crash.token"));
                    string control = crash ? "crash.token" : "stop.token";
                    if (File.Exists(Path.Combine(root, control)))
                    {
                        if (Hash(Read(control)) != Hash(Utf8.GetBytes(nonce + "|" + coordinatorTicks + "|" + requestHash)))
                        {
                            if (rejected < 8)
                            {
                                rejected++;
                                File.Move(Path.Combine(root, control), Path.Combine(root, "rejected-" + rejected + "-" + control));
                                Save("rejected-control-" + rejected + ".json", new { reason = "wrong-launch-or-token", coordinatorPid = coordinator.Id });
                            }
                            else File.Delete(Path.Combine(root, control));
                            continue;
                        }
                        if (crash) coordinator.Kill();
                        else Save("coordinator-stop.json", new { requestHash, nonce });
                        Need(coordinator.WaitForExit(5000), "Exact owned Coordinator failed to close."); break;
                    }
                    Thread.Sleep(10);
                }
                Need(coordinator.WaitForExit(5000), "Coordinator exit not observed.");
                Need(output.Join(2000) & errors.Join(2000), "Diagnostic streams did not close.");
                Need(!drainFailed, "Inert Coordinator diagnostics failed or exceeded the bound.");
                Receipt("exit", coordinator.ExitCode); closed = true;
                if (diagnostics.Length > 0) Save("diagnostics.json", new { text = diagnostics.ToString() });
            }
            return 0;
        }
        catch (Exception error)
        {
            try { if (coordinator != null && !coordinator.HasExited) { coordinator.Kill(); coordinator.WaitForExit(5000); } }
            catch { }
            try { Save("host-error.json", new { error = error.GetType().Name, message = error.Message, retainedChildExitObserved = coordinator != null && coordinator.HasExited, closed }); }
            catch { }
            return 1;
        }
        finally { if (coordinator != null) coordinator.Dispose(); }
    }
}
