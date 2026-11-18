NAME='Accounts - Password Hash Algorithms and State'
DESCRIPTION='The hash type of every account password in /etc/shadow (yescrypt, SHA-512, SHA-256, MD5, DES), and whether it is locked, empty or has no expiry. Weak hashes and empty passwords are findings. Needs root.'
DEPENDENCIES=()
TAGS=(accounts security)

printf 'User\tAlgorithm\tState\tLastChange\tMaxDays\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
$S awk -F: 'BEGIN{OFS="\t"} {h=$2; a="unknown"; st="password set"; if (h=="") {st="EMPTY PASSWORD"; a="none"} else if (h ~ /^[!*]/) {st="locked or no password"; a="n/a"} else if (h ~ /^\$y\$/) a="yescrypt"; else if (h ~ /^\$6\$/) a="SHA-512"; else if (h ~ /^\$5\$/) a="SHA-256"; else if (h ~ /^\$2[abxy]\$/) a="bcrypt"; else if (h ~ /^\$1\$/) {a="MD5 (weak)"} else if (length(h)==13) a="DES (weak)"; lc=($3!="" ? strftime("%Y-%m-%d", $3*86400) : ""); print $1,a,st,lc,$5}' /etc/shadow 2>/dev/null || printf '(/etc/shadow is not readable: run as root)\t\t\t\t\n'
exit 0
