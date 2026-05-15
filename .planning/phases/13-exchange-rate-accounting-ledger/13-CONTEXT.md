---
phase: 13
phase_name: Exchange Rate + Accounting Ledger
created: 2026-05-15
status: locked
---

# Phase 13 Context — Exchange Rate + Accounting Ledger

<domain>
Admin records daily BsF-per-USD exchange rates (immutable, typed by BCV/PARALELO/OTRO) and creates accounting entries (INCOME/EXPENSE/PAYMENT) in BsF or USD with receipt attachments. Full audit trail. PAYMENT entries can optionally link to one or more `ProviderWeeklySettlement` rows (Phase 12) to mark partial or full payment. The ledger is append-only — corrections happen via reversal entries, never UPDATE/DELETE of historical amounts.
</domain>

<requirements_lock>
**Locked by `.planning/REQUIREMENTS.md` — FIN-RATE-01..05 + FIN-LEDGER-01..09.** Planner MUST read REQUIREMENTS.md before generating plans. Do not duplicate requirements text here.

Key locked elements (not up for re-discussion):
- ExchangeRate is immutable post-create (FIN-RATE-02). Corrections = new dated row.
- Rate types: BCV / PARALELO / OTRO (FIN-RATE-01; F-8 — column from day one).
- `createdById` + `createdAt` audit on every rate row (FIN-RATE-03).
- USD entry rejected if no rate exists for `entryDate` (FIN-RATE-04, F-6) — backend AND frontend block.
- USD entries persist `originalAmount`, `originalCurrency`, `exchangeRateId` plus computed `amountBsF`. Historical USD equivalent = `amountBsF / historicalRate` — NEVER re-converted (FIN-LEDGER-02/03, F-7).
- AccountingEntry types: INCOME / EXPENSE / PAYMENT (FIN-LEDGER-01).
- Receipt files: PDF / JPG / PNG, max 5MB, server-side MIME validation, UUID filename, path `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` (FIN-LEDGER-04, F-14).
- Receipts served via admin-auth route only; direct filesystem URL returns 401 (FIN-LEDGER-05).
- Categories are configurable strings (no Account model — F-16; FIN-LEDGER-06).
- Editable on entry post-create: description, category, attachments. Immutable: amountBsF, entryDate, exchangeRateId (FIN-LEDGER-09).
- PAYMENT can link to a `ProviderWeeklySettlement` to mark paid (FIN-LEDGER-07).
- Filter list by date range, type, category, linked provider/settlement (FIN-LEDGER-08).
</requirements_lock>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — FIN-RATE-01..05 + FIN-LEDGER-01..09 (locked — MUST read before planning)
- `.planning/ROADMAP.md` lines 244-256 — Phase 13 spec, parallel-with-12 note, pitfall map
- `.planning/phases/12-provider-commission-engine/12-CONTEXT.md` — Phase 12 D-03 (CONFIRMED terminal), `ProviderWeeklySettlement` schema (PAYMENT FK target)
- `.planning/phases/12-provider-commission-engine/12-RESEARCH.md` — AuditLog usage pattern (referenced in this phase too)
- `backend/prisma/schema.prisma:404` — existing `AuditLog` model (REUSE for all D-07 events; no new audit table)
- `backend/prisma/schema.prisma` — `User` model (createdById FK target)
- `backend/src/middleware/auth.middleware.js` (or equivalent) — admin auth gate to reuse for `/api/contabilidad/*` and receipt-serving routes
- `backend/src/lib/dateUtils.js` — Venezuela TZ helpers (entryDate normalization)
- `backend/src/controllers/admin-jobs.controller.js:126-134` — AuditLog write pattern (action, entity, entityId, userId, ipAddress, userAgent, changes Json)
- `./CLAUDE.md` — project conventions (ES modules, singleton prisma, port 5433, LOCAL ONLY this session)
</canonical_refs>

<decisions>

## D-01 — Rate selection: "last loaded of the day" (createdAt DESC)

When multiple `ExchangeRate` rows exist for the same `date` (different `rateType` values), USD→BsF auto-conversion on a new accounting entry uses the row with the **most recent `createdAt`** for that date.

Selection SQL:
```sql
SELECT * FROM "ExchangeRate"
WHERE date = :entryDate
ORDER BY "createdAt" DESC
LIMIT 1
```

The admin sees which rate was used by reading `entry.exchangeRateId` → joined `rateType` and `rateBsPerUsd` columns shown in the entry detail and exports.

**Rationale:** simpler than per-entry rate selection. Predictable if the operator follows a convention (e.g., always BCV first, then PARALELO if needed). Acceptable because rates are append-only and the historical entry never re-converts.

**Implication for backfill / migration:** if the operator's existing workflow has multiple same-day rates with no clear "primary", they must accept that the entry pulled whatever was created last that day. Documented in DEPLOY.md.

## D-02 — Categories segregated by AccountingEntry type

`Category` rows carry an `appliesTo` enum (`INCOME` / `EXPENSE` / `PAYMENT`). A category created with `appliesTo=EXPENSE` cannot be selected on an INCOME entry form. Categories are NOT type-polymorphic.

Optional seed strategy: the schema migration seeds an initial set (planner decides exact list, but candidates include `EXPENSE`: Sueldos / Internet / Alquiler / Hosting; `INCOME`: Premios cobrados / Otros ingresos; `PAYMENT`: Comisiones proveedor / Premios pagados). Admin can deactivate (soft-disable, not delete — preserves historical entries' category labels).

**Field shape:**
```prisma
model Category {
  id          String   @id @default(cuid())
  name        String
  appliesTo   AccountingEntryType  // INCOME | EXPENSE | PAYMENT
  isActive    Boolean  @default(true)
  createdById String
  createdAt   DateTime @default(now())
  ...
  @@unique([appliesTo, name])
}
```

Soft-delete via `isActive=false` — never hard-delete (FIN-LEDGER-06 implication + audit-friendly).

## D-03 — PAYMENT → Settlement is FK optional, 1 settlement to N payments

A `ProviderWeeklySettlement` may receive multiple partial payments. Settlement is "fully paid" when `SUM(payments.amountBsF) >= settlement.amount` (or admin manually marks paid — planner decides exact UX).

**Schema shape (additions over baseline AccountingEntry):**
```prisma
model AccountingEntry {
  ...
  settlementId String?
  settlement   ProviderWeeklySettlement? @relation(...)
  ...
}
```

UI: a PAYMENT entry has an optional "Asignar a liquidación" picker. Picker lists settlements where `status IN ('CONFIRMED', 'ADJUSTED')` (cannot pay a DRAFT) and `paidAmount < amount`. Paid amount is computed on render via aggregation.

**Out of Phase 13 scope (deferred):** auto-transition settlement.status to a "PAID" terminal state — Phase 12 D-09 only defines DRAFT/CONFIRMED/ADJUSTED. If the operator later wants `PAID` status, a follow-up phase will add it. For now, "paid" is implicit via SUM aggregation.

## D-04 — Receipts: N attachments per entry via separate table

Add `AccountingEntryAttachment` model:
```prisma
model AccountingEntryAttachment {
  id           String   @id @default(cuid())
  entryId      String
  entry        AccountingEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  filename     String   // UUID-based, e.g., "a1b2c3d4-e5f6.pdf"
  originalName String   // operator-provided name preserved for UI display
  mimeType     String   // validated server-side, NOT trusted from client
  sizeBytes    Int
  uploadedById String
  uploadedAt   DateTime @default(now())
}
```

Admin can upload multiple files (one at a time in v1 — multi-file drag-drop is backlog). Each file independently downloadable via auth-gated route. Delete-attachment writes an AuditLog row (D-07) but does NOT cascade onto the entry (entry persists with N-1 attachments).

**File storage layout:** `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` where `YYYY/MM` is the entry's `entryDate` (NOT upload date) for predictable archive-by-fiscal-month behavior.

## D-05 — UI module: `/admin/contabilidad` with 4 sub-tabs

Top-level admin section `/admin/contabilidad` with sub-tabs:
1. **Asientos** (default) — AccountingEntry list with filters (type, dateRange, category, linkedProvider/settlement) + "Nuevo asiento" form. Entry-detail page shows description, amounts (BsF + USD historical eq), receipts, AuditLog history.
2. **Tasas de cambio** — daily rate timeline with rateType filter, "Nueva tasa" form. Shows the picker list per date so admin sees BCV+PARALELO together.
3. **Categorías** — CRUD-style table grouped by `appliesTo`. Activate/deactivate, not hard-delete.
4. **Pagos a proveedores** — filtered view of PAYMENT entries linked to settlements; quick "marcar pagado" action launching the AccountingEntry form pre-populated with the settlement. (Reads from `AccountingEntry` + `ProviderWeeklySettlement`; does NOT introduce a new model.)

**Navigation:** new top-level admin menu item "Contabilidad" — distinct from "Comisiones" (Phase 12). Operator's mental model: comisiones = qué nos deben los proveedores; contabilidad = entradas/salidas reales de dinero.

## D-06 — Reversal mechanism: button-triggered, system creates negative entry

Entry detail page has a "Reversar" button (visible only when `entry.reversedById IS NULL` AND `entry.reversesId IS NULL`, i.e., neither the original nor already a reversal).

Clicking the button:
1. Opens a confirmation modal asking for a reason (required, written to `reversalReason TEXT` on the new row).
2. Server creates a NEW AccountingEntry with:
   - Same `type`, `categoryId`, `entryDate`, `exchangeRateId`, `currency`, `description: 'Reversal de #' + originalSequentialNo`.
   - `amountBsF: -original.amountBsF`, `originalAmount: -original.originalAmount` (if USD).
   - `reversesId: original.id` (FK back to the entry being reversed).
3. Server updates the original row's `reversedById: newReversalEntry.id` to mark it as reversed (one-time write to a nullable column — does NOT violate immutability because no monetary field is touched).
4. Both rows visible in lists with a "Reversado" badge on the original and "Reversal de #X" on the new one. Filters can hide reversed pairs.

**Why not soft-delete:** preserves the financial history as a real ledger. SUM aggregations naturally cancel reversed pairs. Audit-friendly.

**Edge case:** cannot reverse a reversal. Cannot reverse an entry that has a payment-linked settlement that is now ADJUSTED — admin must un-link first (or this becomes a Phase 14 polish item).

## D-07 — AuditLog events (all 4 categories covered)

Following the existing `AuditLog` pattern (`prisma/schema.prisma:404`, write pattern at `admin-jobs.controller.js:126-134`), Phase 13 writes audit rows for:

| Action | Entity | When |
|---|---|---|
| `CREATE` | `ExchangeRate` | On POST /api/contabilidad/tasas |
| `REVERSE` | `AccountingEntry` | On POST /api/contabilidad/asientos/:id/reverse |
| `CREATE` / `UPDATE` | `AccountingEntry` | On create or non-financial-field update |
| `CREATE` / `DEACTIVATE` | `Category` | On category CRUD (no hard delete; only isActive=false) |
| `UPLOAD` / `DELETE` | `AccountingEntryAttachment` | On receipt upload/remove |

Every audit row includes: `userId`, `ipAddress`, `userAgent`, `changes` JSON snapshot (especially valuable on UPDATE — capture the before/after diff for the editable fields).

`AuditLog` is read-only from the UI in Phase 13 — admin can see the history on the entry-detail page but cannot mutate audit rows. (Phase 14 may add a global audit viewer; deferred.)

</decisions>

<scope_boundaries>

**IN scope (Phase 13):**
- `ExchangeRate` model (immutable, typed)
- `AccountingEntry` model (3 types, BsF+USD support, reversal mechanism)
- `Category` model (configurable per-type)
- `AccountingEntryAttachment` model (N receipts per entry, MIME-validated)
- Backend routes: rates CRUD-create + list, entries CRUD with reversal, categories CRUD-style with deactivate, attachments upload/delete/download
- Receipt-serving auth-gated route
- Admin UI `/admin/contabilidad` with 4 sub-tabs
- AuditLog wiring for all D-07 events
- Migration applied locally + `prisma generate`

**OUT of scope (deferred):**
- Auto-transition of settlement to "PAID" status when SUM(payments) >= amount → backlog (would require Phase 12 schema mod)
- Multi-file drag-drop receipt upload → backlog (v1 = one file at a time)
- Bulk reverse / bulk pay → backlog
- CSV/Excel import of historical entries → backlog (current operator has no source data to import per session findings)
- Currency beyond BsF/USD → out of milestone v1.3
- AuditLog global viewer UI → Phase 14 or backlog
- Receipt OCR / amount extraction → backlog (operator-typed amounts trusted)
- Per-category budget alerts → backlog
- Multi-tenant accounting (separate books) → out of milestone

</scope_boundaries>

<deferred>

Ideas surfaced during discussion:
- "Receipt OCR to extract amount and date" — backlog.
- "Email alert when an EXPENSE category exceeds N BsF in a month" — backlog (would need budgets table).
- "Provider portal to see their own PAYMENT history" — backlog (Phase 12 deferred list overlaps).
- "Auto-generate monthly P&L PDF and email to admin" — Phase 14 dashboard covers part of this; PDF email backlog.
- "Multi-currency beyond USD (EUR, COP)" — out of milestone v1.3 (USD only as second currency).
- "Auto-mark settlement as PAID when cumulative payments reach amount" — backlog (Phase 12 schema would need a new status).

</deferred>

<assumptions_for_planner>

Things the planner can assume without re-asking:
1. **Decimal precision:** all monetary columns are `NUMERIC(18,8)` consistent with Phase 11/12 (F-4 convention). Service computations use `decimal.js` with `ROUND_HALF_UP`.
2. **TZ for entryDate:** entries store `entryDate DATE` (just date, no time). Comparison and date-bucketing happen in Venezuela TZ (America/Caracas) consistently with Phase 12's snapshot worker pattern.
3. **Rate-row lookup helper:** create `getEffectiveRateForDate(date)` in a new `exchange-rate.service.js` that wraps the D-01 selection query. The accounting controller MUST call this helper — never inline the query.
4. **MIME validation library:** use `file-type` npm package (probably already a transitive dep; planner should grep + verify). Do NOT trust `req.file.mimetype` from multer — it's client-supplied. Validate by reading the actual file bytes.
5. **5MB enforcement:** at multer config level (statusCode 413 on exceed). Plus a defensive sizeBytes check in the controller before insert.
6. **UUID generation for filenames:** use `crypto.randomUUID()` (Node 19+ stdlib — available in Node 25). Do NOT use the operator's filename anywhere on disk; preserve only in `originalName` column.
7. **Cascade:** `AccountingEntry` ↔ `AccountingEntryAttachment` has `onDelete: Cascade` so admin-side hard delete cleans up attachments. But: in practice admin never hard-deletes entries (reversal pattern), so cascade is a defensive safety, not a primary flow.
8. **Reversal arithmetic:** the original keeps positive amounts; the reversal carries negative amounts. Filters can opt-in/out of "show reversed pairs" — default is "show all". Reports SUM both, which naturally cancels — that is the intended financial-history behavior.
9. **PAYMENT → settlement guard:** picker lists settlements with status IN ('CONFIRMED', 'ADJUSTED'). DRAFT excluded. Backend re-validates on POST to prevent racy client.
10. **No need to revisit Phase 12 schema:** Phase 12 ships first sequentially in this session, so when Phase 13 plans land, `ProviderWeeklySettlement` already exists. The FK in `AccountingEntry.settlementId` is declared in the Phase 13 migration.

</assumptions_for_planner>

<pitfall_mitigations>

Pre-locked from ROADMAP.md (planner must verify in plan acceptance criteria):
- **F-6** — backend AND frontend reject USD entry without same-date `ExchangeRate`. Frontend disables submit; backend returns 400 with explicit error. Integration test for both.
- **F-7** — historical USD eq = `amountBsF / exchangeRate.rateBsPerUsd` where `exchangeRateId` is the row LOCKED at entry creation. Tests with a 6-month-old entry to confirm new same-date rates do NOT change the report number.
- **F-8** — `rateType` column on `ExchangeRate` from day one. Migration must include it (not added later).
- **F-14** — MIME validation via `file-type` byte inspection, 5MB limit at multer, UUID filename, storage path outside web root (`backend/storage/receipts/...`), served only via auth-gated controller. Test: upload `.html` renamed to `.pdf` must reject with 422.
- **F-16** — no `Account` model. Categories are simple configurable rows. No hierarchy, no double-entry bookkeeping in v1.

</pitfall_mitigations>

<next_steps>

1. Run `/gsd-plan-phase 13` to generate detailed plans.
2. Planner reads: this file, REQUIREMENTS.md, ROADMAP.md, Phase 12 CONTEXT.md, AuditLog reference at `admin-jobs.controller.js:126-134`.
3. After plans created, Phase 14 discuss next, then batch execution at the end.

</next_steps>
