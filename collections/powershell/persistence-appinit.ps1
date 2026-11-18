$Name = 'Persistence - AppInit and AppCert DLLs'
$Description = 'DLLs loaded into every process that loads user32 (AppInit_DLLs) or created a process (AppCertDLLs), a classic injection persistence.'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Windows') { $p = Get-ItemProperty $k; [pscustomobject]@{ Key = $k; Value = 'AppInit_DLLs'; Data = $p.AppInit_DLLs }; [pscustomobject]@{ Key = $k; Value = 'LoadAppInit_DLLs'; Data = $p.LoadAppInit_DLLs } }
$c = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCertDlls'
foreach ($n in ($c.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { [pscustomobject]@{ Key = 'AppCertDlls'; Value = $n.Name; Data = $n.Value } }
