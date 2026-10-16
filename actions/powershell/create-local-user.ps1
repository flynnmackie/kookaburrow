$Name = 'Create local user'
$Description = 'Creates a local account with the given password, optionally adding it to a local group such as Administrators.'
$Dependencies = @()
$Parameters = @('UserName', 'Password', 'Group')
$Tags = @('accounts', 'remediation')

if (-not $UserName -or -not $Password) { throw 'UserName and Password are required' }
if (Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue) { throw "User '$UserName' already exists" }
$secure = ConvertTo-SecureString $Password -AsPlainText -Force
New-LocalUser -Name $UserName -Password $secure -PasswordNeverExpires:$false -ErrorAction Stop | Out-Null
Write-Output "Created local user '$UserName'"
if ($Group) {
    Add-LocalGroupMember -Group $Group -Member $UserName -ErrorAction Stop
    Write-Output "Added '$UserName' to '$Group'"
}
