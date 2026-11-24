// Name: Documents - Office macros, shortcuts and script launchers
// Description: Office macros, shortcut files and HTML applications: typical phishing first stage.

rule KB_Office_Macro_Document
{
    meta:
        description = "An Office file with VBA macros: an old OLE document with a VBA project, or a modern document containing vbaProject.bin"
    strings:
        $ole = { D0 CF 11 E0 A1 B1 1A E1 }
        $vba1 = "VBA" ascii wide
        $vba2 = "_VBA_PROJECT" ascii wide
        $macros = "Macros" ascii wide
        $auto1 = "AutoOpen" ascii wide nocase
        $auto2 = "Document_Open" ascii wide nocase
        $auto3 = "Workbook_Open" ascii wide nocase
        $vbaproject = "vbaProject.bin" ascii
        $pk = { 50 4B 03 04 }
    condition:
        ( $ole at 0 and ( $vba2 or ( $vba1 and $macros ) ) ) or ( $pk at 0 and $vbaproject ) or ( $ole at 0 and any of ($auto*) )
}

rule KB_Windows_Shortcut_File
{
    meta:
        description = "A Windows shortcut (.lnk) file by its header; shortcuts that launch scripts are a common delivery method"
    condition:
        uint32(0) == 0x0000004C and uint32(4) == 0x00021401
}

rule KB_Shortcut_Launching_Script_Engine
{
    meta:
        description = "A Windows shortcut that starts PowerShell, cmd, mshta, wscript or cscript"
    strings:
        $ps = "powershell" ascii wide nocase
        $cmd = "cmd.exe" ascii wide nocase
        $mshta = "mshta" ascii wide nocase
        $ws = "wscript" ascii wide nocase
        $cs = "cscript" ascii wide nocase
    condition:
        uint32(0) == 0x0000004C and uint32(4) == 0x00021401 and any of them
}

rule KB_HTML_Application
{
    meta:
        description = "An HTML application (HTA) or script file that runs code through the Windows Script Host"
    strings:
        $hta = "<hta:application" ascii nocase
        $wsh = "WScript.Shell" ascii nocase
        $ax = "ActiveXObject" ascii nocase
        $vbs = "CreateObject(" ascii nocase
    condition:
        $hta or ( $wsh and ( $ax or $vbs ) )
}
