$Name = 'Services - Unusual'
$Description = 'Lists services whose binary is outside the Windows and Program Files folders, uses an unquoted path containing spaces, runs from a user-writable location, or runs as an account other than the built-in service accounts.'
$Dependencies = @()
$Tags = @('persistence', 'services', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'

# One row per service with at least one flag; Flags says why.
Get-CimInstance Win32_Service | ForEach-Object {
    $path = [string]$_.PathName
    $exe = if ($path -match '^"([^"]+)"') { $Matches[1] }
           elseif ($path -match '^(.+?\.exe)') { $Matches[1] }
           else { ($path -split ' ')[0] }
    $flags = @()
    if ($path -and $path -notmatch '^"' -and $exe -match '\s') { $flags += 'unquoted-path-with-spaces' }
    $trusted = $exe -match '(?i)^C:\\ProgramData\\Microsoft\\(Windows Defender|Windows Defender Advanced Threat Protection)\\'
    if ($exe -and -not $trusted -and $exe -notmatch '^(?i)(C:\\Windows\\|C:\\Program Files( \(x86\))?\\)') { $flags += 'outside-standard-dirs' }
    if ($exe -and -not $trusted -and $exe -match '(?i)\\(Users|Temp|ProgramData|AppData)\\') { $flags += 'user-writable-location' }
    if ($_.StartName -and $_.StartName -notmatch '^(LocalSystem|NT AUTHORITY\\(LocalService|NetworkService)|NT SERVICE\\.*)$') { $flags += 'custom-account' }
    if ($flags) {
        [pscustomobject]@{ Name = $_.Name; DisplayName = $_.DisplayName; State = $_.State; StartMode = $_.StartMode; Account = $_.StartName; Path = $path; Flags = ($flags -join ', ') }
    }
} | Sort-Object Name
