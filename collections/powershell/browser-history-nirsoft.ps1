$Name = 'Browser - History'
$Description = 'Browsing history for every user and browser (Chrome, Edge, Firefox, Brave, Internet Explorer and others) listed with NirSoft BrowsingHistoryView.'
$Dependencies = @('BrowsingHistoryView.exe')
$Parameters = @('Days?', 'Contains?')
$Tags = @('forensics', 'history', 'c2')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'BrowsingHistoryView.exe'
$tmp = Join-Path $BinDir 'history.csv'
$days = if ($Days -match '^\d+$') { [int]$Days } else { 7 }
$null = Start-Process -FilePath $exe -ArgumentList @('/HistorySource', '2', '/scomma', "`"$tmp`"") -Wait -NoNewWindow
if (-not (Test-Path -LiteralPath $tmp)) { throw 'BrowsingHistoryView produced no output (administrator rights are needed to read every profile)' }
$since = (Get-Date).AddDays(-$days)
foreach ($r in (Import-Csv -LiteralPath $tmp)) {
    $t = [datetime]::MinValue
    [void][datetime]::TryParse($r.'Visit Time', [ref]$t)
    if ($t -lt $since) { continue }
    if ($Contains -and "$($r.URL) $($r.Title)" -notlike "*$Contains*") { continue }
    [pscustomobject]@{ VisitTime = $r.'Visit Time'; Url = $r.URL; Title = $r.Title; VisitCount = $r.'Visit Count'; VisitedFrom = $r.'Visited From'; Browser = $r.'Web Browser'; User = $r.'User Profile'; BrowserProfile = $r.'Browser Profile' }
}
