// Name: Web shells and well-known attack tool strings
// Description: Script files that run commands from web requests (PHP, ASP.NET, JSP), and programs or scripts that contain the names of widely used attack tools. Run it over web roots and over folders where a user could write.

rule KB_Webshell_PHP_Generic
{
    meta:
        description = "PHP that passes request data to eval, assert, system, passthru or shell_exec"
    strings:
        $php = "<?php" nocase
        $e1 = /(eval|assert|system|passthru|shell_exec|exec|popen|proc_open)\s*\(\s*(base64_decode\s*\(\s*)?\$_(GET|POST|REQUEST|COOKIE)/ nocase
        $e2 = /(eval|assert)\s*\(\s*(gzinflate|gzuncompress|str_rot13|base64_decode)\s*\(/ nocase
        $e3 = /preg_replace\s*\(\s*['"]\/[^'"]*\/e['"]/
    condition:
        filesize < 2MB and $php and any of ($e*)
}

rule KB_Webshell_ASPX_JSP_Generic
{
    meta:
        description = "ASP.NET or JSP that runs a command or evaluates code taken from the request"
    strings:
        $a1 = /eval\s*\(\s*Request(\.Item)?\s*[\[(]/ nocase
        $a2 = "Process.Start" nocase
        $a3 = /cmd\.exe\s*\/c/ nocase
        $a4 = "Request.Form" nocase
        $j1 = /Runtime\.getRuntime\(\)\.exec\(\s*request\.getParameter/
        $j2 = /ProcessBuilder\(\s*request\.getParameter/
    condition:
        filesize < 2MB and ( $a1 or ( $a2 and $a3 and $a4 ) or $j1 or $j2 )
}

rule KB_Attack_Tool_Strings
{
    meta:
        description = "Strings of widely used attack tools: Mimikatz, Meterpreter, Cobalt Strike, Impacket, Rubeus, BloodHound collectors"
    strings:
        $m1 = "sekurlsa::logonpasswords" ascii wide nocase
        $m2 = "gentilkiwi" ascii wide nocase
        $m3 = "Invoke-Mimikatz" ascii wide nocase
        $r1 = "ReflectiveLoader" ascii
        $r2 = "metsrv" ascii
        $c1 = "beacon.dll" ascii nocase
        $c2 = "%s as %s\\%s: %d" ascii
        $i1 = "impacket" ascii nocase
        $rb = "Rubeus" ascii wide
        $bh = "SharpHound" ascii wide
    condition:
        2 of them or $m1 or $m3
}
