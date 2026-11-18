const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, save, id } = require('./store');

// Validate (Monitor > Validate): checks that every chosen host is in the state it should be, on demand or on a schedule. A check is a
// tree of conditions joined with AND / OR (groups can nest and any node can be negated), each condition a preset with the user's
// values: a service by name, a listening port, a type of logging, a registry value and so on (PRESETS below).
// One script per host does every condition of the check: PowerShell for WinRM hosts and SSH hosts that report Windows, bash for the
// rest. Each condition prints one line, KBV <tab> condition id <tab> 1 | 0 | N (not applicable on this OS) | E (could not be checked)
// <tab> what it found; the server reads those lines and works out the tree per host (N and E count as false).
//   check: { id, name, description, hostIds, listIds, tree, everyMinutes (0 = only when run by hand), enabled, createdBy, createdAt,
//            updatedAt, nextRun, lastRunId, running }
//   run:   { id, checkId, startedAt, finishedAt, by (user, or 'schedule'), status: running | done, passed, failed, errors,
//            hosts: [{ hostId, name, address, os, status: pass | fail | error, error, leaves: { conditionId: { s: 1|0|N|E, d } } }] }
// db.validations holds the checks, db.validationRuns the latest MAX_RUNS runs of each.
const MAX_RUNS = 30, MAX_LEAVES = 40, MAX_DEPTH = 4, TICK_MS = 15000, HOST_TIMEOUT_MS = 5 * 60 * 1000;
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const checks = () => (db.validations ||= []);
const runs = () => (db.validationRuns ||= []);

// ---- quoting: values typed by the user go into scripts only as quoted literals ----
const clean = (v, max = 400) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const psq = (v) => `'${clean(v).replace(/'/g, "''")}'`;
const shq = (v) => `'${clean(v).replace(/'/g, "'\\''")}'`;
const regPath = (p) => clean(p).replace(/^(HKEY_LOCAL_MACHINE|HKLM)[\\:]+/i, 'HKLM:\\').replace(/^(HKEY_CURRENT_USER|HKCU)[\\:]+/i, 'HKCU:\\').replace(/^(HKEY_USERS|HKU)[\\:]+/i, 'Registry::HKEY_USERS\\');

// ---- presets ----
// Each: { label, group, params: [{ key, label, type: text|number|select, options: [[value, label]], placeholder, optional, default }],
//   describe(p) (how it reads in the expression), ps(p, id) and sh(p, id) (the script lines; each prints its own KBV line) }.
// An option or preset that only exists on one OS prints N on the other.
const NA = { ps: (i, why) => `KBV '${i}' 'N' ${psq(why)}`, sh: (i, why) => `kbv ${i} N ${shq(why)}` };
const LOGGING = {
  'ps-scriptblock': { label: 'PowerShell script block logging is on (4104)', os: 'windows',
    ps: (i) => `$v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging').EnableScriptBlockLogging; KBV '${i}' ($v -eq 1) "EnableScriptBlockLogging = $(if ($null -eq $v) { 'not set' } else { $v })"` },
  'ps-module': { label: 'PowerShell module logging is on (4103)', os: 'windows',
    ps: (i) => `$v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ModuleLogging').EnableModuleLogging; KBV '${i}' ($v -eq 1) "EnableModuleLogging = $(if ($null -eq $v) { 'not set' } else { $v })"` },
  'ps-transcription': { label: 'PowerShell transcription is on', os: 'windows',
    ps: (i) => `$t = Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\Transcription'; KBV '${i}' ($t.EnableTranscripting -eq 1) "EnableTranscripting = $(if ($null -eq $t.EnableTranscripting) { 'not set' } else { $t.EnableTranscripting })$(if ($t.OutputDirectory) { ', to ' + $t.OutputDirectory })"` },
  'audit-process': { label: 'Process creation is audited (4688)', os: 'windows',
    ps: (i) => `$o = auditpol /get /subcategory:'{0CCE922B-69AE-11D9-BED3-505054503030}' /r | ConvertFrom-Csv; $v = "$($o.'Inclusion Setting')"; KBV '${i}' ($v -match 'Success') "Process Creation: $(if ($v) { $v } else { 'unknown (needs administrator rights)' })"` },
  'audit-cmdline': { label: 'Command lines are recorded in process creation events', os: 'windows',
    ps: (i) => `$v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\\Audit').ProcessCreationIncludeCmdLine_Enabled; KBV '${i}' ($v -eq 1) "ProcessCreationIncludeCmdLine_Enabled = $(if ($null -eq $v) { 'not set' } else { $v })"` },
  'audit-logon': { label: 'Logons are audited (4624 / 4625)', os: 'windows',
    ps: (i) => `$o = auditpol /get /subcategory:'{0CCE9215-69AE-11D9-BED3-505054503030}' /r | ConvertFrom-Csv; $v = "$($o.'Inclusion Setting')"; KBV '${i}' ($v -match 'Success') "Logon: $(if ($v) { $v } else { 'unknown (needs administrator rights)' })"` },
  sysmon: { label: 'Sysmon is installed and running', os: 'windows',
    ps: (i) => `$s = Get-CimInstance Win32_Service | Where-Object { $_.Name -like 'Sysmon*' -or $_.PathName -match 'sysmon' } | Select-Object -First 1; KBV '${i}' ($s -and $s.State -eq 'Running') "$(if ($s) { "$($s.Name) is $($s.State)" } else { 'Sysmon is not installed' })"` },
  eventlog: { label: 'The Windows Event Log service is running', os: 'windows',
    ps: (i) => `$s = Get-Service EventLog; KBV '${i}' ($s.Status -eq 'Running') "EventLog is $($s.Status)"` },
  auditd: { label: 'auditd is running', os: 'linux',
    sh: (i) => `a=$(systemctl is-active auditd 2>/dev/null); [ "$a" = active ] && kbv ${i} 1 "auditd is $a" || kbv ${i} 0 "auditd is \${a:-not installed}"` },
  'auditd-rules': { label: 'auditd has rules loaded', os: 'linux',
    sh: (i) => `if ! command -v auditctl >/dev/null 2>&1; then kbv ${i} 0 'auditctl not found'; else n=$(auditctl -l 2>/dev/null | grep -vc '^No rules'); [ "\${n:-0}" -gt 0 ] && kbv ${i} 1 "$n audit rules" || kbv ${i} 0 'no audit rules loaded (needs root)'; fi` },
  rsyslog: { label: 'rsyslog is running', os: 'linux',
    sh: (i) => `a=$(systemctl is-active rsyslog 2>/dev/null); [ "$a" = active ] && kbv ${i} 1 "rsyslog is $a" || kbv ${i} 0 "rsyslog is \${a:-not installed}"` },
  'journald-persistent': { label: 'journald keeps logs on disk', os: 'linux',
    sh: (i) => `if [ -d /var/log/journal ] || grep -Eq '^[[:space:]]*Storage=persistent' /etc/systemd/journald.conf 2>/dev/null; then kbv ${i} 1 'persistent (/var/log/journal)'; else kbv ${i} 0 'journal is not kept on disk'; fi` },
};
const SECURITY = {
  'defender-rtp': { label: 'Defender real-time protection is on', os: 'windows',
    ps: (i) => `$m = Get-MpComputerStatus; KBV '${i}' ($m -and $m.RealTimeProtectionEnabled) "$(if ($m) { "RealTimeProtectionEnabled = $($m.RealTimeProtectionEnabled)" } else { 'Defender is not answering (another antivirus?)' })"` },
  'defender-tamper': { label: 'Defender tamper protection is on', os: 'windows',
    ps: (i) => `$m = Get-MpComputerStatus; KBV '${i}' ($m -and $m.IsTamperProtected) "$(if ($m) { "IsTamperProtected = $($m.IsTamperProtected)" } else { 'Defender is not answering' })"` },
  'firewall-win': { label: 'Windows Firewall is on for every profile', os: 'windows',
    ps: (i) => `$p = @(Get-NetFirewallProfile); $off = @($p | Where-Object { -not $_.Enabled } | ForEach-Object Name); KBV '${i}' ($p.Count -and -not $off.Count) "$(if ($off.Count) { 'off for ' + ($off -join ', ') } else { 'on for ' + (($p | ForEach-Object Name) -join ', ') })"` },
  bitlocker: { label: 'BitLocker protects the system drive', os: 'windows',
    ps: (i) => `$b = Get-BitLockerVolume -MountPoint $env:SystemDrive; KBV '${i}' ("$($b.ProtectionStatus)" -eq 'On') "$(if ($b) { "$env:SystemDrive protection $($b.ProtectionStatus), $($b.VolumeStatus)" } else { 'BitLocker is not available' })"` },
  'firewall-linux': { label: 'A firewall is active (ufw, firewalld or nftables rules)', os: 'linux',
    sh: (i) => `if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then kbv ${i} 1 'ufw active'; elif [ "$(firewall-cmd --state 2>/dev/null)" = running ]; then kbv ${i} 1 'firewalld running'; elif [ "$(nft list ruleset 2>/dev/null | grep -c 'chain')" -gt 0 ]; then kbv ${i} 1 'nftables rules loaded'; else kbv ${i} 0 'no active firewall found (needs root to see nftables)'; fi` },
  selinux: { label: 'SELinux is enforcing', os: 'linux',
    sh: (i) => `m=$(getenforce 2>/dev/null); [ "$m" = Enforcing ] && kbv ${i} 1 "SELinux $m" || kbv ${i} 0 "SELinux \${m:-not installed}"` },
  apparmor: { label: 'AppArmor is enabled', os: 'linux',
    sh: (i) => `if aa-enabled -q 2>/dev/null || [ "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null)" = Y ]; then kbv ${i} 1 'AppArmor is enabled'; else kbv ${i} 0 'AppArmor not enabled'; fi` },
};
const optionsOf = (o) => Object.entries(o).map(([k, v]) => [k, `${v.label}${v.os === 'linux' ? ' (Linux)' : v.os === 'windows' ? ' (Windows)' : ''}`]);
const fromTable = (table) => ({
  ps: (p, i) => { const o = table[p.what]; return o?.ps ? o.ps(i) : NA.ps(i, o ? 'only on Linux hosts' : 'unknown option'); },
  sh: (p, i) => { const o = table[p.what]; return o?.sh ? o.sh(i) : NA.sh(i, o ? 'only on Windows hosts' : 'unknown option'); },
});

const PRESETS = {
  service: {
    label: 'Service', group: 'Services and processes',
    params: [{ key: 'name', label: 'Service name', type: 'text', placeholder: 'Sysmon64, WinRM, sshd, auditd' },
      { key: 'state', label: 'Must be', type: 'select', options: [['running', 'running'], ['stopped', 'stopped'], ['installed', 'installed'], ['missing', 'not installed']], default: 'running' }],
    describe: (p) => `service "${p.name}" ${{ running: 'is running', stopped: 'is stopped', installed: 'is installed', missing: 'is not installed' }[p.state] || p.state}`,
    ps: (p, i) => `$n = ${psq(p.name)}; $s = Get-Service -Name $n -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $s) { $s = Get-Service | Where-Object { $_.DisplayName -eq $n } | Select-Object -First 1 }
$d = if ($s) { "$($s.Name) is $($s.Status) (start $($s.StartType))" } else { 'not installed' }
KBV '${i}' (${{ running: "$s -and $s.Status -eq 'Running'", stopped: "$s -and $s.Status -ne 'Running'", installed: '[bool]$s', missing: '-not $s' }[p.state] || '$false'}) $d`,
    sh: (p, i) => `u=${shq(p.name)}; case "$u" in *.service|*.socket|*.timer) ;; *) u="$u.service";; esac
if ! command -v systemctl >/dev/null 2>&1; then kbv ${i} E 'no systemctl on this host'; else
l=$(systemctl show -p LoadState --value "$u" 2>/dev/null); a=$(systemctl is-active "$u" 2>/dev/null); [ "$l" = loaded ] && d="$u is \${a:-unknown}" || d='not installed'
${{ running: '[ "$l" = loaded ] && [ "$a" = active ]', stopped: '[ "$l" = loaded ] && [ "$a" != active ]', installed: '[ "$l" = loaded ]', missing: '[ "$l" != loaded ]' }[p.state] || 'false'} && kbv ${i} 1 "$d" || kbv ${i} 0 "$d"; fi`,
  },
  port: {
    label: 'Port listening', group: 'Network',
    params: [{ key: 'port', label: 'Port', type: 'number', placeholder: '5985' },
      { key: 'proto', label: 'Protocol', type: 'select', options: [['tcp', 'TCP'], ['udp', 'UDP']], default: 'tcp' },
      { key: 'process', label: 'Process (optional)', type: 'text', placeholder: 'svchost, sshd', optional: true },
      { key: 'state', label: 'Must be', type: 'select', options: [['listening', 'listening'], ['closed', 'not listening']], default: 'listening' }],
    describe: (p) => `${String(p.proto || 'tcp').toUpperCase()} port ${p.port} is ${p.state === 'closed' ? 'not listening' : 'listening'}${p.process ? ` (by ${p.process})` : ''}`,
    ps: (p, i) => `$port = ${Number(p.port) | 0}; $c = @(${p.proto === 'udp' ? 'Get-NetUDPEndpoint -LocalPort $port' : 'Get-NetTCPConnection -State Listen -LocalPort $port'})
$names = @($c | ForEach-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } | Where-Object { $_ } | Sort-Object -Unique)
$want = ${psq(p.process || '')} -replace '\\.exe$', ''; $hit = $c.Count -gt 0 -and (-not $want -or ($names | Where-Object { $_ -eq $want }))
KBV '${i}' (${p.state === 'closed' ? '-not $hit' : '[bool]$hit'}) "$(if ($c.Count) { "$port listening by $($names -join ', ') on $(($c | ForEach-Object LocalAddress | Sort-Object -Unique) -join ', ')" } else { "nothing listening on $port" })"`,
    sh: (p, i) => `port=${Number(p.port) | 0}; want=${shq(p.process || '')}
if command -v ss >/dev/null 2>&1; then o=$(ss -Hln${p.proto === 'udp' ? 'u' : 't'}p "sport = :$port" 2>/dev/null); else o=$(netstat -ln${p.proto === 'udp' ? 'u' : 't'}p 2>/dev/null | awk -v p=":$port" '$4 ~ p"$"'); fi
names=$(printf '%s' "$o" | grep -o '(("[^"]*"' | tr -d '("' | sort -u | tr '\\n' ' ')
if [ -n "$o" ] && { [ -z "$want" ] || printf '%s' "$names" | grep -qw -- "$want"; }; then hit=1; else hit=0; fi
[ -n "$o" ] && d="$port listening by \${names:-unknown (root needed to see the process)}" || d="nothing listening on $port"
${p.state === 'closed' ? '[ $hit = 0 ]' : '[ $hit = 1 ]'} && kbv ${i} 1 "$d" || kbv ${i} 0 "$d"`,
  },
  process: {
    label: 'Process running', group: 'Services and processes',
    params: [{ key: 'name', label: 'Process name', type: 'text', placeholder: 'MsMpEng, osqueryd' },
      { key: 'state', label: 'Must be', type: 'select', options: [['running', 'running'], ['absent', 'not running']], default: 'running' }],
    describe: (p) => `process "${p.name}" is ${p.state === 'absent' ? 'not running' : 'running'}`,
    ps: (p, i) => `$n = ${psq(p.name)} -replace '\\.exe$', ''; $c = @(Get-Process -Name $n -ErrorAction SilentlyContinue).Count
KBV '${i}' (${p.state === 'absent' ? '$c -eq 0' : '$c -gt 0'}) "$c running"`,
    sh: (p, i) => `c=$(pgrep -xc -- ${shq(p.name)} 2>/dev/null); c=\${c:-0}; ${p.state === 'absent' ? '[ "$c" -eq 0 ]' : '[ "$c" -gt 0 ]'} && kbv ${i} 1 "$c running" || kbv ${i} 0 "$c running"`,
  },
  logging: {
    label: 'Logging enabled', group: 'Logging',
    params: [{ key: 'what', label: 'Logging', type: 'select', options: optionsOf(LOGGING), default: 'ps-scriptblock' }],
    describe: (p) => LOGGING[p.what]?.label || p.what,
    ...fromTable(LOGGING),
  },
  logsize: {
    label: 'Event log size', group: 'Logging',
    params: [{ key: 'log', label: 'Log', type: 'text', placeholder: 'Security', default: 'Security' }, { key: 'min', label: 'At least (MB)', type: 'number', placeholder: '1024' }],
    describe: (p) => `the ${p.log} log is enabled and at least ${p.min} MB`,
    ps: (p, i) => `$l = Get-WinEvent -ListLog ${psq(p.log)} -ErrorAction Stop; $mb = [math]::Round($l.MaximumSizeInBytes / 1MB)
KBV '${i}' ($l.IsEnabled -and $mb -ge ${Number(p.min) || 0}) "$($l.LogName): maximum $mb MB, $(if ($l.IsEnabled) { 'enabled' } else { 'disabled' }), $($l.RecordCount) records"`,
    sh: (p, i) => NA.sh(i, 'Windows event logs only'),
  },
  registry: {
    label: 'Registry value', group: 'Configuration',
    params: [{ key: 'path', label: 'Key', type: 'text', placeholder: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' }, { key: 'name', label: 'Value name', type: 'text', placeholder: 'RunAsPPL' },
      { key: 'op', label: 'Must', type: 'select', options: [['equals', 'equal'], ['contains', 'contain'], ['exists', 'exist'], ['missing', 'not exist']], default: 'equals' },
      { key: 'value', label: 'Value', type: 'text', placeholder: '1', optional: true }],
    describe: (p) => `registry ${p.path}\\${p.name} ${{ equals: `= ${p.value}`, contains: `contains "${p.value}"`, exists: 'exists', missing: 'does not exist' }[p.op] || p.op}`,
    ps: (p, i) => `$p = ${psq(regPath(p.path))}; $n = ${psq(p.name)}; $k = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue; $has = $k -and ($k.PSObject.Properties.Name -contains $n); $v = if ($has) { "$($k.$n)" } else { $null }
KBV '${i}' (${{ equals: `$has -and $v -eq ${psq(p.value)}`, contains: `$has -and $v -like ('*' + ${psq(p.value)} + '*')`, exists: '[bool]$has', missing: '-not $has' }[p.op] || '$false'}) "$(if ($has) { "$n = $v" } elseif ($k) { "$n is not set" } else { 'the key does not exist' })"`,
    sh: (p, i) => NA.sh(i, 'Windows only'),
  },
  file: {
    label: 'File', group: 'Configuration',
    params: [{ key: 'path', label: 'Path', type: 'text', placeholder: 'C:\\Windows\\System32\\drivers\\SysmonDrv.sys or /etc/audit/auditd.conf' },
      { key: 'state', label: 'Must', type: 'select', options: [['exists', 'exist'], ['missing', 'not exist']], default: 'exists' },
      { key: 'sha256', label: 'SHA-256 (optional)', type: 'text', placeholder: 'checked when given', optional: true }],
    describe: (p) => `file ${p.path} ${p.state === 'missing' ? 'does not exist' : `exists${p.sha256 ? ' with the expected SHA-256' : ''}`}`,
    ps: (p, i) => `$f = Get-Item -LiteralPath ${psq(p.path)} -Force -ErrorAction SilentlyContinue; $h = if ($f -and -not $f.PSIsContainer -and ${psq(p.sha256 || '')}) { (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash } else { '' }
KBV '${i}' (${p.state === 'missing' ? '-not $f' : `[bool]$f${p.sha256 ? ` -and $h -eq ${psq(String(p.sha256).toUpperCase())}` : ''}`}) "$(if ($f) { "exists, $($f.Length) bytes$(if ($h) { ", SHA-256 $h" })" } else { 'does not exist' })"`,
    sh: (p, i) => `f=${shq(p.path)}; h=''; if [ -e "$f" ]; then ${p.sha256 ? 'h=$(sha256sum "$f" 2>/dev/null | cut -d" " -f1);' : ':;'} d="exists\${h:+, SHA-256 $h}"; else d='does not exist'; fi
${p.state === 'missing' ? '[ ! -e "$f" ]' : `[ -e "$f" ]${p.sha256 ? ` && [ "$h" = ${shq(String(p.sha256).toLowerCase())} ]` : ''}`} && kbv ${i} 1 "$d" || kbv ${i} 0 "$d"`,
  },
  security: {
    label: 'Security setting', group: 'Security',
    params: [{ key: 'what', label: 'Setting', type: 'select', options: optionsOf(SECURITY), default: 'defender-rtp' }],
    describe: (p) => SECURITY[p.what]?.label || p.what,
    ...fromTable(SECURITY),
  },
  command: {
    label: 'Command output', group: 'Custom', needs: 'actions.run',
    params: [{ key: 'ps', label: 'PowerShell (Windows)', type: 'text', placeholder: '(Get-CimInstance Win32_OperatingSystem).Caption', optional: true },
      { key: 'sh', label: 'Shell (Linux)', type: 'text', placeholder: 'cat /etc/os-release', optional: true },
      { key: 'op', label: 'Output must', type: 'select', options: [['contains', 'contain'], ['not-contains', 'not contain']], default: 'contains' },
      { key: 'text', label: 'Text', type: 'text', placeholder: 'Server 2022' }],
    describe: (p) => `command output ${p.op === 'not-contains' ? 'does not contain' : 'contains'} "${p.text}"`,
    ps: (p, i) => (p.ps ? `$o = (& { ${clean(p.ps, 2000)} } 2>&1 | Out-String); $hit = $o -like ('*' + ${psq(p.text)} + '*')
KBV '${i}' (${p.op === 'not-contains' ? '-not $hit' : '$hit'}) ($o.Trim() -replace '\\s+', ' ').Substring(0, [Math]::Min(200, $o.Trim().Length))` : NA.ps(i, 'no PowerShell command given')),
    sh: (p, i) => (p.sh ? `o=$( { ${clean(p.sh, 2000)} ; } 2>&1 ); if printf '%s' "$o" | grep -qF -- ${shq(p.text)}; then hit=1; else hit=0; fi
${p.op === 'not-contains' ? '[ $hit = 0 ]' : '[ $hit = 1 ]'} && kbv ${i} 1 "$(printf '%s' "$o" | head -c 200)" || kbv ${i} 0 "$(printf '%s' "$o" | head -c 200)"` : NA.sh(i, 'no shell command given')),
  },
};

// A line under each condition type in the editor.
const HELP = {
  service: 'A Windows service (by name or display name) or a systemd unit: running, stopped, installed or missing.',
  port: 'Something listening, or not, on a port, optionally owned by a named process. Needs root on Linux to see the process.',
  process: 'A process by name: running, or not running.',
  logging: 'A kind of logging or auditing is switched on: PowerShell logging, process creation auditing, Sysmon, the Event Log service, auditd, rsyslog, journald.',
  logsize: 'A Windows event log is enabled and at least a size. Windows hosts only.',
  registry: 'A registry value equals, contains, exists or is missing. Windows hosts only.',
  file: 'A file exists or does not, optionally with an exact SHA-256.',
  security: 'A security setting: Defender real-time and tamper protection, the Windows Firewall, BitLocker, a Linux firewall, SELinux, AppArmor.',
  command: 'Your own PowerShell (Windows) and/or shell (Linux) command, whose output must or must not contain some text. Needs the Run actions permission.',
};
// What the page needs to draw the condition editor.
const catalog = () => Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label, group: p.group, help: HELP[key] || '', needs: p.needs || null, params: p.params }));

// ---- the condition tree ----
// group: { type: 'group', op: 'and' | 'or', not, items: [...] }   condition: { type: 'cond', id, preset, params, not }
// Checked and tidied when a check is saved: known presets, required values present, ids unique, at most MAX_DEPTH levels and MAX_LEAVES conditions.
function tidyTree(node, depth = 0, seen = new Set()) {
  if (!node || typeof node !== 'object') throw bad('The conditions are not valid');
  if (node.type === 'group') {
    if (depth >= MAX_DEPTH) throw bad(`Groups can nest ${MAX_DEPTH} deep at most`);
    const items = (Array.isArray(node.items) ? node.items : []).map((n) => tidyTree(n, depth + 1, seen));
    if (!items.length) throw bad('A group has no conditions in it');
    return { type: 'group', op: node.op === 'or' ? 'or' : 'and', not: !!node.not, items };
  }
  if (node.type !== 'cond') throw bad('The conditions are not valid');
  const pre = PRESETS[node.preset];
  if (!pre) throw bad(`Unknown condition: ${node.preset}`);
  let cid = String(node.id || '').toLowerCase();
  if (!/^[a-z0-9]{1,16}$/.test(cid) || seen.has(cid)) cid = id().slice(0, 10);
  seen.add(cid);
  if (seen.size > MAX_LEAVES) throw bad(`A check can have ${MAX_LEAVES} conditions at most`);
  const params = {};
  for (const f of pre.params) {
    let v = clean(node.params?.[f.key] ?? f.default ?? '', f.key === 'ps' || f.key === 'sh' ? 2000 : 400);
    if (f.type === 'select' && !f.options.some(([k]) => k === v)) v = f.default ?? f.options[0][0];
    if (f.type === 'number' && v !== '') { const n = Number(v); if (!Number.isFinite(n) || n < 0 || (f.key === 'port' && (n < 1 || n > 65535 || !Number.isInteger(n)))) throw bad(`${pre.label}: ${f.label} must be ${f.key === 'port' ? 'a port number' : 'a number'}`); v = String(n); }
    const needed = !f.optional && !(node.preset === 'registry' && f.key === 'value' && ['exists', 'missing'].includes(params.op));
    if (needed && v === '') throw bad(`${pre.label}: fill in ${f.label}`);
    params[f.key] = v;
  }
  if (node.preset === 'command' && !params.ps && !params.sh) throw bad('Command output: give a PowerShell command, a shell command or both');
  return { type: 'cond', id: cid, preset: node.preset, params, not: !!node.not };
}
const leaves = (n) => (n.type === 'cond' ? [n] : n.items.flatMap(leaves));
const describeCond = (c) => `${c.not ? 'NOT ' : ''}${PRESETS[c.preset].describe(c.params)}`;
function describe(n, top = true) {
  if (n.type === 'cond') return describeCond(n);
  const inner = n.items.map((x) => describe(x, false)).join(n.op === 'or' ? ' OR ' : ' AND ');
  return n.not ? `NOT (${inner})` : (top || n.items.length < 2 ? inner : `(${inner})`);
}
// true / false for a host from its condition results (N and E count as false).
function evaluate(n, res) {
  const v = n.type === 'cond' ? res[n.id]?.s === '1' : n.op === 'or' ? n.items.some((x) => evaluate(x, res)) : n.items.every((x) => evaluate(x, res));
  return n.not ? !v : v;
}

// ---- scripts ----
const isWindows = (h) => h.protocol === 'winrm' || /windows/i.test(h.os || '');
function script(tree, windows) {
  const ls = leaves(tree);
  if (windows) {
    return ['$ErrorActionPreference = \'SilentlyContinue\'',
      'function KBV([string]$i, $s, [string]$d) { $v = if ($s -is [string] -and ($s -eq \'N\' -or $s -eq \'E\')) { $s } elseif ($s) { \'1\' } else { \'0\' }; "KBV`t$i`t$v`t$((($d -replace \'[\\t\\r\\n]+\', \' \').Trim()))" }',
      ...ls.map((c) => `try {\n${PRESETS[c.preset].ps(c.params, c.id)}\n} catch { KBV '${c.id}' 'E' $_.Exception.Message }`)].join('\n');
  }
  return ['kbv() { d=$(printf \'%s\' "$3" | tr \'\\t\\r\\n\' \'   \' | cut -c1-300); printf \'KBV\\t%s\\t%s\\t%s\\n\' "$1" "$2" "$d"; }',
    ...ls.map((c) => `( ${PRESETS[c.preset].sh(c.params, c.id)} ) 2>/dev/null || true`)].join('\n');
}
// The condition results in a host's output; a condition that printed nothing is E.
function parse(stdout, tree) {
  const out = {};
  for (const l of String(stdout || '').split(/\r?\n/)) {
    const m = /^KBV\t([a-z0-9]+)\t([10NE])\t?(.*)$/.exec(l.trim().replace(/^KBV\s+/, 'KBV\t'));
    if (m) out[m[1]] = { s: m[2], d: m[3].slice(0, 300) };
  }
  for (const c of leaves(tree)) if (!out[c.id]) out[c.id] = { s: 'E', d: 'no answer from the host for this condition' };
  return out;
}

// ---- checks ----
function hostsOf(c) {
  const ids = new Set(c.hostIds);
  for (const lid of c.listIds) db.lists.find((l) => l.id === lid)?.hostIds.forEach((h) => ids.add(h));
  return [...ids].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
}
// The next scheduled run after `from`, or null: not scheduled, paused, or the end time would pass first (the check has finished).
const nextAfter = (c, from = Date.now()) => {
  if (!c.enabled || !(c.everyMinutes > 0)) return null;
  const t = from + c.everyMinutes * 60000;
  return c.until?.type === 'time' && t > Date.parse(c.until.at) ? null : new Date(t).toISOString();
};
// { everyMinutes, until } from a body with schedule: { everyMinutes, until: { type: 'time', at } | { type: 'forever' } }, the same shape as a
// recurring hunt's (checked by scheduler.parseSchedule). No schedule means by hand only. A body with just everyMinutes runs until deleted.
function parseSchedule(b) {
  const s = b.schedule || (Number(b.everyMinutes) > 0 ? { everyMinutes: b.everyMinutes, until: { type: 'forever' } } : null);
  if (!s) return { everyMinutes: 0, until: null };
  return require('./scheduler').parseSchedule(s);
}

// Creates or updates a check from what the page sent. may(perm) says whether the user has a permission (the command preset needs actions.run).
function save_(b, { by, may, existing } = {}) {
  const name = clean(b.name, 80);
  if (!name) throw bad('Give the check a name');
  const hostIds = (Array.isArray(b.hostIds) ? b.hostIds : []).map(String).filter((h) => db.hosts.some((x) => x.id === h));
  const listIds = (Array.isArray(b.listIds) ? b.listIds : []).map(String).filter((l) => db.lists.some((x) => x.id === l));
  if (!hostIds.length && !listIds.length) throw bad('Choose at least one host or group');
  const tree = tidyTree(b.tree);
  for (const c of leaves(tree)) { const need = PRESETS[c.preset].needs; if (need && !may(need)) throw bad(`${PRESETS[c.preset].label} runs your own command on the hosts, so it needs the Run actions permission`, 403); }
  let sched; try { sched = parseSchedule(b); } catch (e) { throw bad(e.message); }
  const c = existing || { id: id(), createdBy: by || null, createdAt: new Date().toISOString(), lastRunId: null, running: false };
  Object.assign(c, { name, description: clean(b.description, 300), hostIds, listIds, tree, everyMinutes: sched.everyMinutes, until: sched.until, enabled: b.enabled !== false, updatedAt: new Date().toISOString() });
  c.nextRun = nextAfter(c);
  if (!existing) checks().push(c);
  save();
  return c;
}
function setEnabled(c, on) { c.enabled = !!on; c.nextRun = nextAfter(c); save(); }
function remove(c) { db.validations = checks().filter((x) => x.id !== c.id); db.validationRuns = runs().filter((r) => r.checkId !== c.id); save(); }

// Runs a check on all its hosts now. Resolves when every host has answered (callers need not wait).
function run(c, by) {
  if (c.running) throw bad('It is already running');
  const hosts = hostsOf(c);
  if (!hosts.length) throw bad('None of its hosts exist any more');
  const collections = require('./collections'), runSettings = require('./run-settings');
  const r = { id: id(), checkId: c.id, startedAt: new Date().toISOString(), finishedAt: null, by: by || null, status: 'running', passed: 0, failed: 0, errors: 0,
    hosts: hosts.map((h) => ({ hostId: h.id, name: h.name || h.hostname || h.address, address: h.address, os: isWindows(h) ? 'windows' : 'linux', status: 'queued', error: '', leaves: {} })) };
  runs().unshift(r);
  const mine = runs().filter((x) => x.checkId === c.id);
  if (mine.length > MAX_RUNS) { const drop = new Set(mine.slice(MAX_RUNS).map((x) => x.id)); db.validationRuns = runs().filter((x) => !drop.has(x.id)); }
  c.running = true; c.lastRunId = r.id; save();
  const files = {};
  const fileFor = (win) => {
    const k = win ? 'ps1' : 'sh';
    if (!files[k]) { const text = script(c.tree, win); const f = path.join(os.tmpdir(), `kb-validate-${r.id}.${k}`); fs.writeFileSync(f, text); files[k] = { file: f, text }; }
    return files[k];
  };
  return (async () => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(runSettings.settings().concurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const i = next++, h = hosts[i], res = r.hosts[i], win = res.os === 'windows', s = fileFor(win);
        res.status = 'running';
        const out = await collections.executeOnHost(h, { name: c.name, type: win ? 'powershell' : 'bash', file: s.file, text: s.text, dependencies: [] }, { timeoutMs: HOST_TIMEOUT_MS });
        if (out.exitCode !== 0 && !/KBV/.test(out.stdout || '')) { res.status = 'error'; res.error = String(out.stderr || out.stdout || 'the host did not answer').trim().split(/\r?\n/)[0].slice(0, 300); continue; }
        res.leaves = parse(out.stdout, c.tree);
        res.status = evaluate(c.tree, res.leaves) ? 'pass' : 'fail';
      }
    }));
    for (const f of Object.values(files)) fs.rm(f.file, { force: true }, () => {});
    Object.assign(r, { status: 'done', finishedAt: new Date().toISOString(), passed: r.hosts.filter((x) => x.status === 'pass').length, failed: r.hosts.filter((x) => x.status === 'fail').length, errors: r.hosts.filter((x) => x.status === 'error').length });
    c.running = false; save();
    return r;
  })().catch((e) => { r.status = 'done'; r.finishedAt = new Date().toISOString(); for (const x of r.hosts) if (x.status === 'queued' || x.status === 'running') { x.status = 'error'; x.error = e.message; } r.errors = r.hosts.filter((x) => x.status === 'error').length; c.running = false; save(); return r; });
}

// What the page shows for a check: its definition, the expression in words, its hosts, the latest run in full and a short history.
function view(c) {
  const last = c.lastRunId ? runs().find((r) => r.id === c.lastRunId) : null;
  return {
    id: c.id, name: c.name, description: c.description, hostIds: c.hostIds, listIds: c.listIds, tree: c.tree, everyMinutes: c.everyMinutes, until: c.until || null, enabled: c.enabled,
    status: !c.everyMinutes ? 'manual' : !c.enabled ? 'paused' : c.nextRun ? 'active' : 'finished', // manual: by hand only; finished: its end time has passed
    nextRun: c.nextRun, running: !!c.running, createdBy: c.createdBy, createdAt: c.createdAt, updatedAt: c.updatedAt,
    expression: describe(c.tree), conditions: leaves(c.tree).map((x) => ({ id: x.id, text: describeCond(x) })),
    hosts: hostsOf(c).length, hostList: hostsOf(c).map((h) => ({ name: h.name || h.hostname || h.address, address: h.address })), groups: c.listIds.map((l) => db.lists.find((x) => x.id === l)?.name).filter(Boolean),
    last, history: runs().filter((r) => r.checkId === c.id).slice(0, MAX_RUNS).map((r) => ({ id: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt, by: r.by, hosts: r.hosts.length, passed: r.passed, failed: r.failed, errors: r.errors, status: r.status })),
  };
}
const getRun = (rid) => runs().find((r) => r.id === rid) || null;

// Every TICK_MS: runs the checks whose time has come. A check still running from last time is not started twice.
function tick() {
  const now = Date.now();
  for (const c of checks()) {
    if (!c.enabled || !c.everyMinutes || !c.nextRun || Date.parse(c.nextRun) > now || c.running) continue;
    c.nextRun = nextAfter(c, now);
    try { run(c, 'schedule'); } catch (e) { console.error(`Validate ${c.name}:`, e.message); save(); }
  }
}
function start() {
  for (const c of checks()) { if (c.running) c.running = false; if (c.enabled && c.everyMinutes && !c.nextRun) c.nextRun = nextAfter(c); }
  for (const r of runs()) if (r.status === 'running') { r.status = 'done'; r.finishedAt = r.finishedAt || new Date().toISOString(); for (const x of r.hosts) if (x.status === 'queued' || x.status === 'running') { x.status = 'error'; x.error = 'The server restarted during the check'; } }
  save();
  setInterval(tick, TICK_MS).unref?.();
}

const conditions = (tree) => leaves(tree).map((x) => ({ id: x.id, text: describeCond(x) }));

module.exports = { PRESETS, catalog, tidyTree, describe, conditions, evaluate, script, parse, checks, find: (cid) => checks().find((c) => c.id === cid) || null, save: save_, setEnabled, remove, run, view, getRun, start, tick };
