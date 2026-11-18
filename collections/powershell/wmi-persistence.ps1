$Name = 'WMI - Persistence'
$Description = 'Lists permanent WMI event filters, consumers and bindings in root\subscription.'
$Dependencies = @()
$Tags = @('persistence', 'wmi', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$ns = 'root\subscription'

# One row per event filter (the trigger), event consumer (the action) and filter-to-consumer binding (Kind says which).
Get-CimInstance -Namespace $ns -ClassName __EventFilter | ForEach-Object {
    [pscustomobject]@{ Kind = 'Filter'; Name = $_.Name; Type = '__EventFilter'; Detail = $_.Query; Extra = "$($_.QueryLanguage) $($_.EventNamespace)".Trim() }
}
Get-CimInstance -Namespace $ns -ClassName __EventConsumer | ForEach-Object {
    $what = @($_.CommandLineTemplate, $_.ExecutablePath, $_.ScriptFileName, $_.ScriptText) | Where-Object { $_ }
    [pscustomobject]@{ Kind = 'Consumer'; Name = $_.Name; Type = $_.CimClass.CimClassName; Detail = ($what -join ' | '); Extra = "$($_.ScriptingEngine)" }
}
Get-CimInstance -Namespace $ns -ClassName __FilterToConsumerBinding | ForEach-Object {
    [pscustomobject]@{ Kind = 'Binding'; Name = "$($_.Filter.Name) -> $($_.Consumer.Name)"; Type = '__FilterToConsumerBinding'; Detail = "$($_.Filter) -> $($_.Consumer)"; Extra = '' }
}
