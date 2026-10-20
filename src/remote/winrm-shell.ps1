# Interactive shell over WinRM for the Shell page. Started by src/shell.js with the target and credentials in
# environment variables (never the command line). It opens one persistent remote session, then reads a command per
# line from stdin, runs it in that session (so the current folder and variables persist) and writes the result and a
# new prompt to stdout. There is no real terminal here: full-screen programs and prompts for input do not work.
#
# Besides typed commands the server sends control lines (they start with character 1) for the Send file / Pull file
# buttons: ls (list a remote folder), get (copy a remote file here) and put (copy a local file to the remote host).
# They use the same session. Answers go back as a hidden marker (ESC ] 7778 ; id ; base64-json BEL) and the current
# folder is reported before each prompt as ESC ] 7777 ; path BEL; the server strips both before the browser sees them.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'

$sec  = ConvertTo-SecureString $env:KB_PASS -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($env:KB_USER, $sec)
$opt = @{ OpenTimeout = 20000 }
$p = @{ ComputerName = $env:KB_HOST; Port = [int]$env:KB_PORT; Credential = $cred; Authentication = $env:KB_AUTH }
if ($env:KB_SSL -eq '1') { $p.UseSSL = $true; $opt.SkipCACheck = $true; $opt.SkipCNCheck = $true }
$p.SessionOption = New-PSSessionOption @opt

$esc = [char]27; $bel = [char]7
function Say($t) { [Console]::Out.Write($t); [Console]::Out.Flush() }
function Marker($code, $text) { Say("$esc]$code;$text$bel") }
function Reply($id, $obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    Marker 7778 ("$id;" + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
}

try { $s = New-PSSession @p } catch { Say("Connection failed: $($_.Exception.Message.Split("`n")[0])`r`n"); exit 1 }
Say("Connected to $($env:KB_HOST). Type a command and press Enter; 'exit' closes the shell.`r`n`r`n")

$listing = {
    param($path)
    if ([string]::IsNullOrEmpty($path)) {
        Get-PSDrive -PSProvider FileSystem | ForEach-Object { [pscustomobject]@{ name = "$($_.Name):\"; dir = $true; size = $null; modified = $null } }
    } else {
        Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop | ForEach-Object {
            [pscustomobject]@{ name = $_.Name; dir = [bool]$_.PSIsContainer; size = $(if ($_.PSIsContainer) { $null } else { $_.Length }); modified = $_.LastWriteTimeUtc.ToString('o') }
        }
    }
}

try {
    $quiet = $false
    while ($true) {
        if (-not $quiet) {
            $where = try { Invoke-Command -Session $s -ScriptBlock { (Get-Location).Path } } catch { '?' }
            Marker 7777 $where
            Say("[$($env:KB_HOST)]: PS $where> ")
        }
        $quiet = $false
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) { break }

        if ($line.Length -gt 0 -and $line[0] -eq [char]1) { # control line from the server, not typed by the user
            $quiet = $true
            $parts = $line.Substring(1).Split("`t")
            $op = $parts[0]; $cid = $parts[1]
            try {
                $a = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2])) | ConvertFrom-Json
                switch ($op) {
                    'ls' {
                        $items = @(Invoke-Command -Session $s -ScriptBlock $listing -ArgumentList $a.path | Select-Object name, dir, size, modified)
                        Reply $cid @{ ok = $true; entries = $items }
                    }
                    'get' {
                        Copy-Item -FromSession $s -LiteralPath $a.remote -Destination $a.local -Force -ErrorAction Stop
                        Reply $cid @{ ok = $true }
                    }
                    'put' {
                        Invoke-Command -Session $s -ArgumentList $a.remoteDir -ScriptBlock { param($d) New-Item -ItemType Directory -Force -Path $d | Out-Null }
                        Copy-Item -ToSession $s -LiteralPath $a.local -Destination $a.remote -Force -ErrorAction Stop
                        Reply $cid @{ ok = $true }
                    }
                    default { Reply $cid @{ ok = $false; error = "Unknown operation $op" } }
                }
            } catch { Reply $cid @{ ok = $false; error = $_.Exception.Message.Split("`n")[0] } }
            continue
        }

        $cmd = $line.Trim()
        if ($cmd -eq '') { Say("`r`n"); continue }
        if ($cmd -in 'exit', 'quit') { break }
        try {
            $out = Invoke-Command -Session $s -HideComputerName -ScriptBlock ([scriptblock]::Create($line)) 2>&1 | ForEach-Object { if ($_ -isnot [string]) { try { $_.PSObject.Properties.Remove("RunspaceId") } catch {} }; $_ } | Out-String -Width 200
            if ($out) { Say(($out.TrimEnd() -replace "`r?`n", "`r`n") + "`r`n") } else { Say("`r`n") }
        } catch {
            Say(($_.Exception.Message.Trim() -replace "`r?`n", "`r`n") + "`r`n")
        }
    }
} finally {
    Remove-PSSession $s -ErrorAction SilentlyContinue
}
Say("`r`nConnection closed.`r`n")
