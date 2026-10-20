NAME='Create local user'
DESCRIPTION='Creates a local account with a home directory and the given password, optionally adding it to a supplementary group such as sudo.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME PASSWORD 'GROUP?')
TAGS=(accounts remediation)

[ -n "$USER_NAME" ] && [ -n "$PASSWORD" ] || { echo "USER_NAME and PASSWORD are required" >&2; exit 2; }
echo "$USER_NAME" | grep -Eq '^[a-z_][a-z0-9_-]{0,31}$' || { echo "USER_NAME must be a valid lowercase login name" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 && { echo "User $USER_NAME already exists" >&2; exit 1; }
useradd -m -s /bin/bash -- "$USER_NAME" || exit 1
echo "$USER_NAME:$PASSWORD" | chpasswd || exit 1
echo "Created user $USER_NAME"
if [ -n "$GROUP" ]; then
  usermod -aG -- "$GROUP" "$USER_NAME" && echo "Added $USER_NAME to $GROUP"
fi
