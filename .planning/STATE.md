---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Capa Financiera y Contabilidad
status: complete
stopped_at: Milestone v1.3 COMPLETE on local mirror — Phase 14 finished; production rollout deferred per 14-DEPLOY.md
last_updated: "2026-05-15T20:30:00.000Z"
last_activity: 2026-05-15 -- Phase 14 Plan 4 SUMMARY committed (frontend P&L page + DrawDetailModal Financiero + 14-DEPLOY.md); milestone v1.3 closed on local mirror
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-15)

**Core value:** Reliable draw lifecycle management
**Current focus:** Milestone v1.3 — Capa Financiera y Contabilidad — COMPLETE (local)

## Current Position

Milestone: v1.3 — Capa Financiera y Contabilidad — **COMPLETE on local mirror**
Phase: 14 (report-refactor-weekly-pnl) — COMPLETE
Plan: 4 of 4 — complete
Status: All four Phase 14 plans landed locally (14-01 backfill + 14-02 service refactor + 14-03 weekly P&L backend + 14-04 frontend P&L page + DrawDetailModal extension + 14-DEPLOY.md). Build green (`next build` PASS). Backend test suite green (56/56 across Phase 12/13/14 cumulative). Production rollout is the next operator-owned step — runbook is `.planning/phases/14-report-refactor-weekly-pnl/14-DEPLOY.md` (LOCAL-ONLY this session; no `ssh 94`, no `pm2 restart`, no `git push` executed).
Last activity: 2026-05-15 -- Phase 14 Plan 4 SUMMARY committed; milestone v1.3 closed on local mirror

```
Progress: [████████████████████] 100% (4/4 phases of v1.3 done — Phases 11, 12, 13, 14)
```

## Performance Metrics

**Velocity:**

- Total plans completed: 18 (v1.0: 10, v1.1: 6, v1.2: 2 adapter plans done)
- Average duration: unknown
- Total execution time: unknown

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 1. Schema Foundation | 2 | Complete |
| 2. Webhook Backend Pipeline | 3 | Complete |
| 3. Admin Provider Management | 3 | Complete |
| 4. Webhook Log Viewer | 2 | Complete |
| 5. Backend Reports Foundation | 2 | Complete |
| 6. Reports Dashboard Frontend | 2 | Complete |
| 7. PDF Export + Production Deploy | 2 | Complete |
| 8. Adapter Implementation | 2 | Complete |
| 9. Response Contract | TBD | Not started |
| 10. Production Deployment | TBD | Not started |
| 11. DrawFinancial Foundation | 4 | Complete (local; deploy pending per 11-DEPLOY.md) |
| 12. Provider Commission Engine | 4 | Complete (local; deploy pending per 12-DEPLOY.md) |
| 13. Exchange Rate + Accounting Ledger | 4 | Complete (local; deploy pending per 13-DEPLOY.md) |
| 14. Report Refactor + Weekly P&L | 4 | Planned (awaiting execution) |

## Accumulated Context

### Decisions

- Virtuales provider payload analyzed: `{ ticketId, game, plays: [{ drawSlotId, amount, animal, number }], timestamp }`
- drawSlotId is a fixed numeric slot (1-48) mapping to gameId + drawTime; comes as string, needs parseInt
- Slots config created: `webhooks/adapters/virtuales.slots.js` (48 slots across 4 games x 12 hours)
- Adapter skeleton created: `webhooks/adapters/virtuales.adapter.draft.js` (rename to .js to activate)
- webhook.service.js updated: normalize() now supports async adapters (await added)
- No commercial network needed for webhook providers — Ticket.userId stays null, providerData stores original payload
- Ticket.source = 'WEBHOOK_PUSH' distinguishes webhook tickets from SRQ (EXTERNAL_API) and online (TAQUILLA_ONLINE)
- Reports already filter by source and apiSystemId — provider tickets naturally grouped without extra infrastructure
- Provider webhook URL: `https://toteback.atilax.io/api/webhooks/virtuales` (frontend URL fixed to use API_URL instead of window.location.origin)
- GameItem lookup is by `number` field (not `animal` name) — `animal` is optional cross-validation only
- RESP-03 (discovery mode unchanged) is essentially already done — just needs verification during Phase 9
- **v1.3 scope confirmed**: TIERED commission formula IS in v1.3 (requires ProviderCommissionTier table)
- **v1.3 commission backfill date**: 2026-04-17 is the explicit go-live constant; no ledger rows written for draws before this date
- **v1.3 decimal precision**: NUMERIC(18,8) for ProviderCommissionLedger.amount; NUMERIC(15,4) for config rates; NUMERIC(12,2) for DrawFinancial totals
- **v1.3 parallel execution**: Phase 13 schema can start after Phase 12 schema migration lands; Phase 13 does not require Phase 12 workers/UI
- **v1.3 receipt storage**: backend/storage/receipts/YYYY/MM/{uuid}.ext — outside web root, admin-auth-gated serve route
- **v1.3 REPORT_USE_MATERIALIZED gate**: flag stays false until (a) backfill complete, (b) 2 weeks live data, (c) 10-draw spot-check passes

### Phase 12 — Provider Commission Engine (COMPLETE locally, 2026-05-15)

- Local backfill outcome: 132 candidate draws (DRAWN + prizesProcessed + drawnAt >= 2026-04-17), 185 (provider, draw) pairs, **0 ledger rows written** because the prod-mirror DB has zero `ProviderCommissionConfig` rows. All 185 pairs went through the D-01 silent-skip path with `logger.warn('[commission] no_config_at_drawnAt', ...)` and no ledger row. This is the correct behavior — when production is configured with at least one effective commission config per provider, the same script will write real ledger rows.
- F-17 invariant verified: `SELECT MIN(d."drawnAt") FROM "ProviderCommissionLedger" cl JOIN "Draw" d ON d.id = cl."drawId"` returns empty (zero rows), so the GO_LIVE invariant trivially holds. Defense-in-depth check inside the backfill script passed (zero pre-GO_LIVE ledger rows exist).
- (provider, week) pairs silently skipped: every (apiSystem, draw) combination in the 132 candidate set, because no provider has a ProviderCommissionConfig in the local DB. Detailed list is in the dry-run reconciliation CSV at `backend/storage/backfill-reports/provider-commission-recon-2026-05-15T23-03-59-842Z.csv`.
- Frontend lint: project has no ESLint config — `npm run lint` requires interactive setup. Documented as a deviation in Plan 12-04 SUMMARY; substitute verification via grep gates + visual code review passed.
- Operator notes: no production execution this session. Next step is the 12-DEPLOY.md runbook (LOCAL-ONLY → VPS 94 supervised session). Production status caveat (`status IN ('DRAWN', 'PUBLISHED')`) must be reviewed before `--confirm` against production.

### Pending Todos

- Production deploy of Phase 11 + Phase 12 (see 11-DEPLOY.md + 12-DEPLOY.md, supervised operator session)
- Seed at least one `ProviderCommissionConfig` per active provider before the first Monday 06:00 VE settlement snapshot (otherwise the snapshot worker produces empty settlements for those providers)
- Initialize Next.js ESLint config (one-off — accept the "Strict" preset prompt and commit `.eslintrc.json`)

### Phase 13 — Exchange Rate + Accounting Ledger (COMPLETE locally, 2026-05-15)

- 4 plans landed: 13-01 (schema + 9 seeded categories), 13-02 (controllers + services + NoRateForDateError), 13-03 (15-route /api/contabilidad + multer + file-type + P-1 static-storage guard + 6-assertion integration test), 13-04 (admin UI for /admin/contabilidad + 13-DEPLOY.md).
- Frontend: 4 sub-tabs (Asientos, Tasas, Categorías, Pagos) with F-6 frontend block, F-7 USD historical eq display, D-06 reversal modal, auth-gated receipt upload/download via FormData multipart and fetch+blob (P-1).
- Integration test re-run after Plan 13-04 frontend changes: 6/6 pass in 0.42s. No regressions.
- next build: all 7 new Phase 13 routes compile cleanly.
- LOCAL ONLY — no `ssh 94`, no `git push`, no `pm2 restart`. 13-DEPLOY.md is the deferred production runbook.

### Blockers/Concerns

None for Phase 13. Phase 14 (Report Refactor + Weekly P&L) plans are authored and ready to execute.

## Session Continuity

Last session: 2026-05-15T19:45:00Z
Stopped at: Phase 13 — Plan 4 complete (SUMMARY written, 4 commits reachable, frontend UI + DEPLOY runbook landed). Next: execute Phase 14 plans.
Resume file: 13-DEPLOY.md (production runbook, NOT yet executed) + .planning/phases/14-*/14-01-PLAN.md (next execution target)
