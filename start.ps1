param([int]$Port=18873)
$ErrorActionPreference='Stop'
$projectRoot=$PSScriptRoot
$server=Join-Path $projectRoot 'server.mjs'
$runtime=Join-Path $projectRoot 'runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$statePath=Join-Path $runtime 'server.json'
if(Test-Path -LiteralPath $statePath){
  $saved=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $existing=Get-CimInstance Win32_Process -Filter "ProcessId = $($saved.pid)" -ErrorAction SilentlyContinue
  if($existing -and $existing.Name -eq 'node.exe' -and $saved.project -eq $projectRoot -and $existing.CommandLine -and $existing.CommandLine.Contains(('"'+$server+'"'))){Write-Output "Already running: $($saved.url)";exit 0}
}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$previousPort=$env:PORTRAIT_WEB_PORT
try{
  $env:PORTRAIT_WEB_PORT=[string]$Port
  $child=Start-Process -FilePath $node -ArgumentList @(('"'+$server+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'stdout.log') -RedirectStandardError (Join-Path $runtime 'stderr.log')
  Start-Sleep -Milliseconds 700
  if($child.HasExited){throw ('Local server failed: '+(Get-Content -LiteralPath (Join-Path $runtime 'stderr.log') -Raw))}
  Write-Output "http://127.0.0.1:$Port"
  Write-Output "Stop: powershell -ExecutionPolicy Bypass -File `"$(Join-Path $projectRoot 'stop.ps1')`""
}finally{if($null -eq $previousPort){Remove-Item Env:PORTRAIT_WEB_PORT -ErrorAction SilentlyContinue}else{$env:PORTRAIT_WEB_PORT=$previousPort}}
