$Name = 'Security - UAC and Admin Approval Settings'
$Description = 'User Account Control settings: whether it is on, the prompt behaviour, and remote token filtering that limits local administrators over the network.'
$Dependencies = @()
$Tags = @('security', 'privilege-escalation', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$p = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
foreach ($n in 'EnableLUA', 'ConsentPromptBehaviorAdmin', 'ConsentPromptBehaviorUser', 'FilterAdministratorToken', 'LocalAccountTokenFilterPolicy', 'EnableInstallerDetection', 'PromptOnSecureDesktop') { [pscustomobject]@{ Setting = $n; Value = $p.$n } }
