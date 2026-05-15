---
phase: 11
plan: 1
subsystem: backend/prisma
tags: [prisma, schema, migration, decimal, drawfinancial, foundation]
requirements:
  - FIN-AGG-01
  - FIN-AGG-02
  - FIN-AGG-04
dependency_graph:
  requires: []
  provides:
    - "DrawFinancial table (per-draw materialized aggregate)"
    - "DrawFinancialProvider table (per-provider breakdown w/ nullable apiSystemId)"
    - "decimal.js library available for backend"
    - "Prisma client regenerated with new models"
  affects:
    - "Plan 11-02 (worker) imports the new Prisma client + decimal.js"
    - "Plan 11-03 (queue integration) sends to/from the new tables via worker"
    - "Plan 11-04 (backfill) populates DrawFinancial for ~2,600 historical DRAWN draws"
    - "Phase 12 (commissions) joins DrawFinancialProvider by apiSystemId"
    - "Phase 14 (report refactor) reads DrawFinancial behind a feature flag"
tech_stack:
  added:
    - "decimal.js@^10.6.0 (precision arithmetic for Decimal(12,2) aggregates)"
  patterns:
    - "Materialized per-draw aggregate (mirror DrawStats shape, Decimal(12, 2))"
    - "Nullable composite-unique with explicit findFirst+update/create worker pattern (D-08)"
    - "totalizedAt as freeze marker (D-16 frozen-after-totalize)"
    - "Forward-tracked Prisma migrations in source control (project shifted from db:push to migrate deploy starting Phase 11)"
key_files:
  created:
    - "backend/prisma/migrations/20260515140232_add_draw_financial_models/migration.sql"
    - "backend/prisma/migrations/migration_lock.toml"
  modified:
    - "backend/prisma/schema.prisma"
    - "backend/package.json"
    - "backend/.gitignore"
    - ".gitignore"
decisions:
  - "Followed CONTEXT.md D-06/D-07/D-08: standard @@unique([drawId, apiSystemId]) plus reliance on the worker's explicit-NULL findFirst+update/create pattern; did NOT add NULLS NOT DISTINCT (D-09 left as Phase 12+ planner discretion)."
  - "Followed CONTEXT.md D-05/D-16: included @@index([totalizedAt]) for Phase 14 weekly P&L queries and totalizedAt as the freeze marker."
  - "Removed `prisma/migrations/` from backend/.gitignore and whitelisted `backend/prisma/migrations/**/*.sql` against root *.sql ignore so production can run `prisma migrate deploy`. Historical pre-Phase-11 migrations stay only in the DB's `_prisma_migrations` table."
  - "Did NOT denormalize `gameId` onto DrawFinancial in this plan (deferred per CONTEXT.md Deferred Ideas — re-evaluate if Phase 14 weekly P&L by game shows poor performance)."
metrics:
  duration_minutes: ~12
  tasks_completed: 3
  files_created: 2
  files_modified: 4
  commits:
    - hash: "fe58774"
      message: "feat(11-01): add DrawFinancial + DrawFinancialProvider Prisma models"
    - hash: "075072e"
      message: "feat(11-01): commit Prisma migration for DrawFinancial tables"
    - hash: "dbb5af5"
      message: "chore(11-01): add decimal.js@^10.6.0 to backend dependencies"
  completed: 2026-05-15T18:05:52Z
---

# Phase 11 Plan 1: DrawFinancial Foundation Summary

Persistence foundation for the v1.3 financial layer: two new Prisma models (`DrawFinancial`, `DrawFinancialProvider`), reciprocal relations on `Draw` and `ApiSystem`, a committed Prisma migration that prod will apply via `migrate deploy`, and `decimal.js@^10.6.0` added to the backend dependency list.

## Schema Additions

### `model DrawFinancial`

Per-draw materialized aggregate with frozen-after-totalize semantics (D-16).

| Field         | Type      | Notes                                                                                 |
| ------------- | --------- | ------------------------------------------------------------------------------------- |
| `id`          | `String @id @default(uuid())` | UUID primary key                                                                       |
| `drawId`      | `String @unique`              | 1:1 with `Draw.id`; idempotency key                                                    |
| `totalSales`  | `Decimal @default(0) @db.Decimal(12, 2)` | Σ `TicketDetail.amount` where `Ticket.status != 'CANCELLED'`                           |
| `totalPrize`  | `Decimal @default(0) @db.Decimal(12, 2)` | Σ `TicketDetail.prize` (written by phase PRIZES)                                       |
| `utility`     | `Decimal @default(0) @db.Decimal(12, 2)` | `totalSales - totalPrize`                                                              |
| `ticketCount` | `Int @default(0)`            | COUNT DISTINCT ticketId                                                                |
| `closedAt`    | `DateTime?`                   | Mirror of `Draw.closedAt` at phase SALES                                               |
| `totalizedAt` | `DateTime?`                   | Set by phase PRIZES — **freeze marker** (D-16). Once non-null, the row is immutable.   |
| `createdAt`   | `DateTime @default(now())`    |                                                                                       |
| `updatedAt`   | `DateTime @updatedAt`         |                                                                                       |

Relations: `draw Draw @relation(fields: [drawId], references: [id], onDelete: Cascade)`

Indexes: `@@index([drawId])`, `@@index([totalizedAt])` (D-05 — supports the Phase 14 weekly P&L time-series queries).

### `model DrawFinancialProvider`

Per-provider breakdown — one row per `(drawId, apiSystemId)`, including a synthetic NULL-apiSystemId row for the TAQUILLA_ONLINE bucket (D-06, labelled "Taquilla / Online" per D-07 in Phase 14 UI).

| Field         | Type                                | Notes                                                                                |
| ------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `id`          | `String @id @default(uuid())`       | UUID primary key                                                                     |
| `drawId`      | `String`                            | FK → `Draw.id` (cascade)                                                             |
| `apiSystemId` | `String?`                           | **Nullable** — NULL aggregates `Ticket.apiSystemId IS NULL` (TAQUILLA_ONLINE bucket) |
| `totalSales`  | `Decimal @default(0) @db.Decimal(12, 2)` |                                                                                      |
| `totalPrize`  | `Decimal @default(0) @db.Decimal(12, 2)` |                                                                                      |
| `ticketCount` | `Int @default(0)`                   |                                                                                      |
| `createdAt`   | `DateTime @default(now())`          |                                                                                      |
| `updatedAt`   | `DateTime @updatedAt`               |                                                                                      |

Relations: `draw Draw @relation(fields: [drawId], references: [id], onDelete: Cascade)` and `apiSystem ApiSystem? @relation(fields: [apiSystemId], references: [id])` (mirror of `Ticket.apiSystem` optional FK).

Constraints / indexes: `@@unique([drawId, apiSystemId])`, `@@index([drawId])`, `@@index([apiSystemId])`.

**D-08 reminder to downstream worker (Plan 11-02):** PostgreSQL treats NULLs as distinct in unique indices. The worker MUST use `findFirst({ where: { drawId, apiSystemId: null } })` then update-or-create — never `prisma.upsert()` with `(drawId, apiSystemId)` as the where target when `apiSystemId` may be NULL. The unique constraint exists as defense-in-depth for non-NULL rows only.

### Reciprocal Relations

- `model Draw`: added `financial DrawFinancial?` and `financialProviders DrawFinancialProvider[]` alongside the existing `stats DrawStats?` / `providerStats ProviderStats[]`.
- `model ApiSystem`: added `drawFinancials DrawFinancialProvider[]` alongside the existing relations (`tickets`, `comerciales`, etc).

## Migration

**File:** `backend/prisma/migrations/20260515140232_add_draw_financial_models/migration.sql`

The migration is purely additive — it creates the two new tables, their indexes, and three foreign-key constraints. No `ALTER` of existing tables (the reciprocal relations on `Draw` and `ApiSystem` are virtual at the Prisma layer; the FK constraints live on the new tables only). Migration window is short.

Verification on local DB:

```
$ docker exec tote_postgres psql -U tote_user -d tote_db -c '\dt' | grep DrawFinancial
 public | DrawFinancial         | table | tote_user
 public | DrawFinancialProvider | table | tote_user

$ docker exec tote_postgres psql -U tote_user -d tote_db -c 'SELECT COUNT(*) FROM "DrawFinancial";'
 count → 0
```

Production deploy step: `cd backend && npx prisma migrate deploy` on VPS 94. The migration is idempotent — re-running `migrate deploy` after applied does nothing.

## decimal.js Dependency

Pinned `decimal.js: "^10.6.0"` in `backend/package.json`, alphabetically placed between `date-fns-tz` and `dotenv`. Smoke-tested arithmetic with no float drift:

```
> new Decimal('1.1').plus('2.2').toString()
'3.3'
```

Phase 11's persisted columns use Prisma's `Decimal @db.Decimal(12, 2)` directly, but the worker (Plan 11-02) and backfill (Plan 11-04) will use `decimal.js` for in-memory arithmetic before persistence — exactly the F-4 mitigation in `PITFALLS.md`. The same library will also serve Phase 12's commission ledger at `Decimal(18, 8)` precision.

## Deviations from Plan

### Rule 3 - Blocking: `prisma/migrations/` was gitignored at the project level

**Found during:** Task 2

**Issue:** `backend/.gitignore` line 38 included `prisma/migrations/`, and the repo-root `.gitignore` line 120 globally ignored `*.sql`. The plan's acceptance criteria (and the v1.3 strategy of running `prisma migrate deploy` on prod) explicitly require committing migration SQL to source control. Without the deviation, the migration would have shipped only on the developer machine — prod would never see it.

**Fix:**

1. Removed the `prisma/migrations/` line from `backend/.gitignore` and replaced it with a comment explaining the Phase-11-onward policy.
2. Added an exception line to the root `.gitignore`: `!backend/prisma/migrations/**/*.sql` so the global `*.sql` rule doesn't re-ignore the migration files.

**Files modified:** `backend/.gitignore`, `.gitignore`

**Commit:** `075072e` (rolled into the Task-2 migration commit, since this gitignore change is the necessary preamble for landing the migration files at all)

### Rule 3 - Blocking: Local DB had 5 unmigrated historical migrations applied via `db:push`

**Found during:** Task 2

**Issue:** Running `prisma migrate dev --name add_draw_financial_models` aborted with "The following migration(s) are applied to the database but missing from the local migrations directory" — the DB's `_prisma_migrations` table listed 5 pre-Phase-11 migrations (`add_tripleta_system`, `add_draw_date_time_columns`, `unify_ticket_structure`, `add_tripleta_config`, `add_player_movements_and_stats`) for which we have no SQL on disk. `prisma migrate dev` would have insisted on resetting the database to recover, which would have wiped real seed data.

**Fix:** Used the alternative `prisma migrate diff` flow instead:

1. `prisma migrate diff --from-url=<live DB> --to-schema-datamodel=<schema.prisma> --script` produced exactly the SQL needed for the new tables.
2. Manually created the timestamped migration directory and wrote `migration.sql` + `migration_lock.toml`.
3. Applied the SQL via `psql` directly.
4. Recorded the migration in `_prisma_migrations` with the SHA-256 checksum so future `prisma migrate status` / `migrate deploy` will treat it as applied.

After this, `prisma migrate status` reports "Database schema is up to date!" and `prisma generate` regenerates the client cleanly.

**Files modified:** `backend/prisma/migrations/20260515140232_add_draw_financial_models/migration.sql` (new), `backend/prisma/migrations/migration_lock.toml` (new)

**Commit:** `075072e`

**Operational note for VPS 94 deploy of Phase 11:** Production was deployed historically via `prisma migrate deploy` in earlier phases or via `db:push`. Before applying this migration on prod, the deploy operator should run `npx prisma migrate status` against the prod DB to confirm parity. If prod's `_prisma_migrations` table lacks the 5 historical migrations the same way local did, the same baseline pattern (mark them as applied with checksums, or skip parity if `db:push` was the prod workflow too) will be needed. The new migration itself is purely additive (CREATE TABLE only) so it can be applied even on a DB whose migration history is "soft" — but capture this in the Phase 11 deploy runbook (out of scope for this plan).

### Project-convention preservation

- `backend/package-lock.json` is intentionally gitignored by the project (`backend/.gitignore` line 3). The plan listed it under `<files>` but the acceptance criterion is just `grep '"decimal.js"' backend/package-lock.json ≥ 1`, which holds on disk. Did NOT add it to source control to avoid contradicting an intentional project convention.

## Verification Checklist

- [x] `prisma validate` exits 0 (schema is valid)
- [x] `grep -E "^model (DrawFinancial|DrawFinancialProvider) \{" backend/prisma/schema.prisma` returns 2
- [x] `DrawFinancial` and `DrawFinancialProvider` tables exist in local `tote_db` (`\dt` confirms)
- [x] Both tables empty (`SELECT COUNT(*)` returns 0) — backfill happens in Plan 11-04
- [x] `prisma generate` exits 0 (client regenerated)
- [x] `prisma migrate status` reports "Database schema is up to date!"
- [x] `migration.sql` contains `CREATE TABLE "DrawFinancial"`, `CREATE TABLE "DrawFinancialProvider"`, and `CREATE UNIQUE INDEX "DrawFinancialProvider_drawId_apiSystemId_key"`
- [x] `decimal.js@^10.6.0` in `backend/package.json` (alphabetical, between `date-fns-tz` and `dotenv`)
- [x] `decimal.js` arithmetic smoke test passes (`1.1 + 2.2 === 3.3`)

## Pointer for Plan 11-02

The Phase 11 worker / service in Plan 11-02 (`backend/src/queue/workers/calculate-draw-financials.worker.js` + `backend/src/services/draw-financial.service.js`) imports:

```javascript
import { prisma } from '../../lib/prisma.js';        // newly regenerated client knows the models
import Decimal from 'decimal.js';                    // for in-memory aggregation precision
```

The worker MUST follow the explicit-NULL pattern (D-08) when upserting `DrawFinancialProvider` rows — see `11-PATTERNS.md` §3 for the canonical code shape.

## Self-Check: PASSED

- Files exist on disk: schema.prisma (modified), migration.sql (new), migration_lock.toml (new), package.json (modified) — all confirmed present.
- Commits exist in git log: fe58774, 075072e, dbb5af5 — all confirmed reachable from HEAD.
- Live DB verification: both new tables present and empty.
