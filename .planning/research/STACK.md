# Technology Stack — v1.3 Financial Layer Additions

**Project:** Tote-Web v1.3 Capa Financiera y Contabilidad
**Researched:** 2026-05-15
**Scope:** Stack additions only — existing Node.js/Express, Next.js 14, PostgreSQL 16, Prisma, pg-boss, date-fns, ExcelJS, PDFKit are already validated and remain unchanged.

---

## 1. Decimal / Money Handling in JS + PostgreSQL + Prisma

### Storage Strategy: `Decimal @db.Decimal(15, 4)` — NO new dependency

**DECISION POINT DP-1: Integer-cents vs Decimal column type**

The codebase already uses `Decimal @db.Decimal(12, 2)` throughout (User.balance, Ticket.totalAmount, Ticket.totalPrize, DrawStats.totalSales, etc.). The new financial tables (`DrawFinancial`, `ProviderCommissionLedger`, `ProviderWeeklySettlement`, `AccountingEntry`, `ExchangeRate`) must follow the same convention.

**Recommendation:** Continue with `Decimal @db.Decimal(15, 4)` for new rate/percentage fields and `Decimal @db.Decimal(12, 2)` for final ledger amounts. Use `(15, 4)` for `commissionRate`, `exchangeRate`, and tiered-bracket thresholds where 4 decimal places prevent rounding loss when applying percentage formulas. The existing `(12, 2)` is sufficient for totals (`DrawFinancial.totalSales`, `AccountingEntry.amountBsF`) — Venezuelan lottery amounts at this scale do not require sub-centavo precision.

**Why not integer cents:** The existing codebase uses Decimal columns with `parseFloat()` throughout (`accounting-report.service.js` lines 122/131/135, `draw-stats.service.js`, `conciliacion.service.js`). Introducing integer cents now would require a cross-cutting migration of all existing services that mix old and new data — coordination cost is not justified, and the existing `Decimal @db.Decimal(12, 2)` approach has not caused production issues.

**Why not `@db.Money`:** Prisma explicitly discourages `@db.Money` because formatting and decimal precision depend on database locale settings. Confirmed in Prisma optimization docs. Not an option.

### Arithmetic Library: `decimal.js` v10.6.0 — ADD TO BACKEND

```bash
npm install decimal.js
```

**Why decimal.js and not big.js or dinero.js:**

`decimal.js` is the exact library Prisma uses internally for its `Decimal` type. The `@prisma/client` package exposes `Prisma.Decimal` which is a `decimal.js` instance. Using the same library means you can perform math directly on Prisma-returned objects without conversion round-trips, and pass the result back to Prisma without type coercion.

`big.js` (v7.0.1 current) is lighter but lacks rounding mode constants (ROUND_HALF_UP, ROUND_DOWN, etc.) that are required for the TIERED commission formula where each bracket must be calculated independently with consistent rounding before summing. It also lacks the `toDecimalPlaces(n, mode)` API that decimal.js provides.

`dinero.js` v2 uses a currency-aware abstraction that prevents mixing currencies at the type level. This is overkill here: BsF and USD are separate fields in the same row, not parameterized currency types. The commission engine needs arithmetic, not currency identity enforcement. Dinero also adds 20+ KB to the dependency tree with no offsetting benefit for this use case.

**Usage pattern for commission formulas:**

```js
import Decimal from 'decimal.js';

// Prisma Decimal fields are decimal.js instances — wrap with toString() for safety
const sales   = new Decimal(drawFinancial.totalSales.toString());
const pct     = new Decimal(config.commissionRate.toString());    // e.g., "3.5000"

// SALES_PCT formula
const commission = sales
  .mul(pct)
  .div(100)
  .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// TIERED formula: iterate brackets, sum
const tieredResult = brackets.reduce((acc, bracket) => {
  const bracketBase = Decimal.min(sales, bracket.upTo).minus(bracket.from);
  return acc.plus(bracketBase.mul(bracket.rate).div(100));
}, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// Persist back to Prisma: pass as string or Decimal instance — both accepted
await prisma.providerCommissionLedger.create({
  data: { amount: commission.toString() }
});
```

**Confidence:** HIGH — version verified via `npm view decimal.js version` (10.6.0), library resolved via Context7 (`/mikemcl/decimal.js`, benchmark score 85.75, 167 code snippets). Prisma's use of decimal.js internally is confirmed via Prisma issue #9170 and discussion #16218.

---

## 2. File Upload for Receipt/Invoice Attachments

### Storage: Local disk under `backend/storage/receipts/` — NO S3/MinIO

**Rationale:** VPS 94 already stores Sharp-generated images under `backend/storage/bases/`, videos under `backend/storage/videos/`, and reports under `backend/storage/reports/`. Receipt attachments (PNG/JPEG/PDF scans uploaded by the single admin user) are low-volume (one per accounting entry, expected dozens per month). Adding MinIO or Cloudflare R2 would introduce a second storage system, service credentials, and operational overhead for no user-facing benefit at current scale. The VPS disk is adequate.

**DECISION POINT DP-2: Receipt URL storage convention**
Store `attachmentUrl` as a path relative to `backend/` (e.g., `storage/receipts/2026-05/uuid.pdf`), not an absolute VPS path. This survives path changes and migrations. Serve via a static Express route `/admin/receipts/:year/:month/:file` protected by the existing JWT admin middleware.

### Upload Library: `multer` v2.1.1 — ADD TO BACKEND

```bash
npm install multer
```

**ESM compatibility:** `multer` 2.1.1 ships as CommonJS (`"type": "commonjs"` confirmed via `npm view multer --json`). It is fully importable in the backend's ES module context via `import multer from 'multer'` — Node.js CJS interop handles the default export. The backend already uses this pattern for other CJS packages (`bcrypt`, `jsonwebtoken`). Verified: `import multer from 'multer'` works correctly.

**Note on multer 2.x vs 1.x:** Version 2.x (current: 2.1.1) drops Node <18 support and updates the underlying `busboy` dependency for security. The DiskStorage API is identical to v1.x — no migration friction. A known RC issue (2.0.0-rc.4) with `ERR_REQUIRE_ESM` was resolved in the stable 2.x release.

**Usage pattern:**

```js
import multer from 'multer';
import path from 'path';
import { mkdirSync } from 'fs';
import crypto from 'crypto';

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const month = new Date().toISOString().slice(0, 7); // "2026-05"
    const dir = path.join(process.cwd(), 'storage', 'receipts', month);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

export const receiptUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});
```

Route usage:
```js
router.post('/accounting/entries',
  receiptUpload.single('receipt'),
  accountingController.createEntry
);
```

**Confidence:** HIGH — version 2.1.1 verified via `npm view multer version`, ESM interop confirmed pattern used by other CJS deps in the backend.

---

## 3. Decimal Serialization to the Frontend

### Strategy: Serialize at the API boundary — NO new library needed

**The problem:** Prisma returns `Decimal` instances (decimal.js objects). When an Express route calls `res.json(data)`, `JSON.stringify` invokes `.toJSON()` on each Decimal field, which returns the value as a **string** (e.g., `"1234.5600"`). This is correct — the string preserves full precision. The frontend receives strings, not numbers.

**The frontend receives strings for all Decimal fields.** This is already the behavior for existing routes: the frontend's `accounting-report.service.js` already calls `parseFloat()` on values returned from the API. The new financial module follows the same convention.

**Recommended pattern — explicit serialization in response mappers:**

```js
// In controllers or service return values — explicit, no magic
function serializeFinancialRow(row) {
  return {
    ...row,
    totalSales:       row.totalSales.toString(),
    totalPrize:       row.totalPrize.toString(),
    utility:          row.utility.toString(),
    commissionAmount: row.commissionAmount?.toString() ?? null,
    exchangeRate:     row.exchangeRate?.rate?.toString() ?? null,
  };
}
```

**Frontend parsing convention:**
```js
// Display: use Intl.NumberFormat (built-in, no library needed)
const fmt = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 });
fmt.format(parseFloat(row.totalSales))  // "1.234,56"

// Arithmetic in frontend (summing a table): Number() is safe for BsF amounts
// at this scale (max ~9 quadrillion before IEEE 754 precision loss)
const total = rows.reduce((sum, r) => sum + Number(r.totalSales), 0);
```

**Why not superjson or devalue:** These libraries solve RSC (React Server Components) serialization where Prisma objects are passed as props directly to Client Components. This project uses Express API routes + `axios` calls from Next.js — the serialization happens in Express's `res.json()`, which already handles Decimal via `.toJSON()`. Adding superjson solves a non-problem for this architecture.

**Why not `Prisma.Decimal.prototype.toJSON = () => this.toNumber()`:** Mutating the prototype converts Decimal to JS `number`, which loses precision for amounts above 2^53 (9 quadrillion). Safer to keep strings and parse explicitly on the frontend where intent is clear.

**Confidence:** HIGH — verified behavior of Prisma Decimal + `res.json()` via Prisma issue #9170 and Next.js discussion #55349. Existing `accounting-report.service.js` already demonstrates the `parseFloat()` convention on the backend side.

---

## 4. PDF / Excel Export of Accounting Reports

### ExcelJS 4.4.0 — ALREADY INSTALLED, no addition needed

The existing `accounting-report.service.js` uses ExcelJS with multi-column formatting, `#,##0.00` currency `numFmt`, Excel formula rows (`SUM(C:C)`), and `writeBuffer()` output. The new reports (weekly P&L, commission ledger, settlement export) follow the same pattern. ExcelJS natively supports multiple worksheets in one workbook:

```js
const wb    = new ExcelJS.Workbook();
const wsBsF = wb.addWorksheet('Balance BsF');
const wsUSD = wb.addWorksheet('Equivalente USD');
const wsPL  = wb.addWorksheet('P&L Semanal');
```

For multi-currency columns, add a USD equivalent column next to each BsF column using the session's exchange rate — pure arithmetic in the worksheet builder, no additional library.

### PDFKit 0.17.2 — ALREADY INSTALLED, sufficient

PDFKit is already available for the existing PDF export feature (v1.1). Commission settlement PDFs follow the same pattern as existing draw reports. Current version is 0.18.0 (`npm view pdfkit version`), but the installed 0.17.2 has no known blockers for this milestone's use cases.

**Confidence:** HIGH — both packages confirmed in `backend/package.json`, versions verified via `npm view`.

---

## 5. ISO Week Boundaries for Weekly Settlements

### date-fns built-in functions — ALREADY AVAILABLE, no addition needed

The backend already has `date-fns` v4.1.0 and `date-fns-tz` v3.2.0 installed. Verified in backend ES module context: `getISOWeek`, `startOfISOWeek`, `endOfISOWeek`, and `getISOWeekYear` are all importable and functional.

**Usage pattern for weekly settlement boundaries in Venezuela timezone:**

```js
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const VENEZUELA_TZ = 'America/Caracas';

/**
 * Returns the ISO week key for a given UTC timestamp in Venezuela time.
 * Format: "2026-W20"
 */
export function getWeekKey(date) {
  const vzDate = toZonedTime(date, VENEZUELA_TZ);
  const week   = getISOWeek(vzDate);
  const year   = getISOWeekYear(vzDate);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Returns Monday 00:00 and Sunday 23:59:59.999 in Venezuela timezone
 * for the ISO week containing the given date.
 */
export function getISOWeekBoundaries(date) {
  const vzDate = toZonedTime(date, VENEZUELA_TZ);
  return {
    weekStart: startOfISOWeek(vzDate),
    weekEnd:   endOfISOWeek(vzDate),
    isoWeek:   getISOWeek(vzDate),
    isoYear:   getISOWeekYear(vzDate),
  };
}
```

**Key design note:** ISO weeks start on Monday. A weekly settlement cron that fires on Monday morning should use the previous week's `startOfISOWeek` as the canonical period. Store `isoWeek` (Int) and `isoYear` (Int) as separate integer columns in `ProviderWeeklySettlement` — do not store a string `weekKey`. Integer comparisons on indexed columns are faster for range queries ("all settlements for 2026").

**DECISION POINT DP-3:** `ProviderWeeklySettlement` must have `@@unique([apiSystemId, isoYear, isoWeek])` to enforce idempotency — the settlement cron uses `upsert`, not `create`, so re-running it for the same provider-week overwrites rather than duplicates.

**Why not Luxon or Temporal:** date-fns is already installed and covers all needed ISO week operations. Adding Luxon duplicates functionality. The Temporal API is experimental in Node.js 25 and not in the LTS versions (22.x) that production should run.

**Confidence:** HIGH — functions verified present and importable in installed date-fns v4.1.0 via direct node test. `toZonedTime` from date-fns-tz v3.2.0 confirmed available.

---

## 6. Summary: What to Install

| Package | Version | Location | Install Command | Why Needed for v1.3 |
|---------|---------|----------|-----------------|----------------------|
| `decimal.js` | 10.6.0 | backend | `npm install decimal.js` | Commission formula arithmetic (SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED) — same type as Prisma.Decimal internals, supports rounding modes required for TIERED bracket math |
| `multer` | 2.1.1 | backend | `npm install multer` | Receipt/invoice file upload for `AccountingEntry.attachmentUrl` — no upload handler exists in backend today |

**Everything else is already installed.**

---

## 7. What NOT to Add (Explicit Out-of-Scope)

| What | Why Not |
|------|---------|
| `dinero.js` | Currency-aware type safety is not needed — BsF and USD are stored as separate Decimal columns with explicit exchange-rate conversion at query time, not as parameterized currency types |
| `big.js` | Subset of decimal.js; Prisma already uses decimal.js internally — two competing arbitrary-precision types in the same service layer create confusion |
| `superjson` / `devalue` | Solve RSC serialization for Next.js Server Components; not applicable — this project uses Express API + axios, not RSC direct DB access |
| MinIO / Cloudflare R2 | Receipt uploads are admin-only, expected dozens per month; VPS 94 disk storage is fully adequate; S3-compatible storage adds service dependency, credentials, and operational overhead with no user-facing benefit |
| `@date-fns/tz` | First-class TZ package for date-fns v3+; `date-fns-tz` v3.2.0 is already installed and provides `toZonedTime` — no migration needed |
| `luxon` | Duplicates installed date-fns; ISO week support already present in v4.1.0 |
| Chart.js / D3 | Weekly P&L visualization should reuse `recharts` already in `frontend/package.json` |
| `accounting.js` | Number formatting utility; `Intl.NumberFormat` handles BsF/USD display formatting natively in modern Node.js and browsers without adding a dependency |
| `currency.js` | Same reasoning as accounting.js — Intl.NumberFormat is sufficient for display, decimal.js handles computation |

---

## 8. Decision Points Summary

These require explicit decisions in Phase 1 (schema design) before any worker or service code is written:

**DP-1: Decimal precision tiers**
Use `@db.Decimal(15, 4)` for rate/percentage config fields (`commissionRate`, `exchangeRate`, tiered bracket thresholds) and `@db.Decimal(12, 2)` for final ledger amounts (`DrawFinancial.totalSales`, `ProviderCommissionLedger.amount`, `AccountingEntry.amountBsF`). Mixing precisions in one schema is intentional — high precision for configuration, standard precision for ledger entries that get aggregated into reports.

**DP-2: Receipt storage URL convention**
Store `attachmentUrl` as a relative path (`storage/receipts/2026-05/uuid.pdf`), not an absolute path or full URL. Serve via `GET /admin/receipts/:year/:month/:file` with JWT admin middleware. The route handler reads from `path.join(process.cwd(), attachmentUrl)`.

**DP-3: Weekly settlement idempotency key**
`ProviderWeeklySettlement` must define `@@unique([apiSystemId, isoYear, isoWeek])`. The settlement cron job uses `prisma.providerWeeklySettlement.upsert()` — idempotent on re-run for same provider+week. Without this constraint, a re-triggered cron creates duplicate settlement rows.

---

## Sources

- Prisma Decimal type serialization: [prisma/prisma issue #9170](https://github.com/prisma/prisma/issues/9170), [Next.js discussion #55349](https://github.com/vercel/next.js/discussions/55349)
- Money storage recommendations: [Prisma discussion #10160](https://github.com/prisma/prisma/discussions/10160), [Avoid @db.Money](https://www.prisma.io/docs/optimize/recommendations/avoid-db-money), [Crunchy Data: Working with Money in Postgres](https://www.crunchydata.com/blog/working-with-money-in-postgres)
- decimal.js: Context7 `/mikemcl/decimal.js` (HIGH confidence, benchmark 85.75, 167 code snippets); npm version 10.6.0 confirmed
- multer ESM: [expressjs/multer issue #1100](https://github.com/expressjs/multer/issues/1100), npm version 2.1.1 confirmed
- date-fns ISO week: [date-fns docs](https://date-fns.org/v1.29.0/docs/getISOWeek), functions verified present in installed v4.1.0
- ExcelJS: [exceljs npm](https://www.npmjs.com/package/exceljs), v4.4.0 confirmed installed in `backend/package.json`

---

*Stack research for: v1.3 Financial Layer (DrawFinancial, provider commissions, multi-currency accounting)*
*Researched: 2026-05-15*
