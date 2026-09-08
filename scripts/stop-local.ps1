$ErrorActionPreference = 'Stop'
$statePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts/local-processes.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No recorded local servers.'; exit 0 }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
foreach ($entry in @($state.api, $state.expo)) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'node' -and $process.StartTime.ToUniversalTime().Ticks -eq [long]$entry.startedTicks) {
        Stop-Process -Id $process.Id
        Write-Output "Stopped task server $($process.Id)"
    }
}
