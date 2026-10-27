$Name = 'Execution - Shimcache'
$Description = 'Application Compatibility Cache (Shimcache) entries from the SYSTEM hive.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$b = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache').AppCompatCache
if (-not $b) { 'No AppCompatCache value.'; return }
$sig = [byte[]](0x31, 0x30, 0x74, 0x73) # "10ts"
$pos = 0
for ($i = 0; $i -lt [Math]::Min(512, $b.Length - 4); $i++) { if ($b[$i] -eq 0x31 -and $b[$i + 1] -eq 0x30 -and $b[$i + 2] -eq 0x74 -and $b[$i + 3] -eq 0x73) { $pos = $i; break } }
if (-not $pos) { 'Unrecognised AppCompatCache format (Windows 10 or later is supported).'; return }
$n = 0
while ($pos + 14 -lt $b.Length -and $b[$pos] -eq 0x31 -and $b[$pos + 1] -eq 0x30 -and $b[$pos + 2] -eq 0x74 -and $b[$pos + 3] -eq 0x73) {
    $dsz = [BitConverter]::ToUInt32($b, $pos + 8)
    $plen = [BitConverter]::ToUInt16($b, $pos + 12)
    $path = [Text.Encoding]::Unicode.GetString($b, $pos + 14, $plen)
    $ft = [BitConverter]::ToInt64($b, $pos + 14 + $plen)
    $n++
    [pscustomobject]@{ Order = $n; Path = $path; LastModifiedUtc = if ($ft -gt 0) { [DateTime]::FromFileTimeUtc($ft) } else { '' } }
    $pos += 12 + $dsz
}
