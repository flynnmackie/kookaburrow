$Name = 'Files - Recycle Bin'
$Description = 'Deleted files still in the Recycle Bin, read from the $I metadata files: original path, size and the time it was deleted, per user SID. Attackers often delete tools and logs and forget to empty the bin; the $R file with the same name holds the content.'
$Dependencies = @()
$Tags = @('forensics', 'filesystem', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$rows = foreach ($drive in (Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3').DeviceID) {
    foreach ($sidDir in Get-ChildItem -LiteralPath "$drive\`$Recycle.Bin" -Directory -Force) {
        $user = try { (New-Object System.Security.Principal.SecurityIdentifier($sidDir.Name)).Translate([System.Security.Principal.NTAccount]).Value } catch { $sidDir.Name }
        foreach ($f in Get-ChildItem -LiteralPath $sidDir.FullName -Filter '$I*' -Force) {
            $b = [IO.File]::ReadAllBytes($f.FullName)
            if ($b.Length -lt 24) { continue }
            $ver = [BitConverter]::ToInt64($b, 0)
            $size = [BitConverter]::ToInt64($b, 8)
            $del = [DateTime]::FromFileTimeUtc([BitConverter]::ToInt64($b, 16))
            $path = if ($ver -eq 2) { [Text.Encoding]::Unicode.GetString($b, 28, [Math]::Max(0, $b.Length - 28)).TrimEnd([char]0) } else { [Text.Encoding]::Unicode.GetString($b, 24, [Math]::Min(520, $b.Length - 24)).TrimEnd([char]0) }
            $r = Join-Path $sidDir.FullName ('$R' + $f.Name.Substring(2))
            [pscustomobject]@{ User = $user; DeletedUtc = $del; OriginalPath = $path; SizeBytes = $size; ContentPresent = (Test-Path -LiteralPath $r); BinFile = $r }
        }
    }
}
$rows | Sort-Object DeletedUtc -Descending
