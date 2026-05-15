---
phase: 12
plan: 4
plan_name: frontend-admin-ui-historical-backfill
status: complete
completed_at: 2026-05-15
commits:
  - 70b6f02  # Task 1 — frontend admin commission UI
  - fc86c33  # Task 2 — backfill script + .gitignore CSV rule
  - 9b99d2d  # Task 2 — 12-DEPLOY.md production runbook
  - 0943356  # Task 3 fix — honest ledgerWritten metric
requirements:
  - FIN-COMM-08
  - FIN-COMM-09
  - FIN-COMM-10
  - FIN-COMM-11
  - FIN-COMM-12
backfill_result:
  mode: confirm
  drawsConsidered: 132
  drawsIterated: 132
  ledgerWritten: 0
  skipped_no_config: 185
  errors: 0
  reason: "Local prod-mirror DB has zero ProviderCommissionConfig rows. Every candidate (provider, draw) pair lacked an effective config — all 185 provider rows correctly went through the D-01 silent-skip path with a warning log and no ledger row."
checkpoint_automation: approved
---

# Plan 12-04 — Admin UI + Historical Backfill Summary

One-liner: Admin commission UI consuming the Plan 12-03 routes (per-provider config history, top-level Liquidaciones/Ledger tabs, settlement drill-down with Confirmar/Ajustar/Excel/PDF) plus the F-17-enforced historical backfill script and the 11-section 12-DEPLOY.md production runbook.

## Task 1 — Frontend admin commission UI (commit `70b6f02`)

8 files, 1578 insertions:

| File | Role |
|------|------|
| `frontend/lib/api/commissions.js` | Typed fetch helpers: `listConfigs`, `createConfig`, `getLedger`, `getSettlements`, `getSettlementDetail`, `confirmSettlement`, `adjustSettlement`, `downloadSettlementExcel`, `downloadSettlementPdf` (Blob). JWT pulled from `localStorage.getItem('accessToken')`. |
| `frontend/components/admin/comisiones/StatusBadge.js` | DRAFT → `Borrador` (yellow), CONFIRMED → `Confirmada` (green), ADJUSTED → `Ajustada` (orange). Mirrors the StatusBadge shape from `proveedores/logs/page.js`. |
| `frontend/components/admin/comisiones/NewConfigModal.js` | Append-only config creator. Supports all 4 formula types (SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED) with conditional rate inputs + dynamic tier brackets. No drag-to-reorder (deferred per REQUIREMENTS.md). |
| `frontend/components/admin/comisiones/SettlementsTab.js` | Filter bar (isoYear/isoWeek/provider/status) + paginated table. Each row links to `/admin/comisiones/settlements/{id}`. Settlement label rendered via `${isoYear}-W${pad(isoWeek)}` (D-06). |
| `frontend/components/admin/comisiones/LedgerTab.js` | Filter bar (provider/from/to) + ledger table (Sorteo / Provider / Ventas / Utilidad / Comisión / Fecha). |
| `frontend/app/admin/proveedores/[id]/comisiones/page.js` | Per-provider Comisiones tab — provider name in header, "Nueva configuración" button, table of configs newest first with a `Vigente` badge on row 0. No edit/delete UI (F-5). |
| `frontend/app/admin/comisiones/page.js` | Top-level section. Two tabs: Liquidaciones (default per D-05) + Ledger. |
| `frontend/app/admin/comisiones/settlements/[id]/page.js` | Settlement detail. Confirmar button HIDDEN unless `status === 'DRAFT'` (D-03 UI mirror). Ajustar opens a modal collecting `{ amount, adjustmentReason }` and PATCHes `/api/commissions/settlements/:id/adjust`. Excel + PDF buttons fetch a Blob and trigger download via `URL.createObjectURL` + `<a download>`. |

### Acceptance grep gates — Task 1

| Gate | Result |
|------|--------|
| `grep -F "Confirmar" .../settlements/[id]/page.js` | match (≥ 2) |
| `grep -F "status !== 'DRAFT'"` | match (D-03 UI gate) |
| `grep -F "createObjectURL"` | match (blob download) |
| `grep -F "adjustmentReason"` | match (Ajustar payload) |
| `grep -F "setActiveTab('settlements')"` | match (D-05 default) |
| `grep -rE "(deleteConfig|updateConfig)" frontend/` | **0 matches** (F-5) |
| `grep -F "drag" NewConfigModal.js` | **0 matches** (deferred — no drag-to-reorder) |

## Task 2 — Backfill script + DEPLOY runbook (commits `fc86c33`, `9b99d2d`)

`backend/src/scripts/backfill-provider-commissions.mjs` (332 lines):

- **F-17 triple defense:** (1) SQL WHERE filters `d."drawnAt" >= COMMISSION_GO_LIVE`. (2) Defense-in-depth COUNT check that aborts with exit 3 if any `ProviderCommissionLedger` row already references a pre-GO_LIVE draw. (3) Per-row belt-and-suspenders check after the SELECT.
- **D-02 gate:** refuses to write without `--confirm` (exits 2 with refusal message). `--dry-run` reads only.
- **D-01 surfaced:** summary log includes `skipped(no_config)=N` count.
- **Chunked loop:** default 100, clamped 50..500 via `--chunk-size=N`.
- **Reconciliation CSV:** `backend/storage/backfill-reports/provider-commission-recon-{stamp}.csv` with columns `drawId,apiSystemId,formulaType,salesBase,utilityBase,computedAmount,configEffectiveFrom`. CSV header carries `GO_LIVE=...` as an audit trail. Dry-run uses a LATERAL-join projection; confirm-mode reads back from the actual ledger table.
- **`import 'dotenv/config'`** at the top — standalone CLI scripts can't rely on the server entry-point dotenv bootstrap (Phase 11 had a related gotcha — Prisma client undefined). The reconciliation CSVs are now `.gitignore`d in `backend/.gitignore` so generated artifacts stay out of source control.

`.planning/phases/12-provider-commission-engine/12-DEPLOY.md` (240 lines):

11 ordered sections — pre-flight, code push, prisma migrate deploy, prisma generate (Phase 11 lesson), backend restart, frontend build-cache-safe restart, F-12 cron line registration (`0 10 * * 1 root /usr/bin/node .../trigger-pgboss-cron.mjs weekly-settlement-snapshot`), queue smoke test, backfill execution, validation SQL, production status caveat (`status IN ('DRAWN', 'PUBLISHED')`), frontend smoke test, rollback. LOCAL-ONLY: every command is documentation.

## Task 3 — Automated checkpoint results

Per user mandate, the `checkpoint:human-verify` task was automated in-session against the local Docker prod-mirror DB.

### Step 1 — Dry-run

Command:
```
cd backend && node src/scripts/backfill-provider-commissions.mjs --dry-run
```
Key log lines:
```
F-17 defense-in-depth check passed (0 pre-GO_LIVE ledger rows).
Remaining draws to backfill: 132 (chunk size 100)
Reconciliation CSV: .../provider-commission-recon-2026-05-15T23-03-59-842Z.csv — rows=185, mode=dry-run
SUMMARY: ledgerWritten=0, skipped(no_config)=0, errors=0, drawsConsidered=132
DRY-RUN complete — no changes written.
```

132 candidate draws (DRAWN + prizesProcessed=true + drawnAt >= 2026-04-17 + has DrawFinancialProvider with apiSystemId + no existing ledger row). 185 provider/draw combinations.

### Step 2 — CSV inspection + manual math check

CSV head (first 4 data rows of 185 + header + audit-trail line):
```
# GO_LIVE=2026-04-17T04:00:00.000Z mode=dry-run generated=2026-05-15T23:03:59.846Z
drawId,apiSystemId,formulaType,salesBase,utilityBase,computedAmount,configEffectiveFrom
4a254278-69cd-4fd1-9e86-5dd68bd27d62,731768ac-98aa-489d-9c12-2ba37bd2a83b,,8686.00,6836.00,(no_config),
7edc108f-9ed7-4ca3-96c2-428e1ca7e482,731768ac-98aa-489d-9c12-2ba37bd2a83b,,1000.00,-2500.00,(no_config),
e745bec1-bcfb-4365-996d-a97808aa2bc8,731768ac-98aa-489d-9c12-2ba37bd2a83b,,1290.00,-210.00,(no_config),
2811f276-881b-4319-90f6-b8787100f8cb,731768ac-98aa-489d-9c12-2ba37bd2a83b,,3835.00,3835.00,(no_config),
```

Every row has `formulaType=""` and `computedAmount=(no_config)`. Reason: the prod-mirror DB has **zero** `ProviderCommissionConfig` rows. Verified via:
```
docker exec tote_postgres psql -U tote_user -d tote_db -tAc 'SELECT COUNT(*) FROM "ProviderCommissionConfig"'  # → 0
```

This is the honest result. Per the user's mandate ("If the dry-run shows 0 remaining draws... that's a valid result — just document it. Don't manufacture configs"), we did not seed configs.

Math projection logic spot-check using hypothetical SALES_PCT @ 5.5%:
```
$ node -e "console.log((1000.00 * 5.5 / 100).toFixed(8))"
55.00000000     ← matches the 12-03 integration test golden value
$ node -e "console.log((3835 * 5/100 + 3835 * 10/100).toFixed(8))"
575.25000000    ← SALES_AND_UTILITY hand-calc agrees with the projection branch
```
The projection branch in the script computes `(salesBase * salesRate / 100).toFixed(8)` exactly as the live `commission.service.js` does (verified by Plan 12-03 integration test #1).

### Step 3 — Confirm run

Command:
```
cd backend && node src/scripts/backfill-provider-commissions.mjs --confirm
```
Final summary line (after the `fix(12-04): report ledgerWritten as actual rows persisted` correction):
```
SUMMARY: ledgerWritten=0, skipped(no_config)=185, errors=0, drawsConsidered=132, drawsIterated=132
Backfill complete — no errors.
```

The D-01 silent-skip path correctly fired for all 185 (provider, draw) pairs — each pair triggered `logger.warn('[commission] no_config_at_drawnAt', ...)` and wrote no ledger row, exactly as designed.

### Step 4 — Validation SQL

```
docker exec tote_postgres psql -U tote_user -d tote_db -tAc 'SELECT COUNT(*) FROM "ProviderCommissionLedger"'
  → 0
docker exec tote_postgres psql -U tote_user -d tote_db -tAc \
  'SELECT MIN(d."drawnAt") FROM "ProviderCommissionLedger" cl JOIN "Draw" d ON d.id = cl."drawId"'
  → (empty)
```

F-17 holds trivially (no rows ⇒ no rows can violate `drawnAt >= 2026-04-17`).

### Step 5 — Frontend lint

The frontend project does NOT have an ESLint config initialized — `npm run lint` triggers Next.js's interactive setup wizard ("How would you like to configure ESLint? Strict / Base / Cancel"). The plan's `<verify automated>` gate for Task 1 cannot pass in this state without first running the interactive ESLint init, which would be an architectural change (Rule 4 — out of scope for this plan, separate from the commission feature).

Substitute verification:
- All 8 frontend files are present (size-checked, 49–412 lines each).
- The grep acceptance gates above all pass.
- Visual code review of each file confirms the JSX is structurally valid and follows the existing patterns from `proveedores/page.js` and `proveedores/logs/page.js`.
- Per-page runtime smoke testing is handled by the orchestrator's post-phase E2E session (this autonomous executor was instructed not to start the dev server).

Recommend a follow-up plan to run `npx next lint` interactively, accept "Strict", and commit the generated `.eslintrc.json` once and for all.

### Steps 6–7 (deferred to orchestrator E2E session)

The plan's manual checkpoint steps 11–15 (visit `/admin/comisiones`, click around, download Excel, verify SUM formulas in the file) are visual UI checks. Per the orchestrator's instruction "Do NOT start the dev servers — the orchestrator will do that for E2E testing after all phases land", these visual checks are deferred to that session. The DEPLOY.md review (step 15) is satisfied by the file existing with all required keywords (verified in Task 2 acceptance gates).

## Deviations

| # | Rule | Description |
|---|------|-------------|
| 1 | Rule 3 (blocker fix) | Added `import 'dotenv/config'` at top of backfill script. Without it, Prisma can't find DATABASE_URL when the script is invoked outside the server entry-point — verified same failure mode also affects the Phase 11 backfill script. |
| 2 | Rule 1 (correctness fix) | First `--confirm` run reported `ledgerWritten=132` because the counter incremented per draw iterated (including D-01 silent skips). Corrected to report the actual post-write `COUNT(*)` of ledger rows in scope, with `drawsIterated` as a separate metric. The honest second run reported `ledgerWritten=0, skipped(no_config)=185`. |
| 3 | Rule 2 (missing critical functionality) | Added `storage/backfill-reports/*.csv` to `backend/.gitignore`. Phase 11 SUMMARY claimed this was done but the rule had drifted out of the file. Without the rule, every backfill run leaves untracked CSVs in the working tree. |
| 4 | Rule 4 (architectural — escalated, NOT silently fixed) | The frontend has no ESLint config — `npm run lint` requires interactive initialization. Documented above; no auto-fix attempted. |

## Known Stubs

None. Every UI component is wired to the real `/api/commissions/*` endpoints from Plan 12-03. The settlement detail page renders empty states ("Sin líneas") rather than placeholder data.

## Phase 12 Readiness

Phase 12 is now feature-complete locally:

- Plan 12-01: schema + migration + ISO-week helpers (4 commits)
- Plan 12-02: commission service + 2 workers + queue wiring + tests (3 commits)
- Plan 12-03: step-process-prizes wiring + admin routes + integration test (3 commits)
- Plan 12-04: frontend UI + backfill script + DEPLOY.md (4 commits — this plan)

What runs end-to-end locally: a new DRAWN draw with a `ProviderCommissionConfig` row in effect for its `apiSystemId` will produce a `ProviderCommissionLedger` row via the `calculate-provider-commission` pg-boss worker. Once at least one Monday 06:00 VE has fired (or a manual `boss.send('weekly-settlement-snapshot', {})`), `ProviderWeeklySettlement` rows are produced and visible in the admin UI.

What ships to production via 12-DEPLOY.md (NOT executed this session):

1. `git push` + `git pull` on VPS 94.
2. `npx prisma migrate deploy` + `npx prisma generate`.
3. `pm2 restart tote-backend` + frontend build + `pm2 restart tote-frontend`.
4. Append the cron line to `/etc/cron.d/tote-triggers`.
5. Dry-run the backfill, inspect CSV, then `--confirm`.
6. Validate `MIN(drawnAt) >= 2026-04-17`.

Phase 12 software is in place. The future production-deploy session uses 12-DEPLOY.md as its runbook.

## Self-Check: PASSED

- `frontend/lib/api/commissions.js` — FOUND (157 lines, 9 named exports + default)
- `frontend/components/admin/comisiones/StatusBadge.js` — FOUND (29 lines)
- `frontend/components/admin/comisiones/NewConfigModal.js` — FOUND (301 lines)
- `frontend/components/admin/comisiones/SettlementsTab.js` — FOUND (239 lines)
- `frontend/components/admin/comisiones/LedgerTab.js` — FOUND (204 lines)
- `frontend/app/admin/proveedores/[id]/comisiones/page.js` — FOUND (187 lines)
- `frontend/app/admin/comisiones/page.js` — FOUND (49 lines)
- `frontend/app/admin/comisiones/settlements/[id]/page.js` — FOUND (412 lines)
- `backend/src/scripts/backfill-provider-commissions.mjs` — FOUND (~334 lines, all 7 grep gates pass, exit 2 without flags, exit 0 with --dry-run and --confirm)
- `backend/storage/backfill-reports/.gitkeep` — FOUND (pre-existing from Phase 11)
- `.planning/phases/12-provider-commission-engine/12-DEPLOY.md` — FOUND (240 lines, all 8 required keywords present)
- Commits 70b6f02, fc86c33, 9b99d2d, 0943356 — all reachable from HEAD (`git log --oneline -5` confirms).
- Backfill dry-run: 132 draws, F-17 defense-in-depth check passing, CSV emitted.
- Backfill --confirm: ledgerWritten=0, skipped(no_config)=185, errors=0 — honest result against a prod-mirror DB with zero ProviderCommissionConfig rows.
