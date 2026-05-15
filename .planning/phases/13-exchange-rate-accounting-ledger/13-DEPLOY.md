# Phase 13 — Deploy Notes (Exchange Rate + Accounting Ledger)

## 1. Scope statement

Phase 13 is **LOCAL-ONLY** in this session. No `ssh 94`. No `git push`. No `pm2 restart`. No `/etc/cron.d/tote-triggers` update. Phase 13 introduces NO new cron job — accounting writes are admin-triggered HTTP requests, not scheduled work.

The deploy steps documented below are **deferred** — they are the procedure to follow when the operator chooses to ship Phase 13 to production. They are *not* executed in this session.

## 2. What landed locally (from 13-01 through 13-04)

- **Schema (13-01):** 4 Prisma tables — `ExchangeRate`, `Category`, `AccountingEntry`, `AccountingEntryAttachment` — plus 3 enums (`RateType`, `AccountingEntryType`, `Currency`). Migration applied against the local prod-mirror DB. 9 seed categories committed via `ON CONFLICT DO NOTHING` (idempotent) — 3 INCOME + 3 EXPENSE + 3 PAYMENT.
- **Services + controllers (13-02):** `exchange-rate.service.js`, `accounting-entry.service.js`, `category.service.js` plus matching class-default-export controllers. `NoRateForDateError` returns 400 for the F-6 backend block.
- **Routes + middleware + attachments (13-03):** `backend/src/middlewares/static-storage-guard.middleware.js` (P-1 closure mounted at `index.js:139` BEFORE `express.static('/storage', ...)`). `backend/src/middlewares/upload.middleware.js` (multer memoryStorage, 5MB, files:1, no fileFilter). `backend/src/services/attachment.service.js` (byte-level MIME via `file-type` before fs.writeFile — F-14). `backend/src/controllers/attachment.controller.js`. `backend/src/routes/contabilidad.routes.js` mounted at `/api/contabilidad` (15 routes). Backend dependencies added: `multer@^2.1.1` + `file-type@^19`. Integration test `backend/src/__tests__/contabilidad.integration.test.js` — 6 assertions passing in ~0.28s.
- **Frontend (13-04):** `/admin/contabilidad` with 4 sub-routes (`asientos`, `tasas`, `categorias`, `pagos`). Create / detail / reversal forms with F-6 frontend block and receipt upload/download via auth-gated endpoints. New `BookOpen`-iconed nav entry "Contabilidad" in `frontend/app/admin/layout.js`. Centralized fetch wrapper `frontend/lib/api/contabilidad.js`. No new frontend dependencies.

> All commits live on local `main`. None of the work has been pushed to `origin/main` yet; rollout to VPS 94 begins only after a future session executes `git push`.

## 3. Pre-flight checklist for production rollout (deferred — not run now)

These steps presuppose: (a) the local commits have been pushed to `origin/main` in a future session and (b) the operator has scheduled a maintenance window of ~5 minutes.

> Each command below is documentation only. Do not execute as part of this session.

```bash
# 3.1 Pull main onto VPS 94 (after `git push` in a later session)
ssh 94 "cd /var/proyectos/tote-web && git pull origin main"

# 3.2 Install new backend deps (multer + file-type@^19)
ssh 94 "cd /var/proyectos/tote-web/backend && npm install"

# 3.3 Apply Phase 13 migration to prod DB
ssh 94 "cd /var/proyectos/tote-web/backend && DATABASE_URL=postgresql://tote_user:ToteSecure2024*@localhost:5433/tote_db?schema=public npx prisma migrate deploy"

# 3.4 Regenerate Prisma client (Phase 11 finding A — no postinstall hook)
ssh 94 "cd /var/proyectos/tote-web/backend && npm run db:generate"

# 3.5 Restart backend (next request will hit the new routes + P-1 guard)
ssh 94 "pm2 restart tote-backend"

# 3.6 Build + restart frontend (see feedback note below before doing 3.6)
ssh 94 "cd /var/proyectos/tote-web/frontend && npm install && npm run build"
ssh 94 "pm2 restart tote-frontend"
```

**Frontend caveat:** prior MEMORY note `feedback_frontend_build.md` warns that `npm run build` can flake on VPS 144 (Inter font / @tailwindcss/postcss). VPS 94 has not exhibited this in recent sessions but is the same Tailwind v4 stack — **never** `pm2 restart tote-frontend` until `npm run build` exits 0 and `.next/BUILD_ID` exists. If the build fails, do NOT roll back: leave the previous build serving and triage in a separate window.

**Smoke checks after rollout:**

```bash
# Admin-auth: should return 200 with the 9 seeded categories
curl -i -H "Authorization: Bearer <prod-admin-jwt>" \
  https://toteback.atilax.io/api/contabilidad/categorias

# P-1 guard: must return 401 (NOT 200, NOT 404)
curl -i https://toteback.atilax.io/storage/receipts/anything.pdf

# Tasa creation smoke (replace token + body)
curl -i -X POST -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-16","rateBsPerUsd":100.0,"rateType":"BCV"}' \
  https://toteback.atilax.io/api/contabilidad/tasas
```

## 4. Rollback plan

If migration 3.3 fails on prod (or post-restart smoke fails):

```bash
# 4.1 Take a DB backup snapshot first
ssh 94 "PGPASSWORD='ToteSecure2024*' pg_dump -U tote_user -h localhost -p 5433 -d tote_db --schema=public --no-owner --no-acl -Fc" > /tmp/tote-prod-phase13-rollback-$(date +%Y%m%d-%H%M%S).dump

# 4.2 Drop the 4 Phase 13 tables (cascade clears child rows)
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db <<SQL
DROP TABLE IF EXISTS "AccountingEntryAttachment" CASCADE;
DROP TABLE IF EXISTS "AccountingEntry" CASCADE;
DROP TABLE IF EXISTS "ExchangeRate" CASCADE;
DROP TABLE IF EXISTS "Category" CASCADE;
DROP TYPE IF EXISTS "RateType";
DROP TYPE IF EXISTS "AccountingEntryType";
DROP TYPE IF EXISTS "Currency";
SQL'

# 4.3 Revert main on the VPS to the prior commit
ssh 94 "cd /var/proyectos/tote-web && git reset --hard <prev-commit-sha>"

# 4.4 Restart backend (frontend tolerates missing /admin/contabilidad — 404 is acceptable)
ssh 94 "pm2 restart tote-backend"
```

The pg-boss queue, Phase 11/12 tables, and existing draw lifecycle are untouched by the Phase 13 schema — the 4 dropped tables have no FK from other modules into them. Settlement → AccountingEntry uses the FK direction `AccountingEntry.settlementId → ProviderWeeklySettlement.id`, so dropping `AccountingEntry` is safe; the inverse never exists.

## 5. Operator handoff notes

- **First action after rollout:** open `/admin/contabilidad/tasas` and enter today's BCV rate before logging any USD-denominated expense. The F-6 frontend block **and** the F-6 backend block both reject a USD entry without a same-date rate row — this is intentional, not a bug.
- **Renaming vs deleting categories:** the Categorías tab supports `Renombrar` and `Activar/Desactivar` only. Seeded category names can be renamed; deactivated rows are hidden from `nueva` dropdowns but preserve historical entries' category labels. There is **no hard-delete UI affordance** anywhere in Phase 13 (FIN-LEDGER-06).
- **Reversals are append-only:** clicking `Reversar` on an entry creates a *new* negative-amount entry and marks the original `reversedById=<new.id>`. You cannot reverse a reversal, and you cannot reverse an already-reversed entry. To "fix" a reversal, create a fresh entry with the corrected amount.
- **Receipt archival:** files live at `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` keyed by the entry's `entryDate` (not upload date), so each fiscal month is a contiguous directory. Old months can be moved to cold storage by `mv` — only the row in `AccountingEntryAttachment` matters for app correctness, and the auth-gated download will 500 (with a friendly stream-error handler) if the file is gone. Schedule cold-storage moves manually.
- **Auth-gated downloads only:** receipts are NEVER served via `/storage/receipts/*`. That path returns 401 by design (P-1). Always use `/api/contabilidad/asientos/:id/attachments/:attId` with the admin JWT, which is what the UI's "Descargar" button does (fetch + blob + anchor click — `<a href>` alone cannot carry the Authorization header).

## 6. Operational notes for the planner / future maintainer

- **P-6 settlement race:** the backend re-validates the picker's selected settlement status on POST `/asientos`. In a multi-admin context this still permits a brief window where two clients pick the same row before either commits, but the single-admin operator context makes the race acceptable per the Phase 13 threat model.
- **Integration test = regression baseline:** `backend/src/__tests__/contabilidad.integration.test.js` covers F-6 (rejection without rate), F-7 (amountBsF locked at create), F-14 (MIME spoof rejected), P-1 (storage guard 401), and D-06 (reversal arithmetic). Re-run after any controller/service change: `cd backend && npx jest src/__tests__/contabilidad.integration.test.js --runInBand`.
- **D-01 selection rule:** when multiple `ExchangeRate` rows exist for the same `date`, the entry-create flow picks the row with the most recent `createdAt`. Predictable if the operator establishes a daily convention (e.g., enter BCV first; PARALELO only if needed). The picked `exchangeRateId` is locked onto the entry row at create time — subsequent rate edits for the same date never change historical values (F-7).
- **Deferred surface for Phase 14 / backlog:** AuditLog global viewer UI, multi-file drag-drop receipts, auto-transition of settlement to "PAID" when SUM(payments) ≥ amount, receipt OCR, per-category budget alerts. None of these are in scope for v1.3.
