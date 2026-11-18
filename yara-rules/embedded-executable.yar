// Name: Files - Executables hidden inside other files
// Description: Files that are not programs themselves but contain a Windows or Linux program, such as a dropper holding its payload, or an executable appended to a document or image.

rule KB_Embedded_PE_In_Other_File
{
    meta:
        description = "A file that does not start as a program but contains a PE program (the DOS stub text is found after the first bytes)"
    strings:
        $dos = "This program cannot be run in DOS mode" ascii
        $mz = { 4D 5A 90 00 03 00 00 00 }
    condition:
        uint16(0) != 0x5A4D and uint32(0) != 0x464C457F and filesize < 50MB and $dos and $mz
}

rule KB_Embedded_ELF_In_Other_File
{
    meta:
        description = "A file that does not start as an ELF program but contains one"
    strings:
        $elf = { 7F 45 4C 46 02 01 01 }
    condition:
        uint32(0) != 0x464C457F and uint16(0) != 0x5A4D and filesize < 50MB and $elf
}

rule KB_Base64_Encoded_PE
{
    meta:
        description = "A text file that contains a Base64 encoded Windows program (MZ and the DOS header encode to TVqQ or TVpQ)"
    strings:
        $b1 = "TVqQAAMAAAAEAAAA" ascii
        $b2 = "TVpQAAIAAAAEAA8A" ascii
        $b3 = "TVoAAAAAAAAAAAAA" ascii
    condition:
        any of them
}
