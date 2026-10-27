$Name = 'PowerShell - Activity'
$Description = 'Reads each user PSReadLine command history.'
$Dependencies = @()
$Tags = @('execution', 'powershell', 'event-logs', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'

'== PSReadLine history per user (last 50 lines) =='
Get-ChildItem 'C:\Users' -Directory | ForEach-Object {
    $h = Join-Path $_.FullName 'AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt'
    if (Test-Path -LiteralPath $h) {
        "-- $($_.Name) ($h) --"
        Get-Content -LiteralPath $h -Tail 50
        ''
    }
}

'== Suspicious script blocks (4104, last 7 days) =='
$pattern = 'FromBase64String|\s-e(nc|ncodedcommand)?\s|IEX|Invoke-Expression|DownloadString|DownloadFile|Net\.WebClient|Invoke-WebRequest|Invoke-RestMethod|-nop\b|-w(indowstyle)?\s+hidden|bypass|Add-Type|Reflection\.Assembly'
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PowerShell/Operational'; Id = 4104; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 2000
$hits = $events | Where-Object { $_.Message -match $pattern } | Select-Object -First 50
if ($hits) {
    $hits | ForEach-Object {
        "[$($_.TimeCreated)]"
        $m = ($_.Message -replace '\s+', ' ')
        $m.Substring(0, [Math]::Min(600, $m.Length))
        ''
    }
} elseif ($events) { '(script blocks present, none matched)' } else { '(no 4104 events: script block logging may be off, or the log is not readable)' }
