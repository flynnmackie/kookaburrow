$Name = 'Execution - BAM'
$Description = 'Background Activity Moderator entries: the full path of each program a user ran and the last time it ran, per user SID (Windows 10 1709 and later). Persists for about a week and survives deletion of the program (like Windows.Forensics.Bam).'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$rows = foreach ($base in 'HKLM:\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings', 'HKLM:\SYSTEM\CurrentControlSet\Services\bam\UserSettings') {
    foreach ($k in Get-ChildItem $base) {
        $sid = $k.PSChildName
        $user = try { (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value } catch { $sid }
        foreach ($n in $k.GetValueNames()) {
            $b = $k.GetValue($n)
            if ($b -isnot [byte[]] -or $b.Length -lt 8 -or $n -in 'Version', 'SequenceNumber') { continue }
            $ft = [BitConverter]::ToInt64($b, 0)
            if ($ft -le 0) { continue }
            [pscustomobject]@{ User = $user; Program = $n; LastRunUtc = [DateTime]::FromFileTimeUtc($ft) }
        }
    }
}
$rows | Sort-Object LastRunUtc -Descending
