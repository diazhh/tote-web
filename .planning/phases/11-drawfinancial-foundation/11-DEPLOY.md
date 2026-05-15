# Phase 11 — Production Deploy Procedure

**Target:** VPS 94 (Telecom, 94.72.116.98)
**Operator-supervised. Do not automate. Follow steps in order.**

This procedure ships:
- Prisma models `DrawFinancial` + `DrawFinancialProvider` (Plan 11-01)
- Service `draw-financial.service.js` + worker `calculate-draw-financials` (Plan 11-02)
- Pipeline wiring in `close-and-ingest` and `step-process-prizes` (Plan 11-03)
- Historical backfill script + reconciliation CSV (Plan 11-04)

## 0. Pre-flight findings (read first — these were discovered during local mirror validation)

**Finding A — Prisma client must be regenerated.** No `postinstall` hook exists in `backend/package.json` that runs `prisma generate`. Without an explicit regenerate after the migration, `prisma.drawFinancial` is `undefined` at runtime and the worker crashes with `Cannot read properties of undefined (reading 'upsert')`. Step 2 of this procedure runs `npm run db:generate` explicitly.

**Finding B — `prizesProcessed` flag is sparse in production.** As of 2026-05-15 the local prod mirror shows only 133 DRAWN draws with `prizesProcessed=true` (all from the last 3 days). The remaining 5804 DRAWN draws never had the flag set, even though they have prize records. **Two choices before running the real backfill:**
1. Run a one-time fix to set `prizesProcessed=true` for all historical DRAWN draws that have associated `Prize` rows. This is the recommended path and unblocks the backfill against ~5937 draws.
2. Adjust the script's candidate query to use `EXISTS (SELECT 1 FROM "Prize" p WHERE p."drawId" = d.id)` instead of `prizesProcessed=true`. Lower risk of side effects but changes the locked plan.

This procedure assumes path (1). If path (2) is chosen, edit the script's query before step 5.

**Finding C — Enum is correct.** Production `DrawStatus` enum is `{SCHEDULED, CLOSED, DRAWN, CANCELLED}` (NO `PUBLISHED`). CLAUDE.md raíz is outdated on this point. The script's F-10 guard will pass.

**Finding D — Local-mirror reconciliation passed.** Backfill against the 133 eligible draws materialized 133 DrawFinancial rows + 185 DrawFinancialProvider rows with zero diff vs `SUM(TicketDetail.amount)`. The aggregation logic is correct.

---

## 1. Pre-flight checks

```bash
# 1.1 Confirm all Phase 11 commits are on origin/main and main is clean
git log --oneline origin/main..main          # should be empty
git status --porcelain                        # should be empty

# 1.2 Confirm production DrawStatus enum (must NOT contain PUBLISHED)
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT unnest(enum_range(NULL::\"DrawStatus\"))"'

# 1.3 Confirm integration test passed locally (Plan 11-03 SUMMARY.md)
cat .planning/phases/11-drawfinancial-foundation/11-03-SUMMARY.md | grep -A2 "Integration test"
```

## 2. Deploy code to VPS 94

```bash
# 2.1 Backup prod DB BEFORE migrations (rollback insurance)
ssh 94 'PGPASSWORD="ToteSecure2024*" pg_dump -U tote_user -h localhost -p 5433 -d tote_db --schema=public --no-owner --no-acl -Fc' > /tmp/tote-prod-pre-phase11-$(date +%Y%m%d-%H%M%S).dump

# 2.2 Pull latest code
ssh 94 'cd /var/proyectos/tote-web && git pull origin main'

# 2.3 Install dependencies (decimal.js is new)
ssh 94 'cd /var/proyectos/tote-web/backend && npm install'

# 2.4 Apply migration
ssh 94 'cd /var/proyectos/tote-web/backend && npx prisma migrate deploy'

# 2.5 REGENERATE PRISMA CLIENT (Finding A — DO NOT SKIP)
ssh 94 'cd /var/proyectos/tote-web/backend && npm run db:generate'

# 2.6 Verify tables exist
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "\dt \"DrawFinancial*\""'
# Expected: DrawFinancial, DrawFinancialProvider both present
```

## 3. Restart backend

```bash
# 3.1 Restart pm2 process
ssh 94 'pm2 restart tote-backend'

# 3.2 F-11 smoke test — confirm BOTH queues are registered in pg-boss
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT name FROM pgboss.queue WHERE name LIKE '\''calculate-%'\''"'
# Expected: calculate-draw-financials AND calculate-provider-commission (D-15 placeholder).
# If either is missing, abort and investigate register.js ordering on the VPS.

# 3.3 Tail logs for 30 seconds — confirm worker registration line
ssh 94 'pm2 logs tote-backend --lines 100 --nostream' | grep -i "calculate-draw-financials\|commission-placeholder"
# Expected: registration log line(s) for both workers
```

## 4. Wait for one live draw cycle (live-pipeline smoke)

Wait until the next draw closes and totalizes (typically within the hour).

```bash
# 4.1 Inspect the newest DrawFinancial row
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT \"drawId\", \"totalSales\", \"totalPrize\", \"ticketCount\", \"closedAt\", \"totalizedAt\" FROM \"DrawFinancial\" ORDER BY \"createdAt\" DESC LIMIT 1"'

# 4.2 Sanity-check the totals against the draw's ticket volume
# (operator pulls the corresponding draw's SUM(TicketDetail.amount) and compares)
```

**GATE:** If the live-pipeline smoke does not produce a DrawFinancial row, STOP and investigate. The worker is not firing — likely a register.js or close-and-ingest wiring regression on the VPS.

## 5. (Optional, recommended) Retroactively set `prizesProcessed` (Finding B path 1)

```bash
# 5.1 Count draws missing the flag but having prize rows
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT COUNT(*) FROM \"Draw\" d WHERE d.status='\''DRAWN'\'' AND d.\"prizesProcessed\" = false AND EXISTS (SELECT 1 FROM \"Prize\" p WHERE p.\"drawId\" = d.id)"'

# 5.2 Apply the fix (operator must approve the count first)
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "UPDATE \"Draw\" SET \"prizesProcessed\" = true WHERE status='\''DRAWN'\'' AND \"prizesProcessed\" = false AND EXISTS (SELECT 1 FROM \"Prize\" p WHERE p.\"drawId\" = \"Draw\".id)"'

# 5.3 Re-count candidates for the backfill
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT COUNT(*) FROM \"Draw\" WHERE status='\''DRAWN'\'' AND \"prizesProcessed\"=true"'
# Expected: ~5937 (all historical DRAWN draws)
```

## 6. Backfill — dry-run first (D-02)

```bash
ssh 94 'cd /var/proyectos/tote-web/backend && node src/scripts/backfill-draw-financials.mjs --dry-run 2>&1 | tee /tmp/backfill-dry-run-$(date +%Y%m%d-%H%M%S).log'
```

**GATE:** Inspect the log:
- Enum verified line present
- Candidate count is reasonable (~5937 if step 5 was run, ~133 if not)
- No DB writes occurred (`SELECT COUNT(*) FROM "DrawFinancial"` is unchanged — only the live-cycle row from step 4 should exist)

If the count is wildly off (e.g., > 10000 or < 100 after running step 5), abort and investigate.

## 7. Backfill — real run

```bash
ssh 94 'cd /var/proyectos/tote-web/backend && node src/scripts/backfill-draw-financials.mjs --confirm 2>&1 | tee /tmp/backfill-run-$(date +%Y%m%d-%H%M%S).log'
```

**Expected duration:** ~150ms per draw. 5937 draws * 150ms ≈ 15 minutes. If runtime exceeds 30 minutes, investigate.

The reconciliation CSV is written to `/var/proyectos/tote-web/backend/storage/backfill-reports/draw-financial-recon-<timestamp>.csv`.

**GATE:** Script exit code MUST be 0. If non-zero, DO NOT mark Phase 11 complete — see step 9 (rollback).

## 8. Acceptance verification (D-04 strict)

```bash
# 8.1 Spot-check the CSV
ssh 94 'ls -t /var/proyectos/tote-web/backend/storage/backfill-reports/draw-financial-recon-*.csv | head -1 | xargs head -10'

# 8.2 Count non-zero diffs (MUST be 0)
ssh 94 'ls -t /var/proyectos/tote-web/backend/storage/backfill-reports/draw-financial-recon-*.csv | head -1 | xargs awk -F, '\''NR>1 && $4 != 0'\'' | wc -l'

# 8.3 DrawFinancial row count == eligible Draw count
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT (SELECT COUNT(*) FROM \"DrawFinancial\") AS materialized, (SELECT COUNT(*) FROM \"Draw\" WHERE status='\''DRAWN'\'' AND \"prizesProcessed\"=true) AS expected"'

# 8.4 10-draw spot check via SQL — random sample
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "SELECT df.\"drawId\", df.\"totalSales\", (SELECT COALESCE(SUM(td.amount),0) FROM \"TicketDetail\" td JOIN \"Ticket\" t ON t.id=td.\"ticketId\" WHERE td.\"drawId\"=df.\"drawId\" AND t.status!='\''CANCELLED'\'') AS live FROM \"DrawFinancial\" df ORDER BY random() LIMIT 10"'
```

**GATE:** If 8.2 returns > 0, abort and investigate. If 8.3 shows a mismatch, abort and investigate. If 8.4 shows any drift between `totalSales` and live SUM, abort.

## 9. Rollback procedure (if any step fails)

```bash
# Clear materialized data — worker will re-populate live draws naturally
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c "DELETE FROM \"DrawFinancialProvider\"; DELETE FROM \"DrawFinancial\";"'

# If migration itself failed:
ssh 94 'cd /var/proyectos/tote-web/backend && npx prisma migrate resolve --rolled-back 20260515140232_add_draw_financial_models'

# Restore from the backup taken in step 2.1 if needed:
# scp /tmp/tote-prod-pre-phase11-<timestamp>.dump 94:/tmp/
# ssh 94 'PGPASSWORD="ToteSecure2024*" pg_restore -U tote_user -h localhost -p 5433 -d tote_db --clean --if-exists /tmp/tote-prod-pre-phase11-<timestamp>.dump'

# Revert pm2 process to pre-Phase-11 code:
ssh 94 'cd /var/proyectos/tote-web && git reset --hard <pre-phase-11-commit-sha> && pm2 restart tote-backend'
```

## 10. Mark phase complete

- Update `.planning/STATE.md`: Phase 11 status → Complete.
- Update `.planning/ROADMAP.md`: Phase 11 plan list `[x]` checkmarks.
- Note: Phase 14 must NOT flip `REPORT_USE_MATERIALIZED=true` yet — requires 2 weeks of live DrawFinancial data per ROADMAP gate.
- Operator can now begin Phase 12 planning.

---

**References to locked decisions / pitfalls:**
- D-01 chunked + resumable (script + step 6)
- D-02 dry-run-required (steps 6 → 7)
- D-03 deploy-window only (this entire procedure)
- D-04 zero-discrepancy gate (step 8.2)
- D-05 totalizedAt = drawnAt (script line 91 — verified during local mirror run)
- D-15 commission placeholder queue (step 3.2)
- F-10 enum guard (step 1.2, also enforced by script)
- F-11 createQueue ordering (step 3.2)
