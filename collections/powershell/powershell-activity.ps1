$Name = 'PowerShell - Activity'
$Description = 'Reads each user PSReadLine command history and recent suspicious script blocks (4104).'
$Dependencies = @()
$Tags = @('execution', 'powershell', 'event-logs', 'defense-evasion')
$DiffIgnore = @('Time')

$ErrorActionPreference = 'SilentlyContinue'

# One row per command line: the last 50 lines of each user's PSReadLine history (Source History), and script blocks from the last
# 7 days that match common attack patterns (Source Script block 4104, cut to 600 characters). A Note row says when there is nothing to read.
function Row($source, $user, $text, $time, $path) { [pscustomobject]@{ Source = $source; User = $user; Text = $text; Time = "$time"; Path = $path } }

Get-ChildItem 'C:\Users' -Directory | ForEach-Object {
    $h = Join-Path $_.FullName 'AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt'
    if (Test-Path -LiteralPath $h) {
        $user = $_.Name
        Get-Content -LiteralPath $h -Tail 50 | Where-Object { $_.Trim() } | ForEach-Object { Row 'History' $user $_ '' $h }
    }
}

$pattern = 'FromBase64String|\s-e(nc|ncodedcommand)?\s|IEX|Invoke-Expression|DownloadString|DownloadFile|Net\.WebClient|Invoke-WebRequest|Invoke-RestMethod|-nop\b|-w(indowstyle)?\s+hidden|bypass|Add-Type|Reflection\.Assembly'
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PowerShell/Operational'; Id = 4104; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 2000
if ($events) {
    $events | Where-Object { $_.Message -match $pattern } | Select-Object -First 50 | ForEach-Object {
        $m = ($_.Message -replace '\s+', ' ')
        Row 'Script block 4104' "$($_.UserId)" $m.Substring(0, [Math]::Min(600, $m.Length)) $_.TimeCreated ''
    }
} else { Row 'Note' '' 'No 4104 events: script block logging may be off, or the log is not readable' '' '' }
