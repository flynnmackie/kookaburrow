$Name = 'Execution - Recent Files'
$Description = 'Shortcut (.lnk) files in every profile Recent folder.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('execution', 'forensics', 'filesystem')

$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -ComObject WScript.Shell
$cut = if ($Days -match '^\d+$') { (Get-Date).AddDays(-[int]$Days) } else { [datetime]::MinValue }
$rows = foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    foreach ($dir in "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\Recent", "$($p.LocalPath)\AppData\Roaming\Microsoft\Office\Recent") {
        Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -Force | Where-Object { $_.LastWriteTime -ge $cut } | ForEach-Object {
            $l = $shell.CreateShortcut($_.FullName)
            [pscustomobject]@{ User = $u; Shortcut = $_.Name; Target = $l.TargetPath; Arguments = $l.Arguments; WorkingDir = $l.WorkingDirectory; ShortcutCreated = $_.CreationTime; ShortcutModified = $_.LastWriteTime; TargetExists = (Test-Path -LiteralPath $l.TargetPath) }
        }
    }
}
$rows | Sort-Object ShortcutModified -Descending
