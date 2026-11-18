NAME='Packages - Python Packages'
DESCRIPTION='Python packages installed system-wide and per user (pip). Extra packages give an attacker libraries for tunnelling, scanning and credential theft.'
DEPENDENCIES=()
TAGS=(inventory packages)

printf 'Interpreter\tPackage\tVersion\n'
for py in python3 python; do command -v "$py" >/dev/null 2>&1 && "$py" -m pip list --format=freeze 2>/dev/null </dev/null | awk -F'==' -v p="$py" 'BEGIN{OFS="\t"} {print p,$1,$2}' | head -n 400 && break; done
exit 0
