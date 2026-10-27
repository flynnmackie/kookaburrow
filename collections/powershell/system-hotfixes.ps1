$Name = 'System - Hotfixes'
$Description = 'Installed Windows updates and hotfixes with install dates.'
$Dependencies = @()
$Tags = @('inventory', 'software')

Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object HotFixID, Description, InstalledOn, InstalledBy
