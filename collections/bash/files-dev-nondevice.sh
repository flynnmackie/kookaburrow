NAME='Files - Regular Files Inside /dev'
DESCRIPTION='Ordinary files and directories in /dev, which should only hold device nodes. A favourite place to hide tools because few people look.'
DEPENDENCIES=()
TAGS=(filesystem defense-evasion malware)

printf 'Path\tType\tSize\tModified\tOwner\n'
find /dev -xdev \( -type f -o -type d \) ! -path /dev -printf '%p\t%y\t%s\t%TY-%Tm-%Td %TH:%TM\t%u\n' 2>/dev/null | grep -vE '^/dev/(shm|mqueue|pts|hugepages|disk|block|char|cpu|bsr|input|snd|dri|net|mapper|vfio|bus|lightnvm|usb|v4l|serial|cuse|fd|shm/\.)' | head -n 100
exit 0
