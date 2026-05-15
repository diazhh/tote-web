---
phase: 13
plan: 1
subsystem: backend/prisma
tags: [prisma, schema, migration, accounting, exchange-rate, multer, file-type, foundation]
requirements:
  - FIN-RATE-01
  - FIN-RATE-02
  - FIN-RATE-03
  - FIN-LEDGER-01
  - FIN-LEDGER-06
  - FIN-LEDGER-07
dependency_graph:
  requires:
    - "Phase 12 ProviderWeeklySettlement table (P-3 prerequisite — verified live before migration)"
  provides:
    - "ExchangeRate table (immutable BCV/PARALELO/OTRO rates)"
    - "Category table (segregated by appliesTo, soft-delete via isActive)"
    - "AccountingEntry table (INCOME/EXPENSE/PAYMENT, BsF+USD, reversal self-relation, optional FK to ProviderWeeklySettlement)"
    - "AccountingEntryAttachment table (N attachments per entry, onDelete: Cascade)"
    - "3 enums: AccountingEntryType, ExchangeRateType, AccountingCurrency"
    - "multer@^2.1.1 + file-type@^19 backend deps"
    - "Prisma client regenerated with 4 new accessors"
  affects:
    - "Plan 13-02 (services) imports prisma.exchangeRate / prisma.accountingEntry / prisma.category / prisma.accountingEntryAttachment"
    - "Plan 13-02 wires getEffectiveRateForDate helper using the [date, createdAt DESC] index"
    - "Plan 13-03 (controllers + routes + receipt upload middleware) consumes multer + file-type"
    - "Plan 13-04 (admin UI /admin/contabilidad with 4 sub-tabs)"
tech_stack:
  added:
    - "multer@^2.1.1 (receipt file upload — memoryStorage convention per F-14)"
    - "file-type@^19.6.0 (server-side MIME byte inspection; pinned to v19 — v21 requires Node ≥22, prod is Node 20.20.2)"
  patterns:
    - "Append-only ledger (mirror Phase 12 ProviderCommissionConfig)"
    - "Decimal(18,8) precision (matches Phase 12, not Phase 11's (12,2))"
    - "Named self-relation idiom 'EntryReversal' for reversal triple (Prisma canonical form)"
    - "Optional FK to Phase 12 ProviderWeeklySettlement for PAYMENT linking (D-03)"
    - "Idempotent seed via ON CONFLICT DO NOTHING with subquery-resolved createdById"
    - "Manual migration via prisma migrate diff + docker exec psql + manual _prisma_migrations row (Phase 11 fallback — required because of pre-Phase-11 history drift in _prisma_migrations vs migrations/ dir)"
key_files:
  created:
    - "backend/prisma/migrations/20260515231140_phase13_accounting/migration.sql"
    - ".planning/phases/13-exchange-rate-accounting-ledger/13-01-SUMMARY.md"
  modified:
    - "backend/package.json"
    - "backend/prisma/schema.prisma"
decisions:
  - "Followed CONTEXT.md D-01..D-07 + RESEARCH 'Code Examples — Prisma schema additions'. All 4 models + 3 enums + back-relations match the planned shape exactly."
  - "Included optional sequentialNo Int @unique @default(autoincrement()) on AccountingEntry (RESEARCH Open Question O1 — included as PATTERNS.md section 1 recommends; powers 'Reversal de #N' description format)."
  - "Used Prisma canonical self-relation idiom for EntryReversal (one named relation, FK side declares fields/references, back-side is fields-less). Discarded the RESEARCH-flagged alternative 'EntryReversal_reverse_fk' shape since it was documented as VERIFY/non-canonical."
  - "Migration applied via Phase 11 fallback (prisma migrate diff + manual SQL apply + manual _prisma_migrations row with SHA-256 checksum) because prisma migrate dev failed P3006 — shadow DB cannot replay Phase 11 migration since pre-Phase-11 baseline tables exist only in _prisma_migrations history, not as on-disk migration dirs."
  - "Did NOT commit backend/package-lock.json (project convention — gitignored at backend level since Phase 11; deviation from plan acceptance criterion #2)."
metrics:
  duration_minutes: ~6
  tasks_completed: 3
  files_created: 1
  files_modified: 2
  commits:
    - hash: "1220e91"
      message: "feat(13-01): add multer + file-type deps"
    - hash: "e1c403f"
      message: "feat(13-01): accounting schema models + enums"
    - hash: "3836d5c"
      message: "feat(13-01): apply phase13 migration"
  completed: 2026-05-15T23:13:00Z
---

# Phase 13 Plan 1: Exchange Rate + Accounting Ledger Schema Foundation Summary

Persistence foundation for Phase 13: 4 Prisma models (`ExchangeRate`, `Category`, `AccountingEntry`, `AccountingEntryAttachment`), 3 enums (`AccountingEntryType`, `ExchangeRateType`, `AccountingCurrency`), back-relations on `User` (4) and `ProviderWeeklySettlement` (1), 12 indexes including the D-01 `[date, createdAt DESC]` picker index, 9 FKs (including a self-FK for `EntryReversal`), and 9 idempotent Category seed rows. Migration `20260515231140_phase13_accounting` applied locally against `tote_db` on port 5433. `multer@^2.1.1` + `file-type@^19.6.0` installed for Plan 13-03's receipt upload pipeline.

## Schema Additions

### Enums

```prisma
enum AccountingEntryType { INCOME EXPENSE PAYMENT }
enum ExchangeRateType    { BCV PARALELO OTRO }
enum AccountingCurrency  { BsF USD }
```

### `model ExchangeRate`

Immutable per FIN-RATE-02 (no UPDATE endpoint at the service layer). Multiple `rateType` rows per `date` allowed (D-01 — last loaded of the day wins via `[date, createdAt(sort: Desc)]` index).

| Field          | Type                          | Notes                                |
| -------------- | ----------------------------- | ------------------------------------ |
| `id`           | `String @id @default(uuid())` |                                      |
| `date`         | `DateTime @db.Date`           | Pure DATE column — no TZ trap        |
| `rateBsPerUsd` | `Decimal @db.Decimal(18, 8)`  | F-4 precision                        |
| `rateType`     | `ExchangeRateType`            | F-8 — column from day one            |
| `notes`        | `String?`                     |                                      |
| `createdById`  | `String` (FK User)            | FIN-RATE-03 audit                    |
| `createdAt`    | `DateTime @default(now())`    |                                      |

### `model Category`

Per-type categories (D-02). Soft-delete via `isActive`. Unique on `(appliesTo, name)`.

### `model AccountingEntry`

Append-only ledger. `amountBsF`, `entryDate`, `exchangeRateId` are IMMUTABLE post-create per FIN-LEDGER-09 (enforced at service layer in Plan 13-02). `description`, `categoryId`, attachments are editable. Reversal triple per D-06: `reversesId @unique`, `reversedById @unique`, `reversalReason`. Optional FK to `ProviderWeeklySettlement` (D-03). `sequentialNo Int @unique @default(autoincrement())` powers the "Reversal de #N" description shape.

Self-relation idiom (Prisma canonical form):

```prisma
reverses   AccountingEntry? @relation("EntryReversal", fields: [reversesId], references: [id])
reversedBy AccountingEntry? @relation("EntryReversal")
```

`prisma validate` accepts this form without further annotation.

Indexes: `[entryDate, type]`, `[categoryId, entryDate]`, `[settlementId]`, `[type, entryDate]`.

### `model AccountingEntryAttachment`

N receipt files per entry. `onDelete: Cascade` is defensive (admin rarely hard-deletes — reversal pattern). `filename` is UUID-based; `originalName` preserved for UI; `mimeType` byte-validated server-side in Plan 13-03 (never trusts `req.file.mimetype`).

### Back-relations

```prisma
// On User: ADD
exchangeRatesCreated ExchangeRate[]
categoriesCreated    Category[]
accountingEntries    AccountingEntry[]
attachmentsUploaded  AccountingEntryAttachment[]

// On ProviderWeeklySettlement: ADD
payments AccountingEntry[]
```

## Migration

**File:** `backend/prisma/migrations/20260515231140_phase13_accounting/migration.sql` (159 lines)

Contents: 3 `CREATE TYPE`, 4 `CREATE TABLE`, 12 `CREATE INDEX` (including 3 unique indexes for reversesId/reversedById/sequentialNo and the `Category_appliesTo_name_key` unique), 9 `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`, and a final idempotent seed block.

Seed block: 9 Category rows resolved at migration time via `CROSS JOIN LATERAL (SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1)`. `ON CONFLICT ("appliesTo", "name") DO NOTHING` makes re-runs safe (verified — re-applying the seed inserts 0 rows, final count stays 9).

### Verification on local DB

```
$ docker exec tote_postgres psql -U tote_user -d tote_db -c '\dt' | grep -E "ExchangeRate|AccountingEntry|Category|AccountingEntryAttachment"
 public | AccountingEntry           | table | tote_user
 public | AccountingEntryAttachment | table | tote_user
 public | Category                  | table | tote_user
 public | ExchangeRate              | table | tote_user

$ docker exec tote_postgres psql -U tote_user -d tote_db -c 'SELECT "appliesTo", COUNT(*) FROM "Category" GROUP BY "appliesTo";'
 INCOME    | 2
 EXPENSE   | 5
 PAYMENT   | 2

$ node --input-type=module -e 'import { prisma } from "./src/lib/prisma.js"; console.log(typeof prisma.exchangeRate, typeof prisma.accountingEntry, typeof prisma.category, typeof prisma.accountingEntryAttachment);'
object object object object
```

## multer + file-type Dependencies

```json
"file-type": "^19.6.0",
"multer":    "^2.1.1",
```

Alphabetically placed in `backend/package.json` dependencies (file-type between `express-rate-limit` and `fluent-ffmpeg`; multer between `mysql2` and `mustache`).

ESM smoke import verified: `import { fileTypeFromBuffer } from "file-type"` resolves with `typeof === "function"`. Backend's `"type": "module"` declaration at `package.json:6` is the mitigation for P-2 (file-type is ESM-only since v16+).

`file-type` pinned to ^19 (NOT v21+ which requires Node ≥22; prod VPS 94 runs Node 20.20.2 per RESEARCH A1).

## Deviations from Plan

### Rule 3 - Blocking: `prisma migrate dev` failed with P3006 (drift)

**Found during:** Task 3 (`prisma migrate dev --name phase13_accounting --create-only`).

**Issue:** Same drift Phase 11 encountered: `_prisma_migrations` carries 5 historical rows (`add_player_movements_and_stats`, `add_tripleta_config`, `unify_ticket_structure`, `add_tripleta_config`, `add_player_movements_and_stats`) for which no on-disk migration directories exist. Prisma's shadow database cannot replay the Phase 11 migration (`The underlying table for model 'Draw' does not exist`) because the pre-Phase-11 baseline tables aren't replayable from disk.

**Fix:** Phase 11 fallback approach:

1. `prisma migrate diff --from-url <live DB> --to-schema-datamodel prisma/schema.prisma --script` → emitted exactly the additive SQL (3 enums, 4 tables, 12 indexes, 9 FKs). Saved to `migration.sql`.
2. Appended the idempotent Category seed block (9 rows, `ON CONFLICT DO NOTHING`).
3. Applied via `docker exec -i tote_postgres psql -U tote_user -d tote_db < migration.sql` — SQL ran clean with no errors.
4. Inserted `_prisma_migrations` row manually with `shasum -a 256` checksum `9444b44ae95821237d4a45041eb40797732727b143dc7a1827f34e84d373d0ed`.
5. `npx prisma generate` succeeds; smoke test confirms accessors.

**Files modified:** `backend/prisma/migrations/20260515231140_phase13_accounting/migration.sql` (new).

**Operational note for prod deploy of Phase 13:** Production already inherited this drift pattern from Phase 11. Before applying this migration on VPS 94, the deploy operator should run `npx prisma migrate status` against prod. If prod's `_prisma_migrations` is "soft" the same way local's is, replicate the baseline-row pattern. The migration SQL itself is purely additive — no `ALTER` on pre-existing tables — so it can be applied safely even on a drifted history.

### Project-convention preservation: package-lock.json not committed

**Found during:** Task 1.

**Issue:** Plan acceptance criterion #2 was "package-lock.json reflects both new deps and is committed". However, `backend/.gitignore:3` includes `package-lock.json` (intentional project policy since before Phase 11; Phase 11 SUMMARY documents the same deviation under "Project-convention preservation").

**Fix:** Followed project convention — Task 1 commit (`1220e91`) staged only `backend/package.json`. The lock file is updated on disk by `npm install` but excluded from git.

## Verification Checklist

- [x] P-3 prerequisite passed: `ProviderWeeklySettlement` exists in live DB before migration ran
- [x] `prisma validate` exits 0
- [x] 4 new models present: `grep -c 'model \(ExchangeRate\|Category\|AccountingEntry\|AccountingEntryAttachment\) {'` returns 4
- [x] 3 new enums present: `grep -c 'enum \(AccountingEntryType\|ExchangeRateType\|AccountingCurrency\) {'` returns 3
- [x] User carries 4 new back-relations
- [x] `ProviderWeeklySettlement` carries `payments AccountingEntry[]`
- [x] Named self-relation `"EntryReversal"` present (2 occurrences — owning + back-reference)
- [x] 4 tables exist in `tote_db` (verified via `\dt`)
- [x] 9 Category seed rows present (5 EXPENSE + 2 INCOME + 2 PAYMENT)
- [x] Seed is idempotent (re-running inserts 0 rows; count unchanged at 9)
- [x] `_prisma_migrations` row inserted with SHA-256 checksum
- [x] `npx prisma generate` succeeds
- [x] Smoke test prints `object object object object`
- [x] `multer@^2.1.1` + `file-type@^19.6.0` in `backend/package.json` (alphabetical)
- [x] ESM `fileTypeFromBuffer` import returns `function`
- [x] No `git push`, no `pm2 restart`, no `ssh 94` — LOCAL ONLY

## Self-Check: PASSED

All claimed artifacts verified to exist:

- `backend/prisma/migrations/20260515231140_phase13_accounting/migration.sql` FOUND
- `backend/prisma/schema.prisma` modified (4 new models, 3 new enums, 5 new back-relations)
- `backend/package.json` modified (multer + file-type added)
- Commit `1220e91` FOUND
- Commit `e1c403f` FOUND
- Commit `3836d5c` FOUND
- 9 Category rows live in tote_db
- 4 Prisma accessors print `object`

## Pointer for Plan 13-02

Plan 13-02 (services) imports:

```javascript
import { prisma } from '../lib/prisma.js';
// Available accessors: prisma.exchangeRate, prisma.accountingEntry, prisma.category, prisma.accountingEntryAttachment
```

The `getEffectiveRateForDate(date)` helper in `backend/src/services/exchange-rate.service.js` (Plan 13-02 will create this file) reads from `prisma.exchangeRate` using the D-01 picker query: `findFirst({ where: { date }, orderBy: { createdAt: 'desc' } })`. The `[date, createdAt(sort: Desc)]` index supports this.

The reversal `$transaction` in `backend/src/services/accounting-entry.service.js` (Plan 13-02) writes the new negative-amount row + flips the original's `reversedById` atomically. The `@unique` on `reversedById` prevents double-reversal at the DB level.
