NAME='Accounts - Login Policy and PAM'
DESCRIPTION='Password and login policy from login.defs and the PAM stack: password aging, hashing, lockout and unusual PAM modules. Weak policy and extra PAM modules matter.'
DEPENDENCIES=()
TAGS=(accounts security persistence)

printf 'Source\tSetting\n'
grep -E '^(PASS_MAX_DAYS|PASS_MIN_DAYS|PASS_MIN_LEN|PASS_WARN_AGE|ENCRYPT_METHOD|UMASK|LOGIN_RETRIES|SHA_CRYPT_MIN_ROUNDS)' /etc/login.defs 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'login.defs\t%s\n' "$l"; done
for f in /etc/pam.d/common-auth /etc/pam.d/common-password /etc/pam.d/system-auth /etc/pam.d/password-auth /etc/pam.d/sshd /etc/pam.d/su /etc/pam.d/sudo; do [ -r "$f" ] && grep -vE '^\s*(#|$)' "$f" 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
exit 0
