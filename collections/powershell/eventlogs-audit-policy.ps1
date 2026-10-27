$Name = 'Event Logs - Audit Policy'
$Description = 'Effective advanced audit policy (auditpol), whether command lines are included in process creation events, and the PowerShell script block, module and transcription logging policies. Needs administrator rights.'
$Dependencies = @()
$Tags = @('event-logs', 'inventory', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
(auditpol /get /category:* /r) | ConvertFrom-Csv | ForEach-Object { [pscustomobject]@{ Setting = 'Audit policy'; Name = "$($_.Category) / $($_.Subcategory)"; Value = $_.'Inclusion Setting' } }
$p = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit'
[pscustomobject]@{ Setting = 'Command line in 4688'; Name = 'ProcessCreationIncludeCmdLine_Enabled'; Value = "$($p.ProcessCreationIncludeCmdLine_Enabled)" }
foreach ($k in @(@('ScriptBlockLogging', 'EnableScriptBlockLogging'), @('ModuleLogging', 'EnableModuleLogging'), @('Transcription', 'EnableTranscripting'))) {
    $v = Get-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\$($k[0])"
    [pscustomobject]@{ Setting = 'PowerShell logging policy'; Name = $k[0]; Value = "$($v.($k[1]))" }
}
Get-WinEvent -ListLog Security, System, 'Microsoft-Windows-PowerShell/Operational', 'Microsoft-Windows-Sysmon/Operational' | ForEach-Object { [pscustomobject]@{ Setting = 'Log'; Name = $_.LogName; Value = "enabled=$($_.IsEnabled) maxMB=$([math]::Round($_.MaximumSizeInBytes / 1MB)) mode=$($_.LogMode)" } }
