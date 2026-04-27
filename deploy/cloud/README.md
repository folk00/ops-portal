## Cloud Bundle

This folder is the cloud handoff bundle for Docker hosts and CAE / OpenShift deployment.

## Included Assets

- `docker-compose.cloud.yml`: three-container runtime for `web`, `api`, and `postgres`
- `.env.cloud`: current image tags and cloud defaults
- `.env.cloud.example`: template version for new environments
- `bootstrap/001-ops_ops_portal.sql`: first-boot PostgreSQL restore payload
- `openshift/`: OpenShift and CAE deployment manifests
- `deploy-cloud.ps1` / `deploy-cloud.sh`: one-command Docker-host deployment helpers

## Current Image Set

- `containers.example.com/ops-team/ops-portal:postgres-16-alpine`
- `containers.example.com/ops-team/ops-portal:api-2026-03-27-r2`
- `containers.example.com/ops-team/ops-portal:web-2026-03-27-r3`

## Docker Host Flow

```mermaid
flowchart TD
    Registry[containers.example.com] --> Host[Target host]
    Host --> Compose[docker compose]
    Compose --> Web[web]
    Compose --> API[api]
    Compose --> PG[postgres]
    PG --> Volume[(postgres_data)]
    PG --> Bootstrap[001-ops_ops_portal.sql]
```

### First Deploy

1. Copy `deploy/cloud/` to the target host.
2. Login to `containers.example.com`.
3. Run:

```powershell
pwsh ./deploy-cloud.ps1
```

Or on Linux:

```bash
chmod +x deploy-cloud.sh
./deploy-cloud.sh
```

### Important Runtime Notes

- The SQL bootstrap file is only used if the Postgres volume is empty.
- Keep the same Docker volume if you want runtime changes to survive redeploys.
- Delete the old volume only when you explicitly want a fresh restore.

## CAE / OpenShift Flow

```mermaid
flowchart TB
    Browser --> Route[Route + SSOAuthConfig]
    Route --> WebSvc[ops-portal service]
    WebSvc --> WebDeploy[ops-portal deployment]
    WebDeploy --> ApiAlias[api service alias]
    ApiAlias --> ApiDeploy[ops-portalapi deployment]
    ApiDeploy --> PgSvc[ops-postgres service]
    PgSvc --> PgDeploy[ops-postgres deployment]
    PgDeploy --> PVC[(20Gi RWO PVC)]
```

### Minimum Objects

- `ops-portal` deployment, service, route, and SSO auth config
- `ops-portalapi` deployment and service
- `api` service alias that points at `ops-portalapi`
- `ops-postgres` deployment and service
- `PersistentVolumeClaim` for Postgres
- `ops-portal-ai_gw` Secret for the AI Playground token

### Critical Env Values

#### Web

```text
API_PROXY_BASE_URL=http://api.opsportal.svc.cluster.local:8010
NEXT_PUBLIC_API_BASE_URL=
```

#### API

```text
DATABASE_URL=postgresql+psycopg://postgres:opsPortalCloud2026!@ops-postgres:5432/ops_ops_portal
ALLOW_DEMO_FALLBACK=false
AI_GATEWAY_BASE_URL=https://ai-gateway.example.com
AI_DEFAULT_MODEL=gpt-4.1-mini
```

Provide the token separately through a Secret:

```text
Secret name: ops-portal-ai_gw
Secret key: ai-gateway-token
```

### Apply The AIGW Token Secret

On a machine that has cluster access:

```powershell
pwsh ./openshift/apply-ai-secret.ps1 -Token "<paste-jwt-here>"
```

Or on Linux:

```bash
./openshift/apply-ai-secret.sh "<paste-jwt-here>"
```

#### Postgres

```text
POSTGRES_DB=ops_ops_portal
POSTGRES_USER=postgres
POSTGRES_PASSWORD=opsPortalCloud2026!
PGDATA=/var/lib/postgresql/data/pgdata
```

### Migrations

Inside the `api` pod:

```bash
cd /app/api
alembic upgrade head
```

Expected result:

```text
20260317_0002 (head)
```

## Persistence Guidance

For CAE, allocate:

- `RWO`: `20Gi`

And mount it through a PVC to the Postgres deployment. Do not rely on `emptyDir` for long-lived environments.

## Troubleshooting

### Web opens but no tracker data

Check:

- `ops-portalapi` is healthy
- `api` alias service exists
- `API_PROXY_BASE_URL` points at `api.opsportal.svc.cluster.local:8010`

### Import returns 500

Check:

- `ops-portalapi` logs
- Alembic schema is at head
- workbook parser is not hitting an unmapped edge case

### Route says missing SAC

Apply the matching `SSOAuthConfig` files:

- `openshift/ops-portal-ssoauthconfig.yaml`
- `openshift/ops-portalapi-ssoauthconfig.yaml`

Their `metadata.name` values already match the explicit route hosts in:

- `openshift/ops-portal-web.yaml`
- `openshift/ops-portalapi-route.yaml`

### Route says application not available

Check:

- `ops-portal` pod is healthy
- `ops-portal` service target port is `3000`
- route points to the correct service port
