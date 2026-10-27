NAME='Persistence - Boot and Init'
DESCRIPTION='Persistence points outside cron and systemd.'
DEPENDENCIES=()
TAGS=(persistence privilege-escalation)

sus='curl|wget|base64|/dev/tcp|nc |ncat|bash -i|python.*-c|perl.*-e|/tmp/|/dev/shm'
echo "== rc.local =="; [ -f /etc/rc.local ] && { ls -l --time-style=long-iso /etc/rc.local; grep -vE '^\s*(#|$)' /etc/rc.local; }
echo "== init.d =="; ls -l --time-style=long-iso /etc/init.d 2>/dev/null | tail -n +2
echo "== profile.d and shell rc =="; ls -l --time-style=long-iso /etc/profile.d /etc/profile /etc/bash.bashrc /etc/bashrc 2>/dev/null
echo "== login-time commands matching suspicious patterns =="; grep -rHnE "$sus" /etc/profile /etc/profile.d /etc/bash.bashrc /etc/bashrc /etc/update-motd.d /etc/rc.local /etc/init.d 2>/dev/null | cut -c1-240
echo "== /etc/environment =="; cat /etc/environment 2>/dev/null
echo "== Dynamic linker =="; ls -l --time-style=long-iso /etc/ld.so.preload 2>/dev/null && cat /etc/ld.so.preload; ls -l --time-style=long-iso /etc/ld.so.conf.d 2>/dev/null | tail -n +2; echo "LD_PRELOAD env: ${LD_PRELOAD}"
echo "== PAM modules not from the standard path =="; grep -rhE 'pam_exec|pam_python|\.so' /etc/pam.d 2>/dev/null | grep -vE '/lib.*/security/|^\s*#' | grep -E '/' | sort -u | head -n 50
echo "== udev rules =="; ls -l --time-style=long-iso /etc/udev/rules.d /usr/lib/udev/rules.d 2>/dev/null | grep -E 'RUN|\.rules' | head -n 80; grep -rl 'RUN+=' /etc/udev/rules.d 2>/dev/null
echo "== Modules loaded at boot =="; cat /etc/modules /etc/modules-load.d/*.conf 2>/dev/null | grep -vE '^\s*(#|$)'
echo "== Kernel command line =="; cat /proc/cmdline
echo "== XDG autostart =="; ls -l --time-style=long-iso /etc/xdg/autostart $(getent passwd | awk -F: '{print $6"/.config/autostart"}') 2>/dev/null | tail -n +2 | head -n 50
echo "== initramfs hooks =="; ls -l --time-style=long-iso /etc/initramfs-tools/hooks /etc/initramfs-tools/scripts /etc/dracut.conf.d 2>/dev/null | tail -n +2
exit 0
