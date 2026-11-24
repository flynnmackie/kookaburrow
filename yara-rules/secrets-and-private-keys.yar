// Name: Files - Secrets, private keys and credentials
// Description: Private keys, cloud access keys and passwords in clear text.

rule KB_Private_Key_File
{
    meta:
        description = "A private key in PEM or OpenSSH format"
    strings:
        $rsa = "-----BEGIN RSA PRIVATE KEY-----" ascii
        $ec = "-----BEGIN EC PRIVATE KEY-----" ascii
        $dsa = "-----BEGIN DSA PRIVATE KEY-----" ascii
        $pkcs8 = "-----BEGIN PRIVATE KEY-----" ascii
        $enc = "-----BEGIN ENCRYPTED PRIVATE KEY-----" ascii
        $ssh = "-----BEGIN OPENSSH PRIVATE KEY-----" ascii
        $pgp = "-----BEGIN PGP PRIVATE KEY BLOCK-----" ascii
    condition:
        any of them
}

rule KB_Cloud_Access_Keys
{
    meta:
        description = "An AWS access key id, a Google service account key, or an Azure storage connection string"
    strings:
        $aws = /\bAKIA[0-9A-Z]{16}\b/
        $aws_secret = /aws_secret_access_key\s*=\s*[A-Za-z0-9\/+=]{40}/ nocase
        $gcp = "\"type\": \"service_account\"" ascii
        $azure = /AccountKey=[A-Za-z0-9\/+=]{60,}/
    condition:
        any of them
}

rule KB_Clear_Text_Passwords
{
    meta:
        description = "A configuration or script that stores a password in clear text (password=, pwd=, a connection string, or a net use / sshpass command)"
    strings:
        $p1 = /(^|[\r\n])\s*(db_|admin_)?pass(word)?\s*[=:]\s*[^\s"'#]{4,}/ nocase
        $p2 = /Password\s*=\s*[^;"\s]{3,};/ nocase
        $p3 = /net use \S+ \/user:\S+ \S+/ nocase
        $p4 = /sshpass -p\s*\S+/
        $p5 = /ConvertTo-SecureString\s+['"][^'"]{4,}['"]\s+-AsPlainText/ nocase
    condition:
        filesize < 5MB and any of them
}
