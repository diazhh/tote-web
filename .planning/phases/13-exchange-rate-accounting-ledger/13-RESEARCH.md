# Phase 13: Exchange Rate + Accounting Ledger — Research

**Researched:** 2026-05-15
**Domain:** Backend persistence (Prisma + Postgres), file uploads (multer + file-type byte inspection), append-only ledger arithmetic (decimal.js), admin Next.js UI (plain `useState` form pattern), AuditLog wiring.
**Confidence:** HIGH on stack/conventions (verified in tree), HIGH on architectural decisions (locked by CONTEXT.md), MEDIUM on `file-type` v19 ESM behavior (verified at npm but no in-tree usage), HIGH on the F-14 static-serving footgun (verified in `backend/src/index.js:136`).

## Summary

Phase 13 ships four new Prisma models (`ExchangeRate`, `AccountingEntry`, `Category`, `AccountingEntryAttachment`), one new admin section `/admin/contabilidad` with four sub-tabs, backend routes under `/api/contabilidad/*` mounted behind `authenticate + authorize('ADMIN')`, and AuditLog writes for the eight D-07 action+entity combinations. All seven D-01..D-07 design choices are locked by CONTEXT.md; this research's job is to surface the in-tree patterns the planner reuses and to flag the **two real codebase gaps** that affect the plan.

**Gap 1 (BLOCKING for F-14):** `backend/src/index.js:136` mounts `app.use('/storage', express.static(...))` — this currently exposes the entire `backend/storage/` directory tree to the public Internet without auth. The receipt-path CONTEXT.md locks (`backend/storage/receipts/YYYY/MM/{uuid}.{ext}`) is *inside* this publicly served tree. The plan MUST either (a) add a router-level guard that rejects `/storage/receipts/*` from the static handler and routes those through the auth-gated controller, or (b) move receipts to a sibling path like `backend/private-storage/receipts/` that is not statically served. **Option (a) is the minimum change**, but the planner should pick one explicitly and write the test that proves it (CONTEXT.md success criterion 5: "a direct URL to `storage/receipts/` without auth returns 401").

**Gap 2 (dependency-add):** `multer` and `file-type` are NOT in `backend/package.json` — both need an npm install task in Plan 1 of this phase. Versions: `multer@^2.1.1` (current latest), `file-type@^19.x` (pure ESM, works because backend is `"type": "module"`). No in-tree multer usage exists today; this is the first file-upload feature in the backend.

**Primary recommendation:** Land the schema migration + storage-path lockdown + multer/file-type install in the first plan; then route+controller (rates/entries/categories), then attachment upload/serve controller; then frontend last. Reuse the proven `useState` form pattern (NOT react-hook-form, even though it's installed in `package.json:23` — admin has zero adopters in-tree), the singleton `prisma` import, the `AuditLog` write pattern at `admin-jobs.controller.js:126-134`, and the `decimal.js` + `Decimal @db.Decimal(18, 8)` precision convention from Phase 11/12.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Rate selection: "last loaded of the day" (createdAt DESC).** When multiple ExchangeRate rows exist for the same `date`, USD→BsF auto-conversion uses the row with the most recent `createdAt`. Single helper `getEffectiveRateForDate(date)` in a new `exchange-rate.service.js` wraps the lookup; the accounting controller MUST call this helper, never inline the query. Selection SQL:
```sql
SELECT * FROM "ExchangeRate" WHERE date = :entryDate ORDER BY "createdAt" DESC LIMIT 1
```

**D-02 — Categories segregated by AccountingEntry type.** `Category.appliesTo` enum (INCOME / EXPENSE / PAYMENT). A category created with `appliesTo=EXPENSE` cannot be selected on an INCOME entry form. `@@unique([appliesTo, name])`. Soft-disable via `isActive=false` — never hard-delete.

**D-03 — PAYMENT → Settlement is FK optional, 1 settlement to N payments.** `AccountingEntry.settlementId String?` with FK to `ProviderWeeklySettlement.id`. UI picker lists settlements where `status IN ('CONFIRMED', 'ADJUSTED')` AND `paidAmount < amount`. Backend re-validates on POST. Paid amount is computed via aggregation (no new "PAID" status on settlement; deferred to backlog).

**D-04 — Receipts: N attachments per entry via separate `AccountingEntryAttachment` table** with `onDelete: Cascade` on the FK back to `AccountingEntry`. Fields: `entryId`, `filename` (UUID-based), `originalName` (operator-provided), `mimeType` (server-validated, NOT trusted from client), `sizeBytes`, `uploadedById`, `uploadedAt`. Storage path: `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` where `YYYY/MM` derives from `entryDate` (NOT upload date).

**D-05 — UI module: `/admin/contabilidad` with 4 sub-tabs.**
1. **Asientos** (default) — AccountingEntry list + filters + "Nuevo asiento" form + entry-detail page.
2. **Tasas de cambio** — daily rate timeline + "Nueva tasa" form.
3. **Categorías** — CRUD-style table grouped by `appliesTo`, with activate/deactivate (no hard-delete).
4. **Pagos a proveedores** — filtered view of PAYMENT entries linked to settlements; quick "marcar pagado" launches AccountingEntry form pre-populated with the settlement.

**D-06 — Reversal mechanism: button-triggered, system creates negative entry.** "Reversar" button visible only when `entry.reversedById IS NULL` AND `entry.reversesId IS NULL`. Confirmation modal asks for `reversalReason TEXT` (required). Server creates a NEW AccountingEntry with same `type/categoryId/entryDate/exchangeRateId/currency`, negated `amountBsF` and `originalAmount`, `reversesId: original.id`. Server updates original row's `reversedById: newReversalEntry.id` — one-time write to a nullable column, does NOT violate the immutability of monetary fields. Cannot reverse a reversal.

**D-07 — AuditLog events.** Reuse existing `AuditLog` model at `schema.prisma:404-422`. Eight action+entity combinations:
- `CREATE` × ExchangeRate
- `CREATE` / `UPDATE` × AccountingEntry
- `REVERSE` × AccountingEntry
- `CREATE` / `DEACTIVATE` × Category
- `UPLOAD` / `DELETE` × AccountingEntryAttachment

Every row includes `userId`, `ipAddress`, `userAgent`, `changes` JSON snapshot.

### Claude's Discretion

- Exact list of seeded categories per `appliesTo` (CONTEXT.md offers candidates: EXPENSE: Sueldos/Internet/Alquiler/Hosting; INCOME: Premios cobrados/Otros ingresos; PAYMENT: Comisiones proveedor/Premios pagados — planner picks final list and writes seed migration).
- Whether `--snapshot-historical-weeks` style flag is in scope (probably out — no backfill in Phase 13).
- Multi-file drag-drop receipt upload — explicitly deferred to backlog; v1 = one file at a time.
- UI form widget split: planner chooses tabbed-form vs single-page-with-collapsibles inside "Nuevo asiento".
- Sequential entry numbering for the "Reversal de #X" label — planner chooses cuid-derived display vs a new `sequentialNo Int @default(autoincrement())` column. CONTEXT.md mentions "originalSequentialNo" in the reversal description but does not lock the column.

### Deferred Ideas (OUT OF SCOPE)

- Auto-transition settlement.status to a "PAID" terminal state (would require Phase 12 schema mod).
- Multi-file drag-drop receipt upload.
- Bulk reverse / bulk pay.
- CSV/Excel import of historical entries.
- Currency beyond BsF/USD.
- AuditLog global viewer UI.
- Receipt OCR / amount extraction.
- Per-category budget alerts.
- Multi-tenant accounting.
- "Auto-mark settlement as PAID when cumulative payments reach amount."
- Email/Telegram alerts when an EXPENSE category exceeds N BsF.
- Provider portal to see their own PAYMENT history.
- Monthly P&L PDF and email.
- Multi-currency beyond USD.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIN-RATE-01 | Admin enters daily BsF-per-USD rate with `date` (unique within rateType — actually NOT unique across rateTypes, see D-01), `rateBsPerUsd`, `rateType` (BCV/PARALELO/OTRO), optional `notes` | `ExchangeRate` model section below — `rateType` enum + (date, createdAt) lookup index |
| FIN-RATE-02 | ExchangeRate is immutable post-create — no UPDATE endpoint exists | Route surface only exposes POST + GET; F-5-style protection — app-level rule |
| FIN-RATE-03 | All rate rows carry `createdById` + `createdAt` | Schema additions section — `createdById String` NOT NULL, audited via AuditLog too |
| FIN-RATE-04 | Reject USD entry when no `ExchangeRate` row exists for the entry's date | F-6 mitigation; backend AND frontend block; `getEffectiveRateForDate` returns null → 400 |
| FIN-RATE-05 | Admin views historical rate timeline with rateType filter | GET /api/contabilidad/tasas?rateType=BCV&from=...&to=... |
| FIN-LEDGER-01 | Create AccountingEntry of type INCOME / EXPENSE / PAYMENT with entryDate, categoryId, amountBsF, description | `AccountingEntry` model + enum `AccountingEntryType` |
| FIN-LEDGER-02 | Admin can specify amount in BsF or USD; if USD, system computes amountBsF using ExchangeRate for entryDate; stores `originalAmount`, `originalCurrency`, `exchangeRateId` | `decimal.js ROUND_HALF_UP` (Phase 11 pattern); `currency` enum `BsF`/`USD` |
| FIN-LEDGER-03 | Reports display historical BsF amount and historical USD equivalent (`amountBsF / historicalRate`) — never re-converts | F-7 mitigation; the joined `exchangeRate.rateBsPerUsd` value is what the UI uses, NOT the latest rate |
| FIN-LEDGER-04 | Upload receipt (PDF/JPG/PNG, max 5MB), stored at `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` with server-side MIME validation | F-14; multer + file-type byte inspection; see Standard Stack |
| FIN-LEDGER-05 | Receipt files served via admin-only auth-gated route, NOT directly from filesystem | F-14; **GAP 1** — see Common Pitfalls section P-1 |
| FIN-LEDGER-06 | Admin configures expense categories (CRUD) — not hard-coded | `Category` model; admin UI sub-tab; soft-delete via `isActive` |
| FIN-LEDGER-07 | Admin can link a PAYMENT entry to a `ProviderWeeklySettlement` to mark it paid | `AccountingEntry.settlementId String?` (FK to Phase 12 model); picker UX |
| FIN-LEDGER-08 | Admin views/filters entries by date range, type, category, linked provider/settlement | List endpoint with query-string filters; standard Prisma `where` composition |
| FIN-LEDGER-09 | Editable post-create: description, category, attachments. Immutable: amountBsF, entryDate, exchangeRateId. Corrections via reversal. | App-level rule in controller; `update` payload strips immutable fields; D-06 reversal path |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema (4 new models + FK to ProviderWeeklySettlement) | Database / Prisma | — | Persistence + FK integrity to Phase 12 |
| Rate lookup helper (`getEffectiveRateForDate`) | API / Backend service | — | Pure server logic; query against `ExchangeRate` table |
| USD→BsF conversion arithmetic | API / Backend service | — | `decimal.js ROUND_HALF_UP` consistency with Phase 11/12; never compute on client |
| Receipt upload (multipart) | API / Backend (multer middleware + controller) | — | Body parsing + magic-number MIME check + disk write |
| Receipt download (auth-gated stream) | API / Backend (controller with `fs.createReadStream`) | — | Static handler MUST NOT serve these — see P-1 |
| AuditLog writes (8 action+entity combinations) | API / Backend (controller layer) | — | Mirror `admin-jobs.controller.js:126-134` pattern |
| Reversal mechanism (transaction: create negated row + update original.reversedById) | API / Backend service | — | Must be atomic — wrap in `prisma.$transaction([...])` |
| AccountingEntry CRUD (create / list / update non-financial-fields) | API / Backend | Browser (form) | Backend enforces immutability rules |
| Category CRUD (create / list / deactivate) | API / Backend | Browser (form) | Standard CRUD; soft-delete via `isActive` |
| Settlement-paidAmount aggregation (for picker filter and detail view) | API / Backend | — | Prisma `aggregate({ _sum: { amountBsF } })` filtered by settlementId; no new column |
| 4 admin sub-tabs UI (`/admin/contabilidad`) | Frontend Server (Next.js App Router) | Browser (form state via `useState`) | Mirrors `/admin/proveedores` and `/admin/conciliacion` pattern |
| File picker + FormData submission | Browser | API (multer) | Native `<input type="file">` + `fetch` with `FormData`; no library |
| JWT auth on every request | Browser (Authorization header) | API (`authenticate` middleware) | Reuse existing pattern from `/admin/conciliacion/page.js:24-26` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | `^6.16.3` (already pinned) | Schema + migration + client | Project standard; new models extend existing schema [VERIFIED: backend/package.json] |
| `decimal.js` | `^10.6.0` (already pinned) | Money arithmetic, `ROUND_HALF_UP` | Phase 11 convention for `Decimal(18,8)` precision [VERIFIED: backend/package.json:58] |
| `multer` | `^2.1.1` (latest) | Express multipart body parsing | The de-facto file-upload middleware for Express; **NEW DEPENDENCY for this phase** [VERIFIED: `npm view multer version`] |
| `file-type` | `^19.x` (latest is 21.3.0 but 19+ has the API used here; **VERIFY at install time**) | Magic-number MIME detection from buffer | Sole canonical lib for byte-level MIME validation; ESM-only — works because `backend/package.json:6` declares `"type": "module"`; **NEW DEPENDENCY** [VERIFIED: backend ESM; CITED: npmjs.com/package/file-type] |
| `uuid` | `^13.0.0` (already pinned) | UUID filenames for receipts | Project standard [VERIFIED: backend/package.json:79]. Alternative: `crypto.randomUUID()` (Node ≥19 stdlib) — prefer the latter for one fewer call site. |
| `express` | `^4.21.1` (already pinned) | HTTP router | Project standard [VERIFIED: backend/package.json:61] |
| `zod` | `^3.23.8` (already pinned) | Request body validation | Pinned but **NOT yet adopted in controllers** (no current usage found); planner discretion whether to introduce in this phase or follow the existing controllers' hand-rolled validation style. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` + `date-fns-tz` | `^4.1.0` / `^3.2.0` (pinned) | Date normalization to America/Caracas | Reuse `getVenezuelaDateString` from `backend/src/lib/dateUtils.js`; entry-date bucketing for receipt path `YYYY/MM/` |
| `winston` (`logger`) | `^3.17.0` (pinned) | Structured logs | `logger.info`/`logger.warn`/`logger.error` from `backend/src/lib/logger.js` |
| `exceljs` | `^4.4.0` (pinned) | Excel export (deferred to Phase 14, but useful for ad-hoc) | Already used in `monitor.controller.js` and `accounting-report.service.js:248-261` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `multer` | `busboy` (direct) | Lower-level, but reimplements what multer already wraps cleanly. No upside for this codebase. |
| `file-type` v19+ | `mmmagic` / `mime-types` (mimetype-only, untrusted) | `mime-types` only inspects extension/declared type — exactly what F-14 forbids. `mmmagic` is C++ native, requires build tools on VPS. file-type is pure JS + ESM-native. |
| `crypto.randomUUID()` | `uuid` package | Both work. randomUUID is stdlib (Node 19+, prod is 20.20.2 — safe), zero-import. uuid v13 already in deps for legacy reasons; keep import consistency or migrate — planner's call. |
| React Hook Form | Plain `useState` | RHF is installed (`frontend/package.json:23`) but **zero admin pages use it** — confirmed via `grep -rln "react-hook-form" frontend/app/admin/` returns no matches. The convention is `const [formData, setFormData] = useState({...})` + a native `handleSubmit` ([VERIFIED: `frontend/app/admin/cuentas-sistema/page.js:14`, `proveedores/page.js:780`]). **Match the in-tree convention** unless the form complexity blows up. |
| `zod` validation in route handler | Inline `if (!body.field) return res.status(400)` | Both are valid. `zod` is in `package.json` but no controller imports it today — adopting in Phase 13 is fine but inconsistent with the rest of the codebase. Planner picks. |

**Installation (Plan 1 task):**
```bash
cd backend && npm install --save multer@^2.1.1 file-type@^19
```

**Version verification (run before final install — versions move):**
```bash
npm view multer version
npm view file-type version engines.node
```
At research time: `multer = 2.1.1`, `file-type = 21.3.0` (engines.node `>=22`, prod has Node 20.20.2 — pin **^19** to stay on the Node 20+ supported track; verify the file-type 19.x changelog before bumping to 21).

## Architecture Patterns

### System Architecture Diagram

```
                           Browser (admin)
                                 │  Authorization: Bearer <JWT>
                                 ▼
                  ┌────────────────────────────────────┐
                  │ Next.js /admin/contabilidad        │
                  │  ├─ tab: Asientos                  │
                  │  ├─ tab: Tasas                     │
                  │  ├─ tab: Categorías                │
                  │  └─ tab: Pagos                     │
                  └──────────────┬─────────────────────┘
                                 │ fetch + FormData (uploads) / JSON (everything else)
                                 ▼
                  ┌────────────────────────────────────┐
                  │ Express @ :3001                    │
                  │  /api/contabilidad/*               │
                  │  router.use(authenticate, authorize('ADMIN'))
                  └──────────────┬─────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              ▼                  ▼                      ▼
   ┌──────────────────┐ ┌──────────────────┐ ┌────────────────────┐
   │ rates controller │ │ entries          │ │ attachments        │
   │ (POST, GET list) │ │ controller       │ │ controller         │
   │                  │ │ (POST/GET/PATCH/ │ │ (POST upload,      │
   │ writes AuditLog  │ │  POST :id/reverse│ │  GET :id download, │
   │   CREATE Rate    │ │ writes AuditLog  │ │  DELETE :id)       │
   └────────┬─────────┘ │  CREATE/UPDATE/  │ │ multer + file-type │
            │           │  REVERSE Entry)  │ │ writes AuditLog    │
            │           └────────┬─────────┘ │  UPLOAD/DELETE     │
            │                    │           │  Attachment        │
            │                    │           └─────────┬──────────┘
            │                    │                     │
            │                    ▼                     │
            │     ┌──────────────────────────────┐     │
            │     │ exchange-rate.service.js     │     │
            │     │  getEffectiveRateForDate()   │     │
            │     │  (D-01: ORDER BY createdAt   │     │
            │     │   DESC LIMIT 1)              │     │
            │     └──────────────┬───────────────┘     │
            │                    │                     │
            │                    ▼                     │
            ▼     ┌──────────────────────────────┐     ▼
   ┌────────────────────────────────────────────────────────┐
   │ Postgres @ :5433 (singleton prisma client)             │
   │  ExchangeRate · AccountingEntry · Category             │
   │  · AccountingEntryAttachment · AuditLog                │
   │  FK → ProviderWeeklySettlement (from Phase 12 schema)  │
   │  FK → User (createdById / uploadedById)                │
   └────────────────────────────────────────────────────────┘
                                 ▲
                                 │ (cascade onDelete on Attachment.entryId)
                                 │
   ┌──────────────────────────────────────────────────────────┐
   │ Filesystem: backend/storage/receipts/YYYY/MM/{uuid}.ext  │
   │  ⚠ inside backend/storage/ which is publicly served by   │
   │  express.static at index.js:136 — MUST be excluded.      │
   └──────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
backend/src/
├── controllers/
│   ├── exchange-rate.controller.js              # NEW — rates POST + GET list
│   ├── accounting-entry.controller.js           # NEW — entries CRUD + reverse
│   ├── accounting-category.controller.js        # NEW — category CRUD + deactivate
│   └── accounting-attachment.controller.js      # NEW — upload / download / delete
├── routes/
│   └── contabilidad.routes.js                   # NEW — single router file, all 4 sub-resources
├── services/
│   ├── exchange-rate.service.js                 # NEW — getEffectiveRateForDate(date)
│   ├── accounting-entry.service.js              # NEW — create/reverse logic in $transaction
│   └── accounting-attachment.service.js         # NEW — file-type validation + path resolution
├── middlewares/
│   └── receipt-upload.middleware.js             # NEW — multer instance + 5MB limit + 422 handler
└── prisma/schema.prisma                         # MODIFIED — 4 new models + 2 enums + back-relations

frontend/
├── app/admin/contabilidad/
│   ├── page.js                                  # NEW — tab switcher (default = Asientos)
│   ├── asientos/
│   │   ├── nueva/page.js                        # NEW — create-entry form
│   │   └── [id]/page.js                         # NEW — entry detail (with Reversar button)
│   ├── tasas/page.js                            # NEW — rate timeline + new-rate form
│   ├── categorias/page.js                       # NEW — category CRUD list
│   └── pagos/page.js                            # NEW — PAYMENT entries linked to settlements
└── components/admin/contabilidad/               # NEW shared components — picker, status badge, file uploader
```

### Pattern 1: Singleton Prisma + admin auth router prefix
**What:** Every controller imports `prisma` from `lib/prisma.js`; every route file mounts `authenticate` + `authorize('ADMIN')` as a router-level middleware.
**When to use:** Every backend feature in this project.
**Example:**
```javascript
// Source: backend/src/middlewares/auth.middleware.js:7-80 (VERIFIED IN TREE)
// + .planning/phases/12-provider-commission-engine/12-PATTERNS.md:1110-1112

import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import * as rates from '../controllers/exchange-rate.controller.js';
import * as entries from '../controllers/accounting-entry.controller.js';
import * as cats from '../controllers/accounting-category.controller.js';
import * as atts from '../controllers/accounting-attachment.controller.js';
import { uploadReceipt } from '../middlewares/receipt-upload.middleware.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));   // ALL routes admin-gated

router.post('/tasas',                 rates.create);
router.get ('/tasas',                 rates.list);

router.post  ('/asientos',                       entries.create);
router.get   ('/asientos',                       entries.list);
router.get   ('/asientos/:id',                   entries.get);
router.patch ('/asientos/:id',                   entries.update);          // non-financial-fields only
router.post  ('/asientos/:id/reverse',           entries.reverse);

router.post  ('/asientos/:id/attachments',       uploadReceipt.single('file'), atts.upload);
router.get   ('/asientos/:id/attachments/:attId',                              atts.download);
router.delete('/asientos/:id/attachments/:attId',                              atts.remove);

router.post  ('/categorias',          cats.create);
router.get   ('/categorias',          cats.list);
router.patch ('/categorias/:id',      cats.update);                        // name, isActive
export default router;
```

### Pattern 2: AuditLog write (existing convention)
**What:** Non-blocking-on-success, blocking-on-financial-trust AuditLog rows captured at the controller layer with `ipAddress` + `userAgent`.
**When:** Every D-07 event (8 combinations).
**Example:**
```javascript
// Source: backend/src/controllers/admin-jobs.controller.js:126-134 (VERIFIED IN TREE)
await prisma.auditLog.create({
  data: {
    action: 'REVERSE',
    entity: 'AccountingEntry',
    entityId: original.id,
    userId: req.user?.id ?? null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
    changes: { reversedById: newReversal.id, reversalReason },
  },
});
```
**Note:** `admin-jobs.controller.js:126-134` only includes `action`/`entity`/`entityId`/`userId`/`changes` — the existing pattern omits `ipAddress` and `userAgent`. D-07 requires them. Planner should follow D-07 explicitly and include all three diagnostic columns (the schema has them at `schema.prisma:411-412`).

### Pattern 3: Reversal atomicity — `$transaction([])`
**What:** Two writes (insert reversal row + update original.reversedById) MUST commit together; otherwise the original could end up flagged-reversed without the reversal row existing, or vice versa.
**When:** Inside `accounting-entry.controller.js#reverse`.
**Example:**
```javascript
// Pattern: standard Prisma transaction array form. No exact in-tree analog
// for reversal, but $transaction is used elsewhere (e.g., publication.service.js,
// ticket creation in webhook.service.js). [ASSUMED — standard Prisma idiom]
const [newReversal, updatedOriginal] = await prisma.$transaction([
  prisma.accountingEntry.create({
    data: {
      type:            original.type,
      entryDate:       original.entryDate,
      categoryId:      original.categoryId,
      exchangeRateId:  original.exchangeRateId,
      currency:        original.currency,
      amountBsF:       original.amountBsF.negated(),  // decimal.js
      originalAmount:  original.originalAmount?.negated(),
      originalCurrency:original.originalCurrency,
      description:     `Reversal de ${original.id}`,
      reversesId:      original.id,
      reversalReason,
      createdById:     req.user.id,
    },
  }),
  prisma.accountingEntry.update({
    where: { id: original.id },
    data:  { reversedById: <captured-after-create — see below> },
  }),
]);
```
**Subtlety:** the second statement needs the newly-created row's id. Prisma's array-form `$transaction` does NOT give cross-statement value passing. Two options:
1. Generate the new id client-side (`crypto.randomUUID()` and set it on `create.data.id`), then reference it in the `update`. This is the cleanest fix.
2. Use the interactive callback form: `await prisma.$transaction(async (tx) => { ... })`. Slightly more verbose but no client-side id juggling. [ASSUMED — pick (2) for readability; both work.]

### Pattern 4: Plain `useState` form (frontend convention)
**What:** Admin pages do NOT use react-hook-form despite the lib being installed. The convention is `const [formData, setFormData] = useState({...})` + `handleSubmit = (e) => { e.preventDefault(); ... }`.
**When:** All forms in `/admin/contabilidad/`.
**Example:**
```javascript
// Source: frontend/app/admin/cuentas-sistema/page.js:14, ../proveedores/page.js:780,1006
// (all VERIFIED in tree)
const [formData, setFormData] = useState({ rateBsPerUsd: '', rateType: 'BCV', date: '', notes: '' });
const handleSubmit = async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('admin_token');           // pattern from proveedores/page.js
  const res = await fetch(`${API_URL}/api/contabilidad/tasas`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  // ...
};
```

### Pattern 5: File upload — FormData on client, multer on server
**What:** Client sends `multipart/form-data`; server uses `multer.single('file')` to land it in memory, then `file-type` byte-inspects the buffer, then `fs.writeFile` to disk under `backend/storage/receipts/YYYY/MM/{uuid}.{ext}`.
**When:** Receipt upload (FIN-LEDGER-04).
**Example (server middleware):**
```javascript
// backend/src/middlewares/receipt-upload.middleware.js (NEW)
// Source: multer 2.x docs; tree has no prior multer usage — establish the convention here.
import multer from 'multer';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const uploadReceipt = multer({
  storage: multer.memoryStorage(),                                // we need bytes for file-type check
  limits:  { fileSize: MAX_BYTES, files: 1 },                     // 5MB hard ceiling; 413 on exceed
  // We deliberately do NOT use multer's fileFilter (client-supplied mimetype).
  // The byte-level validation happens in the controller after the buffer is in memory.
});
```
**Example (controller — byte-level MIME check):**
```javascript
// backend/src/controllers/accounting-attachment.controller.js (NEW)
import { fileTypeFromBuffer } from 'file-type';                  // ESM, works in this backend
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function upload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file' });          // multer didn't see one
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !ALLOWED.has(detected.mime)) {
    return res.status(422).json({                                            // F-14 trap: .html-as-.pdf
      error: `Tipo de archivo no permitido: ${detected?.mime ?? 'desconocido'}`,
    });
  }
  // ... derive YYYY/MM from entry.entryDate, NOT today's date (CONTEXT.md D-04).
  const entry = await prisma.accountingEntry.findUniqueOrThrow({ where: { id: req.params.id } });
  const yyyymm = format(entry.entryDate, 'yyyy/MM');                         // date-fns
  const uuid = randomUUID();
  const filename = `${uuid}.${detected.ext}`;
  const fullDir  = path.join(process.cwd(), 'storage', 'receipts', yyyymm);
  await fs.mkdir(fullDir, { recursive: true });
  await fs.writeFile(path.join(fullDir, filename), req.file.buffer);

  const row = await prisma.accountingEntryAttachment.create({
    data: {
      entryId: req.params.id,
      filename,
      originalName: req.file.originalname,
      mimeType:     detected.mime,                                            // VALIDATED, not client-supplied
      sizeBytes:    req.file.size,
      uploadedById: req.user.id,
    },
  });

  await prisma.auditLog.create({                                              // D-07
    data: {
      action: 'UPLOAD',
      entity: 'AccountingEntryAttachment',
      entityId: row.id,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      changes: { entryId: row.entryId, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
    },
  });

  res.status(201).json(row);
}
```
**Example (controller — auth-gated download):**
```javascript
// Pattern source: imageController.js:114 uses res.sendFile(); monitor.controller.js
// streams ExcelJS/PDFKit. We need the disk-stream variant.
import { createReadStream } from 'fs';

export async function download(req, res) {
  const att = await prisma.accountingEntryAttachment.findUniqueOrThrow({
    where: { id: req.params.attId },
    include: { entry: { select: { entryDate: true } } },
  });
  const yyyymm = format(att.entry.entryDate, 'yyyy/MM');
  const full = path.join(process.cwd(), 'storage', 'receipts', yyyymm, att.filename);
  res.setHeader('Content-Type', att.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${att.originalName}"`);
  createReadStream(full).pipe(res);
}
```

### Pattern 6: `getEffectiveRateForDate` helper (D-01 enforcement)
**What:** Single chokepoint for D-01 rate lookup. Returns the matching `ExchangeRate` row or `null`.
**When:** Every USD-valued entry insert MUST pass through this helper; the accounting controller's `create` flow first calls it, and rejects with 400 if it returns null (F-6).
```javascript
// backend/src/services/exchange-rate.service.js (NEW)
export async function getEffectiveRateForDate(date) {
  return prisma.exchangeRate.findFirst({
    where: { date },
    orderBy: { createdAt: 'desc' },          // D-01: last loaded of the day
  });
}
```

### Anti-Patterns to Avoid
- **Trusting `req.file.mimetype`** — multer reports the client-supplied Content-Type, which a malicious uploader controls. F-14 specifically calls this out. Always re-check with `file-type`.
- **Routing receipt downloads through `express.static`** — defeats the auth gate; the planner must explicitly exclude `/storage/receipts/*` from the static handler (see P-1).
- **Computing `originalAmount` in JS Number** — precision drift on (18,8) is the F-4 trap. Always `decimal.js` with `ROUND_HALF_UP`.
- **Inlining the D-01 lookup query in the entry controller** — CONTEXT.md A3 explicitly forbids this; one helper, one call site.
- **Hard-deleting a Category** — soft-disable via `isActive=false`. Hard delete would orphan historical entries' category labels.
- **Updating `amountBsF`, `entryDate`, or `exchangeRateId` on an existing entry** — FIN-LEDGER-09 forbids. The `update` controller must strip these from the payload (or 400).
- **Re-converting historical USD entries at report time** — F-7; the stored `amountBsF` IS the historical value; the historical USD equivalent is `amountBsF / exchangeRate.rateBsPerUsd` from the JOINed row, NEVER from `getEffectiveRateForDate(today)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart body parsing | Custom busboy/raw-body parser | `multer@^2.1.1` | 5+ years of edge-case handling (filename encoding, partial buffers, DoS limits) |
| MIME validation | Trusting `Content-Type` or extension parsing | `file-type@^19` byte inspection | F-14 — the only correct way to reject `.html` renamed to `.pdf` |
| UUID generation | `Math.random()` / counter | `crypto.randomUUID()` or `uuid` pkg | Cryptographic collision avoidance |
| Decimal arithmetic | Native `Number` | `decimal.js` (already in deps) | F-4 — IEEE-754 drift on monetary math |
| Date-bucketing in VE TZ | `new Date()` math | `date-fns-tz` via `dateUtils.js` | Venezuela TZ subtleties; consistent with Phase 11/12 |
| Form-state mgmt | Custom event-listener mesh | Plain `useState` (project convention) | Match in-tree pattern; don't introduce RHF for one phase |
| Audit row writes | Custom logger sink | `AuditLog` model + `prisma.auditLog.create` | One schema; queryable; D-07 reuses existing infra |
| File serving with auth | `express.static` + middleware before | Dedicated controller with `createReadStream(...)` | Static middleware order is fragile; explicit controller is auditable |

**Key insight:** The accounting domain is unusually rich in "we'll just compute it in JS" footguns. Every monetary field needs decimal.js; every receipt needs byte-level MIME; every state mutation needs an audit row. Skipping any one of these is the difference between an auditable ledger and a class-action lawsuit.

## Runtime State Inventory

Phase 13 is greenfield (new models, new routes, new UI) — no rename, refactor, or migration of existing data.

**Stored data:** None affected. New tables only. ExchangeRate, AccountingEntry, Category, AccountingEntryAttachment are all empty on first migration.

**Live service config:** None affected. No n8n / Datadog / Tailscale changes.

**OS-registered state:** None affected. No new cron lines (Phase 13 has no scheduled jobs — CONTEXT.md explicit). pm2 service list unchanged.

**Secrets and env vars:** None affected. No new env vars (storage path is in code, MAX_BYTES is a constant, MIME allowlist is a constant).

**Build artifacts / installed packages:** TWO new npm deps add to `backend/package.json`: `multer` and `file-type`. After install, `backend/package-lock.json` updates (gitignored per project convention) and `backend/node_modules/` grows. Plan 1 task should include the install step. **Nothing else.**

## Common Pitfalls

### P-1 (CRITICAL): `backend/storage/` is publicly served by `express.static`
**What goes wrong:** Receipt files at `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` are reachable at `https://tote.atilax.io/storage/receipts/YYYY/MM/<uuid>.pdf` without any authentication. FIN-LEDGER-05 and success criterion 5 are violated by default.
**Why it happens:** `backend/src/index.js:136` mounts `app.use('/storage', express.static(path.join(__dirname, '../storage'), {...}))` for the public draw-result images. The receipt directory CONTEXT.md locks (`backend/storage/receipts/...`) sits inside that tree.
**How to avoid:** Plan 1 must include ONE of:
  - **Option A (minimum diff):** Before line 136, mount a guard router: `app.use('/storage/receipts', (req, res) => res.status(401).json({ error: 'Forbidden' }))`. Then the static handler at :136 still serves everything *else* in `/storage/` but the receipts path is dead-ended for any URL hitting it directly. Auth-gated download still works because it goes through `/api/contabilidad/asientos/:id/attachments/:attId`, not `/storage/`.
  - **Option B (cleaner long-term):** Move receipt storage to a sibling path that is never `express.static`'d — e.g., `backend/private-storage/receipts/YYYY/MM/{uuid}.{ext}`. This deviates from the CONTEXT.md-locked path. If the planner picks this, CONTEXT.md should be amended via a discuss-phase revisit; otherwise stick with Option A.
**Recommendation:** **Option A.** It keeps the locked path, requires 3 lines of code, and gives an explicit test target ("hit `/storage/receipts/anything.pdf` and assert 401").
**Warning signs:** the `\dt`-equivalent for storage — `ls backend/storage/` after first upload shows `receipts/2026/05/<uuid>.pdf`. From there, `curl -i $HOST/storage/receipts/2026/05/<uuid>.pdf` returning 200 with content is the smoking gun.

### P-2: `file-type` is ESM-only; backend must declare `"type": "module"`
**What goes wrong:** `require('file-type')` throws ERR_REQUIRE_ESM.
**Why it happens:** Since file-type v16+ the package is pure ESM.
**How to avoid:** Already mitigated — `backend/package.json:6` declares `"type": "module"`, and every backend file uses `import`. [VERIFIED IN TREE]. Confirm at install: `node --input-type=module -e 'import { fileTypeFromBuffer } from "file-type"; console.log(typeof fileTypeFromBuffer)'` prints `function`.

### P-3: `multer` 413 (file too large) error returns generic message
**What goes wrong:** Default multer 413 surfaces as `MulterError: File too large` propagated to Express's default error handler — opaque to the client.
**How to avoid:** Wire a router-level error handler at the end of `contabilidad.routes.js` that catches `MulterError` instances and maps them to friendly JSON: `if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Archivo excede 5MB' })`.

### P-4: Reversal-of-a-reversal infinite loop in lists
**What goes wrong:** Querying "all non-reversed entries" via `WHERE reversedById IS NULL` returns the reversal rows themselves (they were never reversed). UI shows duplicate-looking ledger lines.
**How to avoid:** When filtering "active" entries, use `WHERE reversedById IS NULL AND reversesId IS NULL`. The "Reversar" button visibility rule from CONTEXT.md D-06 already encodes this; mirror the predicate in list queries.

### P-5: `entryDate` TZ confusion on the YYYY/MM path
**What goes wrong:** `new Date('2026-05-01').toISOString()` is `2026-05-01T00:00:00.000Z` (UTC midnight), which is 2026-04-30 20:00 in Venezuela (UTC-4). Bucketing the receipt path naively via `date.getUTCFullYear() + '/' + date.getUTCMonth()` puts a 2026-05-01-VE entry into the `2026/04/` directory.
**How to avoid:** Use `entryDate` as a `Date` Prisma column but format the path via `date-fns-tz` `formatInTimeZone(entryDate, 'America/Caracas', 'yyyy/MM')`. Or — since CONTEXT.md A2 specifies storing as a pure `DATE` (no time) — use `date.toISOString().slice(0, 7).replace('-', '/')` which is safe for date-only values. Both work; planner picks. [VERIFIED via the existing `dateUtils.js` `getVenezuelaDateString` pattern]

### P-6: PAYMENT settlement picker race
**What goes wrong:** Two admins both view the picker (settlement appears unpaid), both submit a PAYMENT entry concurrently. Now `SUM(payments) > settlement.amount` — overpaid.
**How to avoid:** Backend re-validates on POST (CONTEXT.md A9). Run `SELECT amountBsF, (SELECT COALESCE(SUM(amountBsF),0) FROM AccountingEntry WHERE settlementId = X AND reversesId IS NULL) AS paid FROM ProviderWeeklySettlement WHERE id = X` and reject if `paid + incoming > amount`. Wrap the entry insert + check in `prisma.$transaction` with `Serializable` isolation, OR add a DB CHECK constraint deferred (overkill for v1). Pragmatic v1: accept the race; the audit log gives the operator visibility. Document in DEPLOY.md.

### P-7: `_count` and aggregation in Prisma — getting paidAmount efficiently
**What goes wrong:** Naively loading all PAYMENT entries per settlement to compute paidAmount in JS is O(N) DB rows per settlement card.
**How to avoid:** Use `prisma.accountingEntry.aggregate({ _sum: { amountBsF: true }, where: { settlementId: X, reversesId: null } })` — single SQL aggregate. For the picker list (M settlements at once), use a single `prisma.$queryRaw` GROUP BY query OR call `aggregate` once per row in `Promise.all`. The picker rarely shows >50 settlements, so the `Promise.all` shape is acceptable. [ASSUMED — verify with operator's actual settlement count.]

### P-8: AuditLog `ipAddress` is empty behind a reverse proxy
**What goes wrong:** `req.ip` returns the proxy IP (`127.0.0.1` or pm2 internal) instead of the real client IP. Audit trail records the wrong actor.
**How to avoid:** Express needs `app.set('trust proxy', true)` so `req.ip` reflects the `X-Forwarded-For` header. **VERIFY** whether this is already set in `index.js` — if not, add it for Phase 13 (and surface as a recommendation; it benefits every audit-using endpoint, not just contabilidad). [ASSUMED based on the typical pm2-behind-nginx setup; planner should grep `trust proxy` in `index.js` before deciding.]

### P-9: `react-hook-form` is installed but unused in `/admin/*`
**What goes wrong:** Planner sees `react-hook-form` in `frontend/package.json` and adopts it for Phase 13 forms, breaking visual/behavioral consistency with every other admin page.
**How to avoid:** `grep -rln "react-hook-form" frontend/app/admin frontend/components/admin` returns zero — confirmed. Match the `useState` + native `handleSubmit` convention. [VERIFIED IN TREE]

### P-10: Phase 12 schema not yet landed when Phase 13 starts
**What goes wrong:** Phase 13's `AccountingEntry.settlementId` FK targets `ProviderWeeklySettlement.id` (Phase 12 model). If Phase 13 plan-1 migration runs against a DB without that table, the FK creation fails.
**How to avoid:** ROADMAP.md line 249 and CONTEXT.md A10 both lock this: "Phase 12 ships first sequentially in this session — when Phase 13 plans land, ProviderWeeklySettlement already exists." Plan 1 acceptance criteria should include: `docker exec tote_postgres psql -U tote_user -d tote_db -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProviderWeeklySettlement')"` returns `t`. If `f`, abort and surface to operator. [VERIFIED: as of research time, the Phase 12 schema is NOT yet in `backend/prisma/schema.prisma` — `grep ProviderWeeklySettlement schema.prisma` returns nothing.]

## Code Examples

### Prisma schema additions (4 models + 2 enums + back-relations)
```prisma
// Source: schema patterns from Phase 11 + Phase 12 — VERIFIED CONVENTIONS IN TREE
// Append after Phase 12's ProviderWeeklySettlement block.

enum AccountingEntryType {
  INCOME
  EXPENSE
  PAYMENT
}

enum ExchangeRateType {
  BCV
  PARALELO
  OTRO
}

enum AccountingCurrency {
  BsF
  USD
}

model ExchangeRate {
  id            String           @id @default(uuid())
  date          DateTime         @db.Date                        // DATE column — no time, no TZ trap
  rateBsPerUsd  Decimal          @db.Decimal(18, 8)
  rateType      ExchangeRateType
  notes         String?
  createdById   String
  createdAt     DateTime         @default(now())

  createdBy        User              @relation(fields: [createdById], references: [id])
  accountingEntries AccountingEntry[]

  // NOT @@unique on date — multiple rateType rows per date are allowed (CONTEXT.md D-01).
  // The D-01 picker uses (date, createdAt DESC LIMIT 1).
  @@index([date, createdAt(sort: Desc)])
  @@index([rateType, date])
}

model Category {
  id           String              @id @default(uuid())
  name         String
  appliesTo    AccountingEntryType
  isActive     Boolean             @default(true)                // soft-disable per project convention
  createdById  String
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  createdBy User              @relation(fields: [createdById], references: [id])
  entries   AccountingEntry[]

  @@unique([appliesTo, name])
  @@index([appliesTo, isActive])
}

model AccountingEntry {
  id              String              @id @default(uuid())
  type            AccountingEntryType
  entryDate       DateTime            @db.Date
  categoryId      String
  amountBsF       Decimal             @db.Decimal(18, 8)         // IMMUTABLE post-create
  originalAmount  Decimal?            @db.Decimal(18, 8)         // null for BsF-native entries
  originalCurrency AccountingCurrency
  exchangeRateId  String?                                         // null for BsF-native entries
  description     String
  createdById     String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  // Reversal back-pointers (D-06)
  reversesId      String?              @unique                    // FK to original this row reverses
  reversedById    String?              @unique                    // FK to the reversal row that reversed THIS
  reversalReason  String?                                          // populated on the reversal row

  // PAYMENT → settlement link (D-03)
  settlementId    String?
  settlement      ProviderWeeklySettlement? @relation(fields: [settlementId], references: [id])

  category        Category         @relation(fields: [categoryId],     references: [id])
  exchangeRate    ExchangeRate?    @relation(fields: [exchangeRateId], references: [id])
  createdBy       User             @relation(fields: [createdById],    references: [id])
  reverses        AccountingEntry? @relation("EntryReversal", fields: [reversesId], references: [id])
  reversedBy      AccountingEntry? @relation("EntryReversal_reverse_fk")
  // ⚠ The reverses/reversedBy pair is one self-relation; Prisma idiom is:
  //   reverses     AccountingEntry? @relation("Reversal", fields: [reversesId], references: [id])
  //   reversedFor  AccountingEntry? @relation("Reversal")
  // VERIFY exact syntax with prisma format. [ASSUMED — Prisma docs pattern.]

  attachments     AccountingEntryAttachment[]

  @@index([entryDate, type])
  @@index([categoryId, entryDate])
  @@index([settlementId])
  @@index([type, entryDate])
}

model AccountingEntryAttachment {
  id            String          @id @default(uuid())
  entryId       String
  filename      String                                            // UUID-based
  originalName  String                                            // operator-supplied
  mimeType      String                                            // byte-validated
  sizeBytes     Int
  uploadedById  String
  uploadedAt    DateTime        @default(now())

  entry         AccountingEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  uploadedBy    User            @relation(fields: [uploadedById], references: [id])

  @@index([entryId])
}
```
**Back-relations to add to existing models:**
```prisma
// On User (existing model)
exchangeRatesCreated   ExchangeRate[]
categoriesCreated      Category[]
accountingEntries      AccountingEntry[]
attachmentsUploaded    AccountingEntryAttachment[]

// On ProviderWeeklySettlement (from Phase 12)
payments               AccountingEntry[]
```

### `getEffectiveRateForDate` service helper
```javascript
// backend/src/services/exchange-rate.service.js
import { prisma } from '../lib/prisma.js';

export async function getEffectiveRateForDate(date) {
  return prisma.exchangeRate.findFirst({
    where:  { date },
    orderBy: { createdAt: 'desc' },     // D-01 — last loaded of the day
  });
}
```

### USD entry creation flow
```javascript
// backend/src/controllers/accounting-entry.controller.js (excerpt)
import Decimal from 'decimal.js';
import { getEffectiveRateForDate } from '../services/exchange-rate.service.js';
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export async function create(req, res) {
  const { type, entryDate, categoryId, description, currency, amount, settlementId } = req.body;

  let amountBsF, originalAmount = null, exchangeRateId = null;

  if (currency === 'USD') {
    const rate = await getEffectiveRateForDate(new Date(entryDate));
    if (!rate) {
      return res.status(400).json({
        error: `No hay tasa de cambio para ${entryDate} — ingrese la tasa primero`,   // F-6
      });
    }
    exchangeRateId = rate.id;
    originalAmount = new Decimal(amount);
    amountBsF      = originalAmount.times(rate.rateBsPerUsd).toFixed(8);
  } else {
    amountBsF = new Decimal(amount).toFixed(8);
  }

  if (settlementId) {
    // Re-validate the picker (P-6 mitigation, partial)
    const settlement = await prisma.providerWeeklySettlement.findUnique({ where: { id: settlementId } });
    if (!settlement || !['CONFIRMED', 'ADJUSTED'].includes(settlement.status)) {
      return res.status(400).json({ error: 'Settlement no es elegible para pago' });
    }
  }

  const entry = await prisma.accountingEntry.create({
    data: {
      type, entryDate: new Date(entryDate), categoryId, description,
      amountBsF, originalAmount, originalCurrency: currency, exchangeRateId,
      settlementId: settlementId ?? null,
      createdById: req.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'CREATE', entity: 'AccountingEntry', entityId: entry.id,
      userId: req.user.id, ipAddress: req.ip, userAgent: req.get('user-agent'),
      changes: { type, entryDate, categoryId, amountBsF, originalAmount, currency, exchangeRateId },
    },
  });

  res.status(201).json(entry);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trust client `Content-Type` for upload validation | Magic-number byte inspection via `file-type` | Industry standard since ~2018; reinforced post-OWASP A03:2021 | F-14 requires it explicitly |
| Single `multer.diskStorage` to a public dir | `multer.memoryStorage` + post-validate + `fs.writeFile` to a private subdir | Required when MIME validation must succeed before persistence | Avoids leaving the malicious-rename file on disk |
| `multer@1.4.x` | `multer@2.x` (current 2.1.1) | 2024 — multer 2.0 GA | Same API for our use case; security-patched |
| Soft-delete via `deletedAt DateTime?` | `isActive Boolean` | Project convention — `grep isActive schema.prisma` finds 16 models | Match the existing convention exactly |
| Per-controller `try/catch` and inline validation | `zod` schemas | Industry trend; project has `zod` in deps but unused in controllers | Stay with hand-rolled validation for consistency unless planner wants a one-off zod adoption |

**Deprecated/outdated:**
- **`file-type@<16`** (CommonJS) — superseded by ESM. Don't pin an old major.
- **`multer@1.x`** — still works but 2.x is GA.
- **Storing receipts under web root + `htaccess`-style restrictions** — never feasible with Node `express.static`; explicit excluder router or off-tree path is the only correct shape.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `file-type@^19` API uses `fileTypeFromBuffer` and works in pure ESM | Standard Stack, Pattern 5 | Plan 1 install step would need to switch to a different major; controllers using the named export would need updating. **Verify with `npm view file-type@^19 main` and a 1-line smoke test before committing to v19.** |
| A2 | Phase 12's `ProviderWeeklySettlement` model is available when Phase 13 plan-1 migration runs | P-10 | FK creation fails → Plan 1 blocked → trivial fix (wait for Phase 12 to land) but should be an acceptance criterion |
| A3 | The reversal-back-pointer self-relation works as `reverses` + `reversedFor` named relation pair in Prisma | Schema additions section, Pattern 3 | Schema fails `prisma validate`; trivial syntax fix once the planner reads Prisma docs. Cite: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/self-relations |
| A4 | `app.set('trust proxy', true)` is the right pattern for capturing real client IP behind pm2 + nginx | P-8 | Audit rows record wrong IP. Mitigation: grep `index.js` for existing `trust proxy` before deciding. |
| A5 | The (interactive callback) form of `prisma.$transaction` is the cleaner choice for the reversal flow | Pattern 3 | Both forms work; this is a style call. If the planner prefers array form, they'll need the client-side UUID generation trick. |
| A6 | The frontend convention is plain `useState` + native form `handleSubmit` (NOT react-hook-form) | Pattern 4, P-9 | If RHF *is* used somewhere in admin that grep missed, the planner might want to use it for consistency. Quick sanity check: `grep -rln "useForm" frontend/app/admin/` (research did this and found zero matches). |
| A7 | The picker for PAYMENT→settlement linking can tolerate the race documented in P-6 in v1 | P-6 | Operational concern only; an over-payment is recoverable via reversal. Worth surfacing in DEPLOY.md. |
| A8 | `Decimal @db.Decimal(18, 8)` (matching Phase 12, not Phase 11's `(12, 2)`) is appropriate for `amountBsF` and `originalAmount` | Schema additions section | If the operator expects `(12, 2)` for cosmetic alignment, this might surface. CONTEXT.md A1 explicitly locks (18, 8). |
| A9 | The `aggregate({ _sum: ... })` shape for settlement paidAmount lookups scales fine to <100 settlements | P-7 | If the picker has 1000+ open settlements (unlikely), batch via raw SQL. |
| A10 | The Reversal label "Reversal de #X" uses the original entry's `id` (cuid) or a separate `sequentialNo Int @default(autoincrement())` column | Claude's Discretion | If the user later asks for human-readable numbering, a column add is a future migration — no risk. |

**If this table is non-empty (it is):** the planner and discuss-phase should treat A1, A2, A4, A8 as items to verify in plan-1 acceptance criteria. The rest are safe defaults.

## Open Questions

1. **Sequential entry number for the "Reversal de #X" display label.**
   - What we know: CONTEXT.md D-06 says `description: 'Reversal de #' + originalSequentialNo` — but no `sequentialNo` column is locked.
   - What's unclear: Whether to add an `@default(autoincrement()) Int sequentialNo` column or render using a truncated cuid.
   - Recommendation: Add `sequentialNo Int @default(autoincrement()) @unique` to `AccountingEntry`. Operator wants something memorable to reference in audits ("asiento #312"). Trivial migration.

2. **Initial seed of Categories.**
   - What we know: CONTEXT.md lists candidates (EXPENSE: Sueldos/Internet/Alquiler/Hosting; INCOME: Premios cobrados/Otros ingresos; PAYMENT: Comisiones proveedor/Premios pagados).
   - What's unclear: Final list locked by operator preference; whether to seed via a SQL migration or via a `seed.js` block.
   - Recommendation: Plan 1 adds the seed inline in the same migration SQL (`INSERT INTO "Category" (...) VALUES (...)`) — simple, idempotent on first apply, doesn't pollute the existing `seed.js`.

3. **Frontend: separate "Nueva tasa" form vs inline-add row at top of timeline.**
   - What we know: CONTEXT.md says "daily rate timeline + 'Nueva tasa' form".
   - What's unclear: modal vs full page vs inline.
   - Recommendation: Inline at the top of the table is the lowest-friction UX. Planner's call.

4. **Whether to expose a `GET /api/contabilidad/asientos/:id/audit` route or render the AuditLog history server-side in the entry-detail page.**
   - What we know: CONTEXT.md D-07 says "admin can see the history on the entry-detail page".
   - What's unclear: API surface.
   - Recommendation: Include audit rows in the existing entry-detail response via `prisma.auditLog.findMany({ where: { entity: 'AccountingEntry', entityId: id } })` — one round-trip, no new route.

5. **What does "marcar pagado" launch — modal in same page, or navigate to `/admin/contabilidad/asientos/nueva?settlementId=X`?**
   - What we know: CONTEXT.md D-05 says "launches the AccountingEntry form pre-populated with the settlement".
   - What's unclear: navigation shape.
   - Recommendation: Query-string pre-population on the same form is the simpler shape (no shared state between routes). Planner picks.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | yes (local) | 25.9.0 local / 20.20.2 prod (verified via `ssh 94 node --version`) | — |
| PostgreSQL (Docker `tote_postgres`) | Migration + runtime | yes | 16 (per `docker-compose.yml`) | — |
| Prisma CLI | Migration tooling | yes | `^6.16.3` (in `backend/package.json` devDependencies) | — |
| `multer` | Receipt upload | **NO — must install** | — | None — feature blocked without it |
| `file-type` | MIME byte inspection | **NO — must install** | — | None — F-14 requires it |
| `decimal.js` | Money math | yes | `^10.6.0` (Phase 11) | — |
| `uuid` | Filename generation | yes | `^13.0.0` | `crypto.randomUUID()` (Node ≥19 stdlib) |
| `date-fns` + `date-fns-tz` | VE TZ formatting | yes | `^4.1.0` / `^3.2.0` | — |
| `winston` | Logging | yes | `^3.17.0` | — |
| ExcelJS / PDFKit | Future Phase 14 exports (out of scope for Phase 13) | yes | `^4.4.0` / `^0.17.2` | — |

**Missing dependencies with no fallback:**
- `multer` — blocks FIN-LEDGER-04
- `file-type` — blocks F-14 mitigation, hence FIN-LEDGER-04/05

**Missing dependencies with fallback:**
- None — both must be installed in Plan 1.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (configured for ESM via `NODE_OPTIONS='--experimental-vm-modules'`) |
| Config file | None on disk — script is `"test": "NODE_OPTIONS='--experimental-vm-modules' jest --forceExit"` in `backend/package.json:36` |
| Quick run command | `cd backend && npm test -- --testPathPattern=accounting` (filter to Phase 13 tests) |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIN-RATE-01 | POST `/api/contabilidad/tasas` creates a row | integration | `npm test -- --testPathPattern=exchange-rate.controller` | ❌ Wave 0 |
| FIN-RATE-02 | No PUT/PATCH/DELETE route exists for rates | unit | `npm test -- --testPathPattern=contabilidad.routes` | ❌ Wave 0 |
| FIN-RATE-04 | USD entry without same-date rate → 400 | integration | `npm test -- --testPathPattern=accounting-entry.controller.usd-no-rate` | ❌ Wave 0 |
| FIN-LEDGER-02 | USD entry computes `amountBsF = originalAmount * rate.rateBsPerUsd` with decimal.js precision | unit | `npm test -- --testPathPattern=accounting-entry.service` | ❌ Wave 0 |
| FIN-LEDGER-03 | After a new rate is inserted, the original entry's `amountBsF` is unchanged | integration | `npm test -- --testPathPattern=accounting-entry.controller.historical` | ❌ Wave 0 |
| FIN-LEDGER-04 | Upload `.html` renamed to `.pdf` → 422 | integration | `npm test -- --testPathPattern=accounting-attachment.controller.mime-validation` | ❌ Wave 0 |
| FIN-LEDGER-05 | `GET /storage/receipts/2026/05/<uuid>.pdf` without auth → 401 | integration | `npm test -- --testPathPattern=receipt-static-guard` | ❌ Wave 0 |
| FIN-LEDGER-09 | PATCH on `amountBsF` field → 400 (immutable) | unit | `npm test -- --testPathPattern=accounting-entry.controller.update` | ❌ Wave 0 |
| D-01 | Two rates on same date → entry uses the more-recent `createdAt` | unit | `npm test -- --testPathPattern=exchange-rate.service` | ❌ Wave 0 |
| D-06 | Reversal creates negated entry + sets `original.reversedById` atomically | integration | `npm test -- --testPathPattern=accounting-entry.controller.reverse` | ❌ Wave 0 |
| D-07 | Every CRUD action writes an AuditLog row | integration | `npm test -- --testPathPattern=contabilidad.auditlog` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run for the touched file (e.g., `npm test -- accounting-entry.service` after editing the service).
- **Per wave merge:** `npm test -- --testPathPattern=accounting|contabilidad|exchange-rate` (full Phase 13 surface).
- **Phase gate:** `npm test` full suite green; `prisma validate` exits 0; manual smoke against local UI (`/admin/contabilidad`) passes the five success criteria from ROADMAP.md.

### Wave 0 Gaps
- [ ] `backend/src/services/__tests__/exchange-rate.service.test.js` — D-01 / FIN-RATE-04 helper logic
- [ ] `backend/src/services/__tests__/accounting-entry.service.test.js` — decimal.js arithmetic, reversal arithmetic, FIN-LEDGER-09 update guard
- [ ] `backend/src/controllers/__tests__/accounting-entry.controller.test.js` — full integration; needs supertest. **Project has no supertest dep yet** — planner adds `supertest` to devDependencies in Plan 1 OR uses raw `fetch` against a test-server boot. The Phase 11 codebase uses raw Jest tests without supertest; match convention unless the planner sees a need.
- [ ] `backend/src/controllers/__tests__/accounting-attachment.controller.test.js` — multer + file-type mock fixtures (small valid PDF, fake `.html` payload)
- [ ] `backend/test-fixtures/receipts/` — 3 fixtures: `valid.pdf` (real PDF magic bytes), `valid.png`, `evil.html.pdf` (HTML payload with `.pdf` extension)
- [ ] Confirm `jest` is configured to handle `import` in ESM mode — the existing dateUtils tests already do this, so the pattern is proven.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse `authenticate` middleware (`backend/src/middlewares/auth.middleware.js`) — JWT Bearer token, verified server-side. [VERIFIED IN TREE] |
| V3 Session Management | partial | JWT expiration handled by `authService.verifyToken`. No change in Phase 13. |
| V4 Access Control | yes | Reuse `authorize('ADMIN')` — every Phase 13 route requires ADMIN role. Receipt download MUST go through this gate (FIN-LEDGER-05 / P-1). |
| V5 Input Validation | yes | Hand-rolled in controllers; OR `zod` (planner discretion). Numeric fields parsed via `decimal.js` to reject NaN/Infinity. |
| V6 Cryptography | yes (for filename UUIDs) | `crypto.randomUUID()` (stdlib) — never `Math.random()`. |
| V12 File Handling | yes | multer 5MB cap + file-type byte inspection + UUID filename + storage path outside web root (via P-1 guard) |
| V13 API & Web Service | yes | Same as V4 — JSON-only responses, JWT-gated, CORS already set in `index.js` |

### Known Threat Patterns for {express + multer + Prisma + Postgres}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious file upload (`.html`-as-`.pdf` for XSS via direct serve) | Tampering / Information disclosure | `file-type` byte inspection (Pattern 5); 422 on mismatch; storage path outside web root (P-1) |
| Unauthenticated direct receipt access | Information disclosure | Auth-gated controller; explicit `/storage/receipts/*` excluder before `express.static` (P-1) |
| Path traversal via filename (`../../../etc/passwd`) | Tampering | UUID filename — operator-supplied name only goes to `originalName` column, never on disk |
| Decimal precision drift causing financial mis-reporting | Repudiation | `decimal.js ROUND_HALF_UP`; `@db.Decimal(18, 8)` consistency |
| Mass-create AuditLog from a compromised admin token (audit log inflation) | Denial of service | Rate-limited via existing `generalLimiter` at `index.js:118`; out-of-scope for this phase but worth noting |
| SQL injection on filters (date range, type, category) | Tampering | Prisma parameterizes everything; never use `$queryRawUnsafe` in this phase |
| Race condition on settlement PAYMENT (P-6) | Tampering (over-payment) | Backend re-validates on POST; accept the race in v1; reversal mechanism recovers |
| `req.ip` spoofing behind reverse proxy (P-8) | Repudiation | `app.set('trust proxy', true)` if not already set |
| ZIP-bomb-style large upload (e.g., 20MB file claiming to be PDF) | DoS | multer `limits.fileSize = 5MB` rejects at 413 before any disk write |
| Open redirect from PAYMENT picker pre-population | (none — not a redirect) | N/A |

## Sources

### Primary (HIGH confidence)
- `backend/package.json` — verified all currently installed deps + Node engine surface [VERIFIED]
- `backend/src/index.js:120-142` — verified `express.static` mount and webhook raw-body order [VERIFIED]
- `backend/src/middlewares/auth.middleware.js` — verified `authenticate` + `authorize` signatures [VERIFIED]
- `backend/src/controllers/admin-jobs.controller.js:126-134` — AuditLog write pattern [VERIFIED]
- `backend/src/controllers/monitor.controller.js:130-220` — PDFKit streaming + drawTable helper (relevant for Phase 14 but informs receipt-download pattern) [VERIFIED]
- `backend/prisma/schema.prisma:400-422` — AuditLog model + 16 in-tree models using `isActive Boolean @default(true)` [VERIFIED]
- `frontend/app/admin/cuentas-sistema/page.js:14`, `proveedores/page.js:780,1006` — `useState` + native form pattern [VERIFIED]
- `.planning/phases/13-exchange-rate-accounting-ledger/13-CONTEXT.md` — D-01..D-07 locked decisions [VERIFIED]
- `.planning/REQUIREMENTS.md` — FIN-RATE-01..05 + FIN-LEDGER-01..09 locked [VERIFIED]
- `.planning/phases/12-provider-commission-engine/12-PATTERNS.md:1041-1165` — singleton-prisma, AuditLog convention, admin-auth-router, Decimal.js pattern [VERIFIED]
- `.planning/phases/11-drawfinancial-foundation/11-01-SUMMARY.md` — migration approach (manual diff + apply + `_prisma_migrations` insert) [VERIFIED]

### Secondary (MEDIUM confidence)
- `npm view multer version` → `2.1.1` [VERIFIED via npm CLI]
- `npm view file-type version engines.node` → `21.3.0` / `>=22` [VERIFIED via npm CLI — caveat: prod is Node 20.20.2, so pin `^19` until prod Node is upgraded]
- multer 2.x docs (dev.to and expressjs.com) — `fileSize` + `fileFilter` + `memoryStorage` patterns [CITED]
- sindresorhus/file-type README — ESM-only since v16 [CITED]

### Tertiary (LOW confidence)
- `app.set('trust proxy', true)` is the right fix for `req.ip` behind nginx (A4) — accepted Express convention but not verified against this project's specific deployment topology
- The Prisma self-relation syntax for `reverses`/`reversedFor` (A3) — standard idiom but exact syntax should be validated via `prisma format` at task time

## Project Constraints (from CLAUDE.md)

- **Backend uses ES modules** (`import`/`export`, not `require`) — verified, locks `file-type` ESM compatibility.
- **Prisma singleton from `lib/prisma.js`** — every new service/controller imports from there.
- **Timezone Venezuela (America/Caracas, UTC-4) via `lib/dateUtils.js`** — entry-date bucketing for receipt path uses this.
- **Image assets path convention** — `storage/bases/{gameId}/` — confirms storage tree is publicly served (P-1).
- **LOCAL ONLY this session** — no `ssh 94`, no git push, no pm2 restart. Phase 13 has no cron lines.
- **Decimal precision convention from Phase 11/12** — `Decimal @db.Decimal(18, 8)` for monetary fields; `decimal.js` for arithmetic.
- **DB credentials (local):** `tote_user / tote_password_2025 @ localhost:5433/tote_db`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every existing dep verified in `backend/package.json`; new deps (`multer`, `file-type`) verified via `npm view`.
- Architecture: HIGH — patterns directly inherited from Phase 11/12 and confirmed in tree.
- Pitfalls: HIGH on P-1 (verified via `index.js:136` line read), HIGH on P-9 (verified via grep), MEDIUM on P-6 (race scenario reasoned, not observed), MEDIUM on P-8 (assumption about reverse-proxy topology).
- Storage layout: HIGH — public `/storage` mount confirmed; receipt path is inside it; explicit mitigation required.
- Frontend pattern: HIGH — react-hook-form usage verified zero via grep.

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days — stable stack; revisit if multer or file-type bump major before then)
