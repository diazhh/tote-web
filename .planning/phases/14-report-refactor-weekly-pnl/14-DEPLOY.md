---
phase: 14
plan_owner: 14-04
type: deploy-runbook
status: draft (local-only this session — prod steps deferred)
last_updated: 2026-05-15
---

# Phase 14 — Production Deployment Runbook

> Mirrors the structure of `.planning/phases/11-drawfinancial-foundation/11-DEPLOY.md`.
> Phase 14 introduces a new read-path flag (`REPORT_USE_MATERIALIZED`) and a one-shot
> historical fix (`prizesProcessed` backfill + DrawFinancial rerun). Both must be applied
> in production before the flag flips to `true`.

---

## Section A — Scope of THIS session (LOCAL ONLY)

**This session is local-only.** No `ssh 94`, no `pm2 restart`, no `git push` was executed.
The work produced in 14-01..14-04 has been committed to `main` on the developer machine and
is awaiting:

1. Code review / merge into the canonical remote branch
2. A scheduled production rollout (this document)

What landed locally during milestone v1.3 / Phase 14:

| Plan  | Local artifact                                                                                                          |
|-------|-------------------------------------------------------------------------------------------------------------------------|
| 14-01 | `prizesProcessed` retroactive fix + Phase 11 `backfill-draw-financials.mjs` re-run against the local prod-mirror DB; reconciliation CSV shows zero mismatches. |
| 14-02 | `monitor.service.js` + `accounting-report.service.js` branched on `REPORT_USE_MATERIALIZED`; `draw.service.js#getDrawById` extended with `financial` + `financialProviders`. Shadow test added that demonstrates the multi-draw attribution bug going away when the flag is `true`. |
| 14-03 | New `pnl-report.service.js` + controller + routes at `/api/reportes/pnl/semanal{,/excel,/pdf}` with D-01/D-02/D-04 formula; full backend test suite green. |
| 14-04 | `/admin/reportes/pnl-semanal` page, sidebar entry, `DrawDetailModal` Financiero section, `.env.example` doc, this `14-DEPLOY.md`. |

**Production execution of any step below is explicitly NOT done this session.**

---

## Section B — Production rollout (deferred)

> Every command in this section runs **on the production host (VPS 94)** via the `ssh 94`
> alias unless explicitly noted otherwise. **NOT executed during this planning session.**
> The operator owns this checklist; the developer / AI agent's job is only to provide it.

### B.1 — Pre-flight gates

- [ ] Phase 11 deployed to production AND its recon CSV archived (zero mismatches at deploy time).
- [ ] Phase 12 (provider commissions) deployed and at least one weekly settlement cycle has run cleanly.
- [ ] Phase 13 (exchange rate + accounting ledger) deployed and at least one EXPENSE entry has been recorded by an operator.
- [ ] All Phase 14 backend changes (14-01..14-03) merged to the deploy branch.
- [ ] Phase 14 frontend changes (14-04) merged to the deploy branch.
- [ ] The current `REPORT_USE_MATERIALIZED` value in prod `.env` is `false` (the safe default) — verify before starting.

### B.2 — Pre-flight backup

- [ ] **DB backup taken.** Per `11-DEPLOY.md §2.1`:
      ```bash
      ssh 94 "PGPASSWORD='ToteSecure2024*' pg_dump -U tote_user -h localhost -p 5433 \
        -Fc tote_db -f /var/backups/tote-pre-phase14-$(date +%Y%m%d-%H%M).dump"
      ```
- [ ] Backup file SHA recorded in the deploy ticket.

### B.3 — Schema / migrations

- [ ] If any new Prisma migrations were generated during Phase 14, run them:
      ```bash
      ssh 94 "cd /var/proyectos/tote-web/backend && npm run db:migrate"
      ```
      (Phase 14 itself did NOT add new tables — Phase 11 already shipped `DrawFinancial`. Verify the migration count is zero before/after.)
- [ ] Regenerate Prisma client:
      ```bash
      ssh 94 "cd /var/proyectos/tote-web/backend && npm run db:generate"
      ```

### B.4 — Historical fix (D-05): prizesProcessed + DrawFinancial rerun

Phase 14-01 documented that production has the same Finding-B condition as local prod-mirror —
many DRAWN rows have `prizesProcessed=false` despite having `Prize` rows. Run the fix:

- [ ] **prizesProcessed backfill — dry run first:**
      ```bash
      ssh 94 "cd /var/proyectos/tote-web/backend && node src/scripts/fix-prizes-processed.mjs --dry-run"
      ```
      Confirm the count of affected rows looks reasonable (expect thousands across the historical window).
- [ ] **prizesProcessed backfill — apply:**
      ```bash
      ssh 94 "cd /var/proyectos/tote-web/backend && node src/scripts/fix-prizes-processed.mjs --confirm"
      ```
      After-count must be 0 (every DRAWN+Prize row now has `prizesProcessed=true`).
- [ ] **DrawFinancial backfill — dry run:**
      ```bash
      ssh 94 "cd /var/proyectos/tote-web/backend && node src/scripts/backfill-draw-financials.mjs --dry-run"
      ```
- [ ] **DrawFinancial backfill — apply (chunked):**
      ```bash
      ssh 94 "cd /var/proyectos/tote-web/backend && node src/scripts/backfill-draw-financials.mjs --confirm --chunk-size=200"
      ```
      Reconciliation CSV must show **zero mismatches** across the full window.

### B.5 — 2-week live-data window (ROADMAP gate)

- [ ] Wait at least **14 calendar days** after the backfill completes. During this window
      the live `draw-financial.service.js` writer (Phase 11) populates new rows for every
      newly-DRAWN draw, giving real-world coverage beyond synthetic backfill.
- [ ] At T+14 days, sanity-count the table:
      ```bash
      ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db -c \
        \"SELECT COUNT(*) AS fin, (SELECT COUNT(*) FROM \\\"Draw\\\" WHERE status='PUBLISHED' AND \\\"prizesProcessed\\\"=true) AS drawn FROM \\\"DrawFinancial\\\";\""
      ```
      Expect `fin = drawn` (or very close — small drift due to ongoing draws is acceptable).

### B.6 — 10-draw spot-check (Phase 14 D-05)

Before flipping the flag, prove the materialized rows match a live recomputation for 10 random recent draws:

```sql
-- 10-draw spot-check: for 10 random recently-DRAWN draws, compare materialized vs legacy totals.
WITH sample AS (
  SELECT id
  FROM "Draw"
  WHERE status='PUBLISHED'      -- NOTE: prod still uses PUBLISHED enum value
    AND "prizesProcessed"=true
  ORDER BY random()
  LIMIT 10
)
SELECT s.id,
       df."totalSales"                                  AS mat_sales,
       (SELECT COALESCE(SUM(td.amount), 0)::numeric(12,2)
        FROM "TicketDetail" td
        JOIN "Ticket" t ON t.id = td."ticketId"
        WHERE td."drawId" = s.id
          AND t.status <> 'CANCELLED')                  AS live_sales,
       df."totalPrize"                                  AS mat_prize,
       (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
        FROM "Prize" p
        WHERE p."drawId" = s.id)                        AS live_prize
FROM sample s
JOIN "DrawFinancial" df ON df."drawId" = s.id
ORDER BY s.id;
-- PASS when, for all 10 rows: mat_sales = live_sales AND mat_prize = live_prize.
```

- [ ] All 10 rows match (zero diffs). If any row drifts, STOP — do not flip the flag.
      Investigate the source-attribution path (Phase 11 D-06 / Phase 14-02 documented edge cases) before retrying.

### B.7 — Flip the flag

- [ ] Edit prod `.env` on VPS 94:
      ```bash
      ssh 94 "sed -i 's/^REPORT_USE_MATERIALIZED=false/REPORT_USE_MATERIALIZED=true/' /var/proyectos/tote-web/backend/.env"
      ssh 94 "grep '^REPORT_USE_MATERIALIZED=' /var/proyectos/tote-web/backend/.env"
      ```
      Expected output: `REPORT_USE_MATERIALIZED=true`.
- [ ] Restart the backend (1–2 s downtime acceptable):
      ```bash
      ssh 94 "pm2 restart tote-backend"
      ```
- [ ] Tail logs for 30 seconds to confirm clean startup:
      ```bash
      ssh 94 "pm2 logs tote-backend --lines 50 --nostream"
      ```
      No stack traces; "Server running on port 3001" present.

### B.8 — Smoke tests

- [ ] **Daily report (materialized path):**
      ```bash
      ssh 94 "curl -s -H 'Authorization: Bearer <ADMIN_JWT>' \
        'https://toteback.atilax.io/api/monitor/reporte?dateFrom=$(date +%Y-%m-%d)&dateTo=$(date +%Y-%m-%d)' \
        | head -c 400"
      ```
      Returns JSON with `success: true` and a `data.totals` block. No 500.
- [ ] **Weekly P&L:**
      ```bash
      ssh 94 "curl -s -H 'Authorization: Bearer <ADMIN_JWT>' \
        'https://toteback.atilax.io/api/reportes/pnl/semanal?isoYear=$(date +%G)&isoWeek=$(date +%V)' \
        | head -c 400"
      ```
      Returns the weekly aggregate.
- [ ] **DrawDetail extension:** open one DRAWN draw in `/admin/sorteos` via browser; confirm the new
      "Financiero" section renders with non-empty cards.
- [ ] **Excel export:** from `/admin/reportes/pnl-semanal`, click "Excel" — file downloads, formula
      cells visible when inspected in Excel/LibreOffice.

### B.9 — Operator sign-off

- [ ] Production-on-call operator confirms in the deploy ticket: "P14 materialized path live, no incidents in 24h".

---

## Section C — Rollback procedure

Phase 14 is a **read-path** refactor. The DrawFinancial / DrawFinancialProvider rows written
during Phase 11 and live writes are unchanged. Rollback is a flag flip + restart:

1. Edit prod `.env`:
   ```bash
   ssh 94 "sed -i 's/^REPORT_USE_MATERIALIZED=true/REPORT_USE_MATERIALIZED=false/' /var/proyectos/tote-web/backend/.env"
   ```
2. Restart backend:
   ```bash
   ssh 94 "pm2 restart tote-backend"
   ```
3. Verify the legacy path is active by hitting the daily report endpoint — response shape is
   identical (FIN-REPORT-03 contract) but totals revert to the v1.2 multi-draw attribution bug.
4. **No data rollback needed.** The DrawFinancial rows stay in place; the flag simply chooses
   which read path the services use.

**The materialized writer (Phase 11) keeps running regardless of the flag**, so flipping the
flag back to `true` later does not require another backfill.

---

## Section D — Verification queries

### D.1 — DrawFinancial count parity

```sql
SELECT
  (SELECT COUNT(*) FROM "DrawFinancial")                                 AS materialized,
  (SELECT COUNT(*) FROM "Draw" WHERE status='PUBLISHED' AND "prizesProcessed"=true) AS expected,
  (SELECT COUNT(*) FROM "Draw" WHERE status='PUBLISHED' AND "prizesProcessed"=true)
    -
  (SELECT COUNT(*) FROM "DrawFinancial")                                 AS diff;
-- diff must be 0 (or a small positive number representing very recently DRAWN draws still being processed).
```

### D.2 — P-D / multi-draw regression query

For a date known to have multi-draw webhook tickets, the materialized path must report
per-draw totals that sum to the trusted ticket-level value:

```sql
WITH day_draws AS (
  SELECT id FROM "Draw" WHERE "drawDate"='YYYY-MM-DD' AND status='PUBLISHED'
)
SELECT
  SUM(df."totalSales")                       AS materialized_total,
  (SELECT COALESCE(SUM(td.amount),0)
   FROM "TicketDetail" td
   JOIN "Ticket" t ON t.id = td."ticketId"
   WHERE td."drawId" IN (SELECT id FROM day_draws)
     AND t.status <> 'CANCELLED')            AS live_total
FROM "DrawFinancial" df
WHERE df."drawId" IN (SELECT id FROM day_draws);
-- materialized_total must equal live_total.
```

### D.3 — P-B PAYMENT double-count guard

Confirm that PAYMENT-typed `AccountingEntry` rows do NOT show up in `weekExpenses`:

```sql
-- For a week with at least one settlement-linked PAYMENT entry:
SELECT
  SUM(CASE WHEN type='EXPENSE' THEN "amountBsF" ELSE 0 END) AS expenses_only,
  SUM(CASE WHEN type='PAYMENT' THEN "amountBsF" ELSE 0 END) AS payments_only
FROM "AccountingEntry"
WHERE "entryDate" >= '<monday>' AND "entryDate" < '<next-monday>';
-- The Weekly P&L API's weekExpenses must equal `expenses_only`, NOT `expenses_only + payments_only`.
```

---

## Section E — Known limitations

1. **Source-filter fallback (Phase 14-02 documented).** When the daily-report endpoint is called
   with `?source=...` or `?apiSystemId=...` AND the materialized aggregates lack the rows
   needed for that filter, the service falls back to legacy. This is intentional — Phase 11
   does not yet store per-source breakdowns at draw granularity. No action required.

2. **Empty ExchangeRate table (Phase 14 D-01 fallback).** If `ExchangeRate` is empty in prod
   (Phase 13 was deployed but no rates loaded yet), the weekly P&L USD column shows "—" and
   the operator label reads "—". BsF column remains correct.

3. **Provider-filtered P&L expenses (Phase 14 D-04).** When the operator selects a provider in
   the P&L page, the Gastos and Otros ingresos cells render as "—" with the tooltip "Los
   gastos no se atribuyen por proveedor". Provider-attributable expenses are out of scope for
   milestone v1.3.

4. **2-week minimum-live-data window.** The ROADMAP gate that defers the flag flip exists
   because a fresh backfill on a long historical window can mask a Phase-11 writer bug that
   only surfaces during live executions. Do not bypass.

---

## Operator checklist (consolidated)

- [ ] Phase 11/12/13 deployed and recon CSVs archived
- [ ] DB backup taken
- [ ] `fix-prizes-processed.mjs` run with `--confirm`; after-count 0
- [ ] `backfill-draw-financials.mjs` run with `--confirm --chunk-size=200`; recon CSV zero mismatches
- [ ] 14 days elapsed since Phase 11 / Phase 14 prod deploy
- [ ] 10-draw spot-check (Section B.6) passed
- [ ] `REPORT_USE_MATERIALIZED=true` set in prod `.env`
- [ ] `pm2 restart tote-backend` issued
- [ ] Smoke curl against `/api/monitor/reporte` returns 200 with materialized data
- [ ] DrawDetail modal shows Financiero section for at least one recently-DRAWN draw
- [ ] Weekly P&L page renders, Excel + PDF download successfully
- [ ] Operator signed off in deploy ticket
