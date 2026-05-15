---
phase: 12
plan: 4
type: deploy-runbook
status: documentation-only
audience: VPS 94 operator (LOCAL session ONLY documents the sequence — does NOT execute it)
---

# Phase 12 — Production Deploy Runbook

> **LOCAL-ONLY guarantee:** every command in this runbook is *documentation*.
> No `ssh 94`, `git push`, `pm2 restart`, or VPS DB statement is executed by
> any agent during the planning/execution session that produced this file.
> The operator runs these commands in a future supervised session.

## 0. Pre-flight checks

Before touching VPS 94, verify locally:

1. Phase 12 commits are reachable from `main`:
   ```bash
   git log --oneline | grep "(12-0[1-4])" | head -20
   ```
2. Local Docker DB has the migration applied and the integration tests pass:
   ```bash
   cd backend && npx prisma migrate status
   cd backend && npm test -- --testPathPattern='commission|draw-financial'
   ```
3. Phase 11 backfill is complete on production (this is the prerequisite for
   Phase 12 to do anything — without `DrawFinancialProvider` rows the
   commission worker has nothing to aggregate). On production:
   ```bash
   ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db \
     -tAc 'SELECT COUNT(*) FROM \"DrawFinancial\"'"
   ```
   Expected: > 0 (matches the Phase 11 11-DEPLOY.md backfill outcome).

## 1. Code push

```bash
# From local working tree
git status                       # confirm clean working tree
git push origin main             # push Phase 12 commits
ssh 94 "cd /var/proyectos/tote-web && git pull --ff-only"
```

## 2. Schema migration

```bash
ssh 94 "cd /var/proyectos/tote-web/backend && npx prisma migrate deploy"
```

Applies the Phase 12-01 migration (`ProviderCommissionConfig`,
`ProviderCommissionTier`, `ProviderCommissionLedger`,
`ProviderWeeklySettlement`, two enums, `ApiSystem` back-relations,
`Draw` back-relation).

## 2.5. Prisma generate (Phase 11 lesson — DO NOT SKIP)

```bash
ssh 94 "cd /var/proyectos/tote-web/backend && npx prisma generate"
```

Without this step the Node runtime keeps the *pre-Phase-12* client and
`prisma.providerCommissionLedger` is undefined — same failure mode that
surfaced in Phase 11 (11-DEPLOY.md "Bug surfaced: Prisma client was
undefined").

## 3. Restart backend

```bash
ssh 94 "pm2 restart tote-backend"
ssh 94 "pm2 logs tote-backend --lines 100 --nostream"
```

Watch for:
- pg-boss queue registration log: `[pg-boss] queue calculate-provider-commission ready`
- pg-boss queue registration log: `[pg-boss] queue weekly-settlement-snapshot ready`
- No `Cannot read properties of undefined` errors near commission code.

## 4. Restart frontend

```bash
ssh 94 "cd /var/proyectos/tote-web/frontend && npm run build"   # MUST exit 0
ssh 94 "ls -la /var/proyectos/tote-web/frontend/.next/BUILD_ID" # MUST exist
ssh 94 "pm2 restart tote-frontend"
```

Per CLAUDE.md feedback memory (`feedback_frontend_build.md`): never restart
the frontend pm2 process unless `next build` returns 0 *and* `.next/BUILD_ID`
exists — otherwise the running build cache is destroyed and the page goes
down.

## 5. F-12 mitigation — register cron line on VPS

The weekly settlement snapshot is fired by Linux cron, not by `boss.schedule`
(see CLAUDE.md "Scheduling unificado cron Linux + pg-boss"). Add this line
to `/etc/cron.d/tote-triggers`:

```cron
# Phase 12 — weekly provider commission settlement, Mondays 06:00 VE (= 10:00 UTC, no DST)
0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot
```

The allowlist in `trigger-pgboss-cron.mjs` was extended in Plan 12-03 to
include `weekly-settlement-snapshot` — verify before saving the cron file:

```bash
ssh 94 "grep weekly-settlement-snapshot /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs"
```

## 6. Smoke test the queue registration

After backend restart, verify both queues exist in pg-boss:

```bash
ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db \
  -tAc \"SELECT name FROM pgboss.queue WHERE name IN ('calculate-provider-commission', 'weekly-settlement-snapshot') ORDER BY name\""
```

Expected output:
```
calculate-provider-commission
weekly-settlement-snapshot
```

If either is missing, `boss.work()` was called without a preceding
`boss.createQueue()` somewhere in `register.js` (see CLAUDE.md memory
`project_pgboss_createqueue_bug.md`). Fix in code before retrying.

## 7. Backfill execution

> **Wait until at least one new draw post-deploy has produced a normal
> `ProviderCommissionLedger` row via the live worker.** Confirm that path
> first — the backfill should only fill historical gaps, not be the first
> thing that ever writes to the table.

```bash
# 1. Dry-run — writes nothing, emits a reconciliation CSV
ssh 94 "cd /var/proyectos/tote-web/backend && \
  node src/scripts/backfill-provider-commissions.mjs --dry-run"

# 2. Inspect the CSV — sample a few rows manually
ssh 94 "ls -la /var/proyectos/tote-web/backend/storage/backfill-reports/"
ssh 94 "head -10 /var/proyectos/tote-web/backend/storage/backfill-reports/provider-commission-recon-*.csv"

# 3. Real run — writes ledger rows + summary log
ssh 94 "cd /var/proyectos/tote-web/backend && \
  node src/scripts/backfill-provider-commissions.mjs --confirm"
```

The summary log MUST show `errors=0`. If non-zero, investigate `pm2 logs
tote-backend` for the failed `drawId` references.

## 8. Validation queries

Run these against production AFTER `--confirm` completes:

```bash
ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db \
  -tAc 'SELECT COUNT(*) FROM \"ProviderCommissionLedger\"'"

# F-17 invariant — every ledger row points to a draw at or after GO_LIVE
ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db \
  -tAc 'SELECT MIN(d.\"drawnAt\") FROM \"ProviderCommissionLedger\" cl JOIN \"Draw\" d ON d.id = cl.\"drawId\"'"
```

The MIN(drawnAt) MUST be `>= 2026-04-17T00:00:00-04:00`. If it isn't, the
backfill bled into pre-GO-LIVE history — roll back via:

```sql
DELETE FROM "ProviderCommissionLedger" cl
USING "Draw" d
WHERE cl."drawId" = d.id
  AND d."drawnAt" < '2026-04-17T00:00:00-04:00';
```

…then re-run the F-17 defense-in-depth assertion built into the script (it
will now exit cleanly).

## 9. Production draw-status caveat (review BEFORE running --confirm)

Per CLAUDE.md "Estado de draws en producción vs local":

| Entorno    | Status draws completados |
|------------|--------------------------|
| Producción | `PUBLISHED` (legacy)     |
| Local/dev  | `DRAWN` (nuevo)          |

The backfill script's candidate query currently filters
`d.status = 'DRAWN'`. On production, the ~2648 historical draws between
2025-12-20 and today carry `status = 'PUBLISHED'`. **Before running
`--confirm` on production**, the operator MUST decide between:

1. **Path A (recommended):** Edit the candidate query in
   `backfill-provider-commissions.mjs` to filter
   `d.status IN ('DRAWN', 'PUBLISHED')` for this one production run, then
   revert the change locally. This is a one-line edit and is fully
   reversible.
2. **Path B:** Skip the historical backfill entirely and accept that the
   commission ledger only covers draws produced *after* the Phase 12
   deploy. Document the gap in REQUIREMENTS.md FIN-COMM-12.

Either way: this caveat MUST be reviewed and the decision recorded in the
operator's deploy log before `--confirm` runs against production.

## 10. Frontend smoke test

After all of the above:

1. Open `https://tote.atilax.io/admin/comisiones` — Liquidaciones tab loads.
2. Open `https://tote.atilax.io/admin/proveedores` — pick a provider — click
   into the "Comisiones" tab. The append-only history table renders.
3. Open a settlement (after the first Monday 06:00 VE has fired) — confirm
   that:
   - StatusBadge renders `Borrador` / `Confirmada` / `Ajustada` correctly.
   - **Confirmar button is shown only for DRAFT** (D-03 UI mirror).
   - Excel download produces a `.xlsx` file whose TOTAL cell contains a
     `=SUM(...)` formula (audit-grade — open the file in Excel/LibreOffice
     and click the cell to verify).

## 11. Rollback

If anything goes wrong during steps 1–10:

```bash
# 1. Stop the backend (prevents further commission writes)
ssh 94 "pm2 stop tote-backend"

# 2. Roll back the schema (DANGER: drops the 4 new tables)
ssh 94 "cd /var/proyectos/tote-web/backend && npx prisma migrate resolve --rolled-back <migration-name>"

# 3. Restore the cron file
ssh 94 "vim /etc/cron.d/tote-triggers"  # remove the weekly-settlement-snapshot line

# 4. Restart the backend on the prior commit
ssh 94 "cd /var/proyectos/tote-web && git checkout <pre-phase-12-sha> && pm2 restart tote-backend"
```

Phase 11 (DrawFinancial) remains intact — Phase 12 rolls back independently.
