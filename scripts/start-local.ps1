param([int]$ApiPort = 3000, [int]$ExpoPort = 8081)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $workspace 'artifacts'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
function Find-FreePort([int]$start) {
    for ($candidate = $start; $candidate -lt $start + 30; $candidate++) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
        $listener.Server.ExclusiveAddressUse = $true
        try { $listener.Start(); return $candidate } catch { } finally { $listener.Stop() }
    }
    throw "No free port near $start"
}
$ApiPort = Find-FreePort $ApiPort
$ExpoPort = Find-FreePort $ExpoPort
$node = (Get-Command node.exe).Source
$env:PORT = "$ApiPort"
$env:CORS_ORIGINS = "http://localhost:$ExpoPort"
$api = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'src/main.ts') -WorkingDirectory (Join-Path $workspace 'apps/api') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'api.log') -RedirectStandardError (Join-Path $logs 'api.error.log')
$env:EXPO_PUBLIC_API_URL = "http://localhost:$ApiPort"
$env:CI = '1'
$expo = Start-Process -FilePath $node -ArgumentList @('../../node_modules/expo/bin/cli', 'start', '--web', '--port', "$ExpoPort") -WorkingDirectory (Join-Path $workspace 'apps/mobile') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'expo.log') -RedirectStandardError (Join-Path $logs 'expo.error.log')
@{ api = @{ id = $api.Id; startedTicks = "$($api.StartTime.ToUniversalTime().Ticks)" }; expo = @{ id = $expo.Id; startedTicks = "$($expo.StartTime.ToUniversalTime().Ticks)" }; apiPort = $ApiPort; expoPort = $ExpoPort } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $logs 'local-processes.json')
Write-Output "API: http://localhost:$ApiPort/health"
Write-Output "App: http://localhost:$ExpoPort"
Write-Output "Logs: $logs"
