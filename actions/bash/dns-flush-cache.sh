NAME='DNS - Flush Cache'
DESCRIPTION='Clears the DNS resolver cache (systemd-resolved, nscd or dnsmasq, whichever is running), for example after changing /etc/hosts or sinkholing a domain, so the change takes effect immediately.'
DEPENDENCIES=()
TAGS=(dns network recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
done=0
if command -v resolvectl >/dev/null 2>&1 && $SUDO resolvectl flush-caches 2>/dev/null; then echo "Flushed systemd-resolved cache"; done=1; fi
if command -v nscd >/dev/null 2>&1 && $SUDO nscd -i hosts 2>/dev/null; then echo "Flushed nscd hosts cache"; done=1; fi
if systemctl is-active --quiet dnsmasq 2>/dev/null; then $SUDO systemctl restart dnsmasq && echo "Restarted dnsmasq"; done=1; fi
[ "$done" = 1 ] || echo "No caching resolver found (systemd-resolved, nscd or dnsmasq): nothing to flush"
exit 0
