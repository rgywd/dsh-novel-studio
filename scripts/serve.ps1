param([switch]$Dsh,[switch]$Restart)
$ErrorActionPreference='Stop'
$studioRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $studioRoot
$studioPort=if($Dsh){4318}else{4317}
$studioName=if($Dsh){'dsh-novel'}else{'standalone'}
$studioPidFile=Join-Path $studioRoot ".local/$studioName-process.json"
$listener=Get-NetTCPConnection -LocalPort $studioPort -State Listen -ErrorAction SilentlyContinue
if($listener){
  $ownedProcess=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  $record=if(Test-Path -LiteralPath $studioPidFile){Get-Content -LiteralPath $studioPidFile -Raw | ConvertFrom-Json}else{$null}
  $matchesRecord=$record -and $record.pid -eq $ownedProcess.ProcessId -and $record.root -eq $studioRoot -and $record.started -eq $ownedProcess.CreationDate.ToUniversalTime().ToString('o')
  $matchesStudio=if($Dsh){$ownedProcess.CommandLine -like '*--profile novel-studio*'}else{$matchesRecord -or $ownedProcess.CommandLine.Contains((Join-Path $studioRoot 'dist/server.js'))}
  if(-not $matchesStudio){throw "Port $studioPort belongs to an unrelated process; choose another port manually."}
  if(-not $Restart){Write-Output "Already running: http://127.0.0.1:$studioPort/novel-studio/";exit 0}
  # Only this workspace's development process is stopped. Persistent task recovery retains checkpoints.
  Stop-Process -Id $ownedProcess.ProcessId
}
New-Item -ItemType Directory -Path .local -Force | Out-Null
$savedDb=$env:NOVEL_STUDIO_DB
$savedTelemetry=$env:DSH_TELEMETRY_DISABLED
try {
  if($Dsh){
    $dshBin=Join-Path ((npm root -g).Trim()) '@deepseek-ai/dsh/lib/bin.js'
    if(-not (Test-Path -LiteralPath $dshBin)){throw 'Install DSH and initialize the novel-studio profile as described in README.md.'}
    $env:NOVEL_STUDIO_DB=Join-Path $studioRoot '.local/dsh-novel-studio.sqlite'
    $env:DSH_TELEMETRY_DISABLED='1'
    $studioArgs=@('"'+$dshBin+'"','--profile','novel-studio','--no-open','--host','127.0.0.1','--port',"$studioPort")
  }else{
    $env:NOVEL_STUDIO_DB=Join-Path $studioRoot '.local/novel-studio.sqlite'
    $studioArgs=@('"'+(Join-Path $studioRoot 'dist/server.js')+'"')
  }
  $started=Start-Process -FilePath (Get-Command node).Source -ArgumentList $studioArgs -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput ".local/$studioName.log" -RedirectStandardError ".local/$studioName-error.log" -PassThru
  $createdProcess=Get-CimInstance Win32_Process -Filter "ProcessId = $($started.Id)"
  @{pid=$started.Id;root=$studioRoot;started=$createdProcess.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $studioPidFile -Encoding utf8
  for($attempt=0;$attempt -lt 120;$attempt++){
    Start-Sleep -Milliseconds 250
    try{$health=Invoke-RestMethod "http://127.0.0.1:$studioPort/api/novel-studio/health" -TimeoutSec 1;break}catch{if($started.HasExited){throw 'Studio exited. Inspect the local error log; never share unredacted DSH logs.'}}
  }
  if(-not $health){throw 'Startup did not become healthy within 30 seconds. Inspect the local error log.'}
  [pscustomobject]@{Pid=$started.Id;Url="http://127.0.0.1:$studioPort/novel-studio/";Model=$health.dsh.name}
}finally{$env:NOVEL_STUDIO_DB=$savedDb;$env:DSH_TELEMETRY_DISABLED=$savedTelemetry}
