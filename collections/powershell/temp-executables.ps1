$Name = 'Files - Temp Executables'
$Description = 'Finds executables, libraries and scripts changed in the last 7 days under user temp, downloads, AppData, ProgramData and Public folders, with signature status and SHA-256. Malware is commonly dropped and run from these locations.'
$Dependencies = @()
$Tags = @('execution', 'malware', 'filesystem')

$ErrorActionPreference = 'SilentlyContinue'
$cutoff = (Get-Date).AddDays(-7)
$ext = '.exe', '.dll', '.scr', '.ps1', '.bat', '.cmd', '.vbs', '.js', '.hta', '.jar', '.lnk'

$roots = @('C:\Windows\Temp', 'C:\ProgramData', 'C:\Users\Public')
$roots += Get-ChildItem 'C:\Users' -Directory | ForEach-Object {
    Join-Path $_.FullName 'AppData\Local\Temp'
    Join-Path $_.FullName 'AppData\Roaming'
    Join-Path $_.FullName 'Downloads'
    Join-Path $_.FullName 'Desktop'
}

$files = foreach ($r in $roots) {
    if (Test-Path -LiteralPath $r) {
        Get-ChildItem -LiteralPath $r -Recurse -File -Force |
            Where-Object { $ext -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cutoff }
    }
}

$files = @($files | Sort-Object LastWriteTime -Descending | Select-Object -First 200)
"$($files.Count) file(s) (capped at 200, newest first)"
''
$files | ForEach-Object {
    $sig = if ($_.Extension -in '.exe', '.dll', '.scr', '.ps1') { (Get-AuthenticodeSignature -LiteralPath $_.FullName).Status } else { 'n/a' }
    [pscustomobject]@{
        Modified  = $_.LastWriteTime
        Path      = $_.FullName
        SizeKB    = [math]::Round($_.Length / 1KB, 1)
        Signature = $sig
        SHA256    = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
} | Format-List
