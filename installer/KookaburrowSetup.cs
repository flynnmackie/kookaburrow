// Kookaburrow-Setup-<version>-x64.exe: the same installer as the .msi in a single file. It carries the .msi inside itself, asks for administrator rights
// once, writes the .msi to a temporary folder and runs it with Windows Installer, so the same wizard appears. Everything after the exe's name is passed on
// to msiexec, so silent installs work the same way:
//   Kookaburrow-Setup-1.0.0-x64.exe /qn ADMINLOGIN=admin ADMINPASS=...
// A verbose Windows Installer log is always written to %TEMP%\Kookaburrow-install.log (unless /l... is given), and a failure says where it is.
// Build: scripts/build-msi.js compiles this with the .NET Framework compiler that ships with Windows and embeds the .msi as the resource "Kookaburrow.msi".
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

static class KookaburrowSetup
{
    // msiexec reads PROPERTY="value with spaces" (a quote inside a value is doubled); anything else with a space is quoted whole
    static string Quote(string a)
    {
        if (a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return a;
        int eq = a.IndexOf('=');
        if (eq > 0 && a.Substring(0, eq).IndexOf('/') < 0 && a.Substring(0, eq).IndexOf(' ') < 0)
            return a.Substring(0, eq + 1) + "\"" + a.Substring(eq + 1).Replace("\"", "\"\"") + "\"";
        return "\"" + a.Replace("\"", "\\\"") + "\"";
    }

    [STAThread]
    static int Main(string[] args)
    {
        bool silent = false, ownLog = false;
        var pass = new StringBuilder();
        foreach (string a in args)
        {
            string l = a.ToLowerInvariant();
            if (l == "/quiet" || l == "/passive" || l.StartsWith("/qn") || l == "/q" || l.StartsWith("/qb") || l == "/q0" || l == "-q" || l == "-quiet") silent = true;
            if (l.StartsWith("/l") || l.StartsWith("-l")) ownLog = true;
            pass.Append(' ').Append(Quote(a));
        }
        string dir = Path.Combine(Path.GetTempPath(), "Kookaburrow-setup-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        string log = Path.Combine(Path.GetTempPath(), "Kookaburrow-install.log");
        int code;
        try
        {
            Directory.CreateDirectory(dir);
            string msi = Path.Combine(dir, "Kookaburrow.msi");
            using (Stream src = Assembly.GetExecutingAssembly().GetManifestResourceStream("Kookaburrow.msi"))
            using (FileStream dst = File.Create(msi))
            {
                if (src == null) throw new InvalidOperationException("This setup file does not contain the installer. Download it again.");
                src.CopyTo(dst);
            }
            var psi = new ProcessStartInfo("msiexec.exe", "/i \"" + msi + "\"" + (ownLog ? "" : " /l*v \"" + log + "\"") + pass) { UseShellExecute = false };
            using (Process p = Process.Start(psi)) { p.WaitForExit(); code = p.ExitCode; }
        }
        catch (Exception e)
        {
            if (!silent) MessageBox.Show("Kookaburrow setup could not start.\n\n" + e.Message, "Kookaburrow Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            try { Directory.Delete(dir, true); } catch { }
        }
        // 0 done, 3010 / 1641 done but a restart is needed, 1602 the user cancelled
        if (!silent && code != 0 && code != 3010 && code != 1641 && code != 1602)
            MessageBox.Show("Kookaburrow setup did not finish (Windows Installer error " + code + ").\n\n" +
                (ownLog ? "" : "A detailed log was saved to:\n" + log + "\n\n") +
                "If the account step failed, C:\\ProgramData\\Kookaburrow\\install-setup.log may say why.", "Kookaburrow Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return code;
    }
}
