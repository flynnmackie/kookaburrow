$Name = 'Software - Scripting Runtimes and Interpreters'
$Description = 'Python, Node.js, Java, Perl, Ruby, Go and PHP installations found on the host, with versions. Interpreters give an attacker living-off-the-land options.'
$Dependencies = @()
$Tags = @('inventory', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$c = @{ python = '--version'; py = '--version'; node = '--version'; java = '-version'; perl = '-v'; ruby = '--version'; go = 'version'; php = '--version'; git = '--version'; pwsh = '--version'; wsl = '--version' }
foreach ($n in $c.Keys) { $g = Get-Command $n -All; foreach ($x in $g) { if ($x.Source -and $x.Source -notmatch 'WindowsApps') { $v = (& $x.Source $c[$n] 2>&1 | Select-Object -First 1) -as [string]; [pscustomobject]@{ Runtime = $n; Path = $x.Source; Version = $v } } } }
