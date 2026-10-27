# Signs the installer with an Authenticode code-signing certificate:
#   .\scripts\sign-msi.ps1 -Msi build\Kookaburrow-1.0.0-x64.msi -Pfx C:\keys\mycert.pfx        (a real certificate; password in $env:KB_SIGN_PFX_PASSWORD)
#   .\scripts\sign-msi.ps1 -Msi ... -Thumbprint 0123ABCD...                                    (a certificate already in your certificate store, or on a token)
#   .\scripts\sign-msi.ps1 -Msi ... -SelfSigned                                                (makes a self-signed certificate once and uses it)
# The signature is checked by Windows without internet access. A self-signed certificate is only trusted on machines where its public
# certificate (build\signing\Kookaburrow-signing.cer) has been imported into Trusted Root Certification Authorities and Trusted
# Publishers; a certificate from a public CA is trusted everywhere. The timestamp keeps the signature valid after the certificate expires.
param(
  [Parameter(Mandatory = $true)][string]$Msi,
  [string]$Pfx,
  [string]$Thumbprint,
  [switch]$SelfSigned,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Msi)) { throw "Not found: $Msi" }
$Msi = (Resolve-Path -LiteralPath $Msi).Path
$root = Split-Path -Parent $PSScriptRoot

if ($Pfx) {
  $pw = $env:KB_SIGN_PFX_PASSWORD
  $secure = if ($pw) { ConvertTo-SecureString $pw -AsPlainText -Force } else { New-Object System.Security.SecureString }
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList (Resolve-Path $Pfx).Path, $secure, 'Exportable'
} elseif ($Thumbprint) {
  $cert = Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq ($Thumbprint -replace '\s', '') } | Select-Object -First 1
  if (-not $cert) { throw "No certificate with thumbprint $Thumbprint in the certificate store" }
} elseif ($SelfSigned) {
  $dir = Join-Path $root 'build\signing'
  New-Item -ItemType Directory -Force $dir | Out-Null
  $pfxFile = Join-Path $dir 'Kookaburrow-signing.pfx'
  $cerFile = Join-Path $dir 'Kookaburrow-signing.cer'
  $pwFile = Join-Path $dir 'password.txt'
  if (-not (Test-Path $pfxFile)) {
    $made = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Kookaburrow, O=Kookaburrow' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5) -CertStoreLocation Cert:\CurrentUser\My
    $pass = [Convert]::ToBase64String((1..18 | ForEach-Object { Get-Random -Maximum 256 }))
    Set-Content -Path $pwFile -Value $pass -NoNewline
    Export-PfxCertificate -Cert $made -FilePath $pfxFile -Password (ConvertTo-SecureString $pass -AsPlainText -Force) | Out-Null
    Export-Certificate -Cert $made -FilePath $cerFile | Out-Null
    Remove-Item "Cert:\CurrentUser\My\$($made.Thumbprint)" -Force   # keep it only in the files below, not in this PC's certificate store
    Write-Host "Made a self-signed certificate: $cerFile (give this file to the machines that should trust the installer)"
  }
  $secure = ConvertTo-SecureString (Get-Content $pwFile -Raw) -AsPlainText -Force
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $pfxFile, $secure, 'Exportable'
} else {
  throw 'Choose a certificate: -Pfx, -Thumbprint or -SelfSigned'
}

$usages = @($cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages | ForEach-Object { $_.Value } })
if ($usages -notcontains '1.3.6.1.5.5.7.3.3') { throw 'That certificate is not a code-signing certificate' }
Write-Host "Signing with: $($cert.Subject) (expires $($cert.NotAfter.ToString('yyyy-MM-dd')))"
try {
  $r = Set-AuthenticodeSignature -FilePath $Msi -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $TimestampUrl
} catch { $r = $null }
if (-not $r -or -not $r.SignerCertificate) {
  Write-Warning "Could not reach the timestamp server ($TimestampUrl); signing without a timestamp. The signature will stop being valid when the certificate expires."
  $r = Set-AuthenticodeSignature -FilePath $Msi -Certificate $cert -HashAlgorithm SHA256
}
$check = Get-AuthenticodeSignature -FilePath $Msi
Write-Host "Signature: $($check.Status) ($($check.StatusMessage))"
if (-not $check.SignerCertificate) { throw 'The installer was not signed' }
Write-Host "Signed by $($check.SignerCertificate.Subject), thumbprint $($check.SignerCertificate.Thumbprint)$(if ($check.TimeStamperCertificate) { ', timestamped' } else { ', not timestamped' })"
