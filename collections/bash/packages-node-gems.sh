NAME='Packages - Node, Ruby, Go and Rust Tools'
DESCRIPTION='Globally installed npm packages, Ruby gems, Go and cargo binaries. These installs are outside the system package manager.'
DEPENDENCIES=()
TAGS=(inventory packages)

printf 'Kind\tName\n'
command -v npm >/dev/null 2>&1 && npm ls -g --depth=0 --parseable 2>/dev/null </dev/null | tail -n +2 | while IFS= read -r l; do printf 'npm\t%s\n' "$(basename "$l")"; done
command -v gem >/dev/null 2>&1 && gem list --local 2>/dev/null </dev/null | head -n 200 | while IFS= read -r l; do printf 'gem\t%s\n' "$l"; done
for d in /root/go/bin /home/*/go/bin /root/.cargo/bin /home/*/.cargo/bin /usr/local/go/bin; do [ -d "$d" ] && for f in "$d"/*; do [ -f "$f" ] && printf 'binary\t%s\n' "$f"; done; done
exit 0
