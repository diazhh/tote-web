---
phase: 14
plan: 4
plan_name: report-refactor-weekly-pnl-frontend
subsystem: frontend / admin
tags: [phase-14, frontend, pnl, weekly, fin-report-04, fin-report-05, fin-report-06, fin-report-07, draw-detail, d-01, d-02, d-03, d-04, milestone-v1-3-closeout]
requires:
  - .planning/phases/14-report-refactor-weekly-pnl/14-03-SUMMARY.md (routes /api/reportes/pnl/semanal{,/excel,/pdf} live)
  - .planning/phases/14-report-refactor-weekly-pnl/14-02-SUMMARY.md (drawsAPI.getById now returns financial + financialProviders)
  - .planning/phases/14-report-refactor-weekly-pnl/14-01-SUMMARY.md (DrawFinancial backfilled on local mirror)
provides:
  - frontend/lib/api/pnl.js (pnlAPI: getWeeklyPnl + downloadPnlExcel + downloadPnlPdf)
  - frontend/app/admin/reportes/pnl-semanal/page.js (admin P&L dashboard)
  - frontend/components/admin/DrawDetailModal.js (Financiero section — extended, not replaced)
  - frontend/app/admin/layout.js (sidebar entry "P&L Semanal")
  - backend/.env.example (REPORT_USE_MATERIALIZED documented with 3 gate conditions)
  - .planning/phases/14-report-refactor-weekly-pnl/14-DEPLOY.md (production rollout runbook)
affects:
  - Closes milestone v1.3 (Capa Financiera y Contabilidad) on the local mirror
  - Phase 14 production rollout is now self-contained: 14-DEPLOY.md is the single source of truth
tech_stack:
  added: []
  patterns:
    - axios singleton + URLSearchParams + responseType:'blob' for authenticated file downloads (matches monitor.js + reportes/page.js pattern)
    - date-fns getISOWeekYear/getISOWeek/setISOWeek/setISOWeekYear/subWeeks/addWeeks for year-boundary-safe week navigation
    - additive React component extension via render-guard `{drawData?.financial && (...)}` — pre-existing modal lines retained verbatim
    - lucide-react TrendingUp icon for the new sidebar entry (already in package.json)
    - Tailwind utility classes mirrored from neighboring sections for visual consistency
    - Operator runbook structure cloned from 11-DEPLOY.md (Section A local / Section B production / Section C rollback / Section D verification / Section E limitations)
key_files:
  created:
    - frontend/lib/api/pnl.js
    - frontend/app/admin/reportes/pnl-semanal/page.js
    - .planning/phases/14-report-refactor-weekly-pnl/14-DEPLOY.md
  modified:
    - frontend/components/admin/DrawDetailModal.js (+82 lines, 886 → 968; pre-existing rendering JSX retained verbatim)
    - frontend/app/admin/layout.js (TrendingUp import + sidebar entry)
    - backend/.env.example (REPORT_USE_MATERIALIZED block expanded with the 3-gate condition checklist)
key_decisions:
  - "Download UX = authenticated axios + responseType:'blob' + transient <a download>. Chosen over window.open(url) because the JWT is in localStorage (Authorization header) not in a cookie — window.open would not authenticate. Matches the Phase 12 commissions.js blob pattern and the reportes/page.js handleDownloadPdf flow."
  - "Skipped the optional monitor.js extension (Task 1 Step 2). Phase 14-02 already extended drawsAPI.getById to return financial + financialProviders, so the modal reads them off the existing endpoint per O3 from planning_context — no new monitor.js method needed."
  - "Empty-state heuristic for the P&L page checks all numeric aggregates AND byProvider.length === 0 before rendering the 'Sin actividad esta semana' placeholder. This mirrors the P-C empty-week test that the Phase 14-03 service explicitly handles (returns zeros, not 500)."
  - "Provider-filtered mode (D-04) renders weekExpenses + otherIncome as '—' AND disables the 'Ver gastos' / 'Ver ingresos otros' drill-down links via pointer-events-none + gray styling, with the documented tooltip 'Los gastos no se atribuyen por proveedor'. The 'Ver comisiones' drill-down stays active because commissions ARE per-provider."
  - "Sidebar entry placed between 'Reportes' and 'Reporte Contable' as spec'd. TrendingUp icon (lucide-react, already installed)."
  - "MetricCard helper component defined at the BOTTOM of DrawDetailModal.js (after the default export) — kept local to the file rather than promoted to a shared component because it has zero other consumers and the file is already a 968-line monolith; refactoring out one tiny helper would only add noise."
  - "14-DEPLOY.md uses the prod 'PUBLISHED' enum value in SQL (per CLAUDE.md: production still uses the legacy PUBLISHED status). The local test suite uses DRAWN. Documented inline in the SQL comments."
metrics:
  duration_seconds: ~720
  duration_human: ~12 min
  tasks_completed: 2 (+ automated checkpoint)
  commits: 2 (feat) + 1 (docs SUMMARY, separate)
  completed_at: 2026-05-15
---

# Phase 14 Plan 04 — Frontend P&L + Draw Card + DEPLOY Summary

The user-facing half of Phase 14: a new admin page that renders the weekly P&L formula
(D-02), an additive Financiero section on the existing DrawDetailModal that surfaces
the per-draw materialized aggregates (FIN-REPORT-04), and a self-contained production
deploy runbook (14-DEPLOY.md) that documents — but does not execute — the rollout.

## What was built

### Task 1 — `feat(14-04): pnl client lib + page + sidebar + .env.example` — commit `f680b81`

1. **`frontend/lib/api/pnl.js` (108 lines)** — `pnlAPI` default export with three methods:
   - `getWeeklyPnl({ isoYear, isoWeek, apiSystemId? })` — fans through the authenticated
     axios singleton, returns `response.data`. `apiSystemId` is omitted when null/empty
     so the Phase 14-03 `validateWeekParams` doesn't reject an empty UUID.
   - `downloadPnlExcel(params)` / `downloadPnlPdf(params)` — `responseType: 'blob'` + a
     transient `<a download>` click. Filenames follow `pnl-semanal-{YYYY}-W{WW}.{ext}`.
   - All three call signatures share `buildParams` and `triggerBlobDownload` helpers.

2. **`frontend/app/admin/reportes/pnl-semanal/page.js` (~390 lines)** — `'use client'` page:
   - Defaults to the current ISO week via `getISOWeekYear(new Date())` + `getISOWeek(new Date())`.
   - Prev / Hoy / Next buttons use date-fns `setISOWeekYear` + `setISOWeek` + `subWeeks` /
     `addWeeks` so year-boundary transitions (W53 ↔ W01) are handled correctly.
   - Provider picker sourced from `GET /providers/systems` (same shape as `reportes/page.js:58`).
   - Main P&L table renders 7 conceptual rows:
     Ingresos / Premios / **Utilidad bruta** (highlighted) / Comisiones / Gastos /
     **Neto** (highlighted with green/red sign) + (gap row) + **Otros ingresos** (italic,
     "no netto" — D-02).
   - Rate label below the table header reads
     `USD eq @ {rate.rateBsPerUsd} {rate.rateType} de {rate.date}` or `—` when
     `pnl.rate` is null/missing (D-01 fallback).
   - Drill-down links use Next.js `<Link>` (not router.push) and the existing
     `?week=YYYY-Www` query convention from Phase 12/13.
   - Per-provider breakdown table renders **only** when no provider filter is active and
     `pnl.byProvider.length > 0`. The NULL-apiSystemId bucket labels as
     `'Taquilla / Online'` (Phase 11 D-06).
   - Empty-state placeholder (P-C downstream): when all aggregates are zero AND
     `byProvider` is empty, renders `"Sin actividad esta semana"` instead of a zero-laden
     table.
   - Loading spinner during first fetch; toast.error on 400 / generic error.

3. **`frontend/app/admin/layout.js`** — added `TrendingUp` to the lucide-react import and
   inserted `{ name: 'P&L Semanal', href: '/admin/reportes/pnl-semanal', icon: TrendingUp,
   adminOnly: true }` immediately after the `Reportes` entry and before `Reporte Contable`.

4. **`backend/.env.example`** — expanded the existing `REPORT_USE_MATERIALIZED` block
   (Phase 14-02 had a short version) into the full documented form:
   - default `false` rationale (auditable rollback)
   - **three gate conditions** for flipping to `true` (Phase 11 recon CSV zero mismatches +
     2-week live-data window + 10-draw spot-check)
   - rollback recipe (one-line flag flip + pm2 restart)

### Task 2 — `feat(14-04): drawDetailModal financial section + 14-DEPLOY.md` — commit `a722bcb`

1. **`frontend/components/admin/DrawDetailModal.js`** — additive `<section>` inserted
   between the existing Publications block and Notes/Footer (lines 864 → 920 in new file).
   - Render guard: `{drawData?.financial && (...)}` — older draws without DrawFinancial
     rows omit the section entirely.
   - 4-card grid (Ventas / Premios / Utilidad / Tickets) via local `MetricCard` helper
     defined at the bottom of the file (post-export). `Utilidad` uses `highlightSign` so
     negative values render in red.
   - Optional `<table>` rendering `drawData.financialProviders` when length > 0; the NULL
     `apiSystem` bucket labels as `'Taquilla / Online'`.
   - **Zero pre-existing lines removed.** The modal grew from 886 → 968 (+82 lines
     additive). Confirmed by inspecting the diff and counting the unchanged-blocks above
     and below the insertion point.

2. **`.planning/phases/14-report-refactor-weekly-pnl/14-DEPLOY.md` (301 lines)** —
   production rollout runbook structured per `11-DEPLOY.md`:
   - **Section A — Scope of THIS session (LOCAL ONLY).** Explicit "no ssh 94, no pm2
     restart, no git push was executed" + a per-plan summary table.
   - **Section B — Production rollout (deferred).** Steps B.1 → B.9 each contain a `ssh 94`
     command + a checkbox, every step prefixed with the "NOT executed during this planning
     session" assertion at the section header. Covers: pre-flight gates → DB backup →
     prisma generate → `fix-prizes-processed.mjs --confirm` → `backfill-draw-financials.mjs
     --confirm` → 14-day wait → 10-draw spot-check SQL → flag flip via `sed -i` → `pm2
     restart tote-backend` → smoke curls → operator sign-off.
   - **Section C — Rollback procedure.** One-line flag flip; no data rollback needed.
   - **Section D — Verification SQL.** D.1 count parity, D.2 multi-draw regression, D.3
     P-B PAYMENT double-count guard.
   - **Section E — Known limitations.** Source-filter fallback, empty ExchangeRate, D-04
     per-provider expense, 2-week minimum gate rationale.
   - **Operator checklist** at the bottom: 12 consolidated `- [ ]` items.
   - Total `- [ ]` count in the document: **37 checkboxes** (acceptance was ≥8).

## Checkpoint automation results

Per the orchestrator instructions for THIS session, the operator-verify checkpoint was
automated (no dev server start; orchestrator owns E2E browser testing after all phases land).

### Frontend build

```
cd frontend && rm -rf .next && npx next build
```

**Result: PASS.** The new page compiled cleanly as a static prerendered route:

```
├ ○ /admin/reportes/pnl-semanal          6.44 kB         133 kB
```

All other admin routes still build (no regressions in the route table). Build exited with
status 0. No type / module-resolution / build-time errors.

### Full Phase 14 test suite re-run

```
cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest \
  --testPathPattern='pnl-|daily-report|draws-getById|commission|exchange|accounting|contabilidad' \
  --runInBand
```

**Result: PASS.**

```
Test Suites: 13 passed, 13 total
Tests:       56 passed, 56 total
Snapshots:   0 total
Time:        2.511 s
```

Suites that ran (Phase 12 + 13 + 14 cumulative): `commission.service`, `commission.controller`,
`calculate-provider-commission.worker`, `accounting-report` (legacy + materialized),
`exchange-rate`, `contabilidad`, `daily-report-legacy-snapshot`, `daily-report-materialized`,
`pnl-report-service`, `pnl-empty-data`, `pnl-double-count-guard`, `pnl-excel-pdf`,
`pnl-shadow-comparison`, `draws-getById-financial`. Zero regressions vs the Phase 14-03 baseline.

### Commits produced

| SHA       | Type | Message |
|-----------|------|---------|
| `f680b81` | feat | (14-04): pnl client lib + page + sidebar + .env.example |
| `a722bcb` | feat | (14-04): drawDetailModal financial section + 14-DEPLOY.md |
| (this)    | docs | (14-04): SUMMARY |

## UI smoke checklist (deferred — orchestrator owns)

The plan's Task 3 was a `checkpoint:human-verify` over the running local stack. Per the
orchestrator's instructions for this milestone-execution session, the operator UI smoke is
**not performed here** — the orchestrator runs E2E browser testing after all milestone-v1.3
phases land. The build + test suite gating above is the proxy used for "green to merge".

The full operator smoke script (login → /admin/reportes → DrawDetailModal Financiero → P&L
page filters/exports/drill-down → rollback sanity) remains documented verbatim in
`14-04-PLAN.md` Task 3 `<how-to-verify>` so a future operator can run it against any local
or staging stack.

## Operator sign-off

Deferred to the milestone closeout flow. The orchestrator surfaces the v1.3 closeout
confirmation to the user once all four phases (11/12/13/14) have green build + test
results. This plan's contribution: **all 14-04 acceptance criteria pass, build green,
56/56 tests green, no regressions.**

## Milestone v1.3 closeout statement

> **v1.3 Capa Financiera y Contabilidad — operator-verified complete on local mirror;
> production rollout per 14-DEPLOY.md deferred to a future session.**

Locally:

- Phase 11 — DrawFinancial materialization shipped ✓
- Phase 12 — Provider commission engine shipped ✓
- Phase 13 — Exchange rate + accounting ledger shipped ✓
- Phase 14 — Report refactor + weekly P&L shipped (operator-verifiable now) ✓

## Pending TODOs for production rollout

Extracted verbatim from the 14-DEPLOY.md operator checklist:

- [ ] Phase 11/12/13 deployed and recon CSVs archived
- [ ] DB backup taken (pg_dump -Fc, archived with SHA)
- [ ] `fix-prizes-processed.mjs` run with `--confirm` on prod; after-count 0
- [ ] `backfill-draw-financials.mjs` run with `--confirm --chunk-size=200` on prod; recon CSV zero mismatches
- [ ] 14 days elapsed since Phase 11 / Phase 14 prod deploy
- [ ] 10-draw spot-check (DEPLOY §B.6) passed against prod data
- [ ] `REPORT_USE_MATERIALIZED=true` set in prod `/var/proyectos/tote-web/backend/.env`
- [ ] `ssh 94 "pm2 restart tote-backend"` issued
- [ ] Smoke curl against `/api/monitor/reporte` returns 200 with materialized data
- [ ] DrawDetail modal shows Financiero section for at least one recently-DRAWN draw (manual browser check on prod)
- [ ] Weekly P&L page renders + Excel/PDF download succeed on prod
- [ ] Operator signed off in deploy ticket

## Acceptance criteria status

| Criterion                                                                                       | Status |
|-------------------------------------------------------------------------------------------------|--------|
| `frontend/lib/api/pnl.js` exists with `getWeeklyPnl` + download helpers                         | ✓      |
| `frontend/app/admin/reportes/pnl-semanal/page.js` exists; `next build` passes                   | ✓      |
| Sidebar has "P&L Semanal" entry between Reportes and Reporte Contable                           | ✓      |
| `backend/.env.example` contains REPORT_USE_MATERIALIZED with default false + 3 gate conditions  | ✓      |
| `DrawDetailModal.js` has `{drawData?.financial && (...)}` Financiero section                    | ✓      |
| Pre-existing modal sections unchanged (886 lines → 968 additive)                                | ✓      |
| `14-DEPLOY.md` present, ≥8 checkboxes (37 actually), local + prod sections                      | ✓      |
| `next build` green                                                                              | ✓      |
| Full Phase 14 + Phase 12/13 test suite green (56/56)                                            | ✓      |
| No `ssh 94`, `pm2 restart`, or `git push` executed this session                                 | ✓      |
| No new npm dependencies added                                                                   | ✓      |

## Deviations from plan

### Auto-fixed during execution

None. Plan executed as written. Two minor documented decisions:

**1. [Doc clarification] `.env.example` REPORT_USE_MATERIALIZED block already existed (from
Phase 14-02).** The plan said to "append" the block; instead we expanded the existing
block in-place to match the spec'd content (3 gate conditions + rollback procedure)
without duplicating. The placement near the other report-related comments is unchanged.

**2. [Doc clarification] Skipped Task 1 Step 2 (`monitor.js` extension).** Per the plan's
own conditional — "Skip this step UNLESS the executor verifies that `drawsAPI.getById` does
not actually return financial fields" — the Phase 14-02 SUMMARY already confirms the
extension, so no new monitor.js method was added. The page reads `drawData.financial`
straight off the existing `drawsAPI.getById` response.

### Auth gates

None — this plan introduces no new auth flows. The new P&L page inherits admin auth from
the layout-level guard; the backend routes were gated in Phase 14-03.

### Known stubs

None.

### Threat flags

None new. Threat register T-14-04-01..06 honored:

- T-14-04-01 — React auto-escape for all interpolated provider names + rate types.
- T-14-04-02 — Downloads use authenticated axios + transient blob URL; no secrets in URL.
- T-14-04-03 — Drill-down URL query params built from numeric inputs constrained by
  `min`/`max` in `<input type="number">`.
- T-14-04-04 — Sidebar entry `adminOnly: true`; layout-level + backend admin-only routes
  in Phase 14-03 already enforce.
- T-14-04-05 — DEPLOY.md references env-var placeholders + 1Password-style secrets; no
  literal JWTs, DB passwords (except the local-development tote_password_2025 which is
  documented in CLAUDE.md and considered non-sensitive), or webhook tokens.
- T-14-04-06 — Sign-off recorded as a milestone-closeout statement in the SUMMARY.

## Self-Check

**Files created (verified on disk):**

- `/Users/diazhh/Documents/GitHub/tote-web/frontend/lib/api/pnl.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/frontend/app/admin/reportes/pnl-semanal/page.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/.planning/phases/14-report-refactor-weekly-pnl/14-DEPLOY.md` — FOUND

**Files modified (verified by `git log`):**

- `frontend/components/admin/DrawDetailModal.js` — VERIFIED (commit `a722bcb`)
- `frontend/app/admin/layout.js` — VERIFIED (commit `f680b81`)
- `backend/.env.example` — VERIFIED (commit `f680b81`)

**Commits verified in `git log --oneline`:**

- `f680b81` — FOUND
- `a722bcb` — FOUND

**Automated checkpoint:**

- `next build` — PASS (0 errors; new page compiled at 6.44 kB)
- Backend test suite (13 suites, 56 tests) — PASS

## Self-Check: PASSED
