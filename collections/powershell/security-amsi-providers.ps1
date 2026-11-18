$Name = 'Security - AMSI Providers and Script Logging'
$Description = 'Registered AMSI providers (an extra or missing provider can blind PowerShell scanning) and the PowerShell script block, module and transcription logging policy.'
$Dependencies = @()
$Tags = @('defense-evasion', 'powershell', 'security')

$ErrorActionPreference = 'SilentlyContinue'
Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\AMSI\Providers' | ForEach-Object { $g = $_.PSChildName; $dll = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\CLSID\$g\InprocServer32").'(default)'; [pscustomobject]@{ Setting = 'AMSI provider'; Value = "$g $dll" } }
foreach ($e in @(@('ScriptBlockLogging', 'EnableScriptBlockLogging'), @('ModuleLogging', 'EnableModuleLogging'), @('Transcription', 'EnableTranscripting'))) { $v = (Get-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\$($e[0])").($e[1]); [pscustomobject]@{ Setting = $e[1]; Value = "$v" } }
