$Name = 'Network - Listening Ports'
$Description = 'TCP listeners and owning process (Windows).'
$Dependencies = @()
$Tags = @('network', 'listening', 'discovery')

Get-NetTCPConnection -State Listen | ForEach-Object {
    [pscustomobject]@{
        Address = $_.LocalAddress; Port = $_.LocalPort; PID = $_.OwningProcess
        Process = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    }
} | Sort-Object Port | Format-Table -AutoSize
