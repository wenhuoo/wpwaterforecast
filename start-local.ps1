$ErrorActionPreference = 'Stop'
$port = 8768
$url = "http://127.0.0.1:$port/"
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 | Out-Null
} catch {
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $log = Join-Path $env:TEMP 'wpwaterforecast-server.log'
    $errorLog = Join-Path $env:TEMP 'wpwaterforecast-server-error.log'
    Start-Process -FilePath $nodeCommand.Source -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errorLog
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 | Out-Null
            break
        } catch {}
    }
}
Start-Process $url
