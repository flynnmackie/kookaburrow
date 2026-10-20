# Wrapper executed by winrm.js. Credentials and targets arrive via environment variables
# (never the command line). Runs either a local .ps1 file or a short inline probe on the target.
$ErrorActionPreference = 'Stop'
$sec  = ConvertTo-SecureString $env:KB_PASS -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($env:KB_USER, $sec)
$p = @{
    ComputerName   = $env:KB_HOST
    Port           = [int]$env:KB_PORT
    Credential     = $cred
    Authentication = $env:KB_AUTH
}
# Fail within ~20 s when a host does not answer instead of waiting minutes. Self-signed HTTPS certificates are accepted.
$opt = @{ OpenTimeout = 20000 }
if ($env:KB_SSL -eq '1') { $p.UseSSL = $true; $opt.SkipCACheck = $true; $opt.SkipCNCheck = $true }
$p.SessionOption = New-PSSessionOption @opt

# CSV mode (hunts): the collection runs on the target with Format-Table/Format-List turned into pass-throughs, so what
# comes back are the objects themselves, written as CSV. If the collection also prints plain text (section headings,
# notes) the whole output is returned as a one-column CSV (Output) so the result is always valid CSV.
$csv = $env:KB_CSV -eq '1'
if ($csv) {
    $body = Get-Content -LiteralPath $env:KB_SCRIPT -Raw
    $wrapper = {
        param($body)
        function Format-Table { $input }
        function Format-List { $input }
        $items = @(& ([scriptblock]::Create($body)))
        $text = @($items | Where-Object { $_ -is [string] })
        if ($items.Count -gt 0 -and $text.Count -eq 0) { $items | ConvertTo-Csv -NoTypeInformation }
        else { $items | ForEach-Object { [pscustomobject]@{ Output = ([string]$_).TrimEnd() } } | ConvertTo-Csv -NoTypeInformation }
    }
}

if ($env:KB_MODE -eq 'probe') {
    $p.ScriptBlock = {
        $o = Get-CimInstance Win32_OperatingSystem
        [pscustomobject]@{ hostname = $env:COMPUTERNAME; os = $o.Caption; version = $o.Version } | ConvertTo-Json -Compress
    }
    Invoke-Command @p | Out-String
} elseif (-not $env:KB_BINS) {
    if ($csv) { Invoke-Command @p -ScriptBlock $wrapper -ArgumentList $body | Out-String -Width 8192 }
    else { $p.FilePath = $env:KB_SCRIPT; Invoke-Command @p | Out-String -Width 4096 }
} else {
    # The collection needs binaries: stage them in a temp folder on the target, expose it to the collection
    # as $BinDir, run the collection, then always delete the folder and close the session.
    $bins = @($env:KB_BINS | ConvertFrom-Json)
    $session = New-PSSession @p
    $dir = $null
    try {
        $dir = [string](Invoke-Command -Session $session -ScriptBlock {
            $d = Join-Path ([System.IO.Path]::GetTempPath()) ('kb-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $d -Force | Out-Null
            $d
        })
        foreach ($b in $bins) { Copy-Item -LiteralPath $b -Destination $dir -ToSession $session -Force }
        Invoke-Command -Session $session -ScriptBlock { param($d) $global:BinDir = $d } -ArgumentList $dir
        if ($csv) { Invoke-Command -Session $session -ScriptBlock $wrapper -ArgumentList $body | Out-String -Width 8192 }
        else { Invoke-Command -Session $session -FilePath $env:KB_SCRIPT | Out-String -Width 4096 }
    } finally {
        if ($dir -and $dir -like '*\kb-*') {
            Invoke-Command -Session $session -ScriptBlock { param($d) Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue } -ArgumentList $dir
        }
        Remove-PSSession $session -ErrorAction SilentlyContinue
    }
}
