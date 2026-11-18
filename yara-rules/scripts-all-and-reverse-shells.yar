// Name: Scripts - All script files, and reverse shell commands
// Description: Script files by their content (shell, Python, Perl, PowerShell, batch, VBScript, JScript) to list every script in a folder, and shell or script one-liners that open a reverse shell.

rule KB_Script_Any
{
    meta:
        description = "A script: a shebang line, a PowerShell or batch file, or VBScript or JScript, found by its content"
    strings:
        $ps1 = /(^|[\r\n])\s*(param\s*\(|function\s+[A-Za-z-]+\s*\{|\$ErrorActionPreference|Import-Module|Get-[A-Z][a-z]+)/
        $bat = /(^|[\r\n])\s*@echo off/ nocase
        $vbs = /(^|[\r\n])\s*(Option Explicit|Dim\s+\w+|Set\s+\w+\s*=\s*CreateObject)/ nocase
        $js = /(^|[\r\n])\s*(var\s+\w+\s*=\s*new ActiveXObject|WScript\.Echo)/
    condition:
        filesize < 5MB and ( uint16(0) == 0x2123 or any of them )
}

rule KB_Reverse_Shell_Command
{
    meta:
        description = "A command line that connects a shell to a remote address (bash /dev/tcp, nc -e, python, perl, php or PowerShell socket one-liners)"
    strings:
        $bash = /bash\s+-i\s*>&\s*\/dev\/tcp\/[0-9a-zA-Z.\-]+\/[0-9]+/
        $nc = /\bnc(at)?\s+(-[a-z]*e|-c)\s+\/bin\/(ba)?sh/
        $py = /socket\.socket\(.*\).*(connect|dup2).*(\/bin\/(ba)?sh|pty\.spawn)/
        $perl = /perl\s+-e\s+['"]use Socket/
        $php = /fsockopen\(.{0,80}(exec|shell_exec|system|passthru)\(/
        $ps = /New-Object\s+System\.Net\.Sockets\.TCPClient/ nocase
        $mkfifo = /mkfifo\s+\S+;\s*(nc|ncat)\s/
    condition:
        any of them
}
