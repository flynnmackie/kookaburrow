// Name: Executables - Windows programs and libraries (PE)
// Description: Every Windows PE file by its content, whatever it is called: programs, DLLs and drivers. Use it to list all executables in a folder, or to find a program that was renamed.
import "pe"

rule KB_PE_Any_Windows_Binary
{
    meta:
        description = "Any Windows PE file (exe, dll, sys, scr, ocx ...), found by its header, not its name"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550
}

rule KB_PE_Program_Not_Library
{
    meta:
        description = "A Windows program (an .exe type file that is not a DLL or a driver)"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and pe.characteristics & pe.EXECUTABLE_IMAGE != 0 and not pe.is_dll() and pe.subsystem != pe.SUBSYSTEM_NATIVE
}

rule KB_PE_Dynamic_Library
{
    meta:
        description = "A Windows DLL"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and pe.is_dll()
}

rule KB_PE_Kernel_Driver
{
    meta:
        description = "A Windows kernel driver (native subsystem)"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and pe.subsystem == pe.SUBSYSTEM_NATIVE
}
