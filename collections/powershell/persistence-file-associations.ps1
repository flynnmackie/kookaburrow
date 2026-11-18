$Name = 'Persistence - File Association Handlers'
$Description = 'The command run for common file types (exe, bat, cmd, ps1, vbs, js, hta, lnk and others). A changed handler runs an attacker program when a file is opened.'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($t in 'exefile', 'batfile', 'cmdfile', 'comfile', 'htafile', 'jsfile', 'vbsfile', 'vbefile', 'wshfile', 'scrfile', 'piffile', 'Microsoft.PowerShellScript.1', 'txtfile', 'lnkfile') { foreach ($v in 'open', 'edit', 'runas') { $c = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$t\shell\$v\command").'(default)'; if ($c) { [pscustomobject]@{ Type = $t; Verb = $v; Command = $c } } } }
