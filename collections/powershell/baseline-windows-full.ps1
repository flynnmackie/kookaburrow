$Name = 'Baseline - Windows Full'
$Description = 'Full read-only baseline of a Windows host using only built-in tools (64 categories: system, security, accounts, network, processes, services, persistence, software, registry artefacts). Needs administrator rights.'
$Dependencies = @()
$Parameters = @('EventDays?', 'SkipFileFacts?', 'OnlyCategories?')
$Tags = @('baseline', 'triage', 'system', 'accounts', 'network', 'persistence', 'event-logs', 'registry')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'command'
$Transfer = 'large'

# ----------------------------------------------------------------------------------------------------------------------
# Baseline - Windows Full
#   * Read-only. Runs no executables: cmdlets, CIM and .NET only. Writes only to $OutDir (a temporary folder the platform
#     pulls back and removes).
#   * Every category is written as NN_<id>.csv and added to baseline.json (the one JSON file). manifest.csv
#     list each file with its SHA-256. All times are UTC (ISO 8601, ...Z). Rows are sorted so two baselines diff cleanly.
#   * Optional inputs: EventDays (how far back the event log summaries go, 1 to 90, default 7) and SkipFileFacts (any of
#     yes / true / 1 skips hashing and signature checks of files, which is the slowest part).
#   * Credentials and secrets are never read: AutoLogon passwords, Wi-Fi keys, SAM and LSA secrets are not collected.
# ----------------------------------------------------------------------------------------------------------------------
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$script:Started = Get-Date
$script:IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$script:Days = 7
if ("$EventDays" -match '^\d+$') { $script:Days = [math]::Min(90, [math]::Max(1, [int]"$EventDays")) }
$script:SkipFacts = ("$SkipFileFacts" -match '^(1|y|yes|true|skip)$')
$script:Only = @("$OnlyCategories" -split '[,; ]+' | Where-Object { $_ })
$script:Since = $script:Started.AddDays(-$script:Days)
$script:Dir = $null
if (Get-Variable -Name OutDir -Scope Global -ErrorAction SilentlyContinue) { $script:Dir = [string]$global:OutDir }
if (-not $script:Dir) { $script:Dir = Join-Path ([IO.Path]::GetTempPath()) ('kb-baseline-' + $env:COMPUTERNAME + '-' + $script:Started.ToString('yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Path $script:Dir -Force | Out-Null
$script:Utf8 = New-Object System.Text.UTF8Encoding($false)
$script:Summary = New-Object System.Collections.Generic.List[object]
$script:Files = New-Object System.Collections.Generic.List[object]
$script:Seq = 0
$script:Notes = $null
$script:AllJson = New-Object System.IO.StreamWriter((Join-Path $script:Dir 'baseline.json'), $false, $script:Utf8)

# ---- small helpers ---------------------------------------------------------------------------------------------------
function Row($d) { [pscustomobject]$d }
function Tm($v) {   # a date and time as UTC ISO 8601
    if ($null -eq $v -or "$v" -eq '') { return '' }
    try { if ($v -is [datetime]) { if ($v.Year -lt 1980) { return '' }; return $v.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } } catch { }
    return [string]$v
}
function FTime($v) {  # a Windows FILETIME number as UTC ISO 8601
    try { $n = [int64]$v; if ($n -le 0) { return '' }; return [datetime]::FromFileTimeUtc($n).ToString('yyyy-MM-ddTHH:mm:ssZ') } catch { return '' }
}
function J($v, $sep = '; ') { (@($v) | Where-Object { $null -ne $_ -and "$_" -ne '' } | ForEach-Object { "$_" }) -join $sep }
function Note([string]$text) { if ($null -ne $script:Notes) { $script:Notes.Add($text) } }
function Sid2Name([string]$sid) {
    try { return (New-Object Security.Principal.SecurityIdentifier($sid)).Translate([Security.Principal.NTAccount]).Value } catch { return $sid }
}
function RegGet($path) {   # the values of a registry key as a hashtable (empty when the key is missing)
    $h = @{}
    try {
        $p = Get-ItemProperty -LiteralPath $path -ErrorAction Stop
        foreach ($x in $p.PSObject.Properties) { if ($x.Name -notmatch '^PS(Path|ParentPath|ChildName|Drive|Provider)$') { $h[$x.Name] = $x.Value } }
    } catch { }
    return $h
}
function RegKids($path) { return @(Get-ChildItem -LiteralPath $path -ErrorAction SilentlyContinue 2>$null) }   # keeps the readable sub-keys when one of them is protected
function RegVal($path, $name) { try { return (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction Stop).$name } catch { return $null } }
function Show($v) {   # a registry value as text (binary shown as hex, lists joined)
    if ($null -eq $v) { return '' }
    if ($v -is [byte[]]) { $s = ($v | Select-Object -First 64 | ForEach-Object { $_.ToString('x2') }) -join ''; if ($v.Length -gt 64) { $s += '...' }; return $s }
    if ($v -is [array]) { return (J $v ' | ') }
    return [string]$v
}

# Loaded user hives (logged-on users and the SYSTEM profile). Other users' hives are files that would have to be loaded to be read.
$script:Hku = @()
foreach ($k in (RegKids 'Registry::HKEY_USERS')) {
    $sid = $k.PSChildName
    if ($sid -match '_Classes$') { continue }
    if ($sid -eq '.DEFAULT') { $script:Hku += [pscustomobject]@{ Sid = 'S-1-5-18'; User = 'SYSTEM (.DEFAULT)'; Root = 'Registry::HKEY_USERS\.DEFAULT' } }
    elseif ($sid -match '^S-1-5-21-') { $script:Hku += [pscustomobject]@{ Sid = $sid; User = (Sid2Name $sid); Root = "Registry::HKEY_USERS\$sid" } }
}

# ---- executables: path from a command line, then size, hash, signature and version info (cached) -----------------------
function Resolve-Exe([string]$cmd) {
    if (-not $cmd) { return '' }
    $c = [Environment]::ExpandEnvironmentVariables($cmd.Trim())
    $c = $c -replace '^\\\?\?\\', '' -replace '^\\SystemRoot', $env:SystemRoot -replace '^system32\\', "$env:SystemRoot\system32\"
    if ($c -match '^"([^"]+)"') { $p = $Matches[1] }
    elseif ($c -match '^([A-Za-z]:\\.*?\.(exe|dll|sys|bat|cmd|com|scr|ps1|vbs|js|msi|cpl|ocx|drv))(\s|$)') { $p = $Matches[1] }
    else { $p = ($c -split '\s+')[0] }
    if ($p -and $p -notmatch '[\\/]') {
        foreach ($d in @("$env:SystemRoot\System32", $env:SystemRoot)) { if (Test-Path -LiteralPath (Join-Path $d $p) -PathType Leaf) { return (Join-Path $d $p) } }
        $g = Get-Command $p -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($g) { return $g.Source }
    }
    return $p
}
# Signature checks ask the certificate authority whether a certificate was revoked, which can stall for a long time on a host with no
# internet. So they get a time budget: once it is spent, or after three slow checks, the rest show the signer only (read from the file
# without any network use) and the summary says so.
$script:SigBudgetMs = 90000; $script:SigSpentMs = 0; $script:SigSlow = 0; $script:SigLimited = $false
function Get-Sig([string]$path) {
    $res = [pscustomobject]@{ Status = ''; Signer = '' }
    $cn = { param($subject) if ($subject -match 'CN=("[^"]+"|[^,]+)') { $Matches[1].Trim('"') } else { $subject } }
    if ($script:SigSpentMs -lt $script:SigBudgetMs -and $script:SigSlow -lt 3) {
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $s = Get-AuthenticodeSignature -LiteralPath $path -ErrorAction SilentlyContinue
        $ms = $sw.ElapsedMilliseconds; $script:SigSpentMs += $ms
        if ($ms -gt 4000) { $script:SigSlow++ }
        if ($s) { $res.Status = [string]$s.Status; if ($s.SignerCertificate) { $res.Signer = & $cn $s.SignerCertificate.Subject } }
        return $res
    }
    $script:SigLimited = $true
    $res.Status = '(not verified: time limit)'
    try { $c = [Security.Cryptography.X509Certificates.X509Certificate]::CreateFromSignedFile($path); if ($c) { $res.Signer = & $cn $c.Subject } } catch { }
    return $res
}
$script:FactCache = @{}
function Get-Facts([string]$path) {
    $blank = [ordered]@{ Exists = $false; Size = ''; Created = ''; Modified = ''; SHA256 = ''; Signature = ''; Signer = ''; Company = ''; Product = ''; FileVersion = ''; Description = '' }
    if (-not $path) { return [pscustomobject]$blank }
    $key = $path.ToLowerInvariant()
    if ($script:FactCache.ContainsKey($key)) { return $script:FactCache[$key] }
    $o = $blank
    try {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $f = Get-Item -LiteralPath $path -Force -ErrorAction Stop
            $o.Exists = $true; $o.Size = $f.Length; $o.Created = Tm $f.CreationTimeUtc; $o.Modified = Tm $f.LastWriteTimeUtc
            $v = $f.VersionInfo
            if ($v) { $o.Company = $v.CompanyName; $o.Product = $v.ProductName; $o.FileVersion = $v.FileVersion; $o.Description = $v.FileDescription }
            if (-not $script:SkipFacts) {
                if ($f.Length -le 150MB) { $h = (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash; if ($h) { $o.SHA256 = $h.ToLower() } }
                else { $o.SHA256 = '(not hashed: over 150 MB)' }
                $sg = Get-Sig $path
                $o.Signature = $sg.Status; $o.Signer = $sg.Signer
            }
        }
    } catch { }
    $r = [pscustomobject]$o
    $script:FactCache[$key] = $r
    return $r
}
# The columns the file facts add to a row, with a prefix (for example Image -> ImageSHA256).
function Add-Facts($row, [string]$path, [string]$prefix = '') {
    $f = Get-Facts $path
    $row["${prefix}Path"] = $path
    $row["${prefix}Exists"] = $f.Exists
    $row["${prefix}Size"] = $f.Size
    $row["${prefix}Modified"] = $f.Modified
    $row["${prefix}SHA256"] = $f.SHA256
    $row["${prefix}Signature"] = $f.Signature
    $row["${prefix}Signer"] = $f.Signer
    $row["${prefix}Company"] = $f.Company
    $row["${prefix}Description"] = $f.Description
    $row["${prefix}FileVersion"] = $f.FileVersion
}
function Resolve-Clsid([string]$clsid) {   # the file behind a COM class id
    if ($clsid -notmatch '^\{[0-9A-Fa-f-]{36}\}$') { return '' }
    foreach ($root in 'HKLM:\SOFTWARE\Classes\CLSID', 'HKLM:\SOFTWARE\Wow6432Node\Classes\CLSID') {
        foreach ($sub in 'InprocServer32', 'LocalServer32') { $v = (Get-ItemProperty -LiteralPath "$root\$clsid\$sub" -ErrorAction SilentlyContinue).'(default)'; if ($v) { return [string]$v } }
    }
    return ''
}

# ---- event logs ----------------------------------------------------------------------------------------------------------
function Get-Ev([string]$Log, $Ids, [int]$Max = 50000) {
    $f = @{ LogName = $Log; StartTime = $script:Since }
    if ($Ids) { $f.Id = $Ids }
    $r = @(Get-WinEvent -FilterHashtable $f -MaxEvents $Max -ErrorAction SilentlyContinue)
    if ($r.Count -ge $Max) { Note "$Log $($Ids -join '/'): stopped at $Max events (the newest are kept)" }
    return $r
}
function Ev-Data($e) {   # the named fields of an event, from EventData or UserData
    $h = @{}
    try {
        $x = [xml]$e.ToXml()
        $i = 0
        foreach ($d in @($x.Event.EventData.Data)) { $i++; $n = if ($d.Name) { $d.Name } else { "Data$i" }; $h[$n] = [string]$d.'#text' }
        if ($x.Event.UserData) { foreach ($n in $x.Event.UserData.FirstChild.ChildNodes) { $h[$n.LocalName] = [string]$n.InnerText } }
    } catch { }
    return $h
}

# ---- one category: run it, make the rows uniform, write its CSV and add it to baseline.json ---------------------------------------------------
function Invoke-Cat {
    param([string]$Id, [string]$Title, [scriptblock]$Body)
    if ($script:Only.Count -and $script:Only -notcontains $Id) { return }
    $script:Seq++
    $base = ('{0:00}_{1}' -f $script:Seq, $Id)
    $t0 = Get-Date
    $script:Notes = New-Object System.Collections.Generic.List[string]
    $status = 'ok'; $rows = @()
    try {
        $all = @(& $Body 2>&1)
        $rows = @($all | Where-Object { $null -ne $_ -and $_ -isnot [System.Management.Automation.ErrorRecord] })
        foreach ($m in @($all | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { ([string]$_.Exception.Message).Split("`n")[0].Trim() } | Select-Object -Unique | Select-Object -First 3)) { Note $m }
    } catch { $status = 'error'; Note $_.Exception.Message }
    $cols = New-Object System.Collections.Generic.List[string]
    $seen = New-Object System.Collections.Generic.HashSet[string]
    foreach ($r in $rows) { foreach ($p in $r.PSObject.Properties) { if ($seen.Add($p.Name)) { $cols.Add($p.Name) } } }
    $csvName = "$base.csv"
    if ($cols.Count) {
        $out = @($rows | Select-Object -Property ([string[]]$cols))
        [IO.File]::WriteAllText((Join-Path $script:Dir $csvName), ((($out | ConvertTo-Csv -NoTypeInformation) -join "`r`n") + "`r`n"), $script:Utf8)
        $compact = ConvertTo-Json -InputObject $out -Depth 3 -Compress
        if (-not $script:FirstCat) { $script:AllJson.Write(',') }
        $script:FirstCat = $false
        $script:AllJson.Write('"' + $Id + '":' + $compact)
        $p = Join-Path $script:Dir $csvName
        $script:Files.Add([pscustomobject]@{ Category = $Title; File = $csvName; Records = $rows.Count; Bytes = (Get-Item -LiteralPath $p).Length; SHA256 = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() })
    } else {
        $csvName = ''
        if ($status -eq 'ok') { $status = $(if ($script:Notes.Count) { 'not collected' } else { 'empty' }) }
    }
    if ($status -eq 'ok' -and $script:Notes.Count) { $status = 'partial' }
    $script:Summary.Add([pscustomobject][ordered]@{
        Category = $Title; Id = $Id; Records = $rows.Count; Status = $status; Seconds = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
        Columns = (J $cols ', '); File = $csvName; Notes = (J $script:Notes ' | ')
    })
    $script:Notes = $null
}

# baseline.json starts here and is closed at the end: { "meta": {...}, "categories": { "<id>": [rows], ... } }
$script:AllJson.Write('{"meta":' + (ConvertTo-Json -Compress -InputObject ([ordered]@{
    Tool = 'Kookaburrow Baseline - Windows Full'; Schema = 1; Host = $env:COMPUTERNAME; Started = (Tm $script:Started); EventDays = $script:Days
    RanAsAdministrator = $script:IsAdmin; FileFactsSkipped = $script:SkipFacts; PowerShell = $PSVersionTable.PSVersion.ToString(); User = "$env:USERDOMAIN\$env:USERNAME"
    TimesAre = 'UTC (ISO 8601)'
})) + ',"categories":{')
$script:Seq = 0
$script:FirstCat = $true

function KV($section, $setting, $value, $source = '') { Row ([ordered]@{ Section = $section; Setting = $setting; Value = (Show $value); Source = $source }) }
function Reg-KV($section, $setting, $path, $name) {   # one registry value as a Setting row
    $v = RegVal $path $name
    KV $section $setting $(if ($null -eq $v) { '(not set)' } else { $v }) "$path\$name"
}
$LogonTypes = @{ 0 = 'System'; 2 = 'Interactive'; 3 = 'Network'; 4 = 'Batch'; 5 = 'Service'; 7 = 'Unlock'; 8 = 'NetworkCleartext'; 9 = 'NewCredentials'; 10 = 'RemoteInteractive'; 11 = 'CachedInteractive'; 12 = 'CachedRemoteInteractive'; 13 = 'CachedUnlock' }

# ======================================================================================================================
Invoke-Cat 'system' 'System information' {
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $bios = Get-CimInstance Win32_BIOS
    $cv = RegGet 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $role = @{ 0 = 'Standalone workstation'; 1 = 'Member workstation'; 2 = 'Standalone server'; 3 = 'Member server'; 4 = 'Backup domain controller'; 5 = 'Primary domain controller' }
    KV 'Identity' 'ComputerName' $env:COMPUTERNAME
    KV 'Identity' 'DNSHostName' $cs.DNSHostName
    KV 'Identity' 'Domain or workgroup' $cs.Domain
    KV 'Identity' 'PartOfDomain' $cs.PartOfDomain
    KV 'Identity' 'DomainRole' $role[[int]$cs.DomainRole]
    KV 'Identity' 'CurrentUser (console)' $cs.UserName
    KV 'Identity' 'SessionRunAs' "$env:USERDOMAIN\$env:USERNAME"
    KV 'OS' 'Caption' $os.Caption
    KV 'OS' 'Version' $os.Version
    KV 'OS' 'BuildNumber' $os.BuildNumber
    KV 'OS' 'UBR (patch level)' $cv.UBR
    KV 'OS' 'DisplayVersion' $cv.DisplayVersion
    KV 'OS' 'EditionID' $cv.EditionID
    KV 'OS' 'InstallationType' $cv.InstallationType
    KV 'OS' 'Architecture' $os.OSArchitecture
    KV 'OS' 'InstallDate' (Tm $os.InstallDate)
    KV 'OS' 'LastBootUpTime' (Tm $os.LastBootUpTime)
    KV 'OS' 'UptimeDays' ([math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 2))
    KV 'OS' 'WindowsDirectory' $os.WindowsDirectory
    KV 'OS' 'SystemDrive' $os.SystemDrive
    KV 'OS' 'BootDevice' $os.BootDevice
    KV 'OS' 'Locale' $os.Locale
    KV 'OS' 'CountryCode' $os.CountryCode
    KV 'OS' 'CodeSet' $os.CodeSet
    KV 'OS' 'MUILanguages' (J $os.MUILanguages ', ')
    KV 'OS' 'DEP support policy' $os.DataExecutionPrevention_SupportPolicy
    KV 'OS' 'DEP 32-bit applications' $os.DataExecutionPrevention_32BitApplications
    KV 'OS' 'PortableOperatingSystem' $os.PortableOperatingSystem
    KV 'Hardware' 'Manufacturer' $cs.Manufacturer
    KV 'Hardware' 'Model' $cs.Model
    KV 'Hardware' 'SystemType' $cs.SystemType
    KV 'Hardware' 'TotalPhysicalMemoryGB' ([math]::Round($cs.TotalPhysicalMemory / 1GB, 2))
    KV 'Hardware' 'Processors (sockets)' $cs.NumberOfProcessors
    KV 'Hardware' 'LogicalProcessors' $cs.NumberOfLogicalProcessors
    KV 'Hardware' 'HypervisorPresent' $cs.HypervisorPresent
    KV 'Hardware' 'BootupState' $cs.BootupState
    KV 'BIOS' 'Manufacturer' $bios.Manufacturer
    KV 'BIOS' 'Version' $bios.SMBIOSBIOSVersion
    KV 'BIOS' 'ReleaseDate' (Tm $bios.ReleaseDate)
    KV 'BIOS' 'SerialNumber' $bios.SerialNumber
    $i = 0
    foreach ($c in @(Get-CimInstance Win32_Processor)) {
        $i++
        KV 'CPU' "CPU $i Name" $c.Name; KV 'CPU' "CPU $i Cores" $c.NumberOfCores; KV 'CPU' "CPU $i MaxClockMHz" $c.MaxClockSpeed
        KV 'CPU' "CPU $i VirtualizationFirmwareEnabled" $c.VirtualizationFirmwareEnabled
    }
    $m = 0
    foreach ($d in @(Get-CimInstance Win32_PhysicalMemory)) { $m++; KV 'Memory' "Module $m" ("{0} GB {1} {2} MHz ({3})" -f [math]::Round($d.Capacity / 1GB, 1), $d.Manufacturer, $d.Speed, $d.DeviceLocator) }
    $tz = Get-TimeZone
    KV 'Time' 'TimeZone' $tz.Id
    KV 'Time' 'TimeZone display name' $tz.DisplayName
    KV 'Time' 'UTC offset' $tz.BaseUtcOffset.ToString()
    KV 'Time' 'Daylight saving now' $tz.SupportsDaylightSavingTime
    KV 'Time' 'Clock (UTC) when captured' (Tm (Get-Date))
    KV 'PowerShell' 'Version' $PSVersionTable.PSVersion.ToString()
    KV 'PowerShell' 'Edition' $PSVersionTable.PSEdition
    KV 'PowerShell' 'LanguageMode' $ExecutionContext.SessionState.LanguageMode
    KV 'PowerShell' 'CLRVersion' $PSVersionTable.CLRVersion.ToString()
    $ndp = RegGet 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
    KV '.NET Framework' 'Version' $ndp.Version
    KV '.NET Framework' 'Release' $ndp.Release
    try { KV 'Boot security' 'SecureBoot enabled' (Confirm-SecureBootUEFI -ErrorAction Stop) 'Confirm-SecureBootUEFI' } catch { KV 'Boot security' 'SecureBoot enabled' 'Not available (legacy BIOS, or no access)' 'Confirm-SecureBootUEFI' }
    try { $tpm = Get-Tpm -ErrorAction Stop; KV 'Boot security' 'TPM present' $tpm.TpmPresent 'Get-Tpm'; KV 'Boot security' 'TPM ready' $tpm.TpmReady 'Get-Tpm'; KV 'Boot security' 'TPM enabled' $tpm.TpmEnabled 'Get-Tpm'; KV 'Boot security' 'TPM manufacturer' $tpm.ManufacturerIdTxt 'Get-Tpm'; KV 'Boot security' 'TPM manufacturer version' $tpm.ManufacturerVersion 'Get-Tpm' } catch { Note 'TPM: not readable here' }
    try {
        $dg = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard -ErrorAction Stop
        KV 'Virtualization-based security' 'VBS status (0 off, 1 enabled, 2 running)' $dg.VirtualizationBasedSecurityStatus 'Win32_DeviceGuard'
        KV 'Virtualization-based security' 'Security services running (1 Credential Guard, 2 HVCI)' (J $dg.SecurityServicesRunning ', ') 'Win32_DeviceGuard'
        KV 'Virtualization-based security' 'Security services configured' (J $dg.SecurityServicesConfigured ', ') 'Win32_DeviceGuard'
    } catch { }
}

Invoke-Cat 'disks' 'Disks' {
    foreach ($d in @(Get-Disk)) {
        Row ([ordered]@{ Number = $d.Number; FriendlyName = $d.FriendlyName; BusType = [string]$d.BusType; PartitionStyle = [string]$d.PartitionStyle; SizeGB = [math]::Round($d.Size / 1GB, 1); Health = [string]$d.HealthStatus; Status = (J $d.OperationalStatus ', '); IsBoot = $d.IsBoot; IsSystem = $d.IsSystem; IsReadOnly = $d.IsReadOnly; SerialNumber = ([string]$d.SerialNumber).Trim(); Firmware = $d.FirmwareVersion })
    }
    foreach ($p in @(Get-Partition)) {
        Row ([ordered]@{ Number = "$($p.DiskNumber):$($p.PartitionNumber)"; FriendlyName = "Partition $($p.PartitionNumber) on disk $($p.DiskNumber)"; BusType = ''; PartitionStyle = [string]$p.Type; SizeGB = [math]::Round($p.Size / 1GB, 2); Health = ''; Status = ''; IsBoot = $p.IsBoot; IsSystem = $p.IsSystem; IsReadOnly = $p.IsReadOnly; SerialNumber = $p.DriveLetter; Firmware = $p.GptType })
    }
}

Invoke-Cat 'volumes' 'Volumes and BitLocker' {
    $bl = @{}
    try { foreach ($b in @(Get-BitLockerVolume -ErrorAction Stop)) { $bl[[string]$b.MountPoint] = $b } } catch { Note 'BitLocker status not readable here' }
    foreach ($v in @(Get-Volume)) {
        $mp = if ($v.DriveLetter) { "$($v.DriveLetter):" } else { [string]$v.Path }
        $b = $bl[$mp]
        Row ([ordered]@{ Volume = $mp; Label = $v.FileSystemLabel; FileSystem = $v.FileSystem; DriveType = [string]$v.DriveType; Health = [string]$v.HealthStatus; SizeGB = [math]::Round($v.Size / 1GB, 2); FreeGB = [math]::Round($v.SizeRemaining / 1GB, 2)
            BitLockerProtection = $(if ($b) { [string]$b.ProtectionStatus } else { '' }); BitLockerEncryption = $(if ($b) { [string]$b.VolumeStatus } else { '' }); EncryptionPercent = $(if ($b) { $b.EncryptionPercentage } else { '' }); KeyProtectorTypes = $(if ($b) { J ($b.KeyProtector | ForEach-Object { [string]$_.KeyProtectorType }) ', ' } else { '' }) })
    }
}

Invoke-Cat 'devices' 'Plug and Play devices present' {
    foreach ($d in @(Get-PnpDevice -PresentOnly | Sort-Object Class, FriendlyName)) {
        Row ([ordered]@{ Class = $d.Class; Name = $(if ($d.FriendlyName) { $d.FriendlyName } else { $d.InstanceId }); Manufacturer = $d.Manufacturer; Status = [string]$d.Status; InstanceId = $d.InstanceId; Service = $d.Service })
    }
}

Invoke-Cat 'drivers_pnp' 'Installed signed drivers' {
    foreach ($d in @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | Sort-Object DeviceClass, DeviceName)) {
        Row ([ordered]@{ Device = $d.DeviceName; Class = $d.DeviceClass; Manufacturer = $d.Manufacturer; Provider = $d.DriverProviderName; Version = $d.DriverVersion; Date = (Tm $d.DriverDate); InfName = $d.InfName; IsSigned = $d.IsSigned; Signer = $d.Signer; HardwareId = $d.HardWareID })
    }
}

Invoke-Cat 'env' 'Environment variables' {
    $m = RegGet 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
    foreach ($n in ($m.Keys | Sort-Object)) { Row ([ordered]@{ Scope = 'Machine'; User = ''; Name = $n; Value = (Show $m[$n]) }) }
    foreach ($u in $script:Hku) {
        $e = RegGet "$($u.Root)\Environment"
        foreach ($n in ($e.Keys | Sort-Object)) { Row ([ordered]@{ Scope = 'User'; User = $u.User; Name = $n; Value = (Show $e[$n]) }) }
    }
    $p = $m['Path'] -split ';' | Where-Object { $_ }
    $i = 0
    foreach ($d in $p) { $i++; $x = [Environment]::ExpandEnvironmentVariables($d); Row ([ordered]@{ Scope = 'Machine PATH entry'; User = ''; Name = "$i"; Value = "$x  [exists: $(Test-Path -LiteralPath $x)]" }) }
}

# ======================================================================================================================
Invoke-Cat 'local_users' 'Local users' {
    foreach ($u in @(Get-LocalUser | Sort-Object Name)) {
        Row ([ordered]@{ Name = $u.Name; SID = $u.SID.Value; Enabled = $u.Enabled; Description = $u.Description; FullName = $u.FullName; LastLogon = (Tm $u.LastLogon); PasswordLastSet = (Tm $u.PasswordLastSet); PasswordExpires = (Tm $u.PasswordExpires)
            PasswordRequired = $u.PasswordRequired; UserMayChangePassword = $u.UserMayChangePassword; AccountExpires = (Tm $u.AccountExpires); PrincipalSource = [string]$u.PrincipalSource; BuiltInAdministrator = ($u.SID.Value -like '*-500'); BuiltInGuest = ($u.SID.Value -like '*-501') })
    }
}

Invoke-Cat 'local_groups' 'Local groups and members' {
    $priv = 'Administrators', 'Remote Desktop Users', 'Backup Operators', 'Remote Management Users', 'Server Operators', 'Account Operators', 'Print Operators', 'Network Configuration Operators', 'Hyper-V Administrators', 'Event Log Readers', 'Distributed COM Users', 'DnsAdmins', 'Cryptographic Operators', 'Power Users'
    foreach ($g in @(Get-LocalGroup | Sort-Object Name)) {
        $m = @(Get-LocalGroupMember -Group $g.Name)
        if (-not $m.Count) { Row ([ordered]@{ Group = $g.Name; GroupSID = $g.SID.Value; Privileged = ($priv -contains $g.Name); Member = ''; MemberType = ''; MemberSource = ''; MemberSID = ''; GroupDescription = $g.Description }); continue }
        foreach ($x in ($m | Sort-Object Name)) { Row ([ordered]@{ Group = $g.Name; GroupSID = $g.SID.Value; Privileged = ($priv -contains $g.Name); Member = $x.Name; MemberType = [string]$x.ObjectClass; MemberSource = [string]$x.PrincipalSource; MemberSID = $x.SID.Value; GroupDescription = $g.Description }) }
    }
}

Invoke-Cat 'logon_sessions' 'Logon sessions' {
    $sess = @{}
    foreach ($s in @(Get-CimInstance Win32_LogonSession)) { $sess[[string]$s.LogonId] = $s }
    foreach ($l in @(Get-CimInstance Win32_LoggedOnUser)) {
        $s = $sess[[string]$l.Dependent.LogonId]
        Row ([ordered]@{ User = "$($l.Antecedent.Domain)\$($l.Antecedent.Name)"; LogonId = $l.Dependent.LogonId; LogonType = $(if ($s) { $LogonTypes[[int]$s.LogonType] } else { '' }); AuthenticationPackage = $(if ($s) { $s.AuthenticationPackage } else { '' }); StartTime = $(if ($s) { Tm $s.StartTime } else { '' }) })
    }
}

Invoke-Cat 'user_profiles' 'User profiles' {
    $loaded = @($script:Hku | ForEach-Object { $_.Sid })
    foreach ($p in @(Get-CimInstance Win32_UserProfile | Sort-Object LocalPath)) {
        $hist = Join-Path $p.LocalPath 'AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt'
        $hf = if (Test-Path -LiteralPath $hist -PathType Leaf) { Get-Item -LiteralPath $hist -Force } else { $null }
        Row ([ordered]@{ User = (Sid2Name $p.SID); SID = $p.SID; LocalPath = $p.LocalPath; Special = $p.Special; Loaded = $p.Loaded; LastUseTime = (Tm $p.LastUseTime); HiveReadableByThisBaseline = ($loaded -contains $p.SID)
            PowerShellHistoryFile = $(if ($hf) { $hist } else { '' }); PowerShellHistorySize = $(if ($hf) { $hf.Length } else { '' }); PowerShellHistoryModified = $(if ($hf) { Tm $hf.LastWriteTimeUtc } else { '' }) })
        if (-not $p.Special -and $loaded -notcontains $p.SID) { Note "Hive not loaded, registry settings not read: $(Sid2Name $p.SID)" }
    }
}

# ======================================================================================================================
Invoke-Cat 'security_settings' 'Security and system settings' {
    $uac = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
    foreach ($n in 'EnableLUA', 'ConsentPromptBehaviorAdmin', 'ConsentPromptBehaviorUser', 'PromptOnSecureDesktop', 'FilterAdministratorToken', 'LocalAccountTokenFilterPolicy', 'EnableInstallerDetection', 'EnableVirtualization', 'EnableSecureUIAPaths', 'DisableCAD', 'DontDisplayLastUserName', 'InactivityTimeoutSecs', 'LegalNoticeCaption', 'LegalNoticeText', 'ShutdownWithoutLogon', 'UndockWithoutLogon') { Reg-KV 'UAC and logon' $n $uac $n }
    $wl = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    foreach ($n in 'CachedLogonsCount', 'AutoAdminLogon', 'DefaultUserName', 'DefaultDomainName', 'ForceAutoLogon', 'PasswordExpiryWarning', 'ScRemoveOption', 'DisableCAD') { Reg-KV 'UAC and logon' "Winlogon $n" $wl $n }
    $dp = RegVal $wl 'DefaultPassword'
    KV 'UAC and logon' 'Winlogon DefaultPassword' $(if ($null -ne $dp) { '(a password is stored here - value not collected)' } else { '(not set)' }) "$wl\DefaultPassword"
    $lsa = 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
    foreach ($n in 'RunAsPPL', 'RunAsPPLBoot', 'LmCompatibilityLevel', 'NoLMHash', 'RestrictAnonymous', 'RestrictAnonymousSAM', 'EveryoneIncludesAnonymous', 'DisableDomainCreds', 'LimitBlankPasswordUse', 'CrashOnAuditFail', 'SCENoApplyLegacyAuditPolicy', 'FullPrivilegeAuditing', 'AuditBaseObjects', 'AuditBaseDirectories', 'ForceGuest', 'DisableRestrictedAdmin', 'DisableRestrictedAdminOutboundCreds', 'LsaCfgFlags', 'TurnOffAnonymousBlock', 'RestrictRemoteSAM') { Reg-KV 'LSA' $n $lsa $n }
    foreach ($n in 'RestrictSendingNTLMTraffic', 'RestrictReceivingNTLMTraffic', 'NtlmMinClientSec', 'NtlmMinServerSec', 'AuditReceivingNTLMTraffic') { Reg-KV 'LSA' "MSV1_0 $n" "$lsa\MSV1_0" $n }
    Reg-KV 'LSA' 'WDigest UseLogonCredential' 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest' 'UseLogonCredential'
    Reg-KV 'LSA' 'SecurityProviders list' 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders' 'SecurityProviders'
    $dg = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard'
    foreach ($n in 'EnableVirtualizationBasedSecurity', 'RequirePlatformSecurityFeatures', 'HypervisorEnforcedCodeIntegrity', 'LsaCfgFlags') { Reg-KV 'Device Guard' $n $dg $n }
    Reg-KV 'Device Guard' 'HVCI Enabled' "$dg\Scenarios\HypervisorEnforcedCodeIntegrity" 'Enabled'
    Reg-KV 'Device Guard' 'Credential Guard Enabled' "$dg\Scenarios\CredentialGuard" 'Enabled'
    $srv = 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters'
    foreach ($n in 'SMB1', 'SMB2', 'RequireSecuritySignature', 'EnableSecuritySignature', 'RestrictNullSessAccess', 'AutoShareWks', 'AutoShareServer', 'NullSessionShares', 'NullSessionPipes', 'EncryptData', 'RejectUnencryptedAccess') { Reg-KV 'SMB' "Server $n" $srv $n }
    foreach ($n in 'RequireSecuritySignature', 'EnableSecuritySignature', 'AllowInsecureGuestAuth', 'EnablePlainTextPassword') { Reg-KV 'SMB' "Client $n" 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters' $n }
    try { $sc = Get-SmbServerConfiguration -ErrorAction Stop; foreach ($n in 'EnableSMB1Protocol', 'EnableSMB2Protocol', 'RequireSecuritySignature', 'EnableSecuritySignature', 'EncryptData', 'RejectUnencryptedAccess', 'AuditSmb1Access', 'RestrictNamedpipeAccessViaQuic') { KV 'SMB' "ServerConfiguration $n" $sc.$n 'Get-SmbServerConfiguration' } } catch { }
    $ts = 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server'
    foreach ($n in 'fDenyTSConnections', 'fSingleSessionPerUser', 'AllowRemoteRPC') { Reg-KV 'Remote Desktop' $n $ts $n }
    foreach ($n in 'PortNumber', 'UserAuthentication', 'SecurityLayer', 'MinEncryptionLevel', 'fInheritAutoLogon', 'InitialProgram') { Reg-KV 'Remote Desktop' "RDP-Tcp $n" "$ts\WinStations\RDP-Tcp" $n }
    foreach ($n in 'fDenyTSConnections', 'UserAuthentication', 'SecurityLayer', 'MinEncryptionLevel', 'MaxIdleTime', 'MaxDisconnectionTime', 'fPromptForPassword') { Reg-KV 'Remote Desktop' "Policy $n" 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' $n }
    Reg-KV 'Remote Assistance' 'fAllowToGetHelp' 'HKLM:\SYSTEM\CurrentControlSet\Control\Remote Assistance' 'fAllowToGetHelp'
    foreach ($n in 'AllowUnencryptedTraffic', 'AllowBasic', 'AllowAutoConfig', 'IPv4Filter', 'IPv6Filter', 'DisableRunAs') { Reg-KV 'WinRM' "Service policy $n" 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WinRM\Service' $n }
    foreach ($n in 'AllowUnencryptedTraffic', 'AllowBasic', 'AllowDigest') { Reg-KV 'WinRM' "Client policy $n" 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WinRM\Client' $n }
    try { foreach ($l in @(Get-ChildItem WSMan:\localhost\Listener -ErrorAction Stop)) { $props = @(Get-ChildItem $l.PSPath | ForEach-Object { "$($_.Name)=$($_.Value)" }); KV 'WinRM' "Listener $($l.Name)" (J $props ', ') 'WSMan:\localhost\Listener' } } catch { }
    $ps = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell'
    foreach ($n in 'EnableScriptBlockLogging', 'EnableScriptBlockInvocationLogging') { Reg-KV 'PowerShell logging' $n "$ps\ScriptBlockLogging" $n }
    Reg-KV 'PowerShell logging' 'EnableModuleLogging' "$ps\ModuleLogging" 'EnableModuleLogging'
    foreach ($n in 'EnableTranscripting', 'EnableInvocationHeader', 'OutputDirectory') { Reg-KV 'PowerShell logging' $n "$ps\Transcription" $n }
    foreach ($n in 'EnableScripts', 'ExecutionPolicy') { Reg-KV 'PowerShell logging' "Policy $n" $ps $n }
    Reg-KV 'PowerShell logging' 'Machine ExecutionPolicy' 'HKLM:\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell' 'ExecutionPolicy'
    try { foreach ($x in @(Get-ExecutionPolicy -List)) { KV 'PowerShell logging' "ExecutionPolicy $($x.Scope)" ([string]$x.ExecutionPolicy) 'Get-ExecutionPolicy -List' } } catch { }
    try {
        $mp = Get-MpComputerStatus -ErrorAction Stop
        foreach ($n in 'AMServiceEnabled', 'AntivirusEnabled', 'AntispywareEnabled', 'RealTimeProtectionEnabled', 'BehaviorMonitorEnabled', 'IoavProtectionEnabled', 'OnAccessProtectionEnabled', 'NISEnabled', 'IsTamperProtected', 'AMProductVersion', 'AMEngineVersion', 'AntivirusSignatureVersion', 'AntivirusSignatureAge', 'DefenderSignaturesOutOfDate') { KV 'Microsoft Defender' $n $mp.$n 'Get-MpComputerStatus' }
        KV 'Microsoft Defender' 'AntivirusSignatureLastUpdated' (Tm $mp.AntivirusSignatureLastUpdated) 'Get-MpComputerStatus'
        KV 'Microsoft Defender' 'LastQuickScan' (Tm $mp.QuickScanEndTime) 'Get-MpComputerStatus'
        KV 'Microsoft Defender' 'LastFullScan' (Tm $mp.FullScanEndTime) 'Get-MpComputerStatus'
        $pr = Get-MpPreference -ErrorAction Stop
        foreach ($n in 'DisableRealtimeMonitoring', 'DisableBehaviorMonitoring', 'DisableIOAVProtection', 'DisableScriptScanning', 'DisableBlockAtFirstSeen', 'MAPSReporting', 'SubmitSamplesConsent', 'PUAProtection', 'EnableNetworkProtection', 'EnableControlledFolderAccess', 'CloudBlockLevel', 'CloudExtendedTimeout', 'DisableArchiveScanning', 'ScanAvgCPULoadFactor') { KV 'Microsoft Defender' $n $pr.$n 'Get-MpPreference' }
        foreach ($x in @($pr.ExclusionPath)) { KV 'Microsoft Defender exclusions' 'Path' $x 'Get-MpPreference' }
        foreach ($x in @($pr.ExclusionExtension)) { KV 'Microsoft Defender exclusions' 'Extension' $x 'Get-MpPreference' }
        foreach ($x in @($pr.ExclusionProcess)) { KV 'Microsoft Defender exclusions' 'Process' $x 'Get-MpPreference' }
        $ids = @($pr.AttackSurfaceReductionRules_Ids); $act = @($pr.AttackSurfaceReductionRules_Actions)
        for ($i = 0; $i -lt $ids.Count; $i++) { KV 'Microsoft Defender ASR rules' $ids[$i] $(switch ([int]$act[$i]) { 0 { 'Disabled' } 1 { 'Block' } 2 { 'Audit' } 6 { 'Warn' } default { $act[$i] } }) 'Get-MpPreference' }
    } catch { Note 'Microsoft Defender status not readable (Defender may be replaced by another product)' }
    $pol = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender'
    foreach ($n in 'DisableAntiSpyware', 'DisableAntiVirus') { Reg-KV 'Microsoft Defender policy' $n $pol $n }
    foreach ($n in 'DisableRealtimeMonitoring', 'DisableBehaviorMonitoring', 'DisableOnAccessProtection') { Reg-KV 'Microsoft Defender policy' "Real-Time Protection $n" "$pol\Real-Time Protection" $n }
    foreach ($n in 'NoAutoUpdate', 'AUOptions', 'UseWUServer', 'ScheduledInstallDay', 'ScheduledInstallTime') { Reg-KV 'Windows Update' $n 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' $n }
    foreach ($n in 'WUServer', 'WUStatusServer', 'TargetGroup', 'DeferQualityUpdates', 'DeferFeatureUpdates') { Reg-KV 'Windows Update' $n 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' $n }
    foreach ($n in 'NoDriveTypeAutoRun', 'NoAutorun', 'NoAutoplayfornonVolume') { Reg-KV 'AutoRun and AutoPlay' $n 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' $n }
    Reg-KV 'SmartScreen' 'EnableSmartScreen (policy)' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableSmartScreen'
    Reg-KV 'SmartScreen' 'SmartScreenEnabled' 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' 'SmartScreenEnabled'
    Reg-KV 'Telemetry' 'AllowTelemetry (policy)' 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry'
    foreach ($n in 'EnableMulticast', 'EnableMDNS', 'DisableSmartNameResolution', 'DisableParallelAandAAAA') { Reg-KV 'Name resolution' "DNS client policy $n" 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' $n }
    Reg-KV 'Name resolution' 'EnableMulticast (LLMNR, Dnscache)' 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters' 'EnableMulticast'
    foreach ($i in @(RegKids 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces')) { Reg-KV 'Name resolution' "NetBIOS over TCP/IP option ($($i.PSChildName); 0 default, 1 on, 2 off)" $i.PSPath 'NetbiosOptions' }
    foreach ($n in 'DisabledComponents') { Reg-KV 'Network stack' "IPv6 $n" 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters' $n }
    foreach ($n in 'IPEnableRouter', 'EnableICMPRedirect', 'DisableIPSourceRouting') { Reg-KV 'Network stack' $n 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' $n }
    foreach ($n in 'Type', 'NtpServer') { Reg-KV 'Time service' $n 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters' $n }
    foreach ($n in 'ClearPageFileAtShutdown', 'DisablePagingExecutive') { Reg-KV 'Memory' $n 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' $n }
    foreach ($n in 'CrashDumpEnabled', 'AutoReboot', 'LogEvent', 'DumpFile') { Reg-KV 'Crash dumps' $n 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl' $n }
    foreach ($n in 'ProtectionMode', 'SafeDllSearchMode', 'CWDIllegalInDllSearch') { Reg-KV 'Session Manager' $n 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' $n }
    foreach ($n in 'ProxyEnable', 'ProxyServer', 'ProxyOverride', 'AutoConfigURL', 'AutoDetect') { Reg-KV 'Proxy' "Machine Internet Settings $n" 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings' $n }
    foreach ($n in 'ProxyEnable', 'ProxyServer', 'ProxyOverride', 'AutoConfigURL', 'AutoDetect') { foreach ($u in $script:Hku) { $v = RegVal "$($u.Root)\Software\Microsoft\Windows\CurrentVersion\Internet Settings" $n; if ($null -ne $v) { KV 'Proxy' "User Internet Settings $n ($($u.User))" $v "$($u.Root)\...\Internet Settings\$n" } } }
    try { $ap = Get-AppLockerPolicy -Effective -ErrorAction Stop; foreach ($c in $ap.RuleCollections) { KV 'AppLocker' "Rule collection $($c.RuleCollectionType)" ("{0} rule(s), enforcement {1}" -f @($c).Count, $c.EnforcementMode) 'Get-AppLockerPolicy -Effective' } } catch { }
}

Invoke-Cat 'gpo_applied' 'Applied Group Policy objects' {
    $base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Group Policy\History'
    foreach ($k in @(RegKids $base)) {
        foreach ($g in @(RegKids $k.PSPath)) {
            $v = RegGet $g.PSPath
            if ($v.DisplayName) { Row ([ordered]@{ Scope = 'Machine'; Type = $k.PSChildName; GPO = $v.DisplayName; GPOName = $v.GPOName; Link = $v.Link; DSPath = $v.DSPath; FileSysPath = $v.FileSysPath; Options = $v.Options; Version = $v.Version }) }
        }
    }
}

Invoke-Cat 'features' 'Windows optional features enabled' {
    foreach ($f in @(Get-WindowsOptionalFeature -Online -ErrorAction Stop | Where-Object { $_.State -eq 'Enabled' } | Sort-Object FeatureName)) { Row ([ordered]@{ Feature = $f.FeatureName; State = [string]$f.State }) }
}

Invoke-Cat 'hotfixes' 'Installed hotfixes' {
    foreach ($h in @(Get-HotFix | Sort-Object HotFixID)) { Row ([ordered]@{ HotFixID = $h.HotFixID; Description = $h.Description; InstalledBy = $h.InstalledBy; InstalledOn = (Tm $h.InstalledOn) }) }
}

# ======================================================================================================================
# Network
$script:Procs = @{}
foreach ($p in @(Get-CimInstance Win32_Process)) { $script:Procs[[int]$p.ProcessId] = $p }
function ProcName([int]$id) { $p = $script:Procs[$id]; if ($p) { $p.Name } else { '' } }
function ProcPath([int]$id) { $p = $script:Procs[$id]; if ($p) { $p.ExecutablePath } else { '' } }

Invoke-Cat 'net_adapters' 'Network adapters' {
    $cfg = @{}; foreach ($c in @(Get-CimInstance Win32_NetworkAdapterConfiguration)) { $cfg[[int]$c.InterfaceIndex] = $c }
    $ips = @(Get-NetIPAddress -ErrorAction SilentlyContinue)
    $dns = @(Get-DnsClientServerAddress -ErrorAction SilentlyContinue)
    $gw = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0', '::/0' -ErrorAction SilentlyContinue)
    $prof = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
    foreach ($a in @(Get-NetAdapter | Sort-Object ifIndex)) {
        $i = [int]$a.ifIndex; $c = $cfg[$i]
        $pf = $prof | Where-Object { $_.InterfaceIndex -eq $i } | Select-Object -First 1
        Row ([ordered]@{ Name = $a.Name; Description = $a.InterfaceDescription; Status = [string]$a.Status; MAC = $a.MacAddress; LinkSpeed = $a.LinkSpeed; MediaType = [string]$a.PhysicalMediaType; Virtual = $a.Virtual; Driver = $a.DriverVersion; DriverDate = (Tm $a.DriverDate); VlanID = $a.VlanID; MTU = $a.MtuSize
            IPv4 = (J ($ips | Where-Object { $_.InterfaceIndex -eq $i -and $_.AddressFamily -eq 'IPv4' } | ForEach-Object { "$($_.IPAddress)/$($_.PrefixLength)" }) ', ')
            IPv6 = (J ($ips | Where-Object { $_.InterfaceIndex -eq $i -and $_.AddressFamily -eq 'IPv6' } | ForEach-Object { "$($_.IPAddress)/$($_.PrefixLength)" }) ', ')
            Gateways = (J ($gw | Where-Object { $_.InterfaceIndex -eq $i } | ForEach-Object { $_.NextHop }) ', ')
            DNSServers = (J ($dns | Where-Object { $_.InterfaceIndex -eq $i } | ForEach-Object { $_.ServerAddresses }) ', ')
            DHCPEnabled = $(if ($c) { $c.DHCPEnabled } else { '' }); DHCPServer = $(if ($c) { $c.DHCPServer } else { '' }); DNSDomain = $(if ($c) { $c.DNSDomain } else { '' })
            NetBIOSOption = $(if ($c) { $c.TcpipNetbiosOptions } else { '' }); WINS = $(if ($c) { J @($c.WINSPrimaryServer, $c.WINSSecondaryServer) ', ' } else { '' })
            NetworkName = $(if ($pf) { $pf.Name } else { '' }); NetworkCategory = $(if ($pf) { [string]$pf.NetworkCategory } else { '' }) })
    }
}

Invoke-Cat 'net_listeners' 'Listening ports' {
    foreach ($c in @(Get-NetTCPConnection -State Listen | Sort-Object LocalPort, LocalAddress)) {
        $row = [ordered]@{ Protocol = 'TCP'; LocalAddress = $c.LocalAddress; LocalPort = $c.LocalPort; PID = $c.OwningProcess; Process = (ProcName $c.OwningProcess) }
        Add-Facts $row (ProcPath $c.OwningProcess); Row $row
    }
    foreach ($c in @(Get-NetUDPEndpoint | Sort-Object LocalPort, LocalAddress)) {
        $row = [ordered]@{ Protocol = 'UDP'; LocalAddress = $c.LocalAddress; LocalPort = $c.LocalPort; PID = $c.OwningProcess; Process = (ProcName $c.OwningProcess) }
        Add-Facts $row (ProcPath $c.OwningProcess); Row $row
    }
}

Invoke-Cat 'net_connections' 'TCP connections' {
    foreach ($c in @(Get-NetTCPConnection | Where-Object { $_.State -ne 'Listen' -and $_.State -ne 'Bound' } | Sort-Object State, RemoteAddress, RemotePort)) {
        Row ([ordered]@{ State = [string]$c.State; LocalAddress = $c.LocalAddress; LocalPort = $c.LocalPort; RemoteAddress = $c.RemoteAddress; RemotePort = $c.RemotePort; PID = $c.OwningProcess; Process = (ProcName $c.OwningProcess); ProcessPath = (ProcPath $c.OwningProcess); CreationTime = (Tm $c.CreationTime) })
    }
}

Invoke-Cat 'dns_cache' 'DNS client cache' {
    foreach ($d in @(Get-DnsClientCache | Sort-Object Entry, Type)) { Row ([ordered]@{ Entry = $d.Entry; Name = $d.Name; Type = [string]$d.Type; Status = [string]$d.Status; Section = [string]$d.Section; Data = $d.Data; TimeToLive = $d.TimeToLive }) }
}

Invoke-Cat 'arp_neighbors' 'ARP and neighbour cache' {
    foreach ($n in @(Get-NetNeighbor | Where-Object { $_.LinkLayerAddress -and $_.State -ne 'Unreachable' } | Sort-Object InterfaceAlias, IPAddress)) { Row ([ordered]@{ IPAddress = $n.IPAddress; MAC = $n.LinkLayerAddress; State = [string]$n.State; Interface = $n.InterfaceAlias; AddressFamily = [string]$n.AddressFamily }) }
}

Invoke-Cat 'routes' 'Routing table' {
    foreach ($r in @(Get-NetRoute | Sort-Object AddressFamily, DestinationPrefix, InterfaceAlias)) { Row ([ordered]@{ Destination = $r.DestinationPrefix; NextHop = $r.NextHop; Metric = $r.RouteMetric; Interface = $r.InterfaceAlias; AddressFamily = [string]$r.AddressFamily; Protocol = [string]$r.Protocol; Store = [string]$r.Store }) }
}

Invoke-Cat 'hosts_file' 'Hosts file' {
    $f = "$env:SystemRoot\System32\drivers\etc\hosts"
    $i = 0
    foreach ($l in @(Get-Content -LiteralPath $f)) {
        $i++; $t = $l.Trim()
        if (-not $t -or $t.StartsWith('#')) { continue }
        $parts = ($t -split '#')[0].Trim() -split '\s+'
        Row ([ordered]@{ Line = $i; Address = $parts[0]; Names = (J ($parts | Select-Object -Skip 1) ' ') })
    }
    $m = Get-Item -LiteralPath $f -Force
    if ($m) { Note "hosts file size $($m.Length) bytes, modified $(Tm $m.LastWriteTimeUtc)" }
}

Invoke-Cat 'smb_shares' 'SMB shares' {
    foreach ($s in @(Get-SmbShare | Sort-Object Name)) {
        $acc = @(Get-SmbShareAccess -Name $s.Name -ErrorAction SilentlyContinue | ForEach-Object { "$($_.AccountName):$($_.AccessRight)($($_.AccessControlType))" })
        Row ([ordered]@{ Name = $s.Name; Path = $s.Path; Description = $s.Description; Special = $s.Special; Temporary = $s.Temporary; ShareState = [string]$s.ShareState; CurrentUsers = $s.CurrentUsers; EncryptData = $s.EncryptData; FolderEnumerationMode = [string]$s.FolderEnumerationMode; CachingMode = [string]$s.CachingMode; Access = (J $acc ' | ') })
    }
}

Invoke-Cat 'smb_sessions' 'SMB sessions, connections and mappings' {
    foreach ($s in @(Get-SmbSession)) { Row ([ordered]@{ Direction = 'Incoming session'; Remote = $s.ClientComputerName; User = $s.ClientUserName; Detail = "opens=$($s.NumOpens) dialect=$($s.Dialect) signed=$($s.IsSigned)"; Since = (Tm ((Get-Date).AddSeconds(-[double]$s.SecondsExists))) }) }
    foreach ($c in @(Get-SmbConnection)) { Row ([ordered]@{ Direction = 'Outgoing connection'; Remote = $c.ServerName; User = $c.UserName; Detail = "share=$($c.ShareName) dialect=$($c.Dialect) encrypted=$($c.Encrypted) signed=$($c.Signed)"; Since = '' }) }
    foreach ($m in @(Get-SmbMapping)) { Row ([ordered]@{ Direction = 'Mapped drive'; Remote = $m.RemotePath; User = ''; Detail = "local=$($m.LocalPath) status=$($m.Status)"; Since = '' }) }
}

Invoke-Cat 'firewall_profiles' 'Firewall profiles' {
    foreach ($p in @(Get-NetFirewallProfile)) { Row ([ordered]@{ Profile = $p.Name; Enabled = [string]$p.Enabled; DefaultInbound = [string]$p.DefaultInboundAction; DefaultOutbound = [string]$p.DefaultOutboundAction; AllowInboundRules = [string]$p.AllowInboundRules; AllowLocalFirewallRules = [string]$p.AllowLocalFirewallRules; NotifyOnListen = [string]$p.NotifyOnListen; LogAllowed = [string]$p.LogAllowed; LogBlocked = [string]$p.LogBlocked; LogFileName = $p.LogFileName; LogMaxSizeKB = $p.LogMaxSizeKilobytes }) }
}

Invoke-Cat 'firewall_rules' 'Firewall rules' {
    $port = @{}; foreach ($x in @(Get-NetFirewallPortFilter)) { $port[$x.InstanceID] = $x }
    $app = @{}; foreach ($x in @(Get-NetFirewallApplicationFilter)) { $app[$x.InstanceID] = $x }
    $addr = @{}; foreach ($x in @(Get-NetFirewallAddressFilter)) { $addr[$x.InstanceID] = $x }
    $svc = @{}; foreach ($x in @(Get-NetFirewallServiceFilter)) { $svc[$x.InstanceID] = $x }
    foreach ($r in @(Get-NetFirewallRule | Sort-Object Direction, DisplayName, Name)) {
        $po = $port[$r.InstanceID]; $ap = $app[$r.InstanceID]; $ad = $addr[$r.InstanceID]; $sv = $svc[$r.InstanceID]
        Row ([ordered]@{ Name = $r.Name; DisplayName = $r.DisplayName; Group = $r.DisplayGroup; Enabled = [string]$r.Enabled; Direction = [string]$r.Direction; Action = [string]$r.Action; Profile = [string]$r.Profile; Protocol = $(if ($po) { [string]$po.Protocol } else { '' })
            LocalPort = $(if ($po) { J $po.LocalPort ',' } else { '' }); RemotePort = $(if ($po) { J $po.RemotePort ',' } else { '' }); LocalAddress = $(if ($ad) { J $ad.LocalAddress ',' } else { '' }); RemoteAddress = $(if ($ad) { J $ad.RemoteAddress ',' } else { '' })
            Program = $(if ($ap) { [string]$ap.Program } else { '' }); Service = $(if ($sv) { [string]$sv.Service } else { '' }); PrimaryStatus = [string]$r.PrimaryStatus; Owner = [string]$r.Owner; PolicyStore = [string]$r.PolicyStoreSourceType; Description = $r.Description })
    }
}

Invoke-Cat 'named_pipes' 'Named pipes' {
    foreach ($n in ([IO.Directory]::GetFiles('\\.\pipe\') | ForEach-Object { $_.Substring(9) } | Sort-Object)) { Row ([ordered]@{ Pipe = $n }) }
}

Invoke-Cat 'network_history' 'Networks this host has joined' {
    $b = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList'
    $sig = @{}
    foreach ($k in @(RegKids "$b\Signatures\Unmanaged") + @(RegKids "$b\Signatures\Managed")) { $v = RegGet $k.PSPath; if ($v.ProfileGuid) { $sig[[string]$v.ProfileGuid] = $v } }
    $st = { param($bytes) if ($bytes -is [byte[]] -and $bytes.Length -ge 16) { $y = [BitConverter]::ToUInt16($bytes, 0); $mo = [BitConverter]::ToUInt16($bytes, 2); $d = [BitConverter]::ToUInt16($bytes, 6); $h = [BitConverter]::ToUInt16($bytes, 8); $mi = [BitConverter]::ToUInt16($bytes, 10); $s = [BitConverter]::ToUInt16($bytes, 12); try { (Get-Date -Year $y -Month $mo -Day $d -Hour $h -Minute $mi -Second $s -Millisecond 0).ToString('yyyy-MM-ddTHH:mm:ss') + ' (local time of that host)' } catch { '' } } else { '' } }
    foreach ($k in @(RegKids "$b\Profiles")) {
        $v = RegGet $k.PSPath; $s = $sig[$k.PSChildName]
        Row ([ordered]@{ Profile = $v.ProfileName; Description = $v.Description; Category = $v.Category; Managed = $v.Managed; NameType = $v.NameType; Created = (& $st $v.DateCreated); LastConnected = (& $st $v.DateLastConnected); DnsSuffix = $s.DnsSuffix; GatewayMAC = $(if ($s.DefaultGatewayMac) { ($s.DefaultGatewayMac | ForEach-Object { $_.ToString('x2') }) -join ':' } else { '' }); FirstNetwork = $s.FirstNetwork })
    }
}

# ======================================================================================================================
# Processes, services, drivers, tasks
Invoke-Cat 'processes' 'Running processes' {
    $users = @{}
    if ($script:IsAdmin) { foreach ($g in @(Get-Process -IncludeUserName)) { $users[[int]$g.Id] = [string]$g.UserName } }   # one call; per-process owner lookups are slow
    foreach ($p in @($script:Procs.Values | Sort-Object Name, ProcessId)) {
        $par = $script:Procs[[int]$p.ParentProcessId]
        $user = $users[[int]$p.ProcessId]
        if (-not $user -and -not $script:IsAdmin) { try { $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner -ErrorAction Stop; if ($o.User) { $user = "$($o.Domain)\$($o.User)" } } catch { } }
        $row = [ordered]@{ PID = $p.ProcessId; PPID = $p.ParentProcessId; Name = $p.Name; ParentName = $(if ($par) { $par.Name } else { '' }); ParentPath = $(if ($par) { $par.ExecutablePath } else { '' }); User = $user; SessionId = $p.SessionId
            CommandLine = $p.CommandLine; StartTime = (Tm $p.CreationDate); Threads = $p.ThreadCount; Handles = $p.HandleCount; WorkingSetMB = [math]::Round($p.WorkingSetSize / 1MB, 1); Priority = $p.Priority }
        Add-Facts $row $p.ExecutablePath
        Row $row
    }
}

Invoke-Cat 'modules' 'Loaded modules outside the Windows folder' {
    $seen = @{}
    foreach ($g in @(Get-Process)) {
        try { $mods = @($g.Modules) } catch { continue }
        foreach ($m in $mods) {
            $f = [string]$m.FileName
            if (-not $f -or $f.StartsWith($env:SystemRoot, [StringComparison]::OrdinalIgnoreCase)) { continue }
            $k = $f.ToLowerInvariant()
            if (-not $seen.ContainsKey($k)) { $seen[$k] = [pscustomobject]@{ Path = $f; Procs = (New-Object System.Collections.Generic.List[string]) } }
            $n = "$($g.Name)($($g.Id))"
            if (-not $seen[$k].Procs.Contains($n)) { $seen[$k].Procs.Add($n) }
        }
    }
    $i = 0
    foreach ($e in @($seen.Values | Sort-Object Path)) {
        $i++; if ($i -gt 2500) { Note 'Stopped at 2500 modules'; break }
        $row = [ordered]@{ Module = (Split-Path $e.Path -Leaf); LoadedBy = (J ($e.Procs | Select-Object -First 12) ', '); ProcessCount = $e.Procs.Count }
        Add-Facts $row $e.Path; Row $row
    }
    if (-not $script:IsAdmin) { Note 'Module lists of other users and protected processes need administrator rights' }
}

Invoke-Cat 'services' 'Services' {
    foreach ($s in @(Get-CimInstance Win32_Service | Sort-Object Name)) {
        $reg = RegGet "HKLM:\SYSTEM\CurrentControlSet\Services\$($s.Name)"; $par = RegGet "HKLM:\SYSTEM\CurrentControlSet\Services\$($s.Name)\Parameters"
        $img = Resolve-Exe $s.PathName
        $pn = [string]$s.PathName
        $row = [ordered]@{ Name = $s.Name; DisplayName = $s.DisplayName; State = $s.State; StartMode = $s.StartMode; DelayedAutoStart = $reg.DelayedAutostart; Account = $s.StartName; ServiceType = $s.ServiceType; ErrorControl = $s.ErrorControl; PID = $s.ProcessId
            PathName = $pn; UnquotedPathWithSpaces = ($pn -and $pn -notmatch '^"' -and (($pn -replace '(?i)\.exe.*$', '.exe') -match ' ') -and $pn -match '^[A-Za-z]:'); Description = $(if ($s.Description) { $s.Description.Substring(0, [math]::Min(160, $s.Description.Length)) } else { '' })
            DependsOn = (J $reg.DependOnService ', '); FailureCommand = $reg.FailureCommand; ServiceDllPath = ''; ServiceDllSHA256 = ''; ServiceDllSignature = ''; ServiceDllSigner = '' }
        Add-Facts $row $img
        $dll = [Environment]::ExpandEnvironmentVariables([string]$par.ServiceDll)
        if ($dll) { $f = Get-Facts $dll; $row.ServiceDllPath = $dll; $row.ServiceDllSHA256 = $f.SHA256; $row.ServiceDllSignature = $f.Signature; $row.ServiceDllSigner = $f.Signer }
        Row $row
    }
}

Invoke-Cat 'drivers_kernel' 'Kernel and file system drivers' {
    foreach ($d in @(Get-CimInstance Win32_SystemDriver | Sort-Object Name)) {
        $row = [ordered]@{ Name = $d.Name; DisplayName = $d.DisplayName; State = $d.State; StartMode = $d.StartMode; ServiceType = $d.ServiceType; ErrorControl = $d.ErrorControl; Group = (RegVal "HKLM:\SYSTEM\CurrentControlSet\Services\$($d.Name)" 'Group'); Description = $d.Description }
        Add-Facts $row (Resolve-Exe $d.PathName); Row $row
    }
}

Invoke-Cat 'scheduled_tasks' 'Scheduled tasks' {
    foreach ($t in @(Get-ScheduledTask | Sort-Object TaskPath, TaskName)) {
        $i = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction SilentlyContinue
        $acts = @($t.Actions)
        $first = $acts | Where-Object { $_.Execute } | Select-Object -First 1
        $exe = if ($first) { Resolve-Exe $first.Execute } else { '' }
        $row = [ordered]@{ TaskPath = $t.TaskPath; TaskName = $t.TaskName; State = [string]$t.State; Enabled = $t.Settings.Enabled; Hidden = $t.Settings.Hidden; MicrosoftDefaultFolder = ($t.TaskPath -like '\Microsoft\Windows\*'); Author = $t.Author; RunAs = $t.Principal.UserId; LogonType = [string]$t.Principal.LogonType; RunLevel = [string]$t.Principal.RunLevel
            Triggers = (J ($t.Triggers | ForEach-Object { ($_.CimClass.CimClassName -replace '^MSFT_Task', '' -replace 'Trigger$', '') + $(if ($_.StartBoundary) { " $($_.StartBoundary)" } else { '' }) + $(if ($_.Enabled -eq $false) { ' (disabled)' } else { '' }) }) ' | ')
            Actions = (J ($acts | ForEach-Object { if ($_.Execute) { "$($_.Execute) $($_.Arguments)".Trim() } elseif ($_.ClassId) { "COM handler $($_.ClassId)" } else { [string]$_.CimClass.CimClassName } }) ' | ')
            LastRun = $(if ($i) { Tm $i.LastRunTime } else { '' }); LastResult = $(if ($i) { $i.LastTaskResult } else { '' }); NextRun = $(if ($i) { Tm $i.NextRunTime } else { '' }); MissedRuns = $(if ($i) { $i.NumberOfMissedRuns } else { '' }); Registered = (Tm $t.Date); Description = $(if ($t.Description) { $t.Description.Substring(0, [math]::Min(160, $t.Description.Length)) } else { '' }) }
        Add-Facts $row $exe
        Row $row
    }
}

# ======================================================================================================================
# Persistence
function Auto($loc, $scope, $user, $key, $entry, $value, $mode = 'cmd') {
    $v = Show $value
    $row = [ordered]@{ Location = $loc; Scope = $scope; User = $user; Key = $key; Entry = $entry; Value = $v }
    $img = ''
    switch ($mode) {
        'cmd' { $img = Resolve-Exe $v }
        'dll' { if ($v) { $n = $v.Trim(); if ($n -notmatch '\.') { $n += '.dll' }; $img = if ($n -match '[\\/]') { Resolve-Exe $n } else { Join-Path "$env:SystemRoot\System32" $n } } }
        'clsid' { $img = Resolve-Exe (Resolve-Clsid $v) }
        default { }
    }
    Add-Facts $row $img 'Image'
    Row $row
}

Invoke-Cat 'autoruns' 'Persistence: autostart locations in the registry' {
    $mach = @(
        @('Run key', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'cmd'), @('RunOnce key', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce', 'cmd'),
        @('Run key (32-bit)', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Run', 'cmd'), @('RunOnce key (32-bit)', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\RunOnce', 'cmd'),
        @('Policy Run key', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run', 'cmd'), @('Shared task scheduler', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SharedTaskScheduler', 'clsid'),
        @('Shell service object delay load', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\ShellServiceObjectDelayLoad', 'clsid'), @('Shell execute hooks', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellExecuteHooks', 'clsid'),
        @('Winlogon', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'cmd', @('Shell', 'Userinit', 'Taskman', 'AppSetup', 'VmApplet', 'UIHost', 'GinaDLL', 'System')),
        @('Session Manager', 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager', 'cmd', @('BootExecute', 'SetupExecute', 'S0InitialCommand', 'PlatformExecute', 'Execute')),
        @('Known DLLs', 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs', 'none'),
        @('Windows (AppInit)', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows', 'cmd', @('AppInit_DLLs', 'LoadAppInit_DLLs', 'RequireSignedAppInit_DLLs', 'Load', 'Run')),
        @('Windows (AppInit, 32-bit)', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows NT\CurrentVersion\Windows', 'cmd', @('AppInit_DLLs', 'LoadAppInit_DLLs', 'RequireSignedAppInit_DLLs')),
        @('LSA packages', 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa', 'dll', @('Authentication Packages', 'Notification Packages', 'Security Packages')),
        @('LSA OSConfig packages', 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\OSConfig', 'dll', @('Security Packages')),
        @('Netsh helper DLLs', 'HKLM:\SOFTWARE\Microsoft\NetSh', 'dll'), @('Network provider order', 'HKLM:\SYSTEM\CurrentControlSet\Control\NetworkProvider\Order', 'none'),
        @('Boot verification program', 'HKLM:\SYSTEM\CurrentControlSet\Control\BootVerificationProgram', 'cmd', @('ImagePath')), @('Safe Mode alternate shell', 'HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot', 'cmd', @('AlternateShell')),
        @('RDP initial program', 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp', 'cmd', @('InitialProgram')), @('RDP startup programs', 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\Wds\rdpwd', 'cmd', @('StartupPrograms')),
        @('Command Processor AutoRun', 'HKLM:\SOFTWARE\Microsoft\Command Processor', 'cmd', @('AutoRun')), @('Print providers', 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Providers', 'none'),
        @('Appinit-style shell load (WOW)', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows NT\CurrentVersion\Winlogon', 'cmd', @('Shell', 'Userinit'))
    )
    foreach ($m in $mach) {
        $v = RegGet $m[1]
        $names = if ($m.Count -gt 3) { $m[3] } else { @($v.Keys | Sort-Object) }
        foreach ($n in $names) { if ($v.ContainsKey($n)) { foreach ($x in @($v[$n])) { if ("$x" -ne '') { Auto $m[0] 'Machine' '' $m[1] $n $x $m[2] } } } }
    }
    # sub-key based locations: the value that names the file is read from each sub-key
    $subs = @(
        @('Image File Execution Options', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options', @('Debugger', 'VerifierDlls', 'GlobalFlag'), 'cmd'),
        @('Silent process exit monitor', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SilentProcessExit', @('MonitorProcess', 'ReportingMode'), 'cmd'),
        @('AppCert DLLs', 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCertDlls', @(), 'dll'),
        @('Print monitors', 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors', @('Driver'), 'dll'),
        @('Time providers', 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders', @('DllName'), 'dll'),
        @('Active Setup', 'HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components', @('StubPath'), 'cmd'),
        @('Active Setup (32-bit)', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Active Setup\Installed Components', @('StubPath'), 'cmd'),
        @('Credential providers', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers', @('(key)'), 'clsid'),
        @('Shell icon overlays', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers', @('(default)'), 'clsid'),
        @('Browser helper objects', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Browser Helper Objects', @('(key)'), 'clsid'),
        @('Context menu handlers (all files)', 'HKLM:\SOFTWARE\Classes\*\shellex\ContextMenuHandlers', @('(default)'), 'clsid'),
        @('Context menu handlers (folders)', 'HKLM:\SOFTWARE\Classes\Directory\shellex\ContextMenuHandlers', @('(default)'), 'clsid'),
        @('Context menu handlers (drives)', 'HKLM:\SOFTWARE\Classes\Folder\ShellEx\ContextMenuHandlers', @('(default)'), 'clsid'),
        @('Compatibility shim databases', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\InstalledSDB', @('DatabasePath'), 'none'),
        @('Group Policy startup and logon scripts', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Group Policy\Scripts', @('Script'), 'cmd')
    )
    foreach ($s in $subs) {
        foreach ($k in @(Get-ChildItem -LiteralPath $s[1] -Recurse -ErrorAction SilentlyContinue)) {
            $v = RegGet $k.PSPath
            $rel = $k.Name -replace '^.*?\\(?=[^\\]*$)', ''
            foreach ($n in $s[2]) {
                if ($n -eq '(key)') { Auto $s[0] 'Machine' '' $k.PSPath (RegVal $k.PSPath '(default)') $k.PSChildName $s[3] }
                elseif ($n -eq '(default)') { $val = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue).'(default)'; if ($val) { Auto $s[0] 'Machine' '' $k.PSPath $rel $val $s[3] } }
                elseif ($v.ContainsKey($n) -and "$($v[$n])" -ne '') { Auto $s[0] 'Machine' '' $k.PSPath "$rel [$n]" $v[$n] $s[3] }
            }
            if (-not $s[2].Count -and $s[0] -eq 'AppCert DLLs') { foreach ($n in $v.Keys) { Auto $s[0] 'Machine' '' $k.PSPath $n $v[$n] 'dll' } }
        }
    }
    foreach ($k in @(RegKids 'HKLM:\SYSTEM\CurrentControlSet\Services')) {
        $np = RegVal "$($k.PSPath)\NetworkProvider" 'ProviderPath'
        if ($np) { Auto 'Network providers' 'Machine' '' "$($k.PSPath)\NetworkProvider" $k.PSChildName $np 'cmd' }
    }
    # per-user locations of every loaded user hive
    $usr = @(
        @('Run key', 'Software\Microsoft\Windows\CurrentVersion\Run', 'cmd'), @('RunOnce key', 'Software\Microsoft\Windows\CurrentVersion\RunOnce', 'cmd'), @('Policy Run key', 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run', 'cmd'),
        @('Windows (Load and Run)', 'Software\Microsoft\Windows NT\CurrentVersion\Windows', 'cmd', @('Load', 'Run')), @('Winlogon (user shell)', 'Software\Microsoft\Windows NT\CurrentVersion\Winlogon', 'cmd', @('Shell', 'Userinit')),
        @('Command Processor AutoRun', 'Software\Microsoft\Command Processor', 'cmd', @('AutoRun')), @('Logon script', 'Environment', 'cmd', @('UserInitMprLogonScript'))
    )
    foreach ($u in $script:Hku) {
        foreach ($m in $usr) {
            $path = "$($u.Root)\$($m[1])"; $v = RegGet $path
            $names = if ($m.Count -gt 3) { $m[3] } else { @($v.Keys | Sort-Object) }
            foreach ($n in $names) { if ($v.ContainsKey($n) -and "$($v[$n])" -ne '') { Auto $m[0] 'User' $u.User $path $n $v[$n] $m[2] } }
        }
        foreach ($k in @(Get-ChildItem -LiteralPath "$($u.Root)_Classes\CLSID" -ErrorAction SilentlyContinue)) {
            foreach ($t in 'InprocServer32', 'LocalServer32') { $val = (Get-ItemProperty -LiteralPath "$($k.PSPath)\$t" -ErrorAction SilentlyContinue).'(default)'; if ($val) { Auto 'COM class registered by the user' 'User' $u.User $k.PSPath "$($k.PSChildName) [$t]" $val 'cmd' } }
        }
    }
}

Invoke-Cat 'startup_folders' 'Persistence: startup folders' {
    $sh = New-Object -ComObject WScript.Shell
    $places = @(, @('Machine', '', [Environment]::GetFolderPath('CommonStartup')))
    foreach ($p in @(Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special })) { $places += , @('User', (Sid2Name $p.SID), (Join-Path $p.LocalPath 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup')) }
    foreach ($pl in $places) {
        foreach ($f in @(Get-ChildItem -LiteralPath $pl[2] -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })) {
            $target = ''; $args2 = ''
            if ($f.Extension -eq '.lnk') { try { $l = $sh.CreateShortcut($f.FullName); $target = $l.TargetPath; $args2 = $l.Arguments } catch { } }
            $row = [ordered]@{ Scope = $pl[0]; User = $pl[1]; Folder = $pl[2]; Name = $f.Name; Size = $f.Length; Created = (Tm $f.CreationTimeUtc); Modified = (Tm $f.LastWriteTimeUtc); ShortcutTarget = $target; ShortcutArguments = $args2 }
            Add-Facts $row $(if ($target) { $target } else { $f.FullName }) 'Image'
            Row $row
        }
    }
}

Invoke-Cat 'startup_commands' 'Persistence: startup commands known to WMI' {
    foreach ($s in @(Get-CimInstance Win32_StartupCommand | Sort-Object Location, Name)) { Row ([ordered]@{ Name = $s.Name; Command = $s.Command; Location = $s.Location; User = $s.User }) }
}

Invoke-Cat 'wmi_subscriptions' 'Persistence: WMI event subscriptions' {
    $ns = 'root\subscription'
    foreach ($f in @(Get-CimInstance -Namespace $ns -ClassName __EventFilter)) { Row ([ordered]@{ Kind = 'Filter'; Name = $f.Name; Type = 'EventFilter'; Detail = $f.Query; Extra = "namespace=$($f.EventNamespace) language=$($f.QueryLanguage)" }) }
    foreach ($c in @(Get-CimInstance -Namespace $ns -ClassName __EventConsumer)) {
        $type = $c.CimClass.CimClassName
        $d = switch ($type) { 'CommandLineEventConsumer' { "$($c.ExecutablePath) $($c.CommandLineTemplate)".Trim() } 'ActiveScriptEventConsumer' { "$($c.ScriptingEngine): $($c.ScriptText)" } 'NTEventLogEventConsumer' { "source=$($c.SourceName) event=$($c.EventID)" } 'SMTPEventConsumer' { "to=$($c.ToLine)" } default { '' } }
        Row ([ordered]@{ Kind = 'Consumer'; Name = $c.Name; Type = $type; Detail = $d; Extra = '' })
    }
    foreach ($b in @(Get-CimInstance -Namespace $ns -ClassName __FilterToConsumerBinding)) { Row ([ordered]@{ Kind = 'Binding'; Name = ''; Type = 'FilterToConsumerBinding'; Detail = "$($b.Filter.Name) -> $($b.Consumer.Name)"; Extra = '' }) }
}

Invoke-Cat 'bits_jobs' 'Persistence: BITS transfer jobs' {
    foreach ($j in @(Get-BitsTransfer -AllUsers -ErrorAction Stop | Sort-Object CreationTime)) {
        Row ([ordered]@{ JobId = [string]$j.JobId; Name = $j.DisplayName; State = [string]$j.JobState; Owner = $j.OwnerAccount; Type = [string]$j.TransferType; Priority = [string]$j.Priority; Created = (Tm $j.CreationTime); Files = (J ($j.FileList | ForEach-Object { "$($_.RemoteName) -> $($_.LocalName)" }) ' | '); NotifyCommand = "$($j.NotifyCmdLineProgram) $($j.NotifyCmdLineParameters)".Trim(); ProxyUsage = [string]$j.ProxyUsage })
    }
}

# ======================================================================================================================
# Software, certificates, devices
Invoke-Cat 'software' 'Installed software' {
    $sources = @(, @('Registry (machine)', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', ''))
    $sources += , @('Registry (machine, 32-bit)', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall', '')
    foreach ($u in $script:Hku) { $sources += , @('Registry (user)', "$($u.Root)\Software\Microsoft\Windows\CurrentVersion\Uninstall", $u.User) }
    foreach ($s in $sources) {
        foreach ($k in @(RegKids $s[1])) {
            $v = RegGet $k.PSPath
            if (-not $v.DisplayName) { continue }
            Row ([ordered]@{ Name = $v.DisplayName; Version = $v.DisplayVersion; Publisher = $v.Publisher; InstallDate = $v.InstallDate; Source = $s[0]; User = $s[2]; InstallLocation = $v.InstallLocation; UninstallString = $v.UninstallString; SystemComponent = $v.SystemComponent; EstimatedSizeKB = $v.EstimatedSize; Key = $k.PSChildName })
        }
    }
    try {
        foreach ($a in @(Get-AppxPackage -AllUsers -ErrorAction Stop | Sort-Object Name)) {
            Row ([ordered]@{ Name = $a.Name; Version = [string]$a.Version; Publisher = $a.Publisher; InstallDate = ''; Source = 'Store app'; User = ''; InstallLocation = $a.InstallLocation; UninstallString = ''; SystemComponent = $(if ($a.IsFramework) { 'framework' } else { '' }); EstimatedSizeKB = ''; Key = $a.PackageFullName })
        }
    } catch { Note 'Store apps not readable here' }
}

Invoke-Cat 'certificates' 'Certificate stores' {
    $stores = @('LocalMachine\Root', 'LocalMachine\CA', 'LocalMachine\AuthRoot', 'LocalMachine\TrustedPublisher', 'LocalMachine\TrustedPeople', 'LocalMachine\My', 'LocalMachine\Disallowed', 'CurrentUser\Root', 'CurrentUser\TrustedPublisher', 'CurrentUser\My')
    foreach ($s in $stores) {
        foreach ($c in @(Get-ChildItem -LiteralPath "Cert:\$s" -ErrorAction SilentlyContinue | Sort-Object Subject, Thumbprint)) {
            $eku = J ($c.EnhancedKeyUsageList | ForEach-Object { $_.FriendlyName }) ', '
            Row ([ordered]@{ Store = $s; Subject = $c.Subject; Issuer = $c.Issuer; Thumbprint = $c.Thumbprint; Serial = $c.SerialNumber; NotBefore = (Tm $c.NotBefore); NotAfter = (Tm $c.NotAfter); Expired = ($c.NotAfter -lt (Get-Date)); SelfSigned = ($c.Subject -eq $c.Issuer); HasPrivateKey = $c.HasPrivateKey; SignatureAlgorithm = $c.SignatureAlgorithm.FriendlyName; KeyAlgorithm = $c.PublicKey.Oid.FriendlyName; EnhancedKeyUsage = $eku; FriendlyName = $c.FriendlyName })
        }
    }
}

Invoke-Cat 'usb_history' 'USB storage history' {
    $ft = { param($k, $id) $v = (Get-ItemProperty -LiteralPath "$k\Properties\{83da6326-97a6-4088-9453-a1923f573b29}\$id" -ErrorAction SilentlyContinue).'(default)'; if ($v -is [byte[]] -and $v.Length -ge 8) { FTime ([BitConverter]::ToInt64($v, 0)) } else { '' } }
    foreach ($class in 'USBSTOR', 'USB') {
        foreach ($dev in @(RegKids "HKLM:\SYSTEM\CurrentControlSet\Enum\$class")) {
            foreach ($inst in @(RegKids $dev.PSPath)) {
                $v = RegGet $inst.PSPath
                Row ([ordered]@{ Class = $class; Device = $dev.PSChildName; Instance = $inst.PSChildName; FriendlyName = $v.FriendlyName; DeviceDesc = ([string]$v.DeviceDesc -replace '^.*;', ''); Manufacturer = ([string]$v.Mfg -replace '^.*;', ''); Service = $v.Service; ContainerId = [string]$v.ContainerID
                    FirstInstalled = (& $ft $inst.PSPath '0064'); LastArrival = (& $ft $inst.PSPath '0066'); LastRemoved = (& $ft $inst.PSPath '0067') })
            }
        }
    }
}

# ======================================================================================================================
# Evidence of execution and user activity, read from the registry (never copied)
function Rot13([string]$s) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $s.ToCharArray()) {
        $c = [int]$ch
        if ($c -ge 97 -and $c -le 122) { [void]$sb.Append([char]((($c - 97 + 13) % 26) + 97)) } elseif ($c -ge 65 -and $c -le 90) { [void]$sb.Append([char]((($c - 65 + 13) % 26) + 65)) } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}
Invoke-Cat 'exec_userassist' 'Execution evidence: UserAssist (decoded)' {
    foreach ($u in $script:Hku) {
        foreach ($g in @(RegKids "$($u.Root)\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist")) {
            $c = RegGet "$($g.PSPath)\Count"
            foreach ($n in $c.Keys) {
                $b = $c[$n]
                if ($b -isnot [byte[]] -or $b.Length -lt 68) { continue }
                Row ([ordered]@{ User = $u.User; Name = (Rot13 $n); RunCount = [BitConverter]::ToUInt32($b, 4); FocusCount = [BitConverter]::ToUInt32($b, 8); FocusSeconds = [math]::Round([BitConverter]::ToUInt32($b, 12) / 1000, 0); LastExecuted = (FTime ([BitConverter]::ToInt64($b, 60))); Group = $g.PSChildName })
            }
        }
    }
}

Invoke-Cat 'exec_bam' 'Execution evidence: Background Activity Moderator' {
    foreach ($base in 'HKLM:\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings', 'HKLM:\SYSTEM\CurrentControlSet\Services\bam\UserSettings') {
        foreach ($k in @(RegKids $base)) {
            $v = RegGet $k.PSPath
            foreach ($n in $v.Keys) {
                $b = $v[$n]
                if ($b -isnot [byte[]] -or $b.Length -lt 8) { continue }
                Row ([ordered]@{ User = (Sid2Name $k.PSChildName); Path = $n; LastExecuted = (FTime ([BitConverter]::ToInt64($b, 0))) })
            }
        }
    }
}

Invoke-Cat 'exec_shimcache' 'Execution evidence: ShimCache (AppCompatCache, parsed)' {
    $b = RegVal 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache' 'AppCompatCache'
    if ($b -isnot [byte[]]) { Note 'AppCompatCache not readable'; return }
    $sig = [byte[]](0x31, 0x30, 0x74, 0x73)   # "10ts": the entry marker of Windows 10 and 11
    $off = -1
    for ($i = 0; $i -lt [math]::Min($b.Length - 4, 512); $i++) { if ($b[$i] -eq $sig[0] -and $b[$i + 1] -eq $sig[1] -and $b[$i + 2] -eq $sig[2] -and $b[$i + 3] -eq $sig[3]) { $off = $i; break } }
    if ($off -lt 0) { Note 'AppCompatCache is in a format this baseline does not parse (not Windows 10 or 11)'; return }
    $pos = 0
    while ($off + 14 -lt $b.Length -and $pos -lt 1024) {
        if ($b[$off] -ne $sig[0] -or $b[$off + 1] -ne $sig[1] -or $b[$off + 2] -ne $sig[2] -or $b[$off + 3] -ne $sig[3]) { break }
        $size = [BitConverter]::ToUInt32($b, $off + 8); $plen = [BitConverter]::ToUInt16($b, $off + 12)
        if ($plen -le 0 -or $off + 14 + $plen + 8 -gt $b.Length) { break }
        $path = [Text.Encoding]::Unicode.GetString($b, $off + 14, $plen)
        Row ([ordered]@{ Position = $pos; Path = $path; LastModified = (FTime ([BitConverter]::ToInt64($b, $off + 14 + $plen))) })
        $pos++; $off += 12 + [int]$size
    }
}

Invoke-Cat 'exec_muicache' 'Execution evidence: MUICache and Compatibility Assistant' {
    foreach ($u in $script:Hku) {
        $m = RegGet "$($u.Root)_Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache"
        foreach ($n in ($m.Keys | Where-Object { $_ -match '\.(FriendlyAppName|ApplicationCompany)$' -or $_ -match '^[A-Za-z]:\\' } | Sort-Object)) { Row ([ordered]@{ Source = 'MUICache'; User = $u.User; Path = ($n -replace '\.(FriendlyAppName|ApplicationCompany)$', ''); Name = $n -replace '^.*\.(FriendlyAppName|ApplicationCompany)$', '$1'; Value = (Show $m[$n]) }) }
        $s = RegGet "$($u.Root)\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store"
        foreach ($n in ($s.Keys | Sort-Object)) { $b = $s[$n]; Row ([ordered]@{ Source = 'Compatibility Assistant'; User = $u.User; Path = $n; Name = 'Store'; Value = $(if ($b -is [byte[]] -and $b.Length -ge 8) { FTime ([BitConverter]::ToInt64($b, 0)) } else { '' }) }) }
    }
}

Invoke-Cat 'user_activity' 'User activity from loaded user hives' {
    $uni = { param($b) if ($b -is [byte[]]) { $s = [Text.Encoding]::Unicode.GetString($b); $z = $s.IndexOf([char]0); if ($z -ge 0) { $s.Substring(0, $z) } else { $s } } else { [string]$b } }
    foreach ($u in $script:Hku) {
        $ex = "$($u.Root)\Software\Microsoft\Windows\CurrentVersion\Explorer"
        $run = RegGet "$ex\RunMRU"
        foreach ($n in ($run.Keys | Where-Object { $_ -ne 'MRUList' } | Sort-Object)) { Row ([ordered]@{ Source = 'Run dialog history'; User = $u.User; Item = $n; Value = ([string]$run[$n] -replace '\\1$', '') }) }
        foreach ($sec in @(@('Typed paths', "$ex\TypedPaths"), @('Typed URLs (Internet Explorer)', "$($u.Root)\Software\Microsoft\Internet Explorer\TypedURLs"), @('Mapped network drive history', "$ex\Map Network Drive MRU"))) {
            $v = RegGet $sec[1]
            foreach ($n in ($v.Keys | Where-Object { $_ -ne 'MRUList' } | Sort-Object)) { Row ([ordered]@{ Source = $sec[0]; User = $u.User; Item = $n; Value = (Show $v[$n]) }) }
        }
        $ww = RegGet "$ex\WordWheelQuery"
        foreach ($n in ($ww.Keys | Where-Object { $_ -match '^\d+$' } | Sort-Object { [int]$_ })) { Row ([ordered]@{ Source = 'Explorer search terms'; User = $u.User; Item = $n; Value = (& $uni $ww[$n]) }) }
        $rd = RegGet "$ex\RecentDocs"
        foreach ($n in ($rd.Keys | Where-Object { $_ -match '^\d+$' } | Sort-Object { [int]$_ })) { Row ([ordered]@{ Source = 'Recent documents'; User = $u.User; Item = $n; Value = (& $uni $rd[$n]) }) }
        $ts = "$($u.Root)\Software\Microsoft\Terminal Server Client"
        $def = RegGet "$ts\Default"
        foreach ($n in ($def.Keys | Where-Object { $_ -like 'MRU*' } | Sort-Object)) { Row ([ordered]@{ Source = 'Remote Desktop servers connected to'; User = $u.User; Item = $n; Value = (Show $def[$n]) }) }
        foreach ($k in @(RegKids "$ts\Servers")) { Row ([ordered]@{ Source = 'Remote Desktop server and saved user name'; User = $u.User; Item = $k.PSChildName; Value = (RegVal $k.PSPath 'UsernameHint') }) }
        foreach ($k in @(RegKids "$($u.Root)\Network")) { $v = RegGet $k.PSPath; Row ([ordered]@{ Source = 'Mapped drive'; User = $u.User; Item = "$($k.PSChildName):"; Value = "$($v.RemotePath) as $($v.UserName) ($($v.ProviderName))" }) }
    }
}

Invoke-Cat 'prefetch' 'Prefetch files (names and times only)' {
    $d = "$env:SystemRoot\Prefetch"
    $ep = RegVal 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters' 'EnablePrefetcher'
    if ($ep -eq 0) { Note 'Prefetch is switched off on this host' }
    foreach ($f in @(Get-ChildItem -LiteralPath $d -Filter *.pf -Force -ErrorAction Stop | Sort-Object Name)) {
        $nm = [IO.Path]::GetFileNameWithoutExtension($f.Name); $dash = $nm.LastIndexOf('-')
        Row ([ordered]@{ Executable = $(if ($dash -gt 0) { $nm.Substring(0, $dash) } else { $nm }); PathHash = $(if ($dash -gt 0) { $nm.Substring($dash + 1) } else { '' }); File = $f.Name; Size = $f.Length; Created = (Tm $f.CreationTimeUtc); LastWritten = (Tm $f.LastWriteTimeUtc) })
    }
}

Invoke-Cat 'interesting_files' 'Executables and scripts in user-writable locations' {
    $ext = '.exe', '.dll', '.sys', '.scr', '.com', '.cpl', '.ocx', '.msi', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.hta', '.wsf', '.lnk', '.jar'
    $bin = '.exe', '.dll', '.sys', '.scr', '.com', '.cpl', '.ocx', '.msi'
    $places = @('C:\Users\Public', "$env:ProgramData", "$env:SystemRoot\Temp", "$env:SystemRoot\Tasks", "$env:SystemRoot\System32\Tasks_Migrated")
    foreach ($p in @(Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special })) { foreach ($s in 'AppData\Local\Temp', 'AppData\Roaming', 'Downloads', 'Desktop', 'Documents') { $places += (Join-Path $p.LocalPath $s) } }
    $n = 0; $hashed = 0
    foreach ($pl in $places) {
        if (-not (Test-Path -LiteralPath $pl)) { continue }
        foreach ($f in @(Get-ChildItem -LiteralPath $pl -Recurse -Depth 3 -File -Force -ErrorAction SilentlyContinue | Where-Object { $ext -contains $_.Extension.ToLower() } | Sort-Object FullName)) {
            if ($f.FullName -like '*\WindowsApps\*' -or $f.FullName -like "$env:ProgramData\Microsoft\Windows Defender\*" -or $f.FullName -like "$env:ProgramData\Package Cache\*") { continue }
            $n++; if ($n -gt 4000) { Note 'Stopped at 4000 files'; return }
            $row = [ordered]@{ Location = $pl; File = $f.FullName; Extension = $f.Extension.ToLower(); Size = $f.Length; Created = (Tm $f.CreationTimeUtc); Modified = (Tm $f.LastWriteTimeUtc); Hidden = [bool]($f.Attributes -band [IO.FileAttributes]::Hidden); SHA256 = ''; Signature = ''; Signer = '' }
            if ($bin -contains $f.Extension.ToLower() -and $hashed -lt 300) { $hashed++; $x = Get-Facts $f.FullName; $row.SHA256 = $x.SHA256; $row.Signature = $x.Signature; $row.Signer = $x.Signer }
            Row $row
        }
    }
}

# ======================================================================================================================
# Event logs: what they say, summarised (the logs themselves are not copied)
function Group-Ev($events, [scriptblock]$Spec, [scriptblock]$Extra = $null) {
    $g = @{}
    foreach ($e in $events) {
        $d = Ev-Data $e
        $f = & $Spec $d $e
        $k = (@($f.Values) | ForEach-Object { "$_" }) -join '|'
        if (-not $g.ContainsKey($k)) { $g[$k] = [pscustomobject]@{ Key = $k; F = $f; X = $(if ($Extra) { & $Extra $d $e } else { $null }); Count = 0; First = $e.TimeCreated; Last = $e.TimeCreated } }
        $x = $g[$k]; $x.Count++
        if ($e.TimeCreated -lt $x.First) { $x.First = $e.TimeCreated }
        if ($e.TimeCreated -gt $x.Last) { $x.Last = $e.TimeCreated }
    }
    foreach ($x in @($g.Values | Sort-Object @{ Expression = { $_.Count }; Descending = $true }, Key)) {
        $r = [ordered]@{}
        foreach ($k in $x.F.Keys) { $r[$k] = $x.F[$k] }
        $r['Count'] = $x.Count; $r['FirstSeen'] = Tm $x.First; $r['LastSeen'] = Tm $x.Last
        if ($x.X) { foreach ($k in $x.X.Keys) { $r[$k] = $x.X[$k] } }
        Row $r
    }
}
function Detail($d, [int]$max = 400) {   # event fields as "name=value" text
    $s = (@($d.GetEnumerator() | Sort-Object Name | Where-Object { $_.Value -and $_.Value -ne '-' } | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; ') -replace '\s+', ' '
    if ($s.Length -gt $max) { $s = $s.Substring(0, $max) + '...' }
    return $s
}
$FailStatus = @{ '0xc000006a' = 'Wrong password'; '0xc0000064' = 'User name does not exist'; '0xc0000234' = 'Account locked out'; '0xc000006d' = 'Logon failed (generic)'; '0xc0000070' = 'Workstation restriction'; '0xc0000071' = 'Password expired'; '0xc0000072' = 'Account disabled'; '0xc000006f' = 'Outside allowed hours'; '0xc0000193' = 'Account expired'; '0xc0000224' = 'Password must change'; '0xc000015b' = 'Logon type not granted'; '0xc000005e' = 'No logon servers' }
$KerbEnc = @{ '0x1' = 'DES-CBC-CRC'; '0x3' = 'DES-CBC-MD5'; '0x11' = 'AES128'; '0x12' = 'AES256'; '0x17' = 'RC4-HMAC (weak)'; '0x18' = 'RC4-HMAC-EXP (weak)'; '0xffffffff' = 'None' }

Invoke-Cat 'ev_logconfig' 'Event log settings and sizes' {
    foreach ($l in @(Get-WinEvent -ListLog * | Sort-Object LogName)) {
        if (-not $l.IsEnabled -and -not $l.RecordCount) { continue }
        Row ([ordered]@{ Log = $l.LogName; Enabled = $l.IsEnabled; Mode = [string]$l.LogMode; MaxSizeMB = [math]::Round($l.MaximumSizeInBytes / 1MB, 1); FileSizeMB = [math]::Round($l.FileSize / 1MB, 1); Records = $l.RecordCount; LastWritten = (Tm $l.LastWriteTime); Path = $l.LogFilePath })
    }
    foreach ($n in 'Microsoft-Windows-Sysmon/Operational', 'Security', 'Microsoft-Windows-PowerShell/Operational') { if (-not (Get-WinEvent -ListLog $n -ErrorAction SilentlyContinue)) { Note "$n log does not exist on this host" } }
}

Invoke-Cat 'ev_logons' "Successful logons, last $($script:Days) days (grouped)" {
    $ev = Get-Ev 'Security' 4624 30000
    if (-not $ev.Count) { Note 'No 4624 events (Security log not readable, or logon auditing is off)' }
    Group-Ev $ev { param($d, $e) [ordered]@{ User = "$($d.TargetDomainName)\$($d.TargetUserName)"; LogonType = "$($d.LogonType) $($LogonTypes[[int]$d.LogonType])".Trim(); SourceIP = $d.IpAddress; SourceHost = $d.WorkstationName; AuthPackage = $d.AuthenticationPackageName; LogonProcess = $d.LogonProcessName; Process = $d.ProcessName } }
}

Invoke-Cat 'ev_failed_logons' "Failed logons, last $($script:Days) days (grouped)" {
    $ev = Get-Ev 'Security' 4625 30000
    Group-Ev $ev { param($d, $e) [ordered]@{ User = "$($d.TargetDomainName)\$($d.TargetUserName)"; LogonType = "$($d.LogonType) $($LogonTypes[[int]$d.LogonType])".Trim(); SourceIP = $d.IpAddress; SourceHost = $d.WorkstationName; Status = $d.Status; SubStatus = $d.SubStatus; Reason = $FailStatus[([string]$d.SubStatus).ToLower()]; Process = $d.ProcessName } }
}

Invoke-Cat 'ev_special_logons' "Logons with special privileges, last $($script:Days) days (grouped)" {
    Group-Ev (Get-Ev 'Security' 4672 30000) { param($d, $e) [ordered]@{ User = "$($d.SubjectDomainName)\$($d.SubjectUserName)" } } { param($d, $e) [ordered]@{ Privileges = ((([string]$d.PrivilegeList) -split '\s+' | Where-Object { $_ }) -join ', ') } }
}

Invoke-Cat 'ev_explicit_credentials' "Logons with explicit credentials (4648), last $($script:Days) days" {
    Group-Ev (Get-Ev 'Security' 4648 20000) { param($d, $e) [ordered]@{ Subject = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; TargetUser = "$($d.TargetDomainName)\$($d.TargetUserName)"; TargetServer = $d.TargetServerName; Process = $d.ProcessName; SourceIP = $d.IpAddress } }
}

Invoke-Cat 'ev_process_creation' "Process creation (4688), last $($script:Days) days (grouped)" {
    $ev = Get-Ev 'Security' 4688 30000
    if (-not $ev.Count) { Note 'No 4688 events: process creation auditing is probably off on this host' }
    Group-Ev $ev { param($d, $e) [ordered]@{ User = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Process = $d.NewProcessName; Parent = $d.ParentProcessName } } { param($d, $e) $c = [string]$d.CommandLine; [ordered]@{ SampleCommandLine = $(if ($c.Length -gt 400) { $c.Substring(0, 400) + '...' } else { $c }) } }
}

Invoke-Cat 'ev_services_installed' "Services installed, last $($script:Days) days" {
    foreach ($e in @(Get-Ev 'System' 7045 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Source = 'System 7045'; ServiceName = $d.ServiceName; ImagePath = $d.ImagePath; ServiceType = $d.ServiceType; StartType = $d.StartType; Account = $d.AccountName; InstalledBy = $(if ($e.UserId) { Sid2Name $e.UserId.Value } else { '' }) }) }
    foreach ($e in @(Get-Ev 'Security' 4697 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Source = 'Security 4697'; ServiceName = $d.ServiceName; ImagePath = $d.ServiceFileName; ServiceType = $d.ServiceType; StartType = $d.ServiceStartType; Account = $d.ServiceAccount; InstalledBy = "$($d.SubjectDomainName)\$($d.SubjectUserName)" }) }
}

Invoke-Cat 'ev_scheduled_tasks' "Scheduled task changes, last $($script:Days) days" {
    $names = @{ 4698 = 'Created'; 4699 = 'Deleted'; 4700 = 'Enabled'; 4701 = 'Disabled'; 4702 = 'Updated' }
    foreach ($e in @(Get-Ev 'Security' (4698, 4699, 4700, 4701, 4702) 5000)) {
        $d = Ev-Data $e; $c = [string]$d.TaskContent
        $cmd = if ($c -match '<Command>([^<]*)</Command>') { $Matches[1] } else { '' }; $arg = if ($c -match '<Arguments>([^<]*)</Arguments>') { $Matches[1] } else { '' }
        Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Change = $names[[int]$e.Id]; Task = $d.TaskName; By = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Command = "$cmd $arg".Trim(); Source = 'Security' })
    }
    foreach ($e in @(Get-Ev 'Microsoft-Windows-TaskScheduler/Operational' (106, 140, 141) 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Change = $(switch ($e.Id) { 106 { 'Registered' } 140 { 'Updated' } 141 { 'Deleted' } }); Task = $d.TaskName; By = $d.UserContext; Command = ''; Source = 'TaskScheduler' }) }
}

Invoke-Cat 'ev_account_changes' "Account and group changes, last $($script:Days) days" {
    $names = @{ 4720 = 'User created'; 4722 = 'User enabled'; 4723 = 'Password change attempt'; 4724 = 'Password reset'; 4725 = 'User disabled'; 4726 = 'User deleted'; 4731 = 'Local group created'; 4732 = 'Member added to local group'; 4733 = 'Member removed from local group'; 4734 = 'Local group deleted'; 4735 = 'Local group changed'; 4737 = 'Global group changed'; 4738 = 'User changed'; 4740 = 'Account locked out'; 4756 = 'Member added to universal group'; 4767 = 'Account unlocked' }
    foreach ($e in @(Get-Ev 'Security' ([int[]]$names.Keys) 10000)) {
        $d = Ev-Data $e
        Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Event = $names[[int]$e.Id]; Target = "$($d.TargetDomainName)\$($d.TargetUserName)"; Member = $d.MemberName; MemberSid = $d.MemberSid; By = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; CallerComputer = $d.CallerComputerName })
    }
}

Invoke-Cat 'ev_kerberos_ntlm' "Kerberos and NTLM authentication, last $($script:Days) days (grouped)" {
    foreach ($r in @(Group-Ev (Get-Ev 'Security' 4768 20000) { param($d, $e) [ordered]@{ Event = '4768 TGT request'; Account = "$($d.TargetDomainName)\$($d.TargetUserName)"; Service = ''; SourceIP = $d.IpAddress; Status = $d.Status; Encryption = $(if ($KerbEnc.ContainsKey(([string]$d.TicketEncryptionType).ToLower())) { $KerbEnc[([string]$d.TicketEncryptionType).ToLower()] } else { $d.TicketEncryptionType }) } })) { $r }
    foreach ($r in @(Group-Ev (Get-Ev 'Security' 4769 30000) { param($d, $e) [ordered]@{ Event = '4769 service ticket'; Account = $d.TargetUserName; Service = $d.ServiceName; SourceIP = $d.IpAddress; Status = $d.Status; Encryption = $(if ($KerbEnc.ContainsKey(([string]$d.TicketEncryptionType).ToLower())) { $KerbEnc[([string]$d.TicketEncryptionType).ToLower()] } else { $d.TicketEncryptionType }) } })) { $r }
    foreach ($r in @(Group-Ev (Get-Ev 'Security' 4776 20000) { param($d, $e) [ordered]@{ Event = '4776 NTLM validation'; Account = $d.TargetUserName; Service = ''; SourceIP = $d.Workstation; Status = $d.Status; Encryption = 'NTLM' } })) { $r }
}

Invoke-Cat 'ev_log_cleared_and_audit' "Logs cleared and audit policy changes, last $($script:Days) days" {
    foreach ($e in @(Get-Ev 'Security' 1102 500)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = 1102; Event = 'Security log cleared'; By = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Detail = '' }) }
    foreach ($e in @(Get-Ev 'System' 104 500)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = 104; Event = 'Event log cleared'; By = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Detail = "log=$($d.Channel)" }) }
    foreach ($e in @(Get-Ev 'Security' 4719 2000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = 4719; Event = 'Audit policy changed'; By = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Detail = "category=$($d.CategoryId) subcategory=$($d.SubcategoryGuid) changes=$($d.AuditPolicyChanges)" }) }
}

Invoke-Cat 'ev_powershell' "PowerShell script blocks (4104), last $($script:Days) days (grouped by script)" {
    $ev = Get-Ev 'Microsoft-Windows-PowerShell/Operational' 4104 20000
    if (-not $ev.Count) { Note 'No 4104 events (script block logging is probably off, see the security settings)'; return }
    $g = @{}
    foreach ($e in $ev) {
        $d = Ev-Data $e; $t = [string]$d.ScriptBlockText
        $p = if ($d.Path) { [string]$d.Path } else { '(interactive or dynamic)' }
        if (-not $g.ContainsKey($p)) { $one = ($t -replace '\s+', ' '); $g[$p] = [pscustomobject]@{ Path = $p; Blocks = 0; Chars = 0; Longest = 0; LongEncodedText = $false; First = $e.TimeCreated; Last = $e.TimeCreated; Sample = $one.Substring(0, [math]::Min(160, $one.Length)) } }
        $x = $g[$p]; $x.Blocks++; $x.Chars += $t.Length
        if ($t.Length -gt $x.Longest) { $x.Longest = $t.Length }
        if (-not $x.LongEncodedText -and $t -match '[A-Za-z0-9+/]{300,}={0,2}') { $x.LongEncodedText = $true }
        if ($e.TimeCreated -lt $x.First) { $x.First = $e.TimeCreated }
        if ($e.TimeCreated -gt $x.Last) { $x.Last = $e.TimeCreated }
    }
    foreach ($x in @($g.Values | Sort-Object @{ Expression = { $_.Blocks }; Descending = $true }, Path)) {
        Row ([ordered]@{ Path = $x.Path; Blocks = $x.Blocks; TotalChars = $x.Chars; LongestBlock = $x.Longest; HasLongEncodedText = $x.LongEncodedText; FirstSeen = (Tm $x.First); LastSeen = (Tm $x.Last); StartOfFirstBlock = $x.Sample })
    }
}

Invoke-Cat 'ev_remote_desktop' "Remote Desktop logons and sessions, last $($script:Days) days" {
    foreach ($e in @(Get-Ev 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational' 1149 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = 1149; Event = 'RDP authentication succeeded'; User = "$($d.Param2)\$($d.Param1)"; SessionId = ''; SourceAddress = $d.Param3 }) }
    $m = @{ 21 = 'Session logon succeeded'; 22 = 'Shell start notification'; 23 = 'Session logoff'; 24 = 'Session disconnected'; 25 = 'Session reconnected'; 39 = 'Session disconnected by another session'; 40 = 'Session disconnected, reason code' }
    foreach ($e in @(Get-Ev 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational' ([int[]]$m.Keys) 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Event = $m[[int]$e.Id]; User = $d.User; SessionId = $d.SessionID; SourceAddress = $d.Address }) }
}

Invoke-Cat 'ev_defender' "Microsoft Defender detections and configuration changes, last $($script:Days) days" {
    $m = @{ 1116 = 'Threat detected'; 1117 = 'Action taken on threat'; 1118 = 'Action on threat failed'; 1119 = 'Critical failure acting on threat'; 1121 = 'Attack surface reduction rule blocked'; 1122 = 'Attack surface reduction rule audited'; 5001 = 'Real-time protection disabled'; 5004 = 'Real-time protection configuration changed'; 5007 = 'Configuration changed (exclusions are here)'; 5008 = 'Engine failure'; 5010 = 'Scanning for malware disabled'; 5012 = 'Scanning for viruses disabled' }
    foreach ($e in @(Get-Ev 'Microsoft-Windows-Windows Defender/Operational' ([int[]]$m.Keys) 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Event = $m[[int]$e.Id]; Detail = (Detail $d 500) }) }
}

Invoke-Cat 'ev_firewall_changes' "Firewall rule and setting changes, last $($script:Days) days" {
    $m = @{ 2003 = 'Setting changed'; 2004 = 'Rule added'; 2005 = 'Rule changed'; 2006 = 'Rule deleted'; 2009 = 'Group policy rule failed'; 2033 = 'All rules deleted' }
    foreach ($e in @(Get-Ev 'Microsoft-Windows-Windows Firewall With Advanced Security/Firewall' ([int[]]$m.Keys) 5000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Event = $m[[int]$e.Id]; Rule = $d.RuleName; Application = $d.ApplicationPath; By = $d.ModifyingUser; Detail = (Detail $d 300) }) }
}

Invoke-Cat 'ev_boot_and_services' "Starts, shutdowns, crashes and service changes, last $($script:Days) days" {
    $m = @{ 6005 = 'Event log service started (boot)'; 6006 = 'Event log service stopped (clean shutdown)'; 6008 = 'Unexpected shutdown'; 41 = 'Rebooted without clean shutdown (Kernel-Power)'; 1074 = 'Shutdown or restart initiated'; 7040 = 'Service start type changed'; 7030 = 'Service marked interactive'; 7034 = 'Service crashed unexpectedly'; 7031 = 'Service stopped unexpectedly' }
    foreach ($e in @(Get-Ev 'System' ([int[]]$m.Keys) 8000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Event = $m[[int]$e.Id]; Detail = (Detail $d 300) }) }
}

Invoke-Cat 'ev_wmi_activity' "WMI activity (persistent subscriptions), last $($script:Days) days" {
    $m = @{ 5857 = 'Provider started'; 5858 = 'Operation failed'; 5859 = 'Event consumer activity'; 5860 = 'Temporary subscription'; 5861 = 'Permanent subscription created' }
    foreach ($e in @(Get-Ev 'Microsoft-Windows-WMI-Activity/Operational' ([int[]]$m.Keys) 3000)) { $d = Ev-Data $e; Row ([ordered]@{ Time = (Tm $e.TimeCreated); Id = $e.Id; Event = $m[[int]$e.Id]; Detail = (Detail $d 500) }) }
}

# ======================================================================================================================
# Finish: close baseline.json, write the manifest, and return the summary
$script:AllJson.Write('}}')
$script:AllJson.Flush(); $script:AllJson.Dispose()
$bj = Join-Path $script:Dir 'baseline.json'
$ended = Get-Date
$script:Files.Add([pscustomobject]@{ Category = '(all categories combined)'; File = 'baseline.json'; Records = ($script:Summary | Measure-Object -Property Records -Sum).Sum; Bytes = (Get-Item -LiteralPath $bj).Length; SHA256 = (Get-FileHash -LiteralPath $bj -Algorithm SHA256).Hash.ToLower() })
$manifest = [ordered]@{
    Tool = 'Kookaburrow Baseline - Windows Full'; Schema = 1; Host = $env:COMPUTERNAME; Started = (Tm $script:Started); Finished = (Tm $ended); DurationSeconds = [math]::Round(($ended - $script:Started).TotalSeconds, 0)
    RanAsAdministrator = $script:IsAdmin; EventDays = $script:Days; FileFactsSkipped = $script:SkipFacts; LoadedUserHives = @($script:Hku | ForEach-Object { $_.User }); Categories = $script:Summary.Count; SignatureChecksLimited = $script:SigLimited; Files = $script:Files.ToArray()
}
# the run details go into baseline.json's meta (baseline.json is the only JSON file)
[IO.File]::WriteAllText((Join-Path $script:Dir 'manifest.csv'), ((($script:Files | ConvertTo-Csv -NoTypeInformation) -join "`r`n") + "`r`n"), $script:Utf8)
[IO.File]::WriteAllText((Join-Path $script:Dir 'summary.csv'), ((($script:Summary | ConvertTo-Csv -NoTypeInformation) -join "`r`n") + "`r`n"), $script:Utf8)

foreach ($s in $script:Summary) { $s }
[pscustomobject][ordered]@{ Category = '(total)'; Id = ''; Records = ($script:Summary | Measure-Object -Property Records -Sum).Sum; Status = $(if ($script:IsAdmin) { 'ok' } else { 'not administrator: partial' }); Seconds = [math]::Round(($ended - $script:Started).TotalSeconds, 0); Columns = ''; File = "$($script:Files.Count) files in the output folder"; Notes = "event window $($script:Days) day(s); file hashes and signatures $(if ($script:SkipFacts) { 'skipped' } else { 'included' })$(if ($script:SigLimited) { '; signature checks hit their time limit (slow certificate revocation lookups), later files show the signer only' })" }
