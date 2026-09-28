param([switch]$Acceptance, [switch]$Closure)
$ErrorActionPreference = 'Stop'
$folder = if ($Closure) { 'closure-20260928' } elseif ($Acceptance) { 'acceptance-20260928' } else { 'complex-adapters-20260928' }
$receiptFile = "C:\dev\agt-erp\CODEX_AUDIT_13_09_2026\IMPLEMENTATION\F04\$folder\APP_PROCESS.json"
$receipt = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json
if ($receipt.port -ne 16404 -or $receipt.target -notlike 'C:\dev\agt-erp\CODEX_AUDIT_13_09_2026\IMPLEMENTATION\F04\build-*') { throw 'Unexpected process receipt' }
$localAppPid = [int]$receipt.pid
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $localAppPid"
if ($process) {
  if ($process.Name -ne 'node.exe' -or $process.CommandLine -notlike '*agt-erp*node_modules*next*start*--hostname*127.0.0.1*--port*16404*') { throw 'Process identity mismatch' }
  Stop-Process -Id $localAppPid
}
Write-Output "Stopped verified F04 loopback app PID $localAppPid; no other process was targeted."
