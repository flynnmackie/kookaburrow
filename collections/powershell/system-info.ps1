$Name = 'System - Info'
$Description = 'Host identity and build: OS version, install date, last boot and uptime, domain membership, time zone, hardware and BIOS, logged-on user. The first thing to record about any host (like the Velociraptor Windows.Sys.Info artifact).'
$Dependencies = @()
$Tags = @('inventory', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$tz = Get-TimeZone
[pscustomobject]@{
    Hostname = $env:COMPUTERNAME; Domain = $cs.Domain; DomainJoined = $cs.PartOfDomain
    OS = $os.Caption; Version = $os.Version; Build = $os.BuildNumber; Architecture = $os.OSArchitecture
    InstallDate = $os.InstallDate; LastBoot = $os.LastBootUpTime
    UptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
    TimeZone = $tz.Id; UtcOffset = $tz.BaseUtcOffset.ToString()
    Manufacturer = $cs.Manufacturer; Model = $cs.Model; BiosVersion = $bios.SMBIOSBIOSVersion; Serial = $bios.SerialNumber
    MemoryGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1); Cpus = $cs.NumberOfLogicalProcessors; LoggedOnUser = $cs.UserName
}
