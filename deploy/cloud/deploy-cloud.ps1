param(
  [string]$EnvFile = ".env.cloud"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $root
try {
  if (-not (Test-Path $EnvFile)) {
    throw "Environment file not found: $EnvFile"
  }

  Write-Host "Pulling cloud images..."
  docker compose --env-file $EnvFile -f docker-compose.cloud.yml pull

  Write-Host "Starting cloud stack..."
  docker compose --env-file $EnvFile -f docker-compose.cloud.yml up -d

  Write-Host "Current stack status:"
  docker compose --env-file $EnvFile -f docker-compose.cloud.yml ps
}
finally {
  Pop-Location
}
