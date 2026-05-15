---
phase: 12
plan: 1
plan_name: schema-foundation
status: complete
completed_at: 2026-05-15
---

# Plan 12-01 — Schema + ISO Week Helpers (Provider Commission Engine)

## What was built

1. **`backend/prisma/schema.prisma`** — 4 new models + 2 new enums + back-relations on `ApiSystem` and `Draw`.
   - `ProviderCommissionConfig` (append-only versioned config) + `@@index([apiSystemId, effectiveFrom(sort: Desc)])`.
   - `ProviderCommissionTier` (TIERED bracket child, FK Cascade).
   - `ProviderCommissionLedger` (per provider × draw, `apiSystemId NOT NULL`, `configSnapshot Json`, `@@unique([drawId, apiSystemId])`).
   - `ProviderWeeklySettlement` (per provider × ISO week, `@@unique([apiSystemId, isoYear, isoWeek])`, `originalAmount Decimal?` + `adjustmentReason String?` for D-02).
   - Enums: `CommissionFormulaType { SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED }`, `SettlementStatus { DRAFT, CONFIRMED, ADJUSTED }`.
   - Precision: NUMERIC(18,8) on amount/base columns, NUMERIC(15,4) on rates.
2. **`backend/src/lib/dateUtils.js`** — extended with 3 VE ISO-week helpers using `date-fns.getISOWeekYear` (F-15 trap avoided):
   - `getISOWeekVE(date)` → `{ isoYear, isoWeek }`
   - `startOfISOWeekVE(date)` / `endOfISOWeekVE(date)` (VE Monday 00:00 / Sunday 23:59:59.999 with +4h UTC shift, no DST)
3. **`backend/src/lib/__tests__/dateUtils.test.js`** — 6 Jest tests including the three F-15 boundary cases (2026-12-29 → W53/2026, 2027-01-01 → W53/2026, 2027-01-04 → W1/2027).
4. **`backend/prisma/migrations/20260515182725_add_provider_commission_models/migration.sql`** — committed migration applied to local `tote_db` (port 5433). 113 lines, 2 `CREATE TYPE`, 4 `CREATE TABLE`, 11 indexes, 6 FKs.

## Validation

- `npx prisma validate` exits 0.
- 4 tables present in local `tote_db` (verified via `\dt "Provider*"`).
- All 4 runtime accessors print `function` (Phase 11 lesson — explicit `prisma generate` after migration).
- All 6 Jest tests pass including F-15 boundary cases.
- `ProviderCommissionLedger` row count = 0 (Plan 12-04 owns backfill).

## Deviations

The worktree's base was older than expected. Agent applied `prisma migrate diff` against live DB (which already has Phase 11 tables) — producing Phase-12-only SQL correctly. Schema diff carried Phase 11 alignment whitespace changes alongside the Phase 12 additions; the rebased commit in main is purely additive.

## What this enables

- Plan 12-02 imports `prisma.providerCommissionConfig`, `prisma.providerCommissionLedger`, `prisma.providerWeeklySettlement` accessors.
- `getISOWeekVE` / `startOfISOWeekVE` / `endOfISOWeekVE` consumed by `weekly-settlement-snapshot.worker.js` (Plan 12-02) for ISO week boundary math.
- `configSnapshot Json` on the ledger is the reproducibility anchor — every computed amount carries the rate/tiers used at commit time.
