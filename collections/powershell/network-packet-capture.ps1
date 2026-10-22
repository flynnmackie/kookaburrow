$Name = 'Network - Packet Capture'
$Description = 'Captures network traffic on the host for a short time using the built-in Windows pktmon tool and brings back a pcapng file for Wireshark. Seconds is the capture length (default 30, maximum 600). Port limits the capture to one TCP or UDP port (for example 443 or 53) and Address to one IP address; with neither, all traffic is captured. Needs Windows 10 version 2004 or later or Server 2022, and administrator rights. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Parameters = @('Seconds?', 'Port?', 'Address?')
$Tags = @('network', 'forensics', 'c2')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'tool'
$Transfer = 'large'

$ErrorActionPreference = 'Continue' # pktmon prints to stderr when nothing is running; failures are checked explicitly below
$secs = if ($Seconds -match '^\d+$') { [math]::Min([int]$Seconds, 600) } else { 30 }
if (-not (Get-Command pktmon.exe -ErrorAction SilentlyContinue)) { throw 'pktmon is not available on this version of Windows' }
$etl = Join-Path $OutDir 'capture.etl'
$null = pktmon stop 2>&1
$null = pktmon filter remove 2>&1
if ($Port -match '^\d+$') { $null = pktmon filter add -p $Port }
if ($Address -match '^[0-9a-fA-F:.]+$') { $null = pktmon filter add -i $Address }
$null = pktmon start --capture --pkt-size 0 --file-name $etl 2>&1
try { Start-Sleep -Seconds $secs } finally { $null = pktmon stop 2>&1; $null = pktmon filter remove 2>&1 }
$pcap = Join-Path $OutDir 'capture.pcapng'
$null = pktmon etl2pcap $etl --out $pcap 2>&1
if (-not (Test-Path -LiteralPath $etl)) { throw 'pktmon produced no capture file' }
[pscustomobject]@{ Seconds = $secs; EtlMB = [math]::Round((Get-Item -LiteralPath $etl).Length / 1MB, 2); PcapMB = $(if (Test-Path -LiteralPath $pcap) { [math]::Round((Get-Item -LiteralPath $pcap).Length / 1MB, 2) } else { 'conversion unavailable' }); Filter = "port=$Port address=$Address" }
