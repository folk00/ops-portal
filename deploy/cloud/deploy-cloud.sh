#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-.env.cloud}"

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

echo "Pulling cloud images..."
docker compose --env-file "$ENV_FILE" -f docker-compose.cloud.yml pull

echo "Starting cloud stack..."
docker compose --env-file "$ENV_FILE" -f docker-compose.cloud.yml up -d

echo "Current stack status:"
docker compose --env-file "$ENV_FILE" -f docker-compose.cloud.yml ps
