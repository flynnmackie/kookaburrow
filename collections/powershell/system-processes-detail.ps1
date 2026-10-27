$Name = 'Processes - Hashes and Signatures'
$Description = 'Running processes with full command line, parent, owner, image path, SHA-256 and signature status.'
$Dependencies = @()
$Parameters = @('ProcessName?')
$Tags = @('processes', 'execution', 'signing')

$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-CimInstance Win32_Process
if ($ProcessName) { $procs = $procs | Where-Object { $_.Name -like $ProcessName } }
$byId = @{}; Get-CimInstance Win32_Process | ForEach-Object { $byId[$_.ProcessId] = $_.Name }
$cache = @{}
foreach ($p in $procs) {
    $path = $p.ExecutablePath
    if ($path -and -not $cache.ContainsKey($path)) {
        $cache[$path] = @{ Hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; Sig = (Get-AuthenticodeSignature -LiteralPath $path) }
    }
    $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner
    [pscustomobject]@{
        Pid = $p.ProcessId; Name = $p.Name; Parent = "$($p.ParentProcessId) $($byId[[int]$p.ParentProcessId])"; Owner = if ($o.User) { "$($o.Domain)\$($o.User)" } else { '' }
        Started = $p.CreationDate; Path = $path; CommandLine = $p.CommandLine
        Sha256 = $cache[$path].Hash; Signature = $cache[$path].Sig.Status; Signer = $cache[$path].Sig.SignerCertificate.Subject
    }
}
