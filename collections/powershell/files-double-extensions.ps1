$Name = 'Files - Disguised Executables'
$Description = 'Looks in user folders for files that pretend to be something else.'
$Dependencies = @()
$Parameters = @('SearchPath?')
$Tags = @('filesystem', 'malware', 'defense-evasion', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$root = if ($SearchPath) { $SearchPath } else { 'C:\Users' }
$exec = '\.(exe|scr|com|pif|bat|cmd|js|jse|vbs|vbe|wsf|hta|ps1|lnk|dll)$'
$doc = '\.(pdf|docx?|xlsx?|pptx?|txt|rtf|jpe?g|png|gif|zip|csv)\.'
$files = Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue
foreach ($f in $files) {
    $why = @()
    if ($f.Name -match "$doc.*$exec") { $why += 'double extension' }
    if ($f.Name -match [char]0x202E) { $why += 'right-to-left override' }
    if ($f.Name -match '\s{5,}\.\w+$') { $why += 'padded name' }
    if ($f.Extension -match '^\.(txt|pdf|jpe?g|png|gif|docx?|xlsx?|dat|tmp|log)$' -and $f.Length -gt 1024 -and $f.Length -lt 50MB) {
        $b = New-Object byte[] 2
        $fs = [IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')
        try { [void]$fs.Read($b, 0, 2) } finally { $fs.Dispose() }
        if ($b[0] -eq 0x4D -and $b[1] -eq 0x5A) { $why += 'executable content (MZ) in a non-executable extension' }
    }
    if ($why) { [pscustomobject]@{ Path = $f.FullName; Reason = ($why -join '; '); SizeBytes = $f.Length; Modified = $f.LastWriteTime; Sha256 = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash } }
}
