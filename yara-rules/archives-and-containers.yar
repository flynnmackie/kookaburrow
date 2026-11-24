// Name: Files - Archives and disk images
// Description: Archives and disk images by header (zip, 7-Zip, RAR, gzip, tar, ISO, VHD). Finds staged data and renamed archives.

rule KB_Archive_Any
{
    meta:
        description = "A zip, 7-Zip, RAR, gzip, bzip2, xz or cab archive, found by its header whatever the file is called"
    strings:
        $zip = { 50 4B 03 04 }
        $zip_empty = { 50 4B 05 06 }
        $sevenz = { 37 7A BC AF 27 1C }
        $rar4 = { 52 61 72 21 1A 07 00 }
        $rar5 = { 52 61 72 21 1A 07 01 00 }
        $gz = { 1F 8B 08 }
        $bz2 = { 42 5A 68 }
        $xz = { FD 37 7A 58 5A 00 }
        $cab = { 4D 53 43 46 00 00 00 00 }
    condition:
        for any of them : ( @ == 0 )
}

rule KB_Archive_Tar
{
    meta:
        description = "A tar archive (the ustar marker at offset 257)"
    strings:
        $ustar = "ustar" ascii
    condition:
        filesize > 512 and $ustar at 257
}

rule KB_Disk_Image_Container
{
    meta:
        description = "An ISO 9660 image or a virtual disk (VHD, VHDX, VMDK) that can hold a program or a script"
    strings:
        $iso = "CD001" ascii
        $vhd = "conectix" ascii
        $vhdx = "vhdxfile" ascii
        $vmdk = "KDMV" ascii
    condition:
        $iso at 0x8001 or $vhd at 0 or $vhdx at 0 or $vmdk at 0
}
