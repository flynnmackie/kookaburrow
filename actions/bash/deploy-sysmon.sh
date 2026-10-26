NAME='Deploy - Sysmon (Linux)'
DESCRIPTION='Installs Sysmon for Linux on a Debian or Ubuntu host: the SysinternalsEBPF package and the Sysmon package are installed with dpkg, then Sysmon is started with your configuration file (sysmon -accepteula -i config). The files are copied to a temporary folder that is removed afterwards. The configuration is checked to be well-formed XML first when xmllint is available. Nothing is changed if Sysmon is already installed. Needs sysinternalsebpf.deb, sysmonforlinux.deb and sysmon-linux-config.xml uploaded under Settings, Binaries, and root or passwordless sudo. Sysmon stays installed and keeps running.'
DEPENDENCIES=(sysinternalsebpf.deb sysmonforlinux.deb sysmon-linux-config.xml)
PARAMETERS=()
TAGS=(deploy sysmon logging persistence)

SUDO=""; if [ "$(id -u)" != "0" ]; then if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else echo "This needs root or passwordless sudo" >&2; exit 1; fi; fi
for f in sysinternalsebpf.deb sysmonforlinux.deb sysmon-linux-config.xml; do [ -f "$BIN_DIR/$f" ] || { echo "$f was not staged on the host" >&2; exit 1; }; done
command -v dpkg >/dev/null 2>&1 || { echo "dpkg was not found: this installs .deb packages, so it needs a Debian or Ubuntu host" >&2; exit 1; }

if command -v sysmon >/dev/null 2>&1 || [ -x /opt/sysmon/sysmon ] || systemctl list-unit-files sysmon.service 2>/dev/null | grep -q '^sysmon.service'; then
  echo "Sysmon is already installed (service: $(systemctl is-active sysmon 2>/dev/null)). Nothing was changed."
  exit 0
fi
if command -v xmllint >/dev/null 2>&1; then xmllint --noout "$BIN_DIR/sysmon-linux-config.xml" 2>/dev/null || { echo "sysmon-linux-config.xml is not valid XML" >&2; exit 1; }; fi
grep -q '<Sysmon' "$BIN_DIR/sysmon-linux-config.xml" || { echo "sysmon-linux-config.xml is not a Sysmon configuration (no <Sysmon> element)" >&2; exit 1; }
for f in sysinternalsebpf.deb sysmonforlinux.deb sysmon-linux-config.xml; do echo "$f SHA-256 $(sha256sum "$BIN_DIR/$f" | cut -d' ' -f1)"; done

$SUDO env DEBIAN_FRONTEND=noninteractive dpkg -i "$BIN_DIR/sysinternalsebpf.deb" 2>&1 | tail -n 8
$SUDO env DEBIAN_FRONTEND=noninteractive dpkg -i "$BIN_DIR/sysmonforlinux.deb" 2>&1 | tail -n 8
SYSMON="$(command -v sysmon || echo /opt/sysmon/sysmon)"
[ -x "$SYSMON" ] || { echo "The sysmon program was not found after installing the packages" >&2; exit 1; }
$SUDO "$SYSMON" -accepteula -i "$BIN_DIR/sysmon-linux-config.xml" 2>&1 | tail -n 15
for i in 1 2 3 4 5 6; do [ "$(systemctl is-active sysmon 2>/dev/null)" = "active" ] && break; sleep 2; done
if [ "$(systemctl is-active sysmon 2>/dev/null)" = "active" ]; then echo "Sysmon is installed and running"; exit 0; fi
echo "The sysmon service is $(systemctl is-active sysmon 2>/dev/null) afterwards" >&2
exit 1
