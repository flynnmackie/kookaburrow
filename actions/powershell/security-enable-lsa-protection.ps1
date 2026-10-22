$Name = 'Security - Enable LSA Protection'
$Description = 'Turns on LSA protection (RunAsPPL), which makes lsass.exe a protected process so credential dumping tools cannot read its memory without a signed driver. Takes effect after the next restart. Security software that injects into lsass must support protected processes, so test before wide use.'
$Dependencies = @()
$Tags = @('hardening', 'defense-evasion', 'privilege-escalation')

$k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
$old = (Get-ItemProperty -LiteralPath $k).RunAsPPL
Set-ItemProperty -LiteralPath $k -Name RunAsPPL -Value 1 -Type DWord -ErrorAction Stop
Write-Output "RunAsPPL set to 1 (was $(if ($null -eq $old) { 'not set' } else { $old })). Restart the host to apply it."
