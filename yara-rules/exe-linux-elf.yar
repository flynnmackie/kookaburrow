// Name: Executables - Linux programs and libraries (ELF)
// Description: Every ELF file by header: Linux programs, shared libraries and kernel modules.

rule KB_ELF_Any_Binary
{
    meta:
        description = "Any ELF file (program, shared library, kernel module, core dump)"
    condition:
        uint32(0) == 0x464C457F
}

rule KB_ELF_Program
{
    meta:
        description = "An ELF program or position-independent program (type EXEC or DYN)"
    condition:
        uint32(0) == 0x464C457F and (uint16(16) == 2 or uint16(16) == 3)
}

rule KB_ELF_Relocatable_Module
{
    meta:
        description = "An ELF relocatable object, such as a kernel module (.ko)"
    condition:
        uint32(0) == 0x464C457F and uint16(16) == 1
}
