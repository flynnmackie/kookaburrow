$Name = 'Security - AppLocker and Code Integrity Policy'
$Description = 'Effective AppLocker rule collections and the Windows Defender Application Control (code integrity) mode. Shows whether application control is enforced.'
$Dependencies = @()
$Tags = @('security', 'defense-evasion', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$x = [xml](Get-AppLockerPolicy -Effective -Xml)
foreach ($c in $x.AppLockerPolicy.RuleCollection) { [pscustomobject]@{ Setting = "AppLocker $($c.Type)"; Value = "mode $($c.EnforcementMode), $(@($c.ChildNodes | Where-Object { $_.Name -like '*Rule' }).Count) rules" } }
$d = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard
[pscustomobject]@{ Setting = 'Code integrity policy (0 off, 1 audit, 2 enforced)'; Value = $d.CodeIntegrityPolicyEnforcementStatus }
[pscustomobject]@{ Setting = 'User mode code integrity'; Value = $d.UsermodeCodeIntegrityPolicyEnforcementStatus }
