$Name = 'Network - Connections'
$Description = 'Lists established TCP connections to non-loopback addresses with the owning process, its path and its parent, sorted by remote address. A starting point for finding command and control and lateral movement.'
$Dependencies = @()
$Tags = @('network', 'c2', 'lateral-movement', 'processes')

$ErrorActionPreference = 'SilentlyContinue'
$procs = @{}
Get-CimInstance Win32_Process | ForEach-Object { $procs[[int]$_.ProcessId] = $_ }

Get-NetTCPConnection -State Established |
    Where-Object { $_.RemoteAddress -notin '127.0.0.1', '::1' } |
    ForEach-Object {
        $p = $procs[[int]$_.OwningProcess]
        $parent = if ($p) { $procs[[int]$p.ParentProcessId] } else { $null }
        [pscustomobject]@{
            Local   = "$($_.LocalAddress):$($_.LocalPort)"
            Remote  = "$($_.RemoteAddress):$($_.RemotePort)"
            PID     = $_.OwningProcess
            Process = $p.Name
            Parent  = $parent.Name
            Path    = $p.ExecutablePath
        }
    } | Sort-Object Remote | Format-Table -AutoSize -Wrap
