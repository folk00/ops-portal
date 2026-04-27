$ErrorActionPreference = "Stop"

param(
  [string]$DatabaseUrl = "postgresql+psycopg://postgres:postgres@localhost:5432/ops_ops_portal",
  [string]$WorkbookPath = "",
  [string]$ApiProxyBaseUrl = "http://127.0.0.1:8010"
)

$apiScript = Join-Path $PSScriptRoot "run-local-api.ps1"
$webScript = Join-Path $PSScriptRoot "run-local-web.ps1"

$apiArgs = @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", $apiScript,
  "-DatabaseUrl", $DatabaseUrl
)

if ($WorkbookPath) {
  $apiArgs += @("-WorkbookPath", $WorkbookPath)
}

$webArgs = @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", $webScript,
  "-ApiProxyBaseUrl", $ApiProxyBaseUrl
)

Start-Process powershell -ArgumentList $apiArgs
Start-Process powershell -ArgumentList $webArgs

Write-Host "Launched API and web in separate PowerShell windows." -ForegroundColor Green
