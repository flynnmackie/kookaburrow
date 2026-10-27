NAME='Deploy - Elastic Agent (Linux)'
DESCRIPTION='Installs the Elastic Agent on a Linux host and enrols it in your Fleet Server. Needs root or passwordless sudo.'
DEPENDENCIES=(elastic-agent-linux.tar.gz)
PARAMETERS=(FLEET_URL ENROLLMENT_TOKEN INSECURE?)
TAGS=(deploy elastic agent persistence)

SUDO=""; if [ "$(id -u)" != "0" ]; then if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else echo "This needs root or passwordless sudo" >&2; exit 1; fi; fi
echo "$FLEET_URL" | grep -Eq '^https?://[A-Za-z0-9._:/%~\[\]-]+$' || { echo "FLEET_URL must look like https://fleet.example.com:8220" >&2; exit 2; }
echo "$ENROLLMENT_TOKEN" | grep -Eq '^[A-Za-z0-9+/=_:-]{8,}$' || { echo "ENROLLMENT_TOKEN contains characters a Fleet enrollment token does not use" >&2; exit 2; }
PKG="$BIN_DIR/elastic-agent-linux.tar.gz"
[ -f "$PKG" ] || { echo "elastic-agent-linux.tar.gz was not staged on the host" >&2; exit 1; }

if systemctl list-unit-files elastic-agent.service 2>/dev/null | grep -q '^elastic-agent.service'; then
  echo "An Elastic Agent service is already installed (status: $(systemctl is-active elastic-agent 2>/dev/null)). Nothing was changed."
  exit 0
fi
echo "Package: elastic-agent-linux.tar.gz, SHA-256 $(sha256sum "$PKG" | cut -d' ' -f1)"
mkdir -p "$BIN_DIR/elastic" && tar -xzf "$PKG" -C "$BIN_DIR/elastic" || { echo "Could not unpack elastic-agent-linux.tar.gz" >&2; exit 1; }
AGENT="$(find "$BIN_DIR/elastic" -type f -name elastic-agent -perm -u+x 2>/dev/null | head -n 1)"
[ -n "$AGENT" ] || { echo "elastic-agent-linux.tar.gz does not contain the elastic-agent program" >&2; exit 1; }

EXTRA=""
case "$(echo "$INSECURE" | tr 'A-Z' 'a-z')" in yes|true|1) EXTRA="--insecure"; echo "INSECURE is on: the Fleet Server certificate is not verified";; esac
cd "$(dirname "$AGENT")" || exit 1
$SUDO "$AGENT" install --url="$FLEET_URL" --enrollment-token="$ENROLLMENT_TOKEN" --non-interactive $EXTRA 2>&1 | sed "s|$ENROLLMENT_TOKEN|********|g" | tail -n 25
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do [ "$(systemctl is-active elastic-agent 2>/dev/null)" = "active" ] && break; sleep 5; done
if [ "$(systemctl is-active elastic-agent 2>/dev/null)" = "active" ]; then echo "Elastic Agent is installed and running, enrolling with $FLEET_URL"; exit 0; fi
echo "The elastic-agent service is $(systemctl is-active elastic-agent 2>/dev/null) afterwards" >&2
exit 1
