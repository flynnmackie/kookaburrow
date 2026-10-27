$Name = 'System - Certificates'
$Description = 'Certificates in the machine and current-user Root, CA, TrustedPublisher and personal stores with issuer, expiry and thumbprint.'
$Dependencies = @()
$Parameters = @('Store?')
$Tags = @('persistence', 'defense-evasion', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$stores = if ($Store) { @($Store) } else { @('LocalMachine\Root', 'LocalMachine\CA', 'LocalMachine\TrustedPublisher', 'LocalMachine\My', 'CurrentUser\Root', 'CurrentUser\TrustedPublisher') }
foreach ($s in $stores) {
    Get-ChildItem "Cert:\$s" | ForEach-Object {
        [pscustomobject]@{ Store = $s; Subject = $_.Subject; Issuer = $_.Issuer; SelfSigned = ($_.Subject -eq $_.Issuer); NotBefore = $_.NotBefore; NotAfter = $_.NotAfter; Thumbprint = $_.Thumbprint; FriendlyName = $_.FriendlyName }
    }
}
