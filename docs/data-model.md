# Data Model

## Core Principles

- Sites are the operational anchor.
- Workstreams group execution by discipline.
- Tasks represent actionable work and preserve workbook source traceability.
- Migration windows and calls model schedule pressure.
- PTO and assignments power workload awareness.
- Imports and import errors provide auditability.

## Main Entities

### Users

People who own work, provide updates, appear in calls, or take PTO.

### Workstreams

Examples: SD-WAN, SDA, Wireless, Cutover, Validation, Program.

### Sites

Each site carries identity, geography, wave, and notes. Sites are linked to tasks, migration windows, artifacts, and calls.

### Migration Windows

Scheduled change windows optionally scoped to a specific workstream.

### Tasks

The main tracker entity. Tasks support:

- normalized status
- normalized priority
- ownership
- due date
- import traceability
- linkage to site, workstream, and migration window

### Task Updates

Comments and operational timeline items attached to tasks.

### Assignments

Flexible ownership/allocation records to support site-based or task-based planning.

### PTO

Out-of-office windows that affect capacity planning.

### Calls

Planning and execution meetings, optionally linked to a site.

### Artifacts

Links to reports, plans, change records, runbooks, or generated deliverables.

### Imports and Import Errors

A record of workbook ingestion events plus row-level validation outcomes.

## Status Normalization

Messy incoming values are normalized into:

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `NA`

The UI then maps those values to consistent labels and badges.

## Why JSONB Matters

`raw_import_json` on tasks and `raw_row_json` on import errors preserve workbook provenance without sacrificing relational structure.

