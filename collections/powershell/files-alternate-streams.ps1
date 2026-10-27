$Name = 'Files - Alternate Streams'
$Description = 'Finds NTFS alternate data streams (anything other than the main data stream and the harmless Zone.Identifier) under a folder.'
$Dependencies = @()
$Parameters = @('SearchPath', 'Recurse?')
$Tags = @('filesystem', 'defense-evasion', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$gci = @{ LiteralPath = $SearchPath; Force = $true }
if ($Recurse -notmatch '^(n|no|false|0)$') { $gci.Recurse = $true }
Get-ChildItem @gci | ForEach-Object {
    foreach ($s in Get-Item -LiteralPath $_.FullName -Stream * -Force) {
        if ($s.Stream -in ':$DATA', 'Zone.Identifier' -or $s.Stream -eq '') { continue }
        [pscustomobject]@{ Path = $_.FullName; Stream = $s.Stream; SizeBytes = $s.Length; Modified = $_.LastWriteTime }
    }
}
