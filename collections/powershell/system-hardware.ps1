$Name = 'System - Hardware and Firmware'
$Description = 'BIOS vendor and version, system model and serial, CPU, memory and Secure Boot state, to spot virtual machines and unexpected hardware.'
$Dependencies = @()
$Tags = @('inventory', 'system')

$ErrorActionPreference = 'SilentlyContinue'
$b = Get-CimInstance Win32_BIOS; $s = Get-CimInstance Win32_ComputerSystem; $c = Get-CimInstance Win32_Processor | Select-Object -First 1
$sb = try { Confirm-SecureBootUEFI } catch { 'unknown' }
[pscustomobject]@{ Manufacturer = $s.Manufacturer; Model = $s.Model; Serial = $b.SerialNumber; BiosVersion = ($b.SMBIOSBIOSVersion); BiosDate = $b.ReleaseDate; Cpu = $c.Name; Cores = $c.NumberOfCores; MemoryGB = [math]::Round($s.TotalPhysicalMemory / 1GB, 1); SecureBoot = "$sb"; Hypervisor = $s.HypervisorPresent }
