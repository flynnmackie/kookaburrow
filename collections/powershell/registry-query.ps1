$Name = 'Registry - Query Key'
$Description = 'Lists the values under a registry key, optionally with all subkeys.'
$Dependencies = @()
$Parameters = @('KeyPath', 'Recurse?', 'Contains?')
$Tags = @('registry', 'forensics', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
$keys = @(Get-Item -LiteralPath $KeyPath)
if ($Recurse -match '^(y|yes|true|1)$') { $keys += @(Get-ChildItem -LiteralPath $KeyPath -Recurse) }
if (-not $keys[0]) { throw "Key not found: $KeyPath" }
foreach ($k in $keys) {
    foreach ($n in $k.GetValueNames()) {
        $v = $k.GetValue($n)
        $text = if ($v -is [byte[]]) { ([BitConverter]::ToString($v)).Substring(0, [Math]::Min(120, ([BitConverter]::ToString($v)).Length)) } else { ($v -join ' ') }
        if ($Contains -and "$n $text" -notlike "*$Contains*") { continue }
        [pscustomobject]@{ Key = $k.Name; Name = $(if ($n) { $n } else { '(default)' }); Type = $k.GetValueKind($n); Data = $text }
    }
}
