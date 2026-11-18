$Name = 'Files - Known Attack and Admin Tool Names'
$Description = 'Files whose name matches well-known attack and administration tools (mimikatz, psexec, procdump, nmap, plink, rclone, chisel and more) anywhere under user folders, ProgramData and Temp.'
$Dependencies = @()
$Tags = @('malware', 'filesystem', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$pat = '^(mimikatz|mimilib|procdump|psexec|psexesvc|paexec|nmap|masscan|plink|pscp|putty|rclone|chisel|ngrok|frpc|frps|netcat|nc|ncat|nc64|lazagne|sharphound|bloodhound|rubeus|seatbelt|certify|winpeas|linpeas|adfind|nltest|dsquery|crackmapexec|impacket|wce|gsecdump|pwdump|fgdump|cain|hashcat|john|hydra|metasploit|msfvenom|cobaltstrike|beacon|covenant|sliver|havoc|brute ratel|anydesk|ammyy|teamviewer|screenconnect|ultravnc|tightvnc|netscan|advanced_ip_scanner|angryip|everything)[^\\]*\.(exe|dll|ps1|bat|py|zip|7z)$'
foreach ($r in "$env:SystemDrive\Users", $env:ProgramData, "$env:SystemRoot\Temp", "$env:SystemDrive\Temp", "$env:SystemDrive\PerfLogs") { if (Test-Path $r) { Get-ChildItem $r -Recurse -Force -File -Depth 6 | Where-Object { $_.Name -match $pat } | Select-Object -First 200 | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB); Created = $_.CreationTime; Modified = $_.LastWriteTime } } } }
