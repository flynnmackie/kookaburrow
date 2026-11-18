$Name = 'Services - Security Services Status'
$Description = 'State of the services that protect the host: Defender, Windows Firewall, event log, security center, Sysmon, update and the common endpoint agents. A stopped or disabled one is a finding.'
$Dependencies = @()
$Tags = @('services', 'defense-evasion', 'security')

$ErrorActionPreference = 'SilentlyContinue'
$names = 'WinDefend', 'Sense', 'WdNisSvc', 'MpsSvc', 'EventLog', 'wscsvc', 'Sysmon', 'Sysmon64', 'wuauserv', 'BITS', 'CryptSvc', 'W32Time', 'WinRM', 'Winmgmt', 'CSFalconService', 'SentinelAgent', 'CylanceSvc', 'MBAMService', 'SepMasterService', 'TmListen', 'mfevtp', 'EPSecurityService'
foreach ($n in $names) { $s = Get-CimInstance Win32_Service -Filter "Name='$n'"; if ($s) { [pscustomobject]@{ Service = $n; DisplayName = $s.DisplayName; State = $s.State; StartMode = $s.StartMode; Path = $s.PathName } } }
