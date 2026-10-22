$Name = 'System - Hotfixes'
$Description = 'Installed Windows updates and hotfixes with install dates. A host missing recent patches is a likely entry point; a hotfix installed or removed around an incident may be an attacker or a responder.'
$Dependencies = @()
$Tags = @('inventory', 'software')

Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object HotFixID, Description, InstalledOn, InstalledBy
