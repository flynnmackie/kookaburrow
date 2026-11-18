NAME='Packages - Compilers, Interpreters and Network Tools Present'
DESCRIPTION='Whether compilers, interpreters and network or admin tools are installed (gcc, python, perl, nc, nmap, tcpdump, socat, curl, wget and more), with their paths and versions.'
DEPENDENCIES=()
TAGS=(inventory execution)

printf 'Tool\tPath\tVersion\n'
for t in gcc cc make g++ python python3 perl ruby php node java go rustc nc ncat netcat nmap tcpdump tshark socat curl wget telnet ftp ssh scp rsync base64 xxd strace ltrace gdb openssl; do p=$(command -v "$t" 2>/dev/null) && printf '%s\t%s\t%s\n' "$t" "$p" "$("$p" --version 2>&1 </dev/null | head -n1 | cut -c1-80)"; done
exit 0
