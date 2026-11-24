// Name: Scripts - Suspicious PowerShell
// Description: PowerShell that decodes, downloads or runs hidden code.

rule KB_PowerShell_Encoded_Or_Hidden
{
    meta:
        description = "PowerShell started hidden, without a profile, or with an encoded command"
    strings:
        $enc = /-e(nc|ncodedcommand)?\s+[A-Za-z0-9+\/=]{40,}/ nocase
        $hidden = /-w(indowstyle)?\s+hidden/ nocase
        $nop = "-nop" nocase
        $bypass = /-ep\s+bypass|-executionpolicy\s+bypass/ nocase
    condition:
        $enc or ($hidden and ($nop or $bypass))
}

rule KB_PowerShell_Download_And_Run
{
    meta:
        description = "PowerShell that downloads text or a file and runs it"
    strings:
        $dl1 = "DownloadString" nocase
        $dl2 = "DownloadFile" nocase
        $dl3 = "Invoke-WebRequest" nocase
        $dl4 = "Net.WebClient" nocase
        $dl5 = "Start-BitsTransfer" nocase
        $run1 = "Invoke-Expression" nocase
        $run2 = /\biex\b/ nocase
        $run3 = "Start-Process" nocase
    condition:
        any of ($dl*) and any of ($run*)
}

rule KB_PowerShell_Obfuscation_Markers
{
    meta:
        description = "Base64 decoding with compression, reflection or AMSI tampering, which PowerShell malware uses to hide code"
    strings:
        $b64 = "FromBase64String" nocase
        $gz = "IO.Compression.GzipStream" nocase
        $def = "IO.Compression.DeflateStream" nocase
        $refl = "Reflection.Assembly" nocase
        $amsi = "AmsiUtils" nocase
    condition:
        ($b64 and ($gz or $def)) or $amsi or ($b64 and $refl)
}
