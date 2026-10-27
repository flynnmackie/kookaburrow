$Name = 'WMI - Persistence'
$Description = 'Lists permanent WMI event filters, consumers and bindings in root\subscription.'
$Dependencies = @()
$Tags = @('persistence', 'wmi', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$ns = 'root\subscription'

'== Event filters (the trigger) =='
$f = Get-CimInstance -Namespace $ns -ClassName __EventFilter
if ($f) { $f | Select-Object Name, Query, QueryLanguage, EventNamespace | Format-List } else { '(none)' }

'== Event consumers (the action) =='
$c = Get-CimInstance -Namespace $ns -ClassName __EventConsumer
if ($c) {
    $c | Select-Object @{ n = 'Type'; e = { $_.CimClass.CimClassName } }, Name, CommandLineTemplate, ExecutablePath, ScriptingEngine, ScriptText, ScriptFileName |
        Format-List
} else { '(none)' }

'== Filter to consumer bindings =='
$b = Get-CimInstance -Namespace $ns -ClassName __FilterToConsumerBinding
if ($b) { $b | Select-Object Filter, Consumer | Format-List } else { '(none)' }
