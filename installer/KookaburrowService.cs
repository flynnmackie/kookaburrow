// Runs Kookaburrow as a Windows service: starts the bundled Node.js with server.js, keeps it running, and restarts it when it exits
// (the server exits on purpose after Server Settings are saved). Output goes to <data>\server.log.
// Build: csc /target:exe /out:KookaburrowService.exe KookaburrowService.cs   (the .NET Framework compiler that ships with Windows)
// Test without installing:  KookaburrowService.exe --console
using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

class KookaburrowService : ServiceBase
{
    readonly string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
    readonly string home;
    readonly ManualResetEvent stopping = new ManualResetEvent(false);
    Thread worker;
    Process child;

    KookaburrowService()
    {
        ServiceName = "Kookaburrow";
        CanStop = true;
        home = Environment.GetEnvironmentVariable("KB_HOME");
        if (string.IsNullOrEmpty(home))
            home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Kookaburrow");
    }

    static void Main(string[] args)
    {
        var svc = new KookaburrowService();
        if (args.Length > 0 && args[0] == "--console")
        {
            svc.OnStart(args);
            Console.WriteLine("Running. Press Enter to stop.");
            if (Console.ReadLine() == null) Thread.Sleep(Timeout.Infinite); // no console attached: run until killed
            svc.OnStop();
            return;
        }
        ServiceBase.Run(svc);
    }

    protected override void OnStart(string[] args)
    {
        worker = new Thread(Loop) { IsBackground = true };
        worker.Start();
    }

    protected override void OnStop()
    {
        stopping.Set();
        Kill();
        if (worker != null) worker.Join(8000);
    }

    void Kill()
    {
        var p = child;
        if (p == null) return;
        try
        {
            if (!p.HasExited)
            {
                // /T also ends what the server started (the WinRM engine, scans)
                var k = Process.Start(new ProcessStartInfo("taskkill.exe", "/PID " + p.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false });
                k.WaitForExit(5000);
            }
        }
        catch { }
    }

    void Loop()
    {
        string logDir = Path.Combine(home, "data");
        Directory.CreateDirectory(logDir);
        string log = Path.Combine(logDir, "server.log");
        try { if (File.Exists(log) && new FileInfo(log).Length > 10 * 1024 * 1024) File.Move(log, log + ".1"); } catch { }

        while (!stopping.WaitOne(0))
        {
            var started = DateTime.UtcNow;
            try
            {
                var psi = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "\"" + Path.Combine(root, "server.js") + "\"")
                {
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                psi.EnvironmentVariables["KB_HOME"] = home;
                psi.EnvironmentVariables["KB_SERVICE"] = "1";
                child = Process.Start(psi);
                var sw = new StreamWriter(new FileStream(log, FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) { AutoFlush = true };
                object gate = new object();
                DataReceivedEventHandler h = (s, e) => { if (e.Data != null) lock (gate) sw.WriteLine(e.Data); };
                child.OutputDataReceived += h;
                child.ErrorDataReceived += h;
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                child.WaitForExit();
                lock (gate) sw.WriteLine(DateTime.UtcNow.ToString("o") + " server exited with code " + child.ExitCode);
                sw.Dispose();
            }
            catch (Exception ex)
            {
                try { File.AppendAllText(log, DateTime.UtcNow.ToString("o") + " service error: " + ex.Message + Environment.NewLine); } catch { }
            }
            // a restart after Server Settings is quick; a server that dies at once is retried more slowly
            int wait = (DateTime.UtcNow - started).TotalSeconds < 10 ? 10000 : 1000;
            if (stopping.WaitOne(wait)) break;
        }
    }
}
