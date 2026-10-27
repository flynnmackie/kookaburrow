$Name = 'Accounts - Disable Guest'
$Description = 'Disables the built-in Guest account if it is enabled, and reports the state of the built-in Administrator and DefaultAccount.'
$Dependencies = @()
$Tags = @('accounts', 'hardening', 'persistence')

foreach ($sidEnd in 501, 500, 503) {
    $u = Get-LocalUser | Where-Object { $_.SID.Value -like "*-$sidEnd" }
    if ($u) { Write-Output "$($u.Name) (RID $sidEnd): enabled=$($u.Enabled) passwordLastSet=$($u.PasswordLastSet)" }
}
$g = Get-LocalUser | Where-Object { $_.SID.Value -like '*-501' }
if ($g -and $g.Enabled) { Disable-LocalUser -Name $g.Name; Write-Output "Disabled the Guest account ($($g.Name))." } else { Write-Output 'The Guest account is already disabled.' }
