$ErrorActionPreference='Stop'
$statePath=Join-Path $PSScriptRoot 'runtime\server.json'
if(!(Test-Path -LiteralPath $statePath)){Write-Output 'No local workbench server record.';exit 0}
$saved=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expected=Join-Path $PSScriptRoot 'server.mjs'
$candidate=Get-CimInstance Win32_Process -Filter "ProcessId = $($saved.pid)" -ErrorAction SilentlyContinue
if(!$candidate){Write-Output 'Workbench is already stopped.';exit 0}
if($candidate.Name -ne 'node.exe' -or $saved.project -ne $PSScriptRoot -or !$candidate.CommandLine -or !$candidate.CommandLine.Contains(('"'+$expected+'"'))){throw 'PID no longer identifies this workbench. No process was stopped.'}
Stop-Process -Id $saved.pid
Write-Output 'Local workbench stopped. Other applications were untouched.'
