// Name: Executables - Packed or encrypted programs (high entropy)
// Description: Programs with a large random-looking section, as packers and crypters produce. Also matches some legitimate installers.
import "pe"
import "math"

rule KB_PE_High_Entropy_Section
{
    meta:
        description = "A PE file with a section over 4 KB whose entropy is above 7.2 (of 8): packed, encrypted or compressed content"
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and
        for any i in (0 .. pe.number_of_sections - 1) :
            ( pe.sections[i].raw_data_size > 4096 and math.entropy(pe.sections[i].raw_data_offset, pe.sections[i].raw_data_size) > 7.2 )
}

rule KB_PE_Packer_Section_Names
{
    meta:
        description = "A PE file with section names used by common packers (UPX, ASPack, Themida, VMProtect, MPRESS)"
    strings:
        $upx = "UPX0" ascii
        $aspack = ".aspack" ascii
        $themida = ".themida" ascii
        $vmp = ".vmp0" ascii
        $mpress = ".MPRESS1" ascii
    condition:
        uint16(0) == 0x5A4D and uint32(uint32(0x3C)) == 0x00004550 and any of them
}
