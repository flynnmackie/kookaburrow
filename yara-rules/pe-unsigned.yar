// Name: Executables - Windows programs with no digital signature
// Description: PE files with no Authenticode signature. A short list on a server; useful in user and temp folders.
import "pe"

rule KB_PE_Unsigned
{
    meta:
        description = "A Windows PE file with no embedded Authenticode signature (catalog-signed Windows files also appear here)"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and pe.number_of_signatures == 0
}
