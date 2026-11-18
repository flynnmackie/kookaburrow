$Name = 'Registry - Policy Restrictions'
$Description = 'Policies that disable security and management tools: Task Manager, Registry Editor, Command Prompt, Run, Windows Update and Defender. Malware sets them to hinder cleanup.'
$Dependencies = @()
$Tags = @('defense-evasion', 'registry', 'security')

$ErrorActionPreference = 'SilentlyContinue'
$k = @{ 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' = 'DisableTaskMgr', 'DisableRegistryTools', 'DisableCMD', 'NoDispBackgroundPage'; 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' = 'DisableTaskMgr', 'DisableRegistryTools', 'DisableCMD'; 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' = 'NoRun', 'NoControlPanel', 'NoFolderOptions', 'NoDriveTypeAutoRun'; 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender' = 'DisableAntiSpyware', 'DisableAntiVirus'; 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' = 'NoAutoUpdate' }
foreach ($path in $k.Keys) { $p = Get-ItemProperty $path; foreach ($n in $k[$path]) { if ($null -ne $p.$n) { [pscustomobject]@{ Key = $path; Value = $n; Data = $p.$n } } } }
