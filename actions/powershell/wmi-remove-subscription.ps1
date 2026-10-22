$Name = 'WMI - Remove Subscription'
$Description = 'Removes a permanent WMI event subscription (the filter, the consumer and the binding between them) by name, the way malware keeps fileless persistence. SubscriptionName is the name shown by WMI - Persistence. Everything removed is reported with its command or script so you can record it first.'
$Dependencies = @()
$Parameters = @('SubscriptionName')
$Tags = @('wmi', 'persistence', 'remediation')

if (-not $SubscriptionName) { throw 'SubscriptionName is required' }
$ns = 'root\subscription'
$n = 0
foreach ($b in Get-CimInstance -Namespace $ns -ClassName __FilterToConsumerBinding) {
    if ("$($b.Filter)$($b.Consumer)" -like "*$SubscriptionName*") { Write-Output "Removing binding: $($b.Filter.Name) -> $($b.Consumer.Name)"; Remove-CimInstance -InputObject $b; $n++ }
}
foreach ($c in Get-CimInstance -Namespace $ns -ClassName __EventConsumer | Where-Object { $_.Name -like "*$SubscriptionName*" }) {
    Write-Output "Removing consumer $($c.CimClass.CimClassName) $($c.Name): $($c.CommandLineTemplate)$($c.ScriptText)"; Remove-CimInstance -InputObject $c; $n++
}
foreach ($f in Get-CimInstance -Namespace $ns -ClassName __EventFilter | Where-Object { $_.Name -like "*$SubscriptionName*" }) {
    Write-Output "Removing filter $($f.Name): $($f.Query)"; Remove-CimInstance -InputObject $f; $n++
}
if (-not $n) { Write-Output "No WMI subscription matched $SubscriptionName." }
