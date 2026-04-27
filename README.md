# Ops Portal

A reference operations portal for migration / project delivery teams: tracker execution, site ownership, peer review, workbook imports, capacity planning, and calendar context — built as a reference cloud-native stack.

## Stack

- **Frontend** — Next.js 15 (App Router), TypeScript, Tailwind, TanStack Query, shadcn-style UI primitives, AG Grid
- **Backend** — FastAPI, SQLAlchemy, Alembic migrations, openpyxl workbook ingestion
- **Database** — PostgreSQL 16
- **AI** — Pluggable LLM gateway (env-configured base URL + token, OpenAI-compatible)
- **Containers** — Docker / Docker Compose
- **Cloud deploy** — OpenShift manifests included; portable to any Kubernetes platform

## Architecture

```
   ┌────────────────────────┐
   │  Next.js 15 (web/)     │  Tailwind · TanStack Query · AG Grid
   └───────────┬────────────┘
               │
   ┌───────────▼────────────┐
   │  FastAPI (api/)        │  SQLAlchemy · Alembic · openpyxl
   └───────────┬────────────┘
               │
        ┌──────▼──────┐         ┌─────────────────┐
        │ PostgreSQL  │         │  AI Gateway     │
        │   16        │         │  (configurable) │
        └─────────────┘         └─────────────────┘
```

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

Open http://localhost:3000

## Features

- **Workbook import** — upload a multi-sheet Excel workbook and normalize into relational tables (sites, workstreams, tasks, assignments, artifacts, updates)
- **Tracker UI** — AG Grid-driven dashboards with filters, ownership, status updates
- **Migrations** — Alembic-managed schema evolution
- **AI reports** — pluggable LLM backend produces narrative briefings from operational data
- **OpenShift deploy** — manifests for API, web, Postgres, secrets

## Project layout

```
ops-portal/
├── api/              FastAPI service + Alembic migrations
├── web/              Next.js 15 frontend
├── deploy/cloud/     OpenShift manifests, deploy README
├── docs/             Data model, developer manual
├── scripts/          Local dev + image push helpers
└── docker-compose.yml
```

## Configuration

All secrets and environment-specific values are loaded from `.env`. See `.env.example` for the complete list of variables. Required:

- `POSTGRES_*` — database credentials
- `AI_GATEWAY_BASE_URL` — your LLM provider's base URL (OpenAI-compatible)
- `AI_GATEWAY_TOKEN` — bearer token for the LLM gateway

## License

MIT
