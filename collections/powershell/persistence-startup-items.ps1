$Name = 'Persistence - Startup Items'
$Description = 'Programs that start at logon from the Startup folders (all users and each profile) and the legacy Win32_StartupCommand list, with file hashes. Dropping a file or shortcut in a Startup folder is the simplest persistence.'
$Dependencies = @()
$Tags = @('persistence', 'autoruns')

$ErrorActionPreference = 'SilentlyContinue'
$dirs = @(@{ Scope = 'All users'; Path = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup" })
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) { $dirs += @{ Scope = (Split-Path $p.LocalPath -Leaf); Path = "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup" } }
foreach ($d in $dirs) {
    Get-ChildItem -LiteralPath $d.Path -Force | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
        $target = ''
        if ($_.Extension -eq '.lnk') { $target = (New-Object -ComObject WScript.Shell).CreateShortcut($_.FullName).TargetPath }
        [pscustomobject]@{ Source = 'Startup folder'; Scope = $d.Scope; Name = $_.Name; Path = $_.FullName; Target = $target; Modified = $_.LastWriteTime; Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    }
}
Get-CimInstance Win32_StartupCommand | ForEach-Object { [pscustomobject]@{ Source = 'Win32_StartupCommand'; Scope = $_.User; Name = $_.Name; Path = $_.Location; Target = $_.Command; Modified = ''; Sha256 = '' } }
