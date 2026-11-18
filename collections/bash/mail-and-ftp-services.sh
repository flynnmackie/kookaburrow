NAME='Services - Mail, FTP and Remote Access Daemons'
DESCRIPTION='Mail transfer agents, FTP servers, telnet, rsh, VNC, XRDP and other remote-access daemons that are installed or running. Each one is an extra way in.'
DEPENDENCIES=()
TAGS=(inventory network security)

printf 'Service\tState\tPath\n'
for s in postfix exim4 sendmail dovecot vsftpd proftpd pure-ftpd telnetd inetd xinetd rsh rexec rlogin tftpd vncserver x11vnc xrdp teamviewerd anydesk nfs-server rpcbind smbd nmbd snmpd cups; do st=""; command -v systemctl >/dev/null 2>&1 && st=$(systemctl is-active "$s" 2>/dev/null </dev/null); en=$(systemctl is-enabled "$s" 2>/dev/null </dev/null); [ "$st" = active ] || [ "$en" = enabled ] && printf '%s\t%s/%s\t%s\n' "$s" "$st" "$en" "$(command -v "$s" 2>/dev/null)"; done
exit 0
