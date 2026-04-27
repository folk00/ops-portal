$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "api"
$webDir = Join-Path $repoRoot "web"
$localToolRoot = Join-Path $env:LOCALAPPDATA "ops-ops-portal"
$apiVenvDir = Join-Path $localToolRoot "api-venv"
$pnpmStoreDir = Join-Path $localToolRoot "pnpm-store"

New-Item -ItemType Directory -Force -Path $localToolRoot | Out-Null
New-Item -ItemType Directory -Force -Path $pnpmStoreDir | Out-Null

Write-Host "Setting up API virtual environment at $apiVenvDir" -ForegroundColor Cyan
if (!(Test-Path $apiVenvDir)) {
  python -m venv $apiVenvDir
}

$pythonExe = Join-Path $apiVenvDir "Scripts\python.exe"
& $pythonExe -m pip install --upgrade pip wheel
& $pythonExe -m pip install -r (Join-Path $apiDir "requirements.txt")

Write-Host "Installing web dependencies with pnpm" -ForegroundColor Cyan
corepack enable
corepack pnpm install --dir $webDir --store-dir $pnpmStoreDir

Write-Host ""
Write-Host "Local setup complete." -ForegroundColor Green
Write-Host "API venv: $apiVenvDir"
Write-Host "PNPM store: $pnpmStoreDir"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. powershell -ExecutionPolicy Bypass -File scripts\\run-local-api.ps1"
Write-Host "  2. powershell -ExecutionPolicy Bypass -File scripts\\run-local-web.ps1"
Write-Host "  3. Or launch both with scripts\\run-local.ps1"
