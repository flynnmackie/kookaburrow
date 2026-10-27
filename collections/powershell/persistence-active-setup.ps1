$Name = 'Persistence - Active Setup'
$Description = 'Active Setup components: programs that run once for every user at their next logon (StubPath), for the machine and 32-bit views.'
$Dependencies = @()
$Tags = @('persistence', 'registry', 'autoruns')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($base in 'HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Active Setup\Installed Components') {
    foreach ($k in Get-ChildItem $base) {
        $p = Get-ItemProperty $k.PSPath
        if (-not $p.StubPath) { continue }
        [pscustomobject]@{ View = $(if ($base -like '*WOW6432Node*') { '32-bit' } else { '64-bit' }); Component = $k.PSChildName; Name = $p.'(default)'; Version = $p.Version; StubPath = $p.StubPath; Modified = '' }
    }
}
