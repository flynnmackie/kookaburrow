$Name = 'Event log clearing and audit policy changes'
$Description = 'Looks for Security log cleared (1102), System log cleared (104) and audit policy changed (4719) events, then shows new service installs (7045). Clearing logs and weakening auditing are common defense evasion steps. Needs administrator rights for the Security log.'
$Dependencies = @()
$Tags = @('defense-evasion', 'event-logs', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'

function Show-Events($title, $filter, $max) {
    "== $title =="
    $e = Get-WinEvent -FilterHashtable $filter -MaxEvents $max
    if ($e) {
        $e | ForEach-Object {
            $m = ($_.Message -replace '\s+', ' ')
            [pscustomobject]@{ Time = $_.TimeCreated; Id = $_.Id; Message = $m.Substring(0, [Math]::Min(220, $m.Length)) }
        } | Format-Table -AutoSize -Wrap
    } else { '(none, or log not readable)' }
    ''
}

Show-Events 'Security log cleared (1102)' @{ LogName = 'Security'; Id = 1102 } 50
Show-Events 'System log cleared (104)' @{ LogName = 'System'; Id = 104 } 50
Show-Events 'Audit policy changed (4719)' @{ LogName = 'Security'; Id = 4719 } 50
Show-Events 'New service installed (7045)' @{ LogName = 'System'; Id = 7045 } 100
