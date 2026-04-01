# State

## Current Position

Phase: Not started (defining requirements)
Plan: --
Status: Defining requirements
Last activity: 2026-04-01 — Milestone v1.1 started

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01)

**Core value:** Reliable draw lifecycle management
**Current focus:** Reports Dashboard

## Accumulated Context

- /admin/reportes is broken: `formatDrawTime` not imported, causes client-side crash
- Backend `/api/monitor/reporte` exists but only supports single date + single game
- `DrawStats` and `ProviderStats` models have pre-calculated data
- `Ticket.source` distinguishes TAQUILLA_ONLINE / EXTERNAL_API / WEBHOOK_PUSH
- `monitor.service.js` (940 lines) has aggregation logic to extend
- Frontend uses raw fetch() pattern in admin pages (not axios)
