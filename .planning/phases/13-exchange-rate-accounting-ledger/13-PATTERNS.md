# Phase 13: Exchange Rate + Accounting Ledger — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 32 (4 NEW Prisma models + 2 enums + back-relations / 4 NEW services / 4 NEW controllers / 1 NEW route file / 2 NEW middlewares / 1 MODIFIED `index.js` / 1 MODIFIED `package.json` / 6 NEW frontend pages / 4+ NEW frontend components / 1 NEW frontend api client / 4 NEW test files / 1 NEW migration / 1 OPTIONAL seed)
**Analogs found:** 30 / 32 (2 genuinely greenfield: `static-storage-guard.middleware.js`, `attachment.service.js` — documented as new patterns)

Phase 13 is composition over (a) Phase 11/12 schema + migration conventions, (b) the `admin-jobs.controller.js` AuditLog pattern, (c) the `provider.routes.js` + `class-based controller` request-response shape, and (d) the plain `useState` form convention proven across `/admin/proveedores` and `/admin/conciliacion`. Two novelties: multer + file-type byte inspection (no prior in-tree adopter), and the 3-line `static-storage-guard` middleware that addresses RESEARCH P-1.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/schema.prisma` (ADD `ExchangeRate`, `AccountingEntry`, `Category`, `AccountingEntryAttachment` + 3 enums + back-relations) | Model (NEW) | persistence (Decimal, immutable + audit fields, soft-delete, self-relation, optional FK) | Phase 12 `ProviderCommissionConfig` (append-only) + `Game.isActive` (line 23) + Phase 11 `DrawFinancial` (Decimal precision) + Phase 11 `DrawFinancialProvider` (optional FK) | role-match (DIFFER on Decimal precision: Phase 13 uses `(18,8)` per CONTEXT A1 like Phase 12, NOT `(12,2)`) |
| `backend/prisma/migrations/{ts}_phase13_accounting/migration.sql` | Migration (NEW) | one-shot DDL | Phase 11 + Phase 12 migration files | exact |
| `backend/src/services/exchange-rate.service.js` | Service (NEW) | request-response, pure query | Phase 12 `commission.service.js#findEffectiveConfig` (effectiveFrom DESC lookup) | exact (smaller surface: single helper) |
| `backend/src/services/accounting-entry.service.js` | Service (NEW) | CRUD + $transaction (reversal) + AuditLog write | `backend/src/services/draw-financial.service.js` (singleton + named exports + custom error class) + Phase 12 reversal pattern + `prisma.$transaction` (interactive callback form) | role-match (NEW reversal $transaction is novel; rest is exact) |
| `backend/src/services/category.service.js` | Service (NEW) | CRUD with soft-deactivate | `backend/src/controllers/provider.controller.js` (CRUD shape) + `Game.isActive`/`User.isActive` schema convention | exact |
| `backend/src/services/attachment.service.js` | Service (NEW) | file I/O (multer buffer → file-type → fs.writeFile) | **No analog — first file-upload feature in repo.** Closest precedent: `imageController.js` (read+sendFile) — but writes are novel | NEW pattern documented below |
| `backend/src/controllers/exchange-rate.controller.js` | Controller (NEW) | request-response (POST/GET) + AuditLog write | `backend/src/controllers/admin-jobs.controller.js:126-134` (AuditLog write) + `provider.controller.js` (class shape) | exact |
| `backend/src/controllers/accounting-entry.controller.js` | Controller (NEW) | request-response (POST/GET/PATCH + POST :id/reverse) + AuditLog write | `admin-jobs.controller.js` (AuditLog) + `provider.controller.js` (CRUD method shape) | exact |
| `backend/src/controllers/category.controller.js` | Controller (NEW) | request-response (POST/GET/PATCH) | `provider.controller.js` (`createConfiguration`, `updateConfiguration`) | exact |
| `backend/src/controllers/attachment.controller.js` | Controller (NEW) | file I/O (upload via multer, auth-gated download stream, delete) | `imageController.js` (`res.sendFile`/createReadStream pattern) + `admin-jobs.controller.js` (AuditLog write) | role-match (NEW upload+stream combo; AuditLog is exact) |
| `backend/src/routes/contabilidad.routes.js` | Route (NEW) | single router for all 4 sub-resources | `backend/src/routes/provider.routes.js` (top-level `authenticate, authorize('ADMIN')` + `.bind(controller)` pattern) | exact |
| `backend/src/middlewares/upload.middleware.js` (or `receipt-upload.middleware.js`) | Middleware (NEW) | multer config (memoryStorage, 5MB, files: 1) | **No analog — first multer config in repo.** | NEW pattern documented below |
| `backend/src/middlewares/static-storage-guard.middleware.js` | Middleware (NEW) | request-response, route gate | **No analog — novel guard.** Closest precedent: `auth.middleware.js` (early-return guard shape) | NEW 3-line pattern documented below |
| `backend/src/index.js` | Bootstrap (MODIFIED) | mount order — guard BEFORE `express.static('/storage')` at line 136 | self (existing `app.use('/storage', express.static(...))` at line 136) | exact |
| `backend/package.json` | Manifest (MODIFIED) | add 2 deps (`multer@^2.1.1`, `file-type@^19`) | Phase 11 added `decimal.js`; same alphabetic-insertion convention | exact |
| `frontend/app/admin/contabilidad/page.js` | Frontend Page (NEW) | tab switcher (4 tabs default Asientos) | `frontend/app/admin/proveedores/page.js:14` (tab state `useState('configurations')`) + `frontend/app/admin/comisiones/page.js` (Phase 12 tab switcher, when landed) | exact |
| `frontend/app/admin/contabilidad/asientos/nueva/page.js` | Frontend Page (NEW) | request-response, form (currency-switcher, settlement picker) | `frontend/app/admin/proveedores/page.js:780+` (form modal) + Phase 12 `comisiones/settlements/[id]/page.js` (form pattern) | role-match |
| `frontend/app/admin/contabilidad/asientos/[id]/page.js` | Frontend Page (NEW) | request-response, detail + Reversar button + AuditLog history | `frontend/app/admin/proveedores/logs/page.js` (modal inspector at lines 29-90) + Phase 12 settlements detail | role-match |
| `frontend/app/admin/contabilidad/tasas/page.js` | Frontend Page (NEW) | request-response, timeline + inline-add form | `frontend/app/admin/conciliacion/page.js` (filters + table layout) | role-match |
| `frontend/app/admin/contabilidad/categorias/page.js` | Frontend Page (NEW) | CRUD-style table grouped by `appliesTo` | `frontend/app/admin/proveedores/page.js` (full CRUD page) | exact |
| `frontend/app/admin/contabilidad/pagos/page.js` | Frontend Page (NEW) | filtered PAYMENT list + "marcar pagado" quick-action | `frontend/app/admin/conciliacion/page.js` (filtered list) | role-match |
| `frontend/components/admin/contabilidad/*` (forms, table, modals, FileUploader, StatusBadge) | Frontend Component (NEW) | dumb-presentational | `frontend/components/admin/conciliacion/ConciliacionTable.js` + `ConciliacionFilters.js` + Phase 12 `comisiones/StatusBadge.js` | role-match |
| `frontend/lib/api/contabilidad.js` | Frontend API Client (NEW) | axios wrapper | `frontend/lib/api/conciliacion.js` (URLSearchParams pattern) | exact |
| `backend/src/__tests__/services/exchange-rate.service.test.js` | Test (NEW) | unit | existing tests in `backend/src/__tests__/` | role-match |
| `backend/src/__tests__/services/accounting-entry.service.test.js` | Test (NEW) | unit (reversal $transaction, immutability, USD conversion) | existing service tests | role-match |
| `backend/src/__tests__/controllers/attachment.controller.test.js` | Test (NEW) | integration (multer + file-type byte rejection of `.html` renamed `.pdf`; 401 on direct `/storage/receipts/*` URL) | existing controller tests | role-match |

---

## Pattern Assignments

### 1. `backend/prisma/schema.prisma` — ADD 4 models + 3 enums + back-relations

**Role:** Model (NEW)
**Analogs:**
- Phase 12 `ProviderCommissionConfig` — append-only/immutable convention, `effectiveFrom`-style audit field.
- `Game` at `schema.prisma:23` — `isActive Boolean @default(true)` convention (16 models follow this).
- Phase 11 `DrawFinancial` (line 1149) — Decimal precision pattern. **DIFFER:** Phase 13 uses `Decimal(18, 8)` (CONTEXT A1, same as Phase 12), NOT `(12, 2)`.
- Phase 11 `DrawFinancialProvider` (line 1178) — optional FK relation pattern (mirror for `AccountingEntry.exchangeRateId` and `.settlementId`).
- Existing `AuditLog` model at `schema.prisma:404-422` — REUSE; do NOT add new audit table.
- `User` model at `schema.prisma:325` — FK target for `createdById`, `uploadedById`.

**Enum definitions to add** (mirror `ApiSystemMode` style):
```prisma
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
```

**`ExchangeRate` model** (mirror append-only + audit pattern from `ProviderCommissionConfig`):
- `id String @id @default(uuid())`
- `date DateTime @db.Date` — pure date, no time (CONTEXT A2). NOT `@unique` — multiple rateType rows per date allowed (D-01).
- `rateBsPerUsd Decimal @db.Decimal(18, 8)` — F-4 precision.
- `rateType ExchangeRateType` — F-8 column from day one.
- `notes String?`
- `createdById String` — FIN-RATE-03 audit.
- `createdAt DateTime @default(now())`
- `createdBy User @relation(fields: [createdById], references: [id])`
- `accountingEntries AccountingEntry[]` — back-relation.
- `@@index([date, createdAt(sort: Desc)])` — D-01 picker index (RESEARCH Pattern 1 mirror).
- `@@index([rateType, date])` — rate timeline filter.
- **No UPDATE endpoint** — FIN-RATE-02 enforced at service layer.

**`Category` model** (mirror `Game.isActive` convention + Phase 12 append-only category-style):
```prisma
model Category {
  id          String              @id @default(uuid())
  name        String
  appliesTo   AccountingEntryType
  isActive    Boolean             @default(true)  // D-02 soft-delete
  createdById String
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  createdBy User              @relation(fields: [createdById], references: [id])
  entries   AccountingEntry[]

  @@unique([appliesTo, name])
  @@index([appliesTo, isActive])
}
```

**`AccountingEntry` model** (mirror `DrawFinancialProvider` optional-FK shape + new self-relation):
- Monetary fields `Decimal(18, 8)` (CONTEXT A1):
  - `amountBsF Decimal @db.Decimal(18, 8)` — IMMUTABLE post-create (FIN-LEDGER-09).
  - `originalAmount Decimal? @db.Decimal(18, 8)` — null for BsF-native entries.
  - `originalCurrency AccountingCurrency`.
- `exchangeRateId String?` — null for BsF-native entries.
- `entryDate DateTime @db.Date` — pure date (CONTEXT A2).
- `categoryId String`.
- `description String` — EDITABLE (FIN-LEDGER-09).
- `createdById String`, `createdAt`, `updatedAt`.
- **Self-relation for reversal (D-06)** — verify exact Prisma syntax (Open Question A3 in RESEARCH):
  ```prisma
  reversesId     String?           @unique
  reversedById   String?           @unique
  reversalReason String?
  reverses    AccountingEntry? @relation("EntryReversal", fields: [reversesId], references: [id])
  reversedBy  AccountingEntry? @relation("EntryReversal")
  ```
  CANONICAL Prisma idiom: one named relation `"EntryReversal"` with `fields/references` on the side that owns the FK; the other side is the back-reference. Planner MUST run `prisma format && prisma validate` before committing.
- **PAYMENT → Settlement optional FK (D-03)** — mirror `DrawFinancialProvider.apiSystem ApiSystem? @relation(...)` shape (Phase 11 `schema.prisma:1183`):
  ```prisma
  settlementId String?
  settlement   ProviderWeeklySettlement? @relation(fields: [settlementId], references: [id])
  ```
- Optional `sequentialNo Int @default(autoincrement()) @unique` — RESEARCH Open Question #1 (recommended). Planner discretion to include or skip.
- Indices:
  ```prisma
  @@index([entryDate, type])
  @@index([categoryId, entryDate])
  @@index([settlementId])
  @@index([type, entryDate])
  ```

**`AccountingEntryAttachment` model** (NEW pattern, simple shape):
```prisma
model AccountingEntryAttachment {
  id           String          @id @default(uuid())
  entryId      String
  filename     String          // UUID-based, e.g. "a1b2c3d4-e5f6.pdf"
  originalName String          // operator-supplied (preserved for UI)
  mimeType     String          // byte-validated by file-type, NOT trusted from client
  sizeBytes    Int
  uploadedById String
  uploadedAt   DateTime        @default(now())

  entry        AccountingEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  uploadedBy   User            @relation(fields: [uploadedById], references: [id])

  @@index([entryId])
}
```
`onDelete: Cascade` is defensive (CONTEXT A7) — admin never hard-deletes entries (reversal flow).

**Back-relations to add to existing models:**
```prisma
// On User (around line 325-374): ADD
exchangeRatesCreated   ExchangeRate[]
categoriesCreated      Category[]
accountingEntries      AccountingEntry[]
attachmentsUploaded    AccountingEntryAttachment[]

// On ProviderWeeklySettlement (Phase 12 model): ADD
payments               AccountingEntry[]
```

---

### 2. `backend/src/services/exchange-rate.service.js` — NEW (D-01 lookup helper)

**Role:** Service (NEW, pure query)
**Analog:** Phase 12 `commission.service.js#findEffectiveConfig` — effectiveFrom DESC + LIMIT 1 pattern.

**Imports + module shape** (mirror Phase 11 `draw-financial.service.js:30-31`):
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
```

**The single chokepoint helper (D-01 + FIN-RATE-04):**
```javascript
/**
 * D-01: returns the most-recently-loaded ExchangeRate for the given date,
 * regardless of rateType. Returns null if no rate exists for that date.
 * The accounting controller MUST call this — never inline the query
 * (CONTEXT A3 + RESEARCH "Anti-Patterns to Avoid").
 */
export async function getEffectiveRateForDate(date) {
  return prisma.exchangeRate.findFirst({
    where:   { date },
    orderBy: { createdAt: 'desc' },   // last loaded of the day
  });
}
```

Optional extra exports for tests / controller convenience:
```javascript
export async function listRates({ rateType, from, to }) {
  return prisma.exchangeRate.findMany({
    where: {
      ...(rateType && { rateType }),
      ...(from && { date: { gte: from } }),
      ...(to && { date: { lte: to } }),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createRate(data, userId) {
  return prisma.exchangeRate.create({
    data: { ...data, createdById: userId },
  });
}
// NO updateRate / deleteRate — FIN-RATE-02 immutability.
```

---

### 3. `backend/src/services/accounting-entry.service.js` — NEW (CRUD + reversal $transaction)

**Role:** Service (NEW, CRUD + $transaction)
**Analogs:**
- Phase 11 `draw-financial.service.js` — module-level named exports, custom error class shape, `Decimal` import.
- RESEARCH Pattern 3 (reversal $transaction) — interactive callback form.

**Imports:**
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import Decimal from 'decimal.js';
import { getEffectiveRateForDate } from './exchange-rate.service.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
```

**Custom error class for F-6 (mirror Phase 11 `PrizesNotProcessedError` at `draw-financial.service.js:37-42`):**
```javascript
export class NoRateForDateError extends Error {
  constructor(date) {
    super(`No exchange rate exists for ${date} — admin must create one before logging a USD entry`);
    this.name = 'NoRateForDateError';
  }
}
```

**Create flow (FIN-LEDGER-02 + F-6 + F-7):**
```javascript
export async function createEntry({ type, entryDate, categoryId, description, currency, amount, settlementId, createdById }) {
  let amountBsF, originalAmount = null, exchangeRateId = null;

  if (currency === 'USD') {
    const rate = await getEffectiveRateForDate(entryDate);
    if (!rate) throw new NoRateForDateError(entryDate);
    exchangeRateId = rate.id;                                         // F-7 lock the rate at creation
    originalAmount = new Decimal(amount);
    amountBsF      = originalAmount.times(rate.rateBsPerUsd.toString()).toFixed(8);
  } else {
    amountBsF = new Decimal(amount).toFixed(8);
  }

  // P-6 picker re-validate
  if (settlementId) {
    const settlement = await prisma.providerWeeklySettlement.findUnique({ where: { id: settlementId } });
    if (!settlement || !['CONFIRMED', 'ADJUSTED'].includes(settlement.status)) {
      throw new Error('Settlement no es elegible para pago');
    }
  }

  return prisma.accountingEntry.create({
    data: {
      type, entryDate, categoryId, description,
      amountBsF, originalAmount: originalAmount?.toFixed(8) ?? null,
      originalCurrency: currency, exchangeRateId,
      settlementId: settlementId ?? null,
      createdById,
    },
  });
}
```

**Update flow (FIN-LEDGER-09 — strip immutable fields):**
```javascript
const IMMUTABLE = new Set(['amountBsF', 'originalAmount', 'originalCurrency', 'entryDate', 'exchangeRateId', 'type']);

export async function updateEntry(id, patch) {
  const safe = Object.fromEntries(
    Object.entries(patch).filter(([k]) => !IMMUTABLE.has(k))
  );
  // Only description, categoryId, attachments (handled separately) survive.
  return prisma.accountingEntry.update({ where: { id }, data: safe });
}
```

**Reversal flow (D-06 + RESEARCH Pattern 3, interactive callback form A5):**
```javascript
export async function reverseEntry(originalId, reversalReason, userId) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.accountingEntry.findUniqueOrThrow({ where: { id: originalId } });

    // D-06 guards: cannot reverse a reversal, cannot reverse already-reversed
    if (original.reversedById) throw new Error('Entry ya reversado');
    if (original.reversesId)   throw new Error('No se puede reversar un asiento de reversal');

    const newReversal = await tx.accountingEntry.create({
      data: {
        type:             original.type,
        entryDate:        original.entryDate,
        categoryId:       original.categoryId,
        exchangeRateId:   original.exchangeRateId,
        originalCurrency: original.originalCurrency,
        amountBsF:        new Decimal(original.amountBsF.toString()).neg().toFixed(8),
        originalAmount:   original.originalAmount
          ? new Decimal(original.originalAmount.toString()).neg().toFixed(8)
          : null,
        description:      `Reversal de ${original.sequentialNo ?? original.id.slice(0, 8)}`,
        reversesId:       original.id,
        reversalReason,
        createdById:      userId,
      },
    });

    await tx.accountingEntry.update({
      where: { id: original.id },
      data:  { reversedById: newReversal.id },                       // one-time write to nullable column
    });

    return newReversal;
  });
}
```

---

### 4. `backend/src/services/category.service.js` — NEW (CRUD + soft-deactivate)

**Role:** Service (NEW, simple CRUD)
**Analog:** `provider.controller.js` CRUD methods (lines 48-100 style) + `Game.isActive` schema convention.

**Pattern (D-02):**
```javascript
import { prisma } from '../lib/prisma.js';

export async function listCategories({ appliesTo, includeInactive = false }) {
  return prisma.category.findMany({
    where: {
      ...(appliesTo && { appliesTo }),
      ...(!includeInactive && { isActive: true }),
    },
    orderBy: [{ appliesTo: 'asc' }, { name: 'asc' }],
  });
}

export async function createCategory({ name, appliesTo }, userId) {
  return prisma.category.create({ data: { name, appliesTo, createdById: userId } });
}

// Soft-delete only — D-02 forbids hard delete (FIN-LEDGER-06 historical-label preservation)
export async function deactivateCategory(id) {
  return prisma.category.update({ where: { id }, data: { isActive: false } });
}

export async function reactivateCategory(id) {
  return prisma.category.update({ where: { id }, data: { isActive: true } });
}

// Rename only — no other mutable fields
export async function renameCategory(id, name) {
  return prisma.category.update({ where: { id }, data: { name } });
}
```

---

### 5. `backend/src/services/attachment.service.js` — NEW (NO ANALOG — first file-upload feature)

**Role:** Service (NEW, file I/O)
**Analog:** **None — document as new pattern.** Closest precedent is `imageController.js` for read operations only.

**The full pattern (F-14, FIN-LEDGER-04):**
```javascript
import { prisma } from '../lib/prisma.js';
import { fileTypeFromBuffer } from 'file-type';                   // ESM — works because backend declares "type": "module"
import { randomUUID } from 'crypto';                              // Node 19+ stdlib (prod is 20.20.2)
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { format } from 'date-fns';

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const STORAGE_ROOT  = path.join(process.cwd(), 'storage', 'receipts');
const MAX_BYTES     = 5 * 1024 * 1024;                            // defensive — multer enforces too

/**
 * F-14: byte-level MIME validation. NEVER trust req.file.mimetype (client-supplied).
 */
export async function validateAndStore({ buffer, originalName, entryDate, uploadedById, entryId }) {
  // Defensive size check (multer is the primary gate at 5MB)
  if (buffer.length > MAX_BYTES) {
    const err = new Error(`Archivo excede 5MB`); err.statusCode = 413; throw err;
  }

  // Byte-level MIME check
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    const err = new Error(`Tipo de archivo no permitido: ${detected?.mime ?? 'desconocido'}`);
    err.statusCode = 422; throw err;
  }

  // Path: backend/storage/receipts/YYYY/MM/{uuid}.{ext}
  // Use entryDate (NOT today's date — D-04 + P-5). Date-only column → safe slice.
  const yyyymm   = format(entryDate, 'yyyy/MM');
  const uuid     = randomUUID();
  const filename = `${uuid}.${detected.ext}`;
  const dir      = path.join(STORAGE_ROOT, yyyymm);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);

  return prisma.accountingEntryAttachment.create({
    data: {
      entryId, filename, originalName,
      mimeType: detected.mime,                                    // VALIDATED, not from req.file.mimetype
      sizeBytes: buffer.length,
      uploadedById,
    },
  });
}

/** Auth-gated download stream — controller pipes res. */
export async function getAttachmentStream(attachmentId) {
  const att = await prisma.accountingEntryAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { entry: { select: { entryDate: true } } },
  });
  const yyyymm = format(att.entry.entryDate, 'yyyy/MM');
  const full   = path.join(STORAGE_ROOT, yyyymm, att.filename);
  return { att, stream: createReadStream(full) };
}

export async function deleteAttachment(attachmentId) {
  const att = await prisma.accountingEntryAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { entry: { select: { entryDate: true } } },
  });
  const yyyymm = format(att.entry.entryDate, 'yyyy/MM');
  const full   = path.join(STORAGE_ROOT, yyyymm, att.filename);
  await fs.unlink(full).catch(() => {});                          // best-effort fs cleanup
  return prisma.accountingEntryAttachment.delete({ where: { id: attachmentId } });
}
```

---

### 6. `backend/src/controllers/exchange-rate.controller.js` — NEW

**Role:** Controller (NEW, request-response + AuditLog)
**Analogs:**
- `backend/src/controllers/admin-jobs.controller.js:126-134` — AuditLog write (NOTE: existing pattern OMITS `ipAddress` and `userAgent`; D-07 REQUIRES them — see "DIFFER FROM" section).
- `backend/src/controllers/provider.controller.js` — class shape + `export default new XController()`.

**Class shape (mirror `provider.controller.js`):**
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import * as rateService from '../services/exchange-rate.service.js';

class ExchangeRateController {
  async create(req, res) {
    try {
      const { date, rateBsPerUsd, rateType, notes } = req.body;
      const rate = await rateService.createRate(
        { date: new Date(date), rateBsPerUsd, rateType, notes },
        req.user.id,
      );

      // D-07 AuditLog — INCLUDE ipAddress + userAgent (corrects admin-jobs.controller.js:126-134 omission)
      await prisma.auditLog.create({
        data: {
          action:    'CREATE',
          entity:    'ExchangeRate',
          entityId:  rate.id,
          userId:    req.user?.id ?? null,
          ipAddress: req.ip,                                       // app already has `trust proxy 1` at index.js:24
          userAgent: req.get('user-agent') ?? null,
          changes:   { date, rateBsPerUsd, rateType, notes },
        },
      });

      res.status(201).json({ success: true, data: rate });
    } catch (err) {
      logger.error('Error en createRate:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async list(req, res) {
    try {
      const { rateType, from, to } = req.query;
      const rates = await rateService.listRates({
        rateType,
        from: from ? new Date(from) : undefined,
        to:   to   ? new Date(to)   : undefined,
      });
      res.json({ success: true, data: rates });
    } catch (err) {
      logger.error('Error en listRates:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // NO update / delete — FIN-RATE-02 immutability.
}

export default new ExchangeRateController();
```

---

### 7. `backend/src/controllers/accounting-entry.controller.js` — NEW

**Role:** Controller (NEW, request-response + AuditLog + reversal)
**Analog:** same as #6 — `admin-jobs.controller.js` (AuditLog) + `provider.controller.js` (class shape).

**Key method (`create`)** — full F-6 mitigation:
```javascript
async create(req, res) {
  try {
    const entry = await entryService.createEntry({ ...req.body, createdById: req.user.id });
    await this._writeAudit('CREATE', entry.id, req, { /* full body snapshot */ });
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    if (err instanceof NoRateForDateError) {
      return res.status(400).json({ success: false, error: err.message });   // F-6: explicit 400
    }
    logger.error('Error en createEntry:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

async reverse(req, res) {
  try {
    const { reversalReason } = req.body;
    if (!reversalReason) return res.status(400).json({ error: 'reversalReason es requerido' });
    const reversal = await entryService.reverseEntry(req.params.id, reversalReason, req.user.id);
    await this._writeAudit('REVERSE', req.params.id, req, { reversedById: reversal.id, reversalReason });
    res.status(201).json({ success: true, data: reversal });
  } catch (err) {
    logger.error('Error en reverseEntry:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

async _writeAudit(action, entityId, req, changes) {
  // Helper — every D-07 write uses this. NOT exported.
  await prisma.auditLog.create({
    data: {
      action, entity: 'AccountingEntry', entityId,
      userId: req.user?.id ?? null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
      changes,
    },
  });
}
```

**`update` method — strips immutable fields server-side AND writes before/after diff to changes:**
```javascript
async update(req, res) {
  try {
    const before = await prisma.accountingEntry.findUnique({ where: { id: req.params.id } });
    const after  = await entryService.updateEntry(req.params.id, req.body);
    await this._writeAudit('UPDATE', req.params.id, req, {
      before: { description: before.description, categoryId: before.categoryId },
      after:  { description: after.description,  categoryId: after.categoryId },
    });
    res.json({ success: true, data: after });
  } catch (err) { /* ... */ }
}
```

**`getOne` — embed AuditLog history per RESEARCH Open Question #4:**
```javascript
async getOne(req, res) {
  const entry = await prisma.accountingEntry.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { category: true, exchangeRate: true, settlement: true, attachments: true, reverses: true, reversedBy: true },
  });
  const auditHistory = await prisma.auditLog.findMany({
    where: { entity: 'AccountingEntry', entityId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ success: true, data: { ...entry, auditHistory } });
}
```

---

### 8. `backend/src/controllers/category.controller.js` — NEW

**Role:** Controller (NEW, simple CRUD)
**Analog:** `provider.controller.js#createConfiguration` shape.

Standard pattern, AuditLog on CREATE / DEACTIVATE (D-07). Mirror sections 6/7 with `entity: 'Category'`.

---

### 9. `backend/src/controllers/attachment.controller.js` — NEW

**Role:** Controller (NEW, file I/O + auth-gated stream + AuditLog)
**Analogs:**
- `imageController.js` — `res.sendFile` / createReadStream precedent.
- `admin-jobs.controller.js:126-134` — AuditLog write.

**Upload (called after `uploadReceipt.single('file')` multer middleware):**
```javascript
import * as attachmentService from '../services/attachment.service.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class AttachmentController {
  async upload(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

      const entry = await prisma.accountingEntry.findUniqueOrThrow({
        where: { id: req.params.id },
        select: { entryDate: true },
      });

      const att = await attachmentService.validateAndStore({
        buffer:       req.file.buffer,
        originalName: req.file.originalname,
        entryDate:    entry.entryDate,
        uploadedById: req.user.id,
        entryId:      req.params.id,
      });

      // D-07 AuditLog
      await prisma.auditLog.create({
        data: {
          action: 'UPLOAD', entity: 'AccountingEntryAttachment', entityId: att.id,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          changes: { entryId: att.entryId, mimeType: att.mimeType, sizeBytes: att.sizeBytes },
        },
      });

      res.status(201).json({ success: true, data: att });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });   // 413 / 422
      logger.error('Error en upload:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async download(req, res) {
    try {
      const { att, stream } = await attachmentService.getAttachmentStream(req.params.attId);
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.originalName)}"`);
      stream.pipe(res);
    } catch (err) {
      logger.error('Error en download:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    }
  }

  async remove(req, res) {
    try {
      await attachmentService.deleteAttachment(req.params.attId);
      await prisma.auditLog.create({
        data: {
          action: 'DELETE', entity: 'AccountingEntryAttachment', entityId: req.params.attId,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          changes: { entryId: req.params.id },
        },
      });
      res.json({ success: true });
    } catch (err) {
      logger.error('Error en remove:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new AttachmentController();
```

---

### 10. `backend/src/routes/contabilidad.routes.js` — NEW

**Role:** Route (NEW)
**Analog:** `backend/src/routes/provider.routes.js:1-40` (exact pattern — top-level `router.use(authenticate, authorize('ADMIN'))` + `.bind(controller)`).

**Full file (single router, all 4 sub-resources):**
```javascript
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { uploadReceipt }            from '../middlewares/upload.middleware.js';
import rateController       from '../controllers/exchange-rate.controller.js';
import entryController      from '../controllers/accounting-entry.controller.js';
import categoryController   from '../controllers/category.controller.js';
import attachmentController from '../controllers/attachment.controller.js';

const router = express.Router();

// All routes admin-only (mirror provider.routes.js:7-8)
router.use(authenticate, authorize('ADMIN'));

// Tasas (immutable — POST + GET only, NO PUT/DELETE per FIN-RATE-02)
router.post('/tasas', rateController.create.bind(rateController));
router.get ('/tasas', rateController.list  .bind(rateController));

// Asientos
router.post  ('/asientos',                    entryController.create  .bind(entryController));
router.get   ('/asientos',                    entryController.list    .bind(entryController));
router.get   ('/asientos/:id',                entryController.getOne  .bind(entryController));
router.patch ('/asientos/:id',                entryController.update  .bind(entryController));
router.post  ('/asientos/:id/reverse',        entryController.reverse .bind(entryController));

// Adjuntos (auth-gated — never via /storage/* static)
router.post  ('/asientos/:id/attachments',      uploadReceipt.single('file'), attachmentController.upload  .bind(attachmentController));
router.get   ('/asientos/:id/attachments/:attId',                              attachmentController.download.bind(attachmentController));
router.delete('/asientos/:id/attachments/:attId',                              attachmentController.remove  .bind(attachmentController));

// Categorías
router.post  ('/categorias',                  categoryController.create     .bind(categoryController));
router.get   ('/categorias',                  categoryController.list       .bind(categoryController));
router.patch ('/categorias/:id',              categoryController.update     .bind(categoryController));     // name + isActive toggle
router.patch ('/categorias/:id/deactivate',   categoryController.deactivate .bind(categoryController));     // explicit soft-delete

// P-3 multer error handler (router-level — friendly 413/422 messages)
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Archivo excede 5MB' });
  }
  next(err);
});

export default router;
```

**Mount in `backend/src/index.js`:** under `/api/contabilidad` — mirror Phase 12 commission routes mount pattern.

---

### 11. `backend/src/middlewares/upload.middleware.js` — NEW (NO IN-TREE ANALOG)

**Role:** Middleware (NEW — first multer config in repo)
**Analog:** **None — document as new pattern.** multer 2.x docs.

**Full file (RESEARCH Pattern 5):**
```javascript
import multer from 'multer';

const MAX_BYTES = 5 * 1024 * 1024;                                  // 5MB hard ceiling

/**
 * Receipt upload — memoryStorage so the controller can byte-validate via file-type
 * BEFORE persisting to disk (F-14). Do NOT use multer.diskStorage — would leave the
 * malicious-rename file on disk if validation rejects it.
 *
 * fileFilter intentionally OMITTED — multer's fileFilter inspects the client-supplied
 * mimetype, which is untrusted (F-14 explicit footgun). Validation happens in the
 * controller after the buffer is in memory.
 */
export const uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,                                            // 413 on exceed (P-3 — router-level handler maps to friendly JSON)
    files:    1,                                                    // CONTEXT D-04: one-at-a-time in v1; multi-file deferred
  },
});
```

---

### 12. `backend/src/middlewares/static-storage-guard.middleware.js` — NEW (3-line guard — NO ANALOG)

**Role:** Middleware (NEW — addresses RESEARCH P-1 BLOCKING gap)
**Analog:** **None — novel pattern.** Closest shape: early-return middleware in `auth.middleware.js:7-80`.

**Full file:**
```javascript
/**
 * P-1 (BLOCKING for F-14): backend/storage is publicly served by express.static at
 * index.js:136. Receipts at storage/receipts/ MUST NOT be reachable without auth.
 * This guard is mounted BEFORE the express.static handler so direct hits return 401.
 *
 * Auth-gated downloads still work because they go through
 *   GET /api/contabilidad/asientos/:id/attachments/:attId
 * which never touches the /storage/* path.
 */
export function staticStorageGuard(req, res, next) {
  if (req.path.startsWith('/receipts/') || req.path === '/receipts') {
    return res.status(401).json({ error: 'Forbidden' });
  }
  next();
}
```

---

### 13. `backend/src/index.js` — MODIFIED (insert guard BEFORE static)

**Role:** Bootstrap (MODIFIED, surgical)
**Analog:** self — existing `app.use('/storage', express.static(...))` at line 136.

**Existing line 136 (verified):**
```javascript
app.use('/storage', express.static(path.join(__dirname, '../storage'), {
  maxAge: '1d',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  },
}));
```

**Add BEFORE line 136 (P-1 Option A):**
```javascript
import { staticStorageGuard } from './middlewares/static-storage-guard.middleware.js';   // add to top imports

// P-1 guard — block public access to /storage/receipts/* before the static handler.
app.use('/storage', staticStorageGuard);

// Existing static handler (lines 136-142) UNCHANGED — still serves draw-result images, etc.
app.use('/storage', express.static(...));
```

**Express middleware order matters: guard MUST be registered first.** Test target: `curl -i http://localhost:3001/storage/receipts/2026/05/anything.pdf` → `401`.

**`trust proxy` already set at index.js:24 (`app.set('trust proxy', 1)`)** — VERIFIED. No change needed for P-8 — `req.ip` works behind nginx.

---

### 14. `backend/package.json` — MODIFIED (add multer + file-type)

**Role:** Manifest (MODIFIED, additive)
**Analog:** Phase 11 added `decimal.js`; same alphabetic-insertion convention.

```json
"dependencies": {
  ...
  "file-type": "^19",          // ESM-only — works because backend has "type": "module"
  ...
  "multer": "^2.1.1",
  ...
}
```

**Install command (Plan 1):**
```bash
cd backend && npm install --save multer@^2.1.1 file-type@^19
```

**Pre-install verification (RESEARCH A1 — pin to v19 because file-type@21 requires Node ≥22 and prod runs Node 20.20.2):**
```bash
npm view file-type@^19 main version engines.node
node --input-type=module -e 'import { fileTypeFromBuffer } from "file-type"; console.log(typeof fileTypeFromBuffer)'
```

---

### 15. `frontend/app/admin/contabilidad/page.js` — NEW (tab switcher)

**Role:** Frontend Page (NEW)
**Analog:** `frontend/app/admin/proveedores/page.js:14` — `const [activeTab, setActiveTab] = useState('configurations')`.

**Imports + tab state (mirror `proveedores/page.js:1-15`):**
```javascript
'use client';
import { useState } from 'react';

export default function ContabilidadPage() {
  const [activeTab, setActiveTab] = useState('asientos');         // D-05 default

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <p className="text-sm text-gray-500">Asientos, tasas de cambio, categorías y pagos</p>
      </div>
      <nav className="flex gap-4 border-b border-gray-200">
        {['asientos', 'tasas', 'categorias', 'pagos'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={tabClass(activeTab === tab)}>
            {LABEL[tab]}
          </button>
        ))}
      </nav>
      {/* Render sub-tab content — each sub-tab is its own page under /admin/contabilidad/{tab}/ */}
    </div>
  );
}
```

**Routing note:** D-05 lists 4 sub-tabs. Following Next.js App Router conventions (and Phase 12's `/admin/comisiones/{tab}/page.js` precedent), each tab can be its own route OR all four can render conditionally in a single `page.js` — planner discretion. Recommend separate routes for deep-linking and stable URLs.

---

### 16. `frontend/app/admin/contabilidad/asientos/nueva/page.js` — NEW (create-entry form)

**Role:** Frontend Page (NEW)
**Analogs:**
- `frontend/app/admin/proveedores/page.js:780+` — form modal with `useState` (RESEARCH Pattern 4 + P-9).
- `frontend/app/admin/conciliacion/page.js:1-77` — filter+fetch JWT pattern.

**Form-state pattern (plain `useState` — NOT react-hook-form per P-9):**
```javascript
'use client';
import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export default function NuevoAsientoPage() {
  const [formData, setFormData] = useState({
    type: 'EXPENSE',
    entryDate: new Date().toISOString().slice(0, 10),
    categoryId: '',
    description: '',
    currency: 'BsF',
    amount: '',
    settlementId: null,
  });
  const [categories, setCategories] = useState([]);
  const [rateForDate, setRateForDate] = useState(null);            // F-6 frontend block

  // F-6 frontend block: when currency=USD, fetch rate for entryDate; disable submit if null
  useEffect(() => {
    if (formData.currency !== 'USD') { setRateForDate({}); return; }
    const token = localStorage.getItem('accessToken');
    fetch(`${API_URL}/api/contabilidad/tasas?from=${formData.entryDate}&to=${formData.entryDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(res => setRateForDate(res.data?.[0] ?? null));
  }, [formData.currency, formData.entryDate]);

  const usdBlocked = formData.currency === 'USD' && !rateForDate;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (usdBlocked) return;                                        // F-6 frontend block
    const token = localStorage.getItem('accessToken');
    await fetch(`${API_URL}/api/contabilidad/asientos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* fields ... */}
      {usdBlocked && (
        <div className="text-red-600 text-sm">
          No hay tasa de cambio para {formData.entryDate} — ingresa una tasa primero.
        </div>
      )}
      <button type="submit" disabled={usdBlocked}>Crear asiento</button>
    </form>
  );
}
```

---

### 17. `frontend/app/admin/contabilidad/asientos/[id]/page.js` — NEW (entry detail + Reversar)

**Role:** Frontend Page (NEW)
**Analog:** `frontend/app/admin/proveedores/logs/page.js:29-100` — modal inspector pattern.

**Reversar button visibility (D-06):**
```javascript
const canReverse = entry && !entry.reversedById && !entry.reversesId;

{canReverse && (
  <button onClick={() => setShowReversalModal(true)} className="btn-warn">
    Reversar
  </button>
)}
```

**Reversal confirmation modal** — copy shell from `proveedores/logs/page.js:29-90` (fixed inset + bg-opacity overlay + click-outside close). Input field: required `reversalReason` textarea.

**AuditLog history rendering** — display `entry.auditHistory` (already embedded by `getOne` response per RESEARCH Open Question #4):
```javascript
<ul>
  {entry.auditHistory.map((row) => (
    <li key={row.id}>
      [{row.createdAt}] {row.action} por {row.userId} — {JSON.stringify(row.changes)}
    </li>
  ))}
</ul>
```

---

### 18. `frontend/app/admin/contabilidad/tasas/page.js` — NEW (rate timeline + inline-add)

**Role:** Frontend Page (NEW)
**Analog:** `frontend/app/admin/conciliacion/page.js` — filters + table layout.

**Inline-add row at top of timeline** (RESEARCH Open Question #3 recommendation):
```javascript
<table>
  <thead>...</thead>
  <tbody>
    {/* First row: inline form for new rate */}
    <tr className="bg-yellow-50">
      <td><input type="date" value={newRate.date} onChange={...} /></td>
      <td><select value={newRate.rateType}>...</select></td>
      <td><input type="number" step="0.0001" value={newRate.rateBsPerUsd} /></td>
      <td><button onClick={submitNewRate}>+</button></td>
    </tr>
    {/* Historical rows — immutable, no edit buttons (FIN-RATE-02) */}
    {rates.map(r => <tr key={r.id}>...</tr>)}
  </tbody>
</table>
```

---

### 19. `frontend/app/admin/contabilidad/categorias/page.js` — NEW (CRUD-style table)

**Role:** Frontend Page (NEW)
**Analog:** `frontend/app/admin/proveedores/page.js` — full CRUD page.

**Group by `appliesTo` (D-02):**
```javascript
const grouped = categories.reduce((acc, c) => {
  (acc[c.appliesTo] ??= []).push(c); return acc;
}, {});

['INCOME', 'EXPENSE', 'PAYMENT'].map(type => (
  <section key={type}>
    <h2>{type}</h2>
    {/* Activate/deactivate buttons — NO delete (D-02 soft-delete only) */}
  </section>
))
```

---

### 20. `frontend/app/admin/contabilidad/pagos/page.js` — NEW (PAYMENT entries linked to settlements)

**Role:** Frontend Page (NEW)
**Analog:** `frontend/app/admin/conciliacion/page.js` — filtered list.

**Filter scoped to `type=PAYMENT AND settlementId IS NOT NULL`** (D-05 tab 4).

"Marcar pagado" quick-action — launches form pre-populated with the settlement (D-05). Routes to `/admin/contabilidad/asientos/nueva?settlementId=X&type=PAYMENT`.

---

### 21. `frontend/components/admin/contabilidad/*` — NEW shared components

**Role:** Frontend Component (NEW, dumb-presentational)
**Analogs:**
- `frontend/components/admin/conciliacion/ConciliacionTable.js` — sortable table.
- `frontend/components/admin/conciliacion/ConciliacionFilters.js` — filter bar.
- Phase 12 `frontend/components/admin/comisiones/StatusBadge.js` (when landed).

**Recommended components:**
- `EntryForm.js` — shared by `nueva/page.js` (and edit form on detail page).
- `EntryTable.js` — sortable table with filter chips.
- `CategoryPickerModal.js` — filters categories by `appliesTo` value (D-02).
- `SettlementPickerModal.js` — lists `status IN ('CONFIRMED', 'ADJUSTED') AND paidAmount < amount` settlements (D-03).
- `FileUploader.js` — `<input type="file" accept="application/pdf,image/jpeg,image/png">` + FormData submit (RESEARCH Pattern 5 client side).
- `ReversalModal.js` — confirmation modal with required `reversalReason` textarea.
- `StatusBadge.js` — for reversed/active state (mirror `comisiones/StatusBadge.js`).

**FileUploader pattern:**
```javascript
async function uploadFile(file, entryId) {
  const token = localStorage.getItem('accessToken');
  const fd    = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_URL}/api/contabilidad/asientos/${entryId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },                  // NO Content-Type — browser sets multipart boundary
    body:    fd,
  });
  // ... handle 413/422 from RESEARCH P-3
}
```

---

### 22. `frontend/lib/api/contabilidad.js` — NEW (axios wrapper)

**Role:** Frontend API Client (NEW)
**Analog:** `frontend/lib/api/conciliacion.js` (exact URLSearchParams pattern).

```javascript
import axios from './axios';

export const contabilidadApi = {
  // Tasas
  createRate: (body)        => axios.post('/api/contabilidad/tasas', body).then(r => r.data),
  listRates:  (params = {}) => axios.get('/api/contabilidad/tasas', { params }).then(r => r.data),

  // Asientos
  createEntry: (body)       => axios.post('/api/contabilidad/asientos', body).then(r => r.data),
  listEntries: (params)     => axios.get('/api/contabilidad/asientos', { params }).then(r => r.data),
  getEntry:    (id)         => axios.get(`/api/contabilidad/asientos/${id}`).then(r => r.data),
  updateEntry: (id, body)   => axios.patch(`/api/contabilidad/asientos/${id}`, body).then(r => r.data),
  reverseEntry:(id, reason) => axios.post(`/api/contabilidad/asientos/${id}/reverse`, { reversalReason: reason }).then(r => r.data),

  // Adjuntos — FormData via raw axios for multipart
  uploadAttachment: (entryId, file) => {
    const fd = new FormData(); fd.append('file', file);
    return axios.post(`/api/contabilidad/asientos/${entryId}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  downloadAttachment: (entryId, attId) =>
    axios.get(`/api/contabilidad/asientos/${entryId}/attachments/${attId}`, { responseType: 'blob' }),
  deleteAttachment: (entryId, attId)  =>
    axios.delete(`/api/contabilidad/asientos/${entryId}/attachments/${attId}`).then(r => r.data),

  // Categorías
  createCategory:     (body) => axios.post('/api/contabilidad/categorias', body).then(r => r.data),
  listCategories:     (params) => axios.get('/api/contabilidad/categorias', { params }).then(r => r.data),
  deactivateCategory: (id)   => axios.patch(`/api/contabilidad/categorias/${id}/deactivate`).then(r => r.data),
};

export default contabilidadApi;
```

---

### 23. Tests

**Role:** Test (NEW)
**Analog:** Existing `backend/src/__tests__/` files (Jest, ES modules).

**Required test surfaces:**
1. **`exchange-rate.service.test.js`** — D-01 selection (multiple rateType rows for same date, returns most-recent `createdAt`).
2. **`accounting-entry.service.test.js`** —
   - USD entry without rate → throws `NoRateForDateError` (F-6).
   - 6-month-old USD entry: stored `amountBsF` is unchanged even after a new rate row is added later (F-7).
   - Reversal $transaction is atomic: simulated failure mid-transaction leaves both rows unmodified.
   - Cannot reverse a reversal.
   - `update` strips immutable fields (FIN-LEDGER-09).
3. **`attachment.controller.test.js`** —
   - Upload of `.html` renamed to `.pdf` → 422 (F-14 byte-level rejection).
   - File >5MB → 413.
   - Direct GET `/storage/receipts/anything.pdf` returns 401 (P-1 + success criterion 5).
   - Auth-gated download streams correctly.

---

### 24. Migration File

**Role:** Migration (NEW)
**Analog:** Phase 11 + Phase 12 migration files (auto-generated by `prisma migrate dev`).

**Acceptance criteria** (RESEARCH P-10):
- Pre-flight check: `ProviderWeeklySettlement` table exists (Phase 12 migration must have run first).
- Migration includes: 4 new tables, 3 new enums, all back-relations on User + ProviderWeeklySettlement, all `@@index` directives, FK constraints.
- Optional inline `INSERT` seed for Categories (RESEARCH Open Question #2 recommendation): planner-locked list (operator preference).
- Post-apply: `prisma generate` runs cleanly.

---

## Shared Patterns

### Prisma Singleton Import
**Source:** `backend/src/lib/prisma.js`
**Apply to:** all backend code
```javascript
import { prisma } from '../lib/prisma.js';                         // controllers + services (1 level deep)
```

### Winston Logger
**Source:** `backend/src/lib/logger.js`
**Apply to:** all backend code
```javascript
import logger from '../lib/logger.js';
logger.info('[contabilidad] ...');
logger.error('Error en createEntry:', err);
```

### Admin auth — `authenticate + authorize('ADMIN')`
**Source:** `backend/src/routes/provider.routes.js:7-8`, `auth.middleware.js:7-80`.
**Apply to:** `contabilidad.routes.js` — single line `router.use(authenticate, authorize('ADMIN'))`.

### AuditLog write pattern (CORRECTED — D-07 mandates ipAddress + userAgent)
**Source schema:** `prisma/schema.prisma:404-422` (`AuditLog` model — fields include `ipAddress`/`userAgent` already).
**Source code pattern (PARTIAL — omits diagnostic fields):** `admin-jobs.controller.js:126-134`.
**Phase 13 corrected pattern (ALL D-07 events):**
```javascript
await prisma.auditLog.create({
  data: {
    action,                                                         // 'CREATE' | 'UPDATE' | 'REVERSE' | 'DEACTIVATE' | 'UPLOAD' | 'DELETE'
    entity,                                                         // 'ExchangeRate' | 'AccountingEntry' | 'Category' | 'AccountingEntryAttachment'
    entityId,
    userId:    req.user?.id ?? null,
    ipAddress: req.ip,                                              // app.set('trust proxy', 1) — VERIFIED at index.js:24
    userAgent: req.get('user-agent') ?? null,
    changes,                                                        // before/after snapshot on UPDATE
  },
});
```

### Decimal.js for money math
**Source:** Phase 11 PATTERNS + Phase 12 PATTERNS + RESEARCH "Anti-Patterns".
**Apply to:** every monetary computation in `accounting-entry.service.js`.
```javascript
import Decimal from 'decimal.js';
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
// Prisma Decimal → .toString() → new Decimal() → .toFixed(8) → Prisma string (lossless)
// NEVER Number(prismaDecimal) — precision drift.
```

### `isActive`-based soft-delete (project-wide convention — 16 models)
**Source:** `schema.prisma:23,69,96,224,269,303,333,439,496,544,561,578,…`
**Apply to:** `Category` model — D-02 soft-disable.

### `prisma.$transaction` interactive callback form (reversal atomicity)
**Source:** RESEARCH Pattern 3 + Assumption A5 (interactive callback chosen for readability).
**Apply to:** `accounting-entry.service.js#reverseEntry` (newReversal id needed in update statement — array form requires client-side UUID juggling).

### Plain `useState` form (frontend convention — NOT react-hook-form)
**Source:** `frontend/app/admin/proveedores/page.js:14,780+`, `frontend/app/admin/cuentas-sistema/page.js:14`, `frontend/app/admin/conciliacion/page.js:1-77`.
**Apply to:** all forms in `/admin/contabilidad/*`.
```javascript
const [formData, setFormData] = useState({...});
const handleSubmit = async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('accessToken');
  await fetch(..., { headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(formData) });
};
```

### Frontend JWT auth header
**Source:** `frontend/app/admin/conciliacion/page.js:24-26`, `proveedores/page.js:50-53`.
**Apply to:** every frontend fetch.
```javascript
const token = localStorage.getItem('accessToken');
fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
```

### Axios API client wrapper
**Source:** `frontend/lib/api/conciliacion.js` + `frontend/lib/api/axios.js` (already configured with base URL + interceptors).
**Apply to:** `frontend/lib/api/contabilidad.js`.

### Date-bucketing in VE TZ for `YYYY/MM` path (P-5 mitigation)
**Source:** `backend/src/lib/dateUtils.js` (`getVenezuelaDateString` + `VENEZUELA_TIMEZONE`).
**Apply to:** `attachment.service.js#validateAndStore` — use `date-fns format(entryDate, 'yyyy/MM')` on the `Date`-typed `entryDate` column (P-5 explains why this is safe for date-only Prisma columns).

---

## "DIFFER FROM" Notes (intentional inversions)

| File | Analog | Differ on |
|------|--------|-----------|
| `AccountingEntry` model `amountBsF`/`originalAmount` columns | Phase 11 `DrawFinancial.totalSales` | **Decimal precision: `(18, 8)` NOT `(12, 2)`.** Locked by CONTEXT A1; same precision as Phase 12 commission tables (F-4). |
| AuditLog write call sites | `admin-jobs.controller.js:126-134` | **MUST INCLUDE `ipAddress` and `userAgent`.** The existing in-tree code OMITS them (oversight). D-07 requires them on every audit row. Schema fields exist at `schema.prisma:411-412`. `app.set('trust proxy', 1)` is already at `index.js:24` so `req.ip` returns the real client IP. |
| `ExchangeRate` model | `Game` / `User` / Phase 12 `ProviderCommissionConfig` | **NO `updateRate` / `deleteRate` endpoints.** FIN-RATE-02 immutability — corrections are new dated rows. Mirror Phase 12 `ProviderCommissionConfig` append-only enforcement (F-5). |
| `AccountingEntry` `update` controller | `provider.controller.js#updateConfiguration` | **Strips immutable fields server-side** (`amountBsF`, `originalAmount`, `originalCurrency`, `entryDate`, `exchangeRateId`, `type`). FIN-LEDGER-09. Service-layer `IMMUTABLE` Set enforces. |
| `Category` model | other `isActive` models in repo | **No hard-delete endpoint.** D-02 — soft-delete only via `deactivate`. Preserves historical entries' category labels (FIN-LEDGER-06 implication). |
| `attachment.service.js` | (no analog — first file-upload feature) | **NEW.** `multer.memoryStorage` + `fileTypeFromBuffer` byte inspection BEFORE `fs.writeFile`. Never `multer.diskStorage` (would leave malicious file on disk if validation rejects). |
| `static-storage-guard.middleware.js` | (no analog — novel) | **NEW 3-line pattern.** Mounted BEFORE `express.static('/storage')` at `index.js:136`. Addresses RESEARCH P-1 (BLOCKING). Test target: `curl /storage/receipts/anything.pdf` → 401. |
| `upload.middleware.js` | (no analog — first multer config) | **NEW pattern.** No `fileFilter` (client-supplied mimetype is untrusted — F-14); validation happens in the controller after the buffer is in memory. |
| `accounting-entry.service.js#reverseEntry` | (Phase 11/12 had no reversal $transaction) | **NEW interactive callback form** (`prisma.$transaction(async (tx) => {...})`) — needed because the second statement references the first statement's generated id. Array form would require client-side UUID juggling. |
| Frontend `/admin/contabilidad/*` forms | `react-hook-form` in `frontend/package.json:23` | **Use plain `useState` — NOT react-hook-form.** RESEARCH P-9 verifies zero admin-page adopters of RHF. Consistency over library variety. |

---

## No Analog Found

| File | Role | Reason | Status |
|------|------|--------|--------|
| `backend/src/services/attachment.service.js` | service (file I/O) | First file-upload feature in the repo. multer + file-type + fs.writeFile combo is novel. | Fully documented above — RESEARCH Pattern 5 + new 3-step flow (multer memoryStorage → fileTypeFromBuffer → fs.writeFile to `storage/receipts/YYYY/MM/{uuid}.{ext}`). |
| `backend/src/middlewares/upload.middleware.js` | middleware (multer config) | First multer config in the repo. | Fully documented above — 5MB limit, `files: 1`, memoryStorage, NO fileFilter. |
| `backend/src/middlewares/static-storage-guard.middleware.js` | middleware (route gate) | Novel guard — addresses RESEARCH P-1. | Fully documented above — 3-line pattern; mounted BEFORE `express.static` at `index.js:136`. |

---

## Pitfall Coverage Map (RESEARCH-cited)

| Pitfall | Mitigation in Patterns | File / Section |
|---------|------------------------|----------------|
| P-1 (CRITICAL: `/storage` publicly served) | `static-storage-guard.middleware.js` mounted before `express.static` at `index.js:136` | Section 12 + 13 |
| P-2 (file-type ESM-only) | Verified: `backend/package.json:6` declares `"type": "module"` | Section 14 install verification step |
| P-3 (multer 413 generic message) | Router-level error handler in `contabilidad.routes.js` maps `LIMIT_FILE_SIZE` → friendly 413 JSON | Section 10 (last 5 lines) |
| P-4 (reversal-of-reversal in list filters) | List queries use `WHERE reversedById IS NULL AND reversesId IS NULL` for "active" filter | Section 7 (list endpoint conventions) |
| P-5 (entryDate TZ confusion for YYYY/MM) | `format(entryDate, 'yyyy/MM')` on date-only Prisma column — safe for DATE columns | Section 5 (attachment.service.js) |
| P-6 (PAYMENT settlement picker race) | Backend re-validate on POST (`settlement.status IN ('CONFIRMED','ADJUSTED')`) in `accounting-entry.service.js#createEntry` | Section 3 |
| P-7 (paidAmount aggregation) | `prisma.accountingEntry.aggregate({ _sum: { amountBsF }, where: { settlementId, reversesId: null } })` | (Used in settlement picker controller — list endpoints) |
| P-8 (req.ip behind proxy) | Already mitigated — `app.set('trust proxy', 1)` at `index.js:24` VERIFIED | (No new code needed) |
| P-9 (react-hook-form temptation) | "DIFFER FROM" notes + Pattern "Plain useState form" | Sections 16-21 |
| P-10 (Phase 12 schema must exist first) | Migration acceptance criteria: pre-flight check for `ProviderWeeklySettlement` table | Section 24 |
| F-6 (USD without rate) | Backend `NoRateForDateError` + 400 response; Frontend `usdBlocked` state disables submit | Sections 3, 7, 16 |
| F-7 (re-converting historical USD) | `exchangeRateId` LOCKED at entry creation; UI uses `amountBsF / entry.exchangeRate.rateBsPerUsd` from JOINed row, never `getEffectiveRateForDate(today)` | Section 3 |
| F-8 (rateType column from day one) | Enum + column in `ExchangeRate` model | Section 1 |
| F-14 (MIME validation) | `file-type` byte inspection in `attachment.service.js`, NEVER `req.file.mimetype` | Section 5 |
| F-16 (no Account model) | Categories are simple rows — no hierarchy, no `Account` table | Section 1 (Category model) |

---

## Backfill / Historical

**N/A for Phase 13** — no historical data backfill (CONTEXT scope_boundaries OUT-of-scope + RESEARCH "Runtime State Inventory: greenfield"). Admin enters entries fresh. No `backfill-*.mjs` script in this phase.

---

## Metadata

**Analog search scope:**
- `backend/src/controllers/*.js` (40 files — `admin-jobs`, `provider`, `image`, `monitor`, `webhook` deeply inspected)
- `backend/src/services/*.js` (Phase 11 `draw-financial`, Phase 12 `commission`, existing `accounting-report`)
- `backend/src/routes/*.js` (`provider.routes.js` confirmed as exact analog)
- `backend/src/middlewares/*` (`auth.middleware.js` only — no upload middleware exists)
- `backend/src/index.js:24` (`trust proxy 1` verified) + `:136` (static mount confirmed)
- `backend/prisma/schema.prisma` (User, AuditLog, Game, Category-via-isActive convention, Phase 11 DrawFinancial models, Phase 12 ProviderWeeklySettlement)
- `frontend/app/admin/*` (proveedores, conciliacion, cuentas-sistema verified as `useState` form pattern)
- `frontend/components/admin/conciliacion/*` (table+filter pattern)
- `frontend/lib/api/*` (conciliacion.js verified as axios wrapper convention)
- `.planning/phases/11-drawfinancial-foundation/11-PATTERNS.md`
- `.planning/phases/12-provider-commission-engine/12-PATTERNS.md`

**Files scanned:** ~50
**Pattern extraction date:** 2026-05-15
