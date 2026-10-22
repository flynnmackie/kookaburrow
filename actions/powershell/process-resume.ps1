$Name = 'Processes - Resume'
$Description = 'Continues a process that was frozen with Processes - Suspend, by process id.'
$Dependencies = @()
$Parameters = @('ProcessId')
$Tags = @('recovery', 'process')

if (-not ($ProcessId -as [int]) -or [int]$ProcessId -le 4) { throw 'ProcessId is required and must be a number above 4' }
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class KbProc {
    [DllImport("ntdll.dll")] public static extern uint NtSuspendProcess(IntPtr h);
    [DllImport("ntdll.dll")] public static extern uint NtResumeProcess(IntPtr h);
    [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
$p = Get-Process -Id ([int]$ProcessId) -ErrorAction Stop
$h = [KbProc]::OpenProcess(0x800, $false, $p.Id)
if ($h -eq [IntPtr]::Zero) { throw "Could not open PID $($p.Id) (access denied)" }
$r = [KbProc]::NtResumeProcess($h); [void][KbProc]::CloseHandle($h)
if ($r -ne 0) { throw "NtResumeProcess failed with status 0x$($r.ToString('x'))" }
Write-Output "Resumed PID $($p.Id) $($p.ProcessName)"
