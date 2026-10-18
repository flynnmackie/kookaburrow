$Name = 'Local users and profiles'
$Description = 'Lists local accounts with enabled state, last logon and password age, plus user profiles on disk with last use time. Helps find new, dormant or unexpected accounts.'
$Dependencies = @()
$Tags = @('accounts', 'persistence', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'

'== Local users =='
Get-LocalUser | Select-Object Name, Enabled, LastLogon, PasswordLastSet, PasswordRequired, PasswordExpires, SID, Description |
    Sort-Object Name | Format-Table -AutoSize -Wrap

'== User profiles on disk =='
Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special } |
    Select-Object LocalPath, SID, Loaded, LastUseTime | Sort-Object LastUseTime -Descending | Format-Table -AutoSize
