// Name: Executables - Process injection and credential dumping APIs
// Description: Programs that import process-injection or memory-reading APIs. Common in legitimate tools; a hit in a user or temp folder is a lead.
import "pe"

rule KB_PE_Imports_Process_Injection
{
    meta:
        description = "Imports VirtualAllocEx, WriteProcessMemory and CreateRemoteThread (classic remote thread injection)"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and
        pe.imports("kernel32.dll", "VirtualAllocEx") and pe.imports("kernel32.dll", "WriteProcessMemory") and
        ( pe.imports("kernel32.dll", "CreateRemoteThread") or pe.imports("ntdll.dll", "NtCreateThreadEx") )
}

rule KB_PE_Imports_Process_Hollowing
{
    meta:
        description = "Imports the calls used to hollow out a process (unmap, write, set thread context, resume)"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and
        pe.imports("ntdll.dll", "NtUnmapViewOfSection") and pe.imports("kernel32.dll", "WriteProcessMemory") and
        pe.imports("kernel32.dll", "SetThreadContext") and pe.imports("kernel32.dll", "ResumeThread")
}

rule KB_PE_Imports_Memory_Dump
{
    meta:
        description = "Imports MiniDumpWriteDump and OpenProcess: the usual way to dump credentials from another process"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and
        ( pe.imports("dbghelp.dll", "MiniDumpWriteDump") or pe.imports("dbgcore.dll", "MiniDumpWriteDump") ) and pe.imports("kernel32.dll", "OpenProcess")
}
