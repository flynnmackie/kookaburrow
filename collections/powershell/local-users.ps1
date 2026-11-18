$Name = 'Accounts - Local Users'
$Description = 'Lists local accounts with enabled state, last logon and password age, plus user profiles on disk with last use time.'
$Dependencies = @()
$Tags = @('accounts', 'persistence', 'discovery')
$DiffIgnore = @('LastLogon', 'LastUseTime', 'Loaded')

$ErrorActionPreference = 'SilentlyContinue'

# One row per local account and per user profile on disk (Kind says which), so each column can be compared between runs.
$users = @(Get-LocalUser | Sort-Object Name | ForEach-Object {
    [pscustomobject]@{ Kind = 'User'; Name = $_.Name; SID = "$($_.SID)"; Enabled = $_.Enabled; LastLogon = $_.LastLogon; PasswordLastSet = $_.PasswordLastSet
        PasswordRequired = $_.PasswordRequired; PasswordExpires = $_.PasswordExpires; Description = $_.Description; LocalPath = ''; Loaded = ''; LastUseTime = '' }
})
$profiles = @(Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special } | Sort-Object LocalPath | ForEach-Object {
    [pscustomobject]@{ Kind = 'Profile'; Name = Split-Path $_.LocalPath -Leaf; SID = $_.SID; Enabled = ''; LastLogon = ''; PasswordLastSet = ''
        PasswordRequired = ''; PasswordExpires = ''; Description = ''; LocalPath = $_.LocalPath; Loaded = $_.Loaded; LastUseTime = $_.LastUseTime }
})
$users + $profiles
