$Name = 'Persistence - Accessibility Binaries'
$Description = 'Hashes and signatures of the programs reachable from the Windows logon screen (sethc, utilman, osk, narrator, magnify, displayswitch, atbroker) compared with cmd.exe and powershell.exe. If one has been replaced by a command shell (the sticky keys backdoor) the hash will match cmd.exe or the signature will be missing.'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
$sys = [Environment]::SystemDirectory
$cmd = (Get-FileHash "$sys\cmd.exe" -Algorithm SHA256).Hash
$ps = (Get-FileHash "$sys\WindowsPowerShell\v1.0\powershell.exe" -Algorithm SHA256).Hash
foreach ($n in 'sethc.exe', 'utilman.exe', 'osk.exe', 'narrator.exe', 'magnify.exe', 'displayswitch.exe', 'atbroker.exe') {
    $f = Get-Item "$sys\$n"
    if (-not $f) { continue }
    $h = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
    $s = Get-AuthenticodeSignature $f.FullName
    [pscustomobject]@{ Binary = $n; Modified = $f.LastWriteTime; SizeKB = [math]::Round($f.Length / 1KB, 1); Sha256 = $h; Signature = $s.Status; Signer = $s.SignerCertificate.Subject; MatchesCmd = ($h -eq $cmd); MatchesPowerShell = ($h -eq $ps) }
}
