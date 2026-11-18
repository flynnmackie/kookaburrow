$Name = 'System - PATH and Search Order Risks'
$Description = 'Folders on the system and user PATH that are writable by ordinary users or do not exist. A writable PATH folder allows program hijacking.'
$Dependencies = @()
$Tags = @('system', 'privilege-escalation', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
$paths = @(); foreach ($sc in 'Machine', 'User') { foreach ($p in ([Environment]::GetEnvironmentVariable('Path', $sc) -split ';')) { if ($p) { $paths += [pscustomobject]@{ Scope = $sc; Path = [Environment]::ExpandEnvironmentVariables($p) } } } }
foreach ($x in $paths) { $exists = Test-Path -LiteralPath $x.Path; $w = ''; if ($exists) { $acl = Get-Acl -LiteralPath $x.Path; $w = (($acl.Access | Where-Object { $_.FileSystemRights -match 'Write|Modify|FullControl' -and $_.AccessControlType -eq 'Allow' -and $_.IdentityReference -match 'Everyone|Users|Authenticated Users' } | ForEach-Object { "$($_.IdentityReference)" }) -join ', ') }; [pscustomobject]@{ Scope = $x.Scope; Path = $x.Path; Exists = $exists; WritableBy = $w } }
