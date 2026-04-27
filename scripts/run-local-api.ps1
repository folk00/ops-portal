$ErrorActionPreference = "Stop"

param(
  [string]$DatabaseUrl = "postgresql+psycopg://postgres:postgres@localhost:5432/ops_ops_portal",
  [string]$WorkbookPath = ""
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "api"
$apiVenvDir = Join-Path $env:LOCALAPPDATA "ops-ops-portal\api-venv"
$pythonExe = Join-Path $apiVenvDir "Scripts\python.exe"

if (!(Test-Path $pythonExe)) {
  throw "API virtual environment not found. Run scripts\setup-local.ps1 first."
}

Push-Location $apiDir
try {
  $env:DATABASE_URL = $DatabaseUrl
  $env:CORS_ORIGINS = '["http://localhost:3000"]'
  if ($WorkbookPath) {
    $env:WORKBOOK_PATH = $WorkbookPath
  }

  & $pythonExe -m alembic upgrade head
  & $pythonExe -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload
}
finally {
  Pop-Location
}
