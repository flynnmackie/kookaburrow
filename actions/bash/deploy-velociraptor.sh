NAME='Deploy - Velociraptor (Linux)'
DESCRIPTION='Installs the Velociraptor client on a Debian or Ubuntu host from your own client package (the repackaged .deb that already contains your server address and certificates) with dpkg, then checks that the client service is running. The package is copied to a temporary folder that is removed afterwards. Nothing is changed if a Velociraptor client service is already installed. Needs velociraptor-client.deb uploaded under Settings, Binaries, and root or passwordless sudo. The client stays installed and keeps running.'
DEPENDENCIES=(velociraptor-client.deb)
PARAMETERS=()
TAGS=(deploy velociraptor agent persistence)

SUDO=""; if [ "$(id -u)" != "0" ]; then if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else echo "This needs root or passwordless sudo" >&2; exit 1; fi; fi
PKG="$BIN_DIR/velociraptor-client.deb"
[ -f "$PKG" ] || { echo "velociraptor-client.deb was not staged on the host" >&2; exit 1; }
command -v dpkg >/dev/null 2>&1 || { echo "dpkg was not found: this installs a .deb, so it needs a Debian or Ubuntu host" >&2; exit 1; }

for u in velociraptor_client velociraptor; do
  if systemctl list-unit-files "$u.service" 2>/dev/null | grep -q "^$u.service"; then
    echo "A Velociraptor service is already installed ($u: $(systemctl is-active "$u" 2>/dev/null)). Nothing was changed."
    exit 0
  fi
done

echo "Installer: velociraptor-client.deb, SHA-256 $(sha256sum "$PKG" | cut -d' ' -f1)"
$SUDO env DEBIAN_FRONTEND=noninteractive dpkg -i "$PKG" 2>&1 | tail -n 15
$SUDO systemctl daemon-reload 2>/dev/null
for u in velociraptor_client velociraptor; do
  if systemctl list-unit-files "$u.service" 2>/dev/null | grep -q "^$u.service"; then
    $SUDO systemctl enable --now "$u" 2>&1 | tail -n 3
    for i in 1 2 3 4 5 6; do [ "$(systemctl is-active "$u" 2>/dev/null)" = "active" ] && break; sleep 3; done
    if [ "$(systemctl is-active "$u" 2>/dev/null)" = "active" ]; then echo "Velociraptor is installed and running (service $u)"; exit 0; fi
    echo "The $u service is $(systemctl is-active "$u" 2>/dev/null) afterwards" >&2; exit 1
  fi
done
echo "No Velociraptor service was found after the install" >&2
exit 1
