param(
  [string]$ContainerName = "ops-ops-portal-postgres",
  [string]$Database = "ops_ops_portal",
  [string]$User = "postgres",
  [string]$InputPath = "deploy/cloud/bootstrap/001-ops_ops_portal.sql"
)

$ErrorActionPreference = "Stop"

$source = Join-Path (Get-Location) $InputPath
if (-not (Test-Path $source)) {
  throw "Dump file not found: $source"
}

Write-Host "Restoring $source into $ContainerName/$Database"
Get-Content $source | docker exec -i $ContainerName psql -U $User -d $Database
Write-Host "Restore complete."
