$Name = 'Autoruns - Unsigned'
$Description = 'Runs Sysinternals Autoruns (autorunsc) across every autostart location and lists entries that are not signed by a verified publisher, with hashes and launch strings.'
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
# One row per autostart entry that is not signed by a verified publisher.
$csv = & $autoruns -accepteula -nobanner -a * -c -h -s 2>$null
$csv | ConvertFrom-Csv |
    Where-Object { ($_.'Image Path' -or $_.'Launch String') -and $_.Signer -notlike '(Verified)*' } |
    Sort-Object Category, Entry |
    ForEach-Object {
        [pscustomobject]@{ Category = $_.Category; Entry = $_.Entry; EntryLocation = $_.'Entry Location'; Enabled = $_.Enabled; Signer = $_.Signer
            ImagePath = $_.'Image Path'; LaunchString = $_.'Launch String'; Sha256 = $_.'SHA-256' }
    }
