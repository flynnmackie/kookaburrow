$Name = 'Autoruns - Unsigned'
$Description = 'Runs Sysinternals Autoruns (autorunsc) across every autostart location and lists entries that are not signed by a verified publisher, with hashes and launch strings. The hunter supplies autorunsc.exe; the platform copies it to a temporary folder on the target, runs this collection, and deletes the folder afterwards.'
$Dependencies = @('autorunsc.exe')
$Tags = @('persistence', 'autoruns', 'signing')

# $BinDir is set by the platform before this script runs: the temporary folder on the target
# that holds every binary listed in $Dependencies. It is deleted again when the collection finishes.
if (-not $BinDir) {
    Write-Error 'BinDir is not set. This collection must be run through the platform, which stages its binaries first.'
    return
}
$autoruns = Join-Path $BinDir 'autorunsc.exe'
if (-not (Test-Path -LiteralPath $autoruns)) {
    Write-Error "autorunsc.exe was not staged in $BinDir."
    return
}

# -a * all categories, -c CSV, -h hashes, -s verify signatures, -nobanner, -accepteula
$csv = & $autoruns -accepteula -nobanner -a * -c -h -s 2>$null
$rows = $csv | ConvertFrom-Csv | Where-Object { $_.'Image Path' -or $_.'Launch String' }

'== Entries per category =='
$rows | Group-Object Category | Sort-Object Count -Descending |
    Select-Object Count, @{ n = 'Category'; e = { $_.Name } } | Format-Table -AutoSize

'== Unsigned / unverified entries =='
$rows | Where-Object { $_.Signer -notlike '(Verified)*' } |
    Select-Object Category, Entry, Enabled, Signer, 'Image Path', 'Launch String', 'SHA-256' |
    Sort-Object Category, Entry |
    Format-List
