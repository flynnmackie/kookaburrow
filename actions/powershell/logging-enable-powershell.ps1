$Name = 'Logging - Enable PowerShell Logging'
$Description = 'Turns on PowerShell script block logging (event 4104) and module logging for all modules by policy, so attacker PowerShell is recorded from now on. TranscriptPath optionally also turns on transcription to that folder (for example C:\PSTranscripts). Takes effect for new PowerShell sessions.'
$Dependencies = @()
$Parameters = @('TranscriptPath?')
$Tags = @('hardening', 'powershell', 'event-logs')

$b = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell'
New-Item -Path "$b\ScriptBlockLogging" -Force | Out-Null
Set-ItemProperty -Path "$b\ScriptBlockLogging" -Name EnableScriptBlockLogging -Value 1 -Type DWord
New-Item -Path "$b\ModuleLogging\ModuleNames" -Force | Out-Null
Set-ItemProperty -Path "$b\ModuleLogging" -Name EnableModuleLogging -Value 1 -Type DWord
Set-ItemProperty -Path "$b\ModuleLogging\ModuleNames" -Name '*' -Value '*' -Type String
Write-Output 'Script block logging and module logging enabled.'
if ($TranscriptPath) {
    New-Item -ItemType Directory -Force -Path $TranscriptPath | Out-Null
    New-Item -Path "$b\Transcription" -Force | Out-Null
    Set-ItemProperty -Path "$b\Transcription" -Name EnableTranscripting -Value 1 -Type DWord
    Set-ItemProperty -Path "$b\Transcription" -Name OutputDirectory -Value $TranscriptPath -Type String
    Set-ItemProperty -Path "$b\Transcription" -Name EnableInvocationHeader -Value 1 -Type DWord
    Write-Output "Transcription enabled to $TranscriptPath"
}
