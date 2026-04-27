# Architecture

## Goal

Ops Portal is a standalone operational system for migration tracking and team coordination. It replaces multi-sheet Excel trackers with a relational backend and a dense, keyboard-friendly web UI.

## High-Level Shape

- `web/`: Next.js 15 App Router
- `api/`: FastAPI + SQLAlchemy 2.x + Alembic
- `database`: PostgreSQL via Docker Compose
- `scripts/`: operator-friendly local seed and import entry points

## Request Flow

1. User opens the Next.js app.
2. The web app queries FastAPI for dashboard, sites, tracker, team, calendar, imports, and system views.
3. FastAPI reads and writes PostgreSQL entities.
4. Workbook imports pass through the import service, which normalizes rows, stores errors, and preserves raw source data.
5. Once imported, the portal operates from PostgreSQL, not from the workbook file itself.

## UX Inspiration Sources

Inspired by the existing internal reference stack:

- clear application shell with strong top-level areas
- compact card rhythm instead of oversized consumer spacing
- restrained status badges and concise activity surfaces

Inspired by best-in-class operational products:

- Airtable-like dense data navigation
- GitHub Projects / Linear-style saved-view mentality
- Atlassian-style information architecture and page headers
- enterprise execution dashboards focused on risk, ownership, and due work

## Architectural Decisions

### Separate web and API

- Keeps UI delivery independent from data workflows.
- Makes imports, bulk updates, and seed operations testable outside the browser.

### PostgreSQL over workbook-only state

- Supports normalized entities, relationships, and audit-friendly history.
- Handles both structured fields and raw JSONB traceability from imports.
- Keeps the portal usable for day-to-day operations without requiring workbook re-upload for every view.

### Feature-oriented frontend structure

- Shared shell and primitives live under `src/components`.
- Page-specific surfaces live under `src/features`.
- Domain typing and status utilities are centralized.

### System views as first-class architecture

The portal is structured so views like `My Work`, `Blocked`, and `Upcoming Migrations` are native concepts even before custom per-user persistence ships.

## Non-Goals In Phase 1

- authentication / SSO integration
- AI copilots
- workflow engines
- notifications and email
- SharePoint synchronization
