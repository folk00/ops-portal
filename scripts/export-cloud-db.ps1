param(
  [string]$ContainerName = "ops-ops-portal-postgres",
  [string]$Database = "ops_ops_portal",
  [string]$User = "postgres",
  [string]$OutputPath = "deploy/cloud/bootstrap/001-ops_ops_portal.sql"
)

$ErrorActionPreference = "Stop"

$target = Join-Path (Get-Location) $OutputPath
$targetDir = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Write-Host "Exporting PostgreSQL state from $ContainerName into $target"
docker exec $ContainerName pg_dump -U $User -d $Database --clean --if-exists --no-owner --no-privileges > $target

if (-not (Test-Path $target)) {
  throw "PostgreSQL dump was not created."
}

$sizeMb = [math]::Round(((Get-Item $target).Length / 1MB), 2)
Write-Host "Done. Dump size: $sizeMb MB"
