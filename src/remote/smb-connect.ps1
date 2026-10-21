# Connects this Windows logon session to a share (\\host\share) with explicit credentials, or disconnects it again.
# Credentials arrive via environment variables (never the command line). Once connected, any process in the same Windows session
# (the Kookaburrow server) can read \\host\share\... directly, with full SMB3 support (signing, encryption).
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KbWNet {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class NETRESOURCE { public int dwScope; public int dwType; public int dwDisplayType; public int dwUsage; public string lpLocalName; public string lpRemoteName; public string lpComment; public string lpProvider; }
    [DllImport("mpr.dll", CharSet = CharSet.Unicode)] public static extern int WNetAddConnection2(NETRESOURCE r, string password, string user, int flags);
    [DllImport("mpr.dll", CharSet = CharSet.Unicode)] public static extern int WNetCancelConnection2(string name, int flags, bool force);
}
'@
$remote = '\\' + $env:KB_HOST + '\' + $env:KB_SHARE
if ($env:KB_ACTION -eq 'disconnect') {
    $rc = [KbWNet]::WNetCancelConnection2($remote, 0, $true)
    if ($rc -ne 0 -and $rc -ne 2250) { throw (New-Object System.ComponentModel.Win32Exception $rc).Message }
    return
}
[void][KbWNet]::WNetCancelConnection2($remote, 0, $true) # drop a stale connection to the same share first
$nr = New-Object KbWNet+NETRESOURCE
$nr.dwType = 1
$nr.lpRemoteName = $remote
$rc = [KbWNet]::WNetAddConnection2($nr, $env:KB_PASS, $env:KB_USER, 0)
if ($rc -ne 0) { throw ('{0} (error {1})' -f (New-Object System.ComponentModel.Win32Exception $rc).Message, $rc) }
if (-not (Test-Path -LiteralPath $remote)) { throw "Connected, but $remote cannot be opened" }
