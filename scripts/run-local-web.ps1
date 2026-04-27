$ErrorActionPreference = "Stop"

param(
  [string]$ApiProxyBaseUrl = "http://127.0.0.1:8010"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"
$pnpmStoreDir = Join-Path $env:LOCALAPPDATA "ops-ops-portal\pnpm-store"

Push-Location $webDir
try {
  $env:API_PROXY_BASE_URL = $ApiProxyBaseUrl
  $env:NEXT_PUBLIC_API_BASE_URL = ""
  corepack pnpm dev --store-dir $pnpmStoreDir
}
finally {
  Pop-Location
}
