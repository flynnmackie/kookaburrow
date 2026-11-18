$Name = 'Software - Remote Administration and Network Tools'
$Description = 'Installed Sysinternals, PuTTY, WinSCP, Wireshark, nmap, VNC and similar tools found in Program Files and the registry. Normal for admins, notable on a user workstation.'
$Dependencies = @()
$Tags = @('inventory', 'discovery', 'lateral-movement')

$ErrorActionPreference = 'SilentlyContinue'
$pat = 'Sysinternals|PuTTY|WinSCP|FileZilla|Wireshark|Npcap|WinPcap|Nmap|VNC|Advanced IP Scanner|Angry IP|Remote Desktop Manager|mRemoteNG|RDCMan|Cyberduck|Burp|Fiddler|Process Hacker|Process Explorer|x64dbg|OllyDbg|IDA|Ghidra|dnSpy|HxD|Cain|John the Ripper|Hashcat'
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') { Get-ChildItem $k | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.DisplayName -match $pat) { [pscustomobject]@{ Name = $p.DisplayName; Version = $p.DisplayVersion; Publisher = $p.Publisher; InstallDate = $p.InstallDate; Location = $p.InstallLocation } } } }
