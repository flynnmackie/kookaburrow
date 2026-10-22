$Name = 'Security - Credential Protection'
$Description = 'Settings that decide how easily credentials can be stolen from this host: LSA protection (RunAsPPL), Credential Guard and virtualization-based security, WDigest clear-text caching, the number of cached domain logons, LM hash storage, NTLM level, restricted admin mode and whether SMB signing is required. Shows hosts where tools like Mimikatz would succeed.'
$Dependencies = @()
$Tags = @('inventory', 'privilege-escalation', 'defense-evasion', 'security')

$ErrorActionPreference = 'SilentlyContinue'
function V($path, $name) { (Get-ItemProperty -LiteralPath $path -Name $name).$name }
function Row($setting, $value, $meaning) { [pscustomobject]@{ Setting = $setting; Value = $(if ($null -eq $value) { '(not set)' } else { $value }); Meaning = $meaning } }
Row 'LSA protection (RunAsPPL)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RunAsPPL') '1 or 2 = lsass is a protected process'
Row 'Credential Guard (LsaCfgFlags)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'LsaCfgFlags') '1 or 2 = Credential Guard configured'
$dg = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard
Row 'Virtualization-based security running' ($dg.SecurityServicesRunning -join ',') '1 = Credential Guard running, 2 = HVCI running'
Row 'WDigest clear-text passwords (UseLogonCredential)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest' 'UseLogonCredential') '1 = passwords kept in memory in clear text'
Row 'Cached domain logons' (V 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' 'CachedLogonsCount') 'number of cached domain credentials (default 10)'
Row 'LM hash storage disabled (NoLMHash)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'NoLMHash') '1 = LM hashes not stored'
Row 'NTLM compatibility level' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'LmCompatibilityLevel') '5 = NTLMv2 only, refuse LM and NTLM'
Row 'Restricted admin mode (DisableRestrictedAdmin)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'DisableRestrictedAdmin') '0 = restricted admin enabled for RDP'
Row 'Anonymous enumeration (RestrictAnonymous)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RestrictAnonymous') '1 or higher = anonymous access restricted'
Row 'SMB server signing required' (Get-SmbServerConfiguration).RequireSecuritySignature 'True = signing required'
Row 'SMB client signing required' (Get-SmbClientConfiguration).RequireSecuritySignature 'True = signing required'
Row 'UAC enabled (EnableLUA)' (V 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'EnableLUA') '1 = UAC on'
Row 'UAC remote filter (LocalAccountTokenFilterPolicy)' (V 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'LocalAccountTokenFilterPolicy') '1 = local admin accounts get full rights remotely (pass-the-hash risk)'
