---
phase: 13
plan: 2
subsystem: backend/services+controllers
tags: [accounting, exchange-rate, category, auditlog, decimal.js, reversal, immutability]
requirements:
  - FIN-RATE-01
  - FIN-RATE-02
  - FIN-RATE-04
  - FIN-RATE-05
  - FIN-LEDGER-01
  - FIN-LEDGER-02
  - FIN-LEDGER-03
  - FIN-LEDGER-06
  - FIN-LEDGER-07
  - FIN-LEDGER-08
  - FIN-LEDGER-09
dependency_graph:
  requires:
    - "Plan 13-01: prisma.exchangeRate / accountingEntry / category accessors + 3 enums (AccountingEntryType / ExchangeRateType / AccountingCurrency)"
    - "Plan 13-01: AccountingEntry.sequentialNo (powers reverseEntry description string)"
    - "Phase 11 PrizesNotProcessedError shape (mirrored as NoRateForDateError)"
    - "Phase 12 ProviderWeeklySettlement (settlement re-validate target for P-6)"
    - "decimal.js@^10.6.0 (already in backend/package.json)"
  provides:
    - "exchange-rate.service.js: getEffectiveRateForDate (D-01 chokepoint), listRates, createRate"
    - "accounting-entry.service.js: createEntry, updateEntry, reverseEntry, listEntries, getEntry, NoRateForDateError"
    - "category.service.js: listCategories, createCategory, deactivateCategory, reactivateCategory, renameCategory"
    - "exchange-rate.controller.js: class ExchangeRateController { create, list }"
    - "accounting-entry.controller.js: class AccountingEntryController { create, list, getOne, update, reverse }"
    - "category.controller.js: class CategoryController { create, list, update, deactivate, reactivate }"
  affects:
    - "Plan 13-03 (routes + multer + receipt upload + static-storage guard) mounts these 3 controllers"
    - "Plan 13-03's integration test consumes the F-6 backend block (NoRateForDateError → 400 from createEntry)"
    - "Plan 13-04 (admin UI /admin/contabilidad) consumes the route surface that 13-03 wires up"
tech_stack:
  added: []
  patterns:
    - "D-01 single chokepoint: getEffectiveRateForDate is the ONLY place ExchangeRate is queried by date for picker semantics — Plan 13-03+ must NEVER inline the lookup"
    - "F-4 decimal.js ROUND_HALF_UP set at module scope of accounting-entry.service.js (banker's-error-free accounting)"
    - "F-6 NoRateForDateError (mirror of Phase 11 PrizesNotProcessedError class shape)"
    - "F-7 exchangeRateId locked at create time; never re-converted on read"
    - "FIN-LEDGER-09 IMMUTABLE Set strip at SERVICE layer + controller pre-strip (defense-in-depth)"
    - "D-06 atomic reversal: prisma.\$transaction(async (tx) => ...) interactive callback form (NOT array form — second statement needs newReversal.id)"
    - "P-4 list default excludes both halves of reversed pairs (reversedById:null AND reversesId:null)"
    - "P-6 settlement re-validate at createEntry (status IN CONFIRMED/ADJUSTED) — backend guard against racy picker"
    - "D-07 AuditLog with FULL diagnostic triple userId + ipAddress=req.ip + userAgent=req.get('user-agent') — corrects admin-jobs.controller.js:126-134 omission"
    - "Class-based controllers exported as `export default new XController()` (mirror provider.controller.js); route binding deferred to Plan 13-03"
    - "FIN-RATE-02 + FIN-LEDGER-06 immutability enforced via SURFACE AREA (no updateRate/deleteRate/deleteCategory/deleteEntry exports)"
key_files:
  created:
    - "backend/src/services/exchange-rate.service.js"
    - "backend/src/services/accounting-entry.service.js"
    - "backend/src/services/category.service.js"
    - "backend/src/controllers/exchange-rate.controller.js"
    - "backend/src/controllers/accounting-entry.controller.js"
    - "backend/src/controllers/category.controller.js"
    - ".planning/phases/13-exchange-rate-accounting-ledger/13-02-SUMMARY.md"
  modified: []
decisions:
  - "Followed PATTERNS.md sections 2, 3, 4, 6, 7, 8 verbatim — no structural deviations"
  - "reverseEntry description uses `Reversal de #${original.sequentialNo ?? original.id.slice(0, 8)}` — sequentialNo is the autoincrement column added in Plan 13-01 (PATTERNS.md section 1 RESEARCH O1 inclusion), so the fallback id.slice(0,8) is dead code in practice but kept defensively"
  - "Hand-rolled payload validation in all 3 controllers (no zod) — matches in-tree convention (planner pre-decision O4 in 13-02-PLAN.md)"
  - "Number.isFinite + > 0 used as the lightweight positive-decimal check in controllers. The actual decimal.js .toFixed(8) computation lives in the service layer (createEntry) — controllers only gate gross-shape correctness, not arithmetic precision"
  - "Controller-side IMMUTABLE strip uses an allow-list (EDITABLE_PATCH_KEYS = description/categoryId/settlementId) instead of a deny-list. Allow-list is safer against schema evolution: if a new immutable field is added to AccountingEntry in a future migration, no controller change is needed"
  - "AuditLog 'UPDATE' diff snapshot includes settlementId in the before/after — wider than PATTERNS.md section 7 sample (description + categoryId only) but still strictly within the FIN-LEDGER-09 EDITABLE surface"
  - "Reversal guard error messages bubble up as HTTP 400 (not 500): controller string-matches on 'Entry ya reversado' / 'No se puede reversar un asiento de reversal'. Brittle but acceptable for v1 — could be replaced with a typed error class in a follow-up if reuse appears"
  - "ExchangeRateController#create — no AuditLog helper method (only one mutation method in the class). Inline auditLog.create call. CategoryController + AccountingEntryController use a private `_writeAudit(action, entityId, req, changes)` helper since they have 3+ mutation methods each"
  - "Category.update is rename-only — appliesTo is intentionally immutable at the service layer (renameCategory takes name only). Rationale: changing appliesTo would reclassify historical entries silently"
  - "Did NOT auto-stage backend/src/services/publication.service.js or any other pre-existing dirty files (project-wide deletions of phases 01-08 .planning dirs + various untracked docs were present at session start). Only the 6 plan-scope files + this SUMMARY were committed"
metrics:
  duration_minutes: ~8
  tasks_completed: 3
  files_created: 7
  files_modified: 0
  commits:
    - hash: "c33ef7e"
      message: "feat(13-02): exchange-rate + category services"
    - hash: "772c30d"
      message: "feat(13-02): accounting-entry service with reversal $transaction"
    - hash: "c17558b"
      message: "feat(13-02): rate/entry/category controllers with AuditLog"
  completed: 2026-05-15T23:19:00Z
---

# Phase 13 Plan 2: Exchange Rate + Accounting Ledger Services + Controllers Summary

Backend business-logic and request-handling layer for Phase 13. Three pure-query/CRUD services (no req-handling, no HTTP, no AuditLog writes) + three class-based controllers that wrap each mutation in an `AuditLog` row with the FULL diagnostic triple (`userId` + `ipAddress` + `userAgent`). All six files import cleanly under `node --input-type=module`. F-4 (decimal.js precision), F-6 (USD-without-rate block via `NoRateForDateError`), F-7 (locked `exchangeRateId` at create), FIN-LEDGER-09 (immutable monetary fields stripped at both controller and service layers), D-01 (`getEffectiveRateForDate` is the single chokepoint), D-02 (category soft-delete only), D-03 + P-6 (PAYMENT→settlement re-validate), D-06 (atomic reversal `$transaction`), and D-07 + P-4 (audit triple) are all enforced.

## Exported Surface — Exact Names

### `backend/src/services/exchange-rate.service.js`

```javascript
export async function getEffectiveRateForDate(date)
export async function listRates({ rateType, from, to } = {})
export async function createRate(data, userId)
```

**Intentional absences (FIN-RATE-02):** no `updateRate`, no `deleteRate`.

### `backend/src/services/accounting-entry.service.js`

```javascript
export class NoRateForDateError extends Error { ... }
export async function createEntry({ type, entryDate, categoryId, description, currency, amount, settlementId, createdById })
export async function updateEntry(id, patch)            // strips IMMUTABLE = { amountBsF, originalAmount, originalCurrency, entryDate, exchangeRateId, type }
export async function reverseEntry(originalId, reversalReason, userId)   // $transaction(async (tx) => {...})
export async function listEntries({ type, categoryId, settlementId, providerId, from, to, includeReversed = false } = {})
export async function getEntry(id)
```

**Intentional absences:** no `deleteEntry`.

`Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` is at module scope (line directly after imports).

### `backend/src/services/category.service.js`

```javascript
export async function listCategories({ appliesTo, includeInactive = false } = {})
export async function createCategory({ name, appliesTo }, userId)
export async function deactivateCategory(id)
export async function reactivateCategory(id)
export async function renameCategory(id, name)
```

**Intentional absences (FIN-LEDGER-06):** no `deleteCategory`.

### `backend/src/controllers/exchange-rate.controller.js`

```javascript
class ExchangeRateController {
  async create(req, res)   // POST /tasas — payload validation + createRate + AuditLog CREATE
  async list(req, res)     // GET  /tasas
}
export default new ExchangeRateController();
```

**Intentional absences (FIN-RATE-02):** no `update`, no `delete`.

### `backend/src/controllers/accounting-entry.controller.js`

```javascript
class AccountingEntryController {
  async create(req, res)   // POST /asientos — catches NoRateForDateError → 400; rejects amountBsF/originalAmount/exchangeRateId from body
  async list(req, res)     // GET  /asientos
  async getOne(req, res)   // GET  /asientos/:id — embeds auditHistory
  async update(req, res)   // PATCH /asientos/:id — pre-strips to EDITABLE_PATCH_KEYS
  async reverse(req, res)  // POST /asientos/:id/reverse — validates reversalReason; maps guard errors to 400
  async _writeAudit(action, entityId, req, changes)   // private helper
}
export default new AccountingEntryController();
```

**Intentional absences:** no `delete`.

### `backend/src/controllers/category.controller.js`

```javascript
class CategoryController {
  async create(req, res)       // POST /categorias — P2002 on @@unique([appliesTo, name]) → 409
  async list(req, res)         // GET  /categorias
  async update(req, res)       // PATCH /categorias/:id — rename only
  async deactivate(req, res)   // PATCH /categorias/:id/deactivate
  async reactivate(req, res)   // PATCH /categorias/:id/reactivate
  async _writeAudit(action, entityId, req, changes)   // private helper
}
export default new CategoryController();
```

**Intentional absences (FIN-LEDGER-06):** no `delete`.

## Payload Validation Shape

Hand-rolled per planner pre-decision O4 — no zod. Validation lives in the controllers; services trust well-shaped inputs but enforce business rules (F-6, P-6, IMMUTABLE strip).

| Endpoint                                      | Required body keys                                        | Forbidden body keys                                   | Other validation                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /tasas`                                 | `date` (parseable), `rateBsPerUsd` (positive), `rateType` | —                                                     | `rateType ∈ {BCV, PARALELO, OTRO}`; `notes` optional                                                                                                      |
| `POST /asientos`                              | `type`, `entryDate`, `categoryId`, `description`, `currency`, `amount` | `amountBsF`, `originalAmount`, `exchangeRateId`     | `type ∈ {INCOME, EXPENSE, PAYMENT}`; `currency ∈ {BsF, USD}`; `amount` positive numeric; `settlementId` optional                                          |
| `PATCH /asientos/:id`                         | at least one of `description` / `categoryId` / `settlementId` | everything else (pre-stripped to EDITABLE allow-list) | service also strips IMMUTABLE defense-in-depth                                                                                                            |
| `POST /asientos/:id/reverse`                  | `reversalReason` (non-empty trimmed)                       | —                                                     | service guards: cannot reverse already-reversed, cannot reverse a reversal                                                                                |
| `POST /categorias`                            | `name` (non-empty trimmed), `appliesTo`                   | —                                                     | `appliesTo ∈ {INCOME, EXPENSE, PAYMENT}`; P2002 → 409                                                                                                     |
| `PATCH /categorias/:id`                       | `name` (non-empty trimmed)                                | —                                                     | rename only — `appliesTo` intentionally immutable                                                                                                          |

The route file in Plan 13-03 will wire these methods with `.bind(controller)` per the `provider.routes.js` convention.

## Reversal Description Format

`reverseEntry`'s new entry uses:

```javascript
description: `Reversal de #${original.sequentialNo ?? original.id.slice(0, 8)}`
```

`sequentialNo` was added to `AccountingEntry` in Plan 13-01 as `Int @unique @default(autoincrement())` (RESEARCH Open Question O1 — PATTERNS.md section 1 recommended inclusion). Since the column always carries a value, the `id.slice(0, 8)` fallback is dead code in practice but kept defensively in case a future schema migration removes the field.

## Deviations from Plan

### 1. [Rule 2 — Auto-add critical functionality] Controller IMMUTABLE strip uses ALLOW-list, not DENY-list

**Found during:** Task 3.

**Issue:** PATTERNS.md section 7 shows controller-side strip with description + categoryId in the diff (an implicit allow-list). However, the plan's `<behavior>` and `<action>` blocks describe stripping `amountBsF / originalAmount / exchangeRateId` (deny-list of computed fields) on `create`, and stripping non-EDITABLE keys on `update`.

**Fix:** `update` uses an explicit allow-list `EDITABLE_PATCH_KEYS = new Set(['description', 'categoryId', 'settlementId'])`. The service ALSO strips `IMMUTABLE = new Set(['amountBsF', 'originalAmount', 'originalCurrency', 'entryDate', 'exchangeRateId', 'type'])` (deny-list as authoritative gate). Allow-list at the controller is safer against schema evolution — adding a new immutable field to AccountingEntry would NOT silently leak through the controller, because only the explicitly listed editable fields survive.

**Files modified:** `backend/src/controllers/accounting-entry.controller.js`.

**Commit:** `c17558b`.

### 2. [Rule 2 — Auto-add critical functionality] settlementId included in AuditLog UPDATE diff

**Found during:** Task 3.

**Issue:** PATTERNS.md section 7's sample `_writeAudit('UPDATE', ...)` shows only `description` + `categoryId` in the before/after snapshot. Since `settlementId` is in the EDITABLE allow-list (per the plan's `<action>` block), the audit diff should capture changes to it too.

**Fix:** Added `settlementId` to the before/after snapshot in `AccountingEntryController#update`. Still strictly within FIN-LEDGER-09 EDITABLE surface — no IMMUTABLE field leaks into the audit row.

**Files modified:** `backend/src/controllers/accounting-entry.controller.js`.

**Commit:** `c17558b`.

### 3. [Rule 2 — Auto-add critical functionality] Reversal guard errors mapped to HTTP 400 (not 500)

**Found during:** Task 3.

**Issue:** PATTERNS.md section 7's `reverse` method swallows all errors as 500. But the service-layer guards (`'Entry ya reversado'`, `'No se puede reversar un asiento de reversal'`) are client-correctable business-rule violations, not server faults — admin UI needs to render an actionable message.

**Fix:** `AccountingEntryController#reverse` string-matches the two guard messages and maps them to 400. Brittle but acceptable for v1. A follow-up could introduce typed guard error classes if reuse appears (similar to `NoRateForDateError`).

**Files modified:** `backend/src/controllers/accounting-entry.controller.js`.

**Commit:** `c17558b`.

### 4. [Rule 2 — Auto-add critical functionality] CategoryController#deactivate + reactivate were not explicitly enumerated in the verify command's mutation-method list, but FIN-LEDGER-06 requires them

**Issue:** The Task 3 `<verify>` automated grep tests `['create','list','update','deactivate','reactivate']` for the category controller, which matches PATTERNS.md section 8's enumeration. `<behavior>` block also lists `reactivate`. Implementation includes both.

**Fix:** N/A — implementation is correct. Recording for traceability only.

### 5. [Note, not a deviation] No in-tree pattern conflict on `req.ip`

The plan called out a potential pitfall (P-8) where `req.ip` could return a non-public address despite trust proxy. Inspection of `backend/src/index.js:24` confirms `app.set('trust proxy', 1)` is set. No test execution was performed in this plan (Plan 13-03 owns the integration test), but the existing trust-proxy configuration is the documented mitigation per the plan's `<interfaces>` block.

## Authentication Gates

None encountered.

## Verification Checklist

- [x] 6 plan-scope files created (3 services + 3 controllers)
- [x] Task 1 verify command exits 0 (rate + cat services smoke import + forbidden-export check)
- [x] Task 2 verify command exits 0 (entry service smoke + `$transaction(async (tx)` grep + `reversedById: null` grep + `IMMUTABLE = new Set` grep)
- [x] Task 3 verify command exits 0 (controller smoke + forbidden-method check + per-file `ipAddress: req.ip` grep + per-file `userAgent: req.get` grep)
- [x] No `update` / `delete` exported from rate controller
- [x] No `delete` exported from entry controller
- [x] No `delete` exported from category controller
- [x] `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` at module scope of accounting-entry.service.js
- [x] `reverseEntry` uses interactive `$transaction(async (tx) =>` form (not array form)
- [x] `listEntries` default filter includes BOTH `reversedById: null` AND `reversesId: null` (P-4)
- [x] `updateEntry` strips IMMUTABLE set before forwarding to prisma.update (service + controller)
- [x] `NoRateForDateError` class exported and caught by controller → 400
- [x] All 3 controllers write AuditLog rows with `ipAddress: req.ip` AND `userAgent: req.get('user-agent')`
- [x] No router/routes file touched (Plan 13-03 owns wiring)
- [x] No pre-existing dirty files auto-staged
- [x] LOCAL ONLY — no `ssh 94`, no `pm2 restart`, no `git push`

## Self-Check: PASSED

Files verified to exist:

- `backend/src/services/exchange-rate.service.js` FOUND
- `backend/src/services/accounting-entry.service.js` FOUND
- `backend/src/services/category.service.js` FOUND
- `backend/src/controllers/exchange-rate.controller.js` FOUND
- `backend/src/controllers/accounting-entry.controller.js` FOUND
- `backend/src/controllers/category.controller.js` FOUND

Commits verified in `git log`:

- `c33ef7e feat(13-02): exchange-rate + category services` FOUND
- `772c30d feat(13-02): accounting-entry service with reversal $transaction` FOUND
- `c17558b feat(13-02): rate/entry/category controllers with AuditLog` FOUND

Plan-level 6-file smoke import (parallel imports from a single node process) succeeded:

```
services: function function function
controllers: function function function
NoRateForDateError: function
ALL 6 IMPORTS OK
```

## Pointer for Plan 13-03

Plan 13-03 (routes + multer + attachments + static-storage guard) imports the three controller default exports and wires them with `.bind(controller)` per `provider.routes.js`:

```javascript
import rateController     from '../controllers/exchange-rate.controller.js';
import entryController    from '../controllers/accounting-entry.controller.js';
import categoryController from '../controllers/category.controller.js';

router.post('/tasas',                      authMiddleware, rateController.create.bind(rateController));
router.get('/tasas',                       authMiddleware, rateController.list.bind(rateController));

router.post('/asientos',                   authMiddleware, entryController.create.bind(entryController));
router.get('/asientos',                    authMiddleware, entryController.list.bind(entryController));
router.get('/asientos/:id',                authMiddleware, entryController.getOne.bind(entryController));
router.patch('/asientos/:id',              authMiddleware, entryController.update.bind(entryController));
router.post('/asientos/:id/reverse',       authMiddleware, entryController.reverse.bind(entryController));

router.post('/categorias',                 authMiddleware, categoryController.create.bind(categoryController));
router.get('/categorias',                  authMiddleware, categoryController.list.bind(categoryController));
router.patch('/categorias/:id',            authMiddleware, categoryController.update.bind(categoryController));
router.patch('/categorias/:id/deactivate', authMiddleware, categoryController.deactivate.bind(categoryController));
router.patch('/categorias/:id/reactivate', authMiddleware, categoryController.reactivate.bind(categoryController));
```

Plan 13-03 also adds the `/asientos/:id/attachments` POST/DELETE/GET routes (multer + file-type byte validation + auth-gated stream) using `attachment.service.js` + `attachment.controller.js` (per PATTERNS.md sections 5 + 9). Receipt storage path: `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` keyed on `entryDate` (NOT upload date — D-04 + P-5).

The F-6 backend block is integration-testable via Plan 13-03's test suite: `POST /asientos { currency: 'USD', entryDate: <date with no rate> }` should return HTTP 400 with the `NoRateForDateError` message.
