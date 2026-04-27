param(
  [string]$RegistryImage = "containers.example.com/ops-team/ops-portal",
  [string]$PostgresSourceImage = "postgres:16-alpine",
  [string]$PostgresTag = "postgres-16-alpine",
  [string]$ApiTag = "api-2026-03-27-r2",
  [string]$WebTag = "web-2026-03-27-r3"
)

$ErrorActionPreference = "Stop"

$targets = @(
  @{ Local = $PostgresSourceImage; Remote = "${RegistryImage}:$PostgresTag" },
  @{ Local = "ops-ops-portal-api:latest"; Remote = "${RegistryImage}:$ApiTag" },
  @{ Local = "ops-ops-portal-web:latest"; Remote = "${RegistryImage}:$WebTag" }
)

foreach ($target in $targets) {
  Write-Host "Tagging $($target.Local) -> $($target.Remote)"
  docker tag $target.Local $target.Remote
  Write-Host "Pushing $($target.Remote)"
  docker push $target.Remote
}

Write-Host "Image push complete."
