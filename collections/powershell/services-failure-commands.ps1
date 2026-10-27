$Name = 'Services - Failure Commands'
$Description = 'Services that run a command when they fail (the Recovery tab "run a program" action, FailureCommand) and services whose DLL is loaded by svchost (ServiceDll) with that DLL signature.'
$Dependencies = @()
$Tags = @('persistence', 'services', 'privilege-escalation', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($k in Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services') {
    $p = Get-ItemProperty $k.PSPath
    if ($p.FailureCommand) { [pscustomobject]@{ Service = $k.PSChildName; Setting = 'FailureCommand'; Value = $p.FailureCommand; Signature = ''; Signer = '' } }
    $dll = (Get-ItemProperty "$($k.PSPath)\Parameters").ServiceDll
    if ($dll) {
        $exp = [Environment]::ExpandEnvironmentVariables($dll)
        $sig = if (Test-Path -LiteralPath $exp) { Get-AuthenticodeSignature -LiteralPath $exp } else { $null }
        [pscustomobject]@{ Service = $k.PSChildName; Setting = 'ServiceDll'; Value = $dll; Signature = $(if ($sig) { $sig.Status } else { 'file not found' }); Signer = $sig.SignerCertificate.Subject }
    }
}
