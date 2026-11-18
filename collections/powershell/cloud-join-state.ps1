$Name = 'Cloud - Azure AD and Intune Join State'
$Description = 'Whether the host is joined to Azure AD or a domain, the tenant, the device identity and MDM enrolment, from dsregcmd.'
$Dependencies = @()
$Tags = @('inventory', 'accounts', 'security')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($l in (dsregcmd /status 2>&1)) { if ($l -match '^\s*(AzureAdJoined|EnterpriseJoined|DomainJoined|DomainName|TenantName|TenantId|DeviceId|WorkplaceJoined|MdmUrl|NgcSet|SSO State|AzureAdPrt|WamDefaultSet)\s*:\s*(.*)$') { [pscustomobject]@{ Setting = $Matches[1]; Value = $Matches[2].Trim() } } }
