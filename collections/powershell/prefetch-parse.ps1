$Name = 'Prefetch - Parse'
$Description = 'Parses Windows Prefetch files natively (no tools needed, like PECmd). Needs administrator rights.'
$Dependencies = @()
$Parameters = @('ExeContains?', 'IncludeFiles?')
$Tags = @('execution', 'forensics', 'prefetch')

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class KbMam {
    [DllImport("ntdll.dll")] static extern uint RtlGetCompressionWorkSpaceSize(ushort fmt, out uint wsSize, out uint frag);
    [DllImport("ntdll.dll")] static extern uint RtlDecompressBufferEx(ushort fmt, byte[] outBuf, int outSize, byte[] inBuf, int inSize, out int finalSize, byte[] ws);
    public static byte[] Decompress(byte[] data) {
        int size = BitConverter.ToInt32(data, 4);
        byte[] input = new byte[data.Length - 8]; Array.Copy(data, 8, input, 0, input.Length);
        uint wsSize, frag; RtlGetCompressionWorkSpaceSize(4, out wsSize, out frag);
        byte[] ws = new byte[wsSize], output = new byte[size]; int final;
        uint r = RtlDecompressBufferEx(4, output, size, input, input.Length, out final, ws);
        if (r != 0) throw new Exception("decompress failed 0x" + r.ToString("x"));
        return output;
    }
}
'@
$dir = "$env:SystemRoot\Prefetch"
$files = @(Get-ChildItem -LiteralPath $dir -Filter '*.pf' -Force)
if (-not $files) { "No Prefetch files in $dir (Prefetch may be disabled; it usually is on servers)."; return }
foreach ($f in $files) {
    if ($ExeContains -and $f.Name -notlike "*$ExeContains*") { continue }
    try {
        $b = [IO.File]::ReadAllBytes($f.FullName)
        if ($b[0] -eq 0x4D -and $b[1] -eq 0x41 -and $b[2] -eq 0x4D) { $b = [KbMam]::Decompress($b) }
        if ([Text.Encoding]::ASCII.GetString($b, 4, 4) -ne 'SCCA') { throw 'not a Prefetch file' }
        $ver = [BitConverter]::ToUInt32($b, 0)
        $exe = [Text.Encoding]::Unicode.GetString($b, 16, 60).Split([char]0)[0]
        $hash = '{0:X8}' -f [BitConverter]::ToUInt32($b, 76)
        $count = if ($ver -ge 30) { 8 } else { 1 }
        $timesOff = if ($ver -ge 23) { 128 } else { 120 }
        $times = @(for ($i = 0; $i -lt $count; $i++) { $ft = [BitConverter]::ToInt64($b, $timesOff + 8 * $i); if ($ft -gt 0) { [DateTime]::FromFileTimeUtc($ft).ToString('yyyy-MM-dd HH:mm:ss') } })
        $runOff = switch ($ver) { 17 { 144 } 23 { 152 } 26 { 208 } default { 200 } }
        $runCount = [BitConverter]::ToUInt32($b, $runOff)
        $fnOff = [BitConverter]::ToUInt32($b, 100); $fnSize = [BitConverter]::ToUInt32($b, 104)
        $names = [Text.Encoding]::Unicode.GetString($b, $fnOff, $fnSize).Split([char]0) | Where-Object { $_ }
        $volOff = [BitConverter]::ToUInt32($b, 108); $volCount = [BitConverter]::ToUInt32($b, 112)
        $vols = @(for ($v = 0; $v -lt $volCount; $v++) {
            $o = $volOff + $v * $(if ($ver -ge 30) { 104 } elseif ($ver -ge 23) { 104 } else { 40 })
            $pOff = [BitConverter]::ToUInt32($b, $o); $pLen = [BitConverter]::ToUInt32($b, $o + 4)
            $path = [Text.Encoding]::Unicode.GetString($b, $volOff + $pOff, $pLen * 2).TrimEnd([char]0)
            "{0} (serial {1:X8})" -f $path, [BitConverter]::ToUInt32($b, $o + 16)
        })
        $row = [ordered]@{ Executable = $exe; PrefetchHash = $hash; RunCount = $runCount; LastRun1 = $times[0]; LastRun2 = $times[1]; LastRun3 = $times[2]; LastRun4 = $times[3]; LastRun5 = $times[4]; LastRun6 = $times[5]; LastRun7 = $times[6]; LastRun8 = $times[7]; Volumes = ($vols -join ' | '); FilesLoaded = @($names).Count; Version = $ver; PrefetchCreated = $f.CreationTime; File = $f.Name }
        if ($IncludeFiles -match '^(y|yes|true|1)$') { $row.Files = ($names -join ' ; ') }
        [pscustomobject]$row
    } catch { [pscustomobject][ordered]@{ Executable = ''; PrefetchHash = ''; RunCount = ''; LastRun1 = "Could not parse: $($_.Exception.Message)"; File = $f.Name } }
}
