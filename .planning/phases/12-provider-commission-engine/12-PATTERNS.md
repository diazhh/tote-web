# Phase 12: Provider Commission Engine — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 18 (4 NEW schema models, 1 NEW service, 2 NEW workers, 1 MODIFIED placeholder worker swap, 1 NEW controller, 1 NEW route file, 1 NEW backfill script, 1 MODIFIED trigger allowlist, 2 MODIFIED queue files, 4 NEW frontend pages, 1 lib helper extension)
**Analogs found:** 18 / 18

Phase 12 is composition over Phase 11 analogs — the worker shape, service shape, backfill shape, and queue wiring are all proven patterns from `.planning/phases/11-drawfinancial-foundation/11-PATTERNS.md`. New surfaces (ExcelJS/PDFKit exports, AuditLog writes, append-only versioning, frontend tabs) all have first-class analogs in the codebase.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/schema.prisma` (ADD `ProviderCommissionConfig` + `ProviderCommissionTier` + `ProviderCommissionLedger` + `ProviderWeeklySettlement` + enums + ApiSystem back-relations) | model (NEW) | persistence (Decimal aggregate, append-only versioning, state machine) | `model DrawFinancial` (line 1149), `model DrawFinancialProvider` (line 1178), `model AuditLog` (line 404), `enum ApiSystemMode` | exact (Decimal+nullable-FK conventions) + role-match for state-machine column |
| `backend/src/services/commission.service.js` | service (NEW) | aggregate + upsert + pure compute (decimal.js) + Excel/PDF builders | `draw-financial.service.js` (compute + D-08 upsert) + `accounting-report.service.js:191-290` (ExcelJS) + `monitor.controller.js:130-220` (PDFKit) | exact (compute+upsert) + exact (Excel+PDF) |
| `backend/src/queue/workers/calculate-provider-commission.worker.js` | worker (NEW — replaces placeholder) | event-driven, single-phase, race-condition guarded | `calculate-draw-financials.worker.js` (jobs unwrap + draw load + service delegation) | exact |
| `backend/src/queue/workers/weekly-settlement-snapshot.worker.js` | worker (NEW) | cron-triggered (Linux), empty-payload, computes "last completed ISO week" | `cleanup-logs.worker.js` (cron-triggered + empty payload) + `monitor-dlq.worker.js` (same shape) | role-match |
| `backend/src/queue/register.js` | bootstrap (MODIFIED) | replace placeholder body + register snapshot worker | self (Phase 11 block at lines 94-113) | exact |
| `backend/src/queue/constants.js` | config (MODIFIED) | static config addition | self (existing `CALCULATE_DRAW_FINANCIALS` block at lines 14-18 + 108-114) | exact |
| `backend/src/queue/workers/step-process-prizes.worker.js` | worker (MODIFIED) | add third `boss.send` | self (existing `STEP_CALCULATE_STATS` send at lines 19-23 + 50-53 already parallels `CALCULATE_DRAW_FINANCIALS` at 25-29 + 55-59) | exact |
| `backend/src/scripts/trigger-pgboss-cron.mjs` | bootstrap (MODIFIED) | extend ALLOWED_QUEUES allowlist | self (lines 32-45) | exact |
| `backend/src/scripts/backfill-provider-commissions.mjs` | script (NEW) | batch + chunked + dry-run + reconciliation CSV | `backfill-draw-financials.mjs` (full structure 1-172) | exact |
| `backend/src/controllers/commission.controller.js` | controller (NEW) | request-response, JSON CRUD + Excel/PDF stream | `provider.controller.js` (class+default export, JWT auth) + `monitor.controller.js:130-220` (PDF stream) + `admin-jobs.controller.js:100-142` (AuditLog write) | exact |
| `backend/src/routes/commission.routes.js` | route (NEW) | request-response | `provider.routes.js` (authenticate+authorize('ADMIN') guard) | exact |
| `backend/src/lib/dateUtils.js` | utility (MODIFIED) | pure function — VE ISO-week helpers | self (existing `getVenezuelaDateString` shape lines 25-33) | role-match (date-fns + date-fns-tz additions) |
| `frontend/app/admin/proveedores/[id]/comisiones/page.js` | component (NEW) | request-response, tab content + form | `frontend/app/admin/proveedores/logs/page.js` (table+modal pattern) + `frontend/app/admin/proveedores/page.js` (tab state pattern at line 14) | role-match |
| `frontend/app/admin/comisiones/page.js` | component (NEW) | request-response, tab switcher | `frontend/app/admin/conciliacion/page.js` (filters+table) + `frontend/app/admin/proveedores/page.js` (tab state) | role-match |
| `frontend/app/admin/comisiones/settlements/[id]/page.js` | component (NEW) | request-response, detail page + downloads | `frontend/app/admin/proveedores/logs/page.js` (modal inspector — lines 29-90) | role-match |
| `frontend/components/admin/conciliacion/ConciliacionFilters.js` referenced; new `frontend/components/admin/comisiones/*` | component (NEW) | dumb-presentational | `ConciliacionFilters.js` + `ConciliacionTable.js` | role-match |
| `backend/package.json` | manifest (NO CHANGE) | — | n/a — all deps (decimal.js, date-fns, date-fns-tz, exceljs, pdfkit) already installed [VERIFIED in Phase 11 PATTERNS line 593 + RESEARCH.md "Standard Stack"] | — |
| `DEPLOY.md` (out of session scope) | docs | additive | Phase 11 DEPLOY.md cron-line update | role-match |

---

## Pattern Assignments

### 1. `backend/prisma/schema.prisma` — ADD commission models (4 new models, 1 new enum)

**Role:** model (NEW)
**Analogs:**
- `model DrawFinancial` at `schema.prisma:1149-1171` — Decimal column conventions + relation pattern.
- `model DrawFinancialProvider` at `schema.prisma:1178-1196` — D-08 `@@unique([..., apiSystemId])` + optional-FK relation `apiSystem ApiSystem? @relation(...)`.
- `model AuditLog` at `schema.prisma:404-422` — state-change audit pattern (will be referenced FROM commission code, not duplicated).
- `enum ApiSystemMode` (PULL/PUSH/SCRAPE) — pattern for the 4-state `CommissionFormulaType` enum and 3-state `SettlementStatus` enum.

**Decimal precision conventions (DIFFER from Phase 11):**
Phase 12 amount columns MUST be `Decimal @db.Decimal(18, 8)` per F-4 + CONTEXT assumption 1 — **NOT** `(12,2)` like DrawFinancial. The 18,8 precision exists specifically so commission rates can be stored at 8-decimal precision without drift. Cite CONTEXT.md: *"all monetary columns are NUMERIC(18,8)"*.

**Append-only versioning pattern (NEW — no exact analog):**
`ProviderCommissionConfig` has no `update` semantics. Mirror the `effectiveFrom` shape used informally in `ApiConfiguration`/`Draw` (timestamp-keyed) but enforce append-only at the service layer (F-5 — see Pitfall 2 in RESEARCH.md). Add this index for efficient effective-config lookup (Pattern 1 in RESEARCH.md):
```prisma
@@index([apiSystemId, effectiveFrom(sort: Desc)])
```

**Per-provider Decimal + optional-FK pattern (from `DrawFinancialProvider`):**
```prisma
// Mirror this from schema.prisma:1178-1196
model ProviderCommissionLedger {
  id          String  @id @default(uuid())
  drawId      String
  apiSystemId String  // NOT NULL — Phase 12 commission is always tied to a real provider (D-01: missing config → no row, no NULL bucket)
  amount      Decimal @db.Decimal(18, 8)   // 18,8 per F-4 (NOT 12,2 like DrawFinancial)
  salesBase   Decimal @db.Decimal(18, 8)
  utilityBase Decimal @db.Decimal(18, 8)
  configId    String  // FK snapshot — which config row was effective
  configSnapshot Json // {formulaType, salesRate, utilityRate, tier} — Open Question #2 RECOMMENDED YES
  createdAt   DateTime @default(now())

  draw      Draw      @relation(fields: [drawId], references: [id], onDelete: Cascade)
  apiSystem ApiSystem @relation(fields: [apiSystemId], references: [id])
  config    ProviderCommissionConfig @relation(fields: [configId], references: [id])

  @@unique([drawId, apiSystemId])  // one commission row per (provider, draw)
  @@index([drawId])
  @@index([apiSystemId, createdAt])
}
```

**State-machine column pattern for `ProviderWeeklySettlement`:**
- `isoYear Int` + `isoWeek Int` — per D-06; never store rendered "2026-W19" string.
- `@@unique([apiSystemId, isoYear, isoWeek])` — per D-06 + RESEARCH Pattern 7.
- `status` enum field with default `'DRAFT'` — mirror `Draw.status` shape (string-backed enum).
- `amount` + `originalAmount` (NULL until ADJUSTED) + `adjustmentReason TEXT?` (per D-02). Both `Decimal @db.Decimal(18, 8)`.

**TIERED bracket child table (`ProviderCommissionTier`):**
- FK to `ProviderCommissionConfig.id`. Cascade delete (config row append-only → tiers append-only too).
- `minSales Decimal @db.Decimal(18, 8)`, `maxSales Decimal? @db.Decimal(18, 8)` (NULL = open-ended top tier per Assumption A3), `rate Decimal @db.Decimal(18, 8)`.
- `@@unique([configId, minSales])` to prevent duplicate brackets.

**Back-relations on `ApiSystem`** (mirror `drawFinancials` at `schema.prisma:448`):
```prisma
// In model ApiSystem near line 448 — ADD:
commissionConfigs    ProviderCommissionConfig[]
commissionLedgerRows ProviderCommissionLedger[]
weeklySettlements    ProviderWeeklySettlement[]
```

**Back-relation on `Draw`** (mirror lines 156-157):
```prisma
commissionLedgerRows ProviderCommissionLedger[] // Phase 12
```

---

### 2. `backend/src/services/commission.service.js` — NEW service (compute + upsert + Excel/PDF)

**Role:** service (NEW, CRUD + aggregate + pure-function compute + export builders)
**Analogs:**
- `backend/src/services/draw-financial.service.js` (entire shape) — module-level named exports, decOrZero helper, custom-error class, decimal.js usage, D-08 findFirst+update/create.
- `backend/src/services/accounting-report.service.js:191-290` — `buildAccountingExcel` ExcelJS pattern.
- `backend/src/controllers/monitor.controller.js:130-220` — PDFKit streaming pattern (will live in commission.controller.js per separation of concerns, but the table-helper `drawTable` at lines 141-157 is reusable).

**Imports + module shape — copy from `draw-financial.service.js:30-31` + add decimal.js + date-fns helpers:**
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { getISOWeekVE, startOfISOWeekVE } from '../lib/dateUtils.js'; // NEW helpers added in this phase

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
```

**Custom error class — copy `PrizesNotProcessedError` shape from `draw-financial.service.js:37-42`:**
```javascript
// Worker re-throws → pg-boss retries 3× with backoff (mirrors Phase 11 D-14 boundary).
// Covers Race Condition Pitfall 7 in RESEARCH.md.
export class DrawFinancialNotReadyError extends Error {
  constructor(drawId) {
    super(`DrawFinancial not ready for ${drawId} — retrying`);
    this.name = 'DrawFinancialNotReadyError';
  }
}
```

**Effective-config lookup pattern (Pattern 1 in RESEARCH.md):**
```javascript
// commission.service.js — pure function, no side effects
export async function findEffectiveConfig(apiSystemId, drawnAt) {
  return prisma.providerCommissionConfig.findFirst({
    where: { apiSystemId, effectiveFrom: { lte: drawnAt } },
    orderBy: { effectiveFrom: 'desc' },
    include: { tiers: { orderBy: { minSales: 'asc' } } },
  });
}
```

**Formula evaluation — full Decimal.js pattern (RESEARCH.md Pattern 2):**
```javascript
// Decimal precision flow:
// 1. Prisma Decimal → new Decimal(value.toString()) [NOT Number()]
// 2. All math in decimal.js
// 3. Final .toFixed(8) to match NUMERIC(18, 8)
// 4. Pass string back to Prisma (lossless)
export function computeCommission(config, providerRow, cumulativeWeeklySales) {
  const sales = new Decimal(providerRow.totalSales.toString());
  const prize = new Decimal(providerRow.totalPrize.toString());
  const utility = sales.minus(prize);

  switch (config.formulaType) {
    case 'SALES_PCT':
      return sales.times(config.salesRate.toString()).dividedBy(100).toFixed(8);
    case 'UTILITY_PCT':
      return utility.times(config.utilityRate.toString()).dividedBy(100).toFixed(8);
    case 'SALES_AND_UTILITY_PCT':
      return sales.times(config.salesRate.toString()).dividedBy(100)
        .plus(utility.times(config.utilityRate.toString()).dividedBy(100))
        .toFixed(8);
    case 'TIERED': {
      const cum = new Decimal(cumulativeWeeklySales.toString());
      const bracket = config.tiers.find(t =>
        cum.gte(t.minSales.toString()) &&
        (t.maxSales === null || cum.lt(t.maxSales.toString()))
      );
      if (!bracket) throw new Error(`No tier matches cumulative sales ${cumulativeWeeklySales}`);
      return sales.times(bracket.rate.toString()).dividedBy(100).toFixed(8);
    }
    default:
      throw new Error(`Unknown formulaType: ${config.formulaType}`);
  }
}
```

**TIERED cumulative-sales lookup (Pattern 3 in RESEARCH.md):**
```javascript
// Mirror draw-financial.service.js:85-94 raw SQL style.
export async function getCumulativeWeeklySales(apiSystemId, drawnAt) {
  const weekStart = startOfISOWeekVE(drawnAt);
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(dfp."totalSales"), 0)::numeric(18,8) AS cumulative
    FROM   "DrawFinancialProvider" dfp
    JOIN   "Draw" d ON d.id = dfp."drawId"
    WHERE  dfp."apiSystemId" = ${apiSystemId}
      AND  d."drawnAt" >= ${weekStart}
      AND  d."drawnAt" <= ${drawnAt}
  `;
  return rows[0].cumulative; // string-safe for Decimal
}
```

**Ledger upsert per draw — mirror D-08 explicit findFirst+update/create from `draw-financial.service.js:104-124`:**
```javascript
export async function computeAndUpsertLedgerForDraw(drawId) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { drawnAt: true },
  });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  // Read materialized per-provider rows (Phase 11 output — NOT raw TicketDetail).
  // RESEARCH.md "Anti-Patterns to Avoid": don't aggregate from raw TicketDetail here.
  const providers = await prisma.drawFinancialProvider.findMany({
    where: { drawId, apiSystemId: { not: null } }, // skip TAQUILLA_ONLINE bucket
    include: { apiSystem: { select: { id: true, name: true, slug: true } } },
  });

  let processed = 0;
  let skipped = 0;
  for (const row of providers) {
    const config = await findEffectiveConfig(row.apiSystemId, draw.drawnAt);
    if (!config) {
      // D-01 — silent skip, warning log, no row written
      logger.warn('[commission] no_config_at_drawnAt', {
        drawId, apiSystemId: row.apiSystemId, reason: 'no_config_at_drawnAt',
      });
      skipped++;
      continue;
    }

    const cumulativeSales =
      config.formulaType === 'TIERED'
        ? await getCumulativeWeeklySales(row.apiSystemId, draw.drawnAt)
        : '0';

    const amount = computeCommission(config, row, cumulativeSales);
    const sales = new Decimal(row.totalSales.toString()).toFixed(8);
    const utility = new Decimal(row.totalSales.toString())
      .minus(row.totalPrize.toString())
      .toFixed(8);

    // Snapshot the config used (Open Question #2 — RECOMMENDED YES)
    const snapshot = {
      formulaType: config.formulaType,
      salesRate: config.salesRate?.toString() ?? null,
      utilityRate: config.utilityRate?.toString() ?? null,
      tiers: config.tiers.map(t => ({
        minSales: t.minSales.toString(),
        maxSales: t.maxSales?.toString() ?? null,
        rate: t.rate.toString(),
      })),
    };

    // D-08 pattern — but apiSystemId is NOT NULL here, so prisma.upsert is safe.
    // Still using findFirst+branch for consistency with draw-financial.service.js.
    const existing = await prisma.providerCommissionLedger.findFirst({
      where: { drawId, apiSystemId: row.apiSystemId },
    });
    if (existing) {
      await prisma.providerCommissionLedger.update({
        where: { id: existing.id },
        data: { amount, salesBase: sales, utilityBase: utility, configId: config.id, configSnapshot: snapshot },
      });
    } else {
      await prisma.providerCommissionLedger.create({
        data: { drawId, apiSystemId: row.apiSystemId, amount, salesBase: sales, utilityBase: utility, configId: config.id, configSnapshot: snapshot },
      });
    }
    processed++;
  }
  return { providersProcessed: processed, skipped };
}
```

**Excel export — copy structure from `accounting-report.service.js:191-290` (especially the SUM-formula totals row at lines 246-261 — those formulas make the Excel audit-grade):**
```javascript
export async function buildSettlementExcel(settlementId) {
  // Load settlement + ledger rows (assumes a service helper getSettlementWithLedger)
  const settlement = await getSettlementWithLedger(settlementId);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tote — Liquidación Semanal de Comisiones';
  wb.created = new Date();
  const tag = `${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`;
  const ws = wb.addWorksheet(tag);

  // Header — MIRROR accounting-report.service.js:201-217
  ws.mergeCells('A1:E1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Liquidación ${settlement.apiSystem.name} — ${tag}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };
  ws.addRow([]);

  // Column headers — MIRROR accounting-report.service.js:222-230
  const headers = ['Sorteo', 'Fecha', 'Ventas', 'Premios', 'Comisión'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Data rows
  const dataStartRow = headerRow.number + 1;
  for (const row of settlement.ledgerRows) {
    ws.addRow([
      row.drawId.slice(0, 8),
      row.draw.drawnAt,
      Number(row.salesBase),
      Number(row.utilityBase), // pre-compute or use prize
      Number(row.amount),
    ]);
  }
  const dataEndRow = dataStartRow + settlement.ledgerRows.length - 1;

  // Total with SUM formula (auditable) — MIRROR accounting-report.service.js:248-261
  ws.addRow([]);
  const totalRow = ws.addRow([
    'TOTAL', '',
    { formula: `SUM(C${dataStartRow}:C${dataEndRow})` },
    { formula: `SUM(D${dataStartRow}:D${dataEndRow})` },
    { formula: `SUM(E${dataStartRow}:E${dataEndRow})` },
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  // Currency formatting — MIRROR accounting-report.service.js:272-277
  for (let r = dataStartRow; r <= totalRow.number; r++) {
    ['C', 'D', 'E'].forEach((col) => {
      ws.getCell(`${col}${r}`).numFmt = '#,##0.00';
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

**Service-layer append-only enforcement (F-5):**
- NO `updateConfig` method exposed. Only `createConfig(data)`.
- Unit test: assert `prisma.providerCommissionConfig.update` is never imported/called from service exports.

---

### 3. `backend/src/queue/workers/calculate-provider-commission.worker.js` — NEW worker (replaces placeholder)

**Role:** worker (NEW, event-driven, race-guarded)
**Analog:** `backend/src/queue/workers/calculate-draw-financials.worker.js` (exact shape — jobs unwrap, draw load, service delegation, error class re-throw).

**Full file pattern — copy from `calculate-draw-financials.worker.js:14-51` and adapt:**
```javascript
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import {
  computeAndUpsertLedgerForDraw,
  DrawFinancialNotReadyError,
} from '../../services/commission.service.js';

export async function calculateProviderCommissionWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // Race-condition guard (RESEARCH.md Pitfall 7).
  // Mirror Phase 11 PrizesNotProcessedError pattern: throw → pg-boss retries 3× with
  // backoff (5s, 10s, 20s) — by which time DrawFinancial PRIZES will have committed.
  const df = await prisma.drawFinancial.findUnique({
    where: { drawId },
    select: { totalizedAt: true },
  });
  if (!df || df.totalizedAt === null) {
    throw new DrawFinancialNotReadyError(drawId);
  }

  logger.info(`[calculate-provider-commission] drawId=${drawId}`);
  const result = await computeAndUpsertLedgerForDraw(drawId);
  return {
    success: true,
    drawId,
    providersProcessed: result.providersProcessed,
    skipped: result.skipped,
  };
}
```

**Where this gets wired in (Plan 12-XX register.js change):** replaces the placeholder no-op handler at `register.js:108-112`. The `createQueue` at line 102 STAYS (F-11 — already correct). Only the handler body swaps.

---

### 4. `backend/src/queue/workers/weekly-settlement-snapshot.worker.js` — NEW worker (cron-triggered, empty payload)

**Role:** worker (NEW, cron-driven, empty-payload, state-conditional upsert)
**Analog:** `cleanup-logs.worker.js` and `monitor-dlq.worker.js` — both are cron-triggered via `trigger-pgboss-cron.mjs` with empty payload. Worker computes "what to do" from `new Date()`.

**Critical differences from a normal upsert worker (RESEARCH.md Pattern 7):**
- MUST NOT use `prisma.upsert` — `CONFIRMED` and `ADJUSTED` settlements are frozen per D-03.
- Use explicit `findFirst` + branch on `existing.status`.
- D-02 path 2: if drift detected on a `CONFIRMED` row, mark it `ADJUSTED` and log.

**Worker skeleton (mirror jobs-unwrap from `calculate-draw-financials.worker.js:19-22`):**
```javascript
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { getISOWeekVE, startOfISOWeekVE, endOfISOWeekVE } from '../../lib/dateUtils.js';
import { subDays } from 'date-fns';

export async function weeklySettlementSnapshotWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;

  // Cron fires Monday 06:00 VE — last completed ISO week ended Sunday 23:59:59.999 VE.
  // Use "yesterday" as the reference point so we land safely inside the prior week
  // even if cron fires slightly late.
  const referenceDate = subDays(new Date(), 1);
  const { isoYear, isoWeek } = getISOWeekVE(referenceDate);
  const start = startOfISOWeekVE(referenceDate);
  const end = endOfISOWeekVE(referenceDate);

  logger.info(`[weekly-settlement-snapshot] isoYear=${isoYear} isoWeek=${isoWeek} range=${start.toISOString()}..${end.toISOString()}`);

  // GROUP BY apiSystemId across the closed week's ledger rows
  const byProvider = await prisma.$queryRaw`
    SELECT cl."apiSystemId",
           SUM(cl.amount)::numeric(18,8) AS "totalAmount",
           COUNT(*)::int AS "ledgerRowCount"
    FROM   "ProviderCommissionLedger" cl
    JOIN   "Draw" d ON d.id = cl."drawId"
    WHERE  d."drawnAt" >= ${start}
      AND  d."drawnAt" <= ${end}
    GROUP  BY cl."apiSystemId"
  `;

  let created = 0, updated = 0, frozen = 0, drifted = 0;
  for (const row of byProvider) {
    const existing = await prisma.providerWeeklySettlement.findFirst({
      where: { apiSystemId: row.apiSystemId, isoYear, isoWeek },
    });

    if (!existing) {
      await prisma.providerWeeklySettlement.create({
        data: {
          apiSystemId: row.apiSystemId,
          isoYear, isoWeek,
          amount: row.totalAmount,
          ledgerRowCount: row.ledgerRowCount,
          status: 'DRAFT',
          snapshotAt: new Date(),
        },
      });
      created++;
    } else if (existing.status === 'DRAFT') {
      await prisma.providerWeeklySettlement.update({
        where: { id: existing.id },
        data: {
          amount: row.totalAmount,
          ledgerRowCount: row.ledgerRowCount,
          snapshotAt: new Date(),
        },
      });
      updated++;
    } else {
      // CONFIRMED or ADJUSTED — D-03 freeze. Check drift (D-02 path 2).
      const drift = !(new (await import('decimal.js')).default(existing.amount.toString())
        .equals(row.totalAmount.toString()));
      if (drift && existing.status === 'CONFIRMED') {
        await prisma.providerWeeklySettlement.update({
          where: { id: existing.id },
          data: { status: 'ADJUSTED', adjustmentReason: 'auto: drift detected by snapshot' },
        });
        drifted++;
        logger.warn('[weekly-settlement-snapshot] drift_detected', {
          id: existing.id, oldAmount: existing.amount, newAmount: row.totalAmount,
        });
      }
      frozen++;
    }
  }

  logger.info(`[weekly-settlement-snapshot] done isoYear=${isoYear} isoWeek=${isoWeek} created=${created} updated=${updated} frozen=${frozen} drifted=${drifted}`);
  return { isoYear, isoWeek, created, updated, frozen, drifted };
}
```

---

### 5. `backend/src/queue/register.js` — MODIFIED (swap placeholder + add snapshot worker)

**Role:** bootstrap (MODIFIED, surgical swap)
**Analog:** self — Phase 11 block at lines 94-113.

**Surgical change at lines 108-112** — replace placeholder handler:
```javascript
// REPLACE the placeholder block at register.js:106-112 with:
const { calculateProviderCommissionWorker } = await import('./workers/calculate-provider-commission.worker.js');
await boss.work(
  QUEUES.CALCULATE_PROVIDER_COMMISSION,
  QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
  calculateProviderCommissionWorker,
);
```

**Additive at end of Phase 11 block (before line 113 logger.info):** register snapshot worker.
F-11 mandate: `createQueue` BEFORE `work`. Mirror the SYNC_SCRAPE_TICKETS comment at lines 158-159.

```javascript
// Phase 12: weekly settlement snapshot — cron-triggered (Linux), always-on.
const { weeklySettlementSnapshotWorker } = await import('./workers/weekly-settlement-snapshot.worker.js');
await boss.createQueue(QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT);
await boss.work(
  QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT,
  QUEUE_CONFIGS[QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT],
  weeklySettlementSnapshotWorker,
);
logger.info('[pg-boss] Worker weekly-settlement-snapshot registrado (trigger via cron Linux, Lunes 06:00 VE)');
```

**Smoke test (mirror Phase 11 PATTERNS):**
```sql
SELECT name FROM pgboss.queue WHERE name IN ('calculate-provider-commission', 'weekly-settlement-snapshot');
-- Must return 2 rows. (calculate-provider-commission already exists from Phase 11.)
```

---

### 6. `backend/src/queue/constants.js` — MODIFIED (add 1 new queue + config)

**Role:** config (MODIFIED, additive — `CALCULATE_PROVIDER_COMMISSION` already exists at line 18)
**Analog:** self — Phase 11 entries at lines 14-18 + 108-121.

**QUEUES block** — add ONE line after line 18:
```javascript
// Phase 12 — weekly settlement snapshot (cron-triggered)
WEEKLY_SETTLEMENT_SNAPSHOT: 'weekly-settlement-snapshot',
```

**QUEUE_CONFIGS block** — add ONE entry. Mirror `CALCULATE_DRAW_FINANCIALS` at lines 108-114 but with a larger `expireInMinutes` (snapshot has more DB work than a single-draw commission compute):
```javascript
[QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT]: {
  retryLimit: 2,
  retryDelay: 30,        // snapshot is a heavy GROUP BY; back off harder than per-draw
  retryBackoff: true,
  expireInMinutes: 10,   // worst-case ~4 providers × ~50 rows; should be << 1min, but generous.
},
```

---

### 7. `backend/src/queue/workers/step-process-prizes.worker.js` — MODIFIED (add 3rd parallel send)

**Role:** worker (MODIFIED — surgical addition)
**Analog:** self — Phase 11 already added the 2nd parallel send at lines 25-29 + 55-59.

**Both insertion points (lines 23-29 ALREADY-PROCESSED path + lines 50-59 MAIN path) — ADD after the existing `df-prizes` send:**
```javascript
// In step-process-prizes.worker.js — AFTER the existing Phase 11 df-prizes send at line 28-29 (already-processed branch) AND lines 56-59 (main branch).

// Phase 12: parallel-trigger provider commission. Worker has DrawFinancial-ready
// race-condition guard (Pitfall 7) — pg-boss retries 3× with backoff if PRIZES
// hasn't committed yet.
await boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, { drawId }, {
  singletonKey: `comm-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
});
```

**Imports already present** (lines 4-5 — `getBoss`, `QUEUES`, `QUEUE_CONFIGS`). No new imports.

**No try/catch:** mirrors Phase 11 convention — failure in `boss.send` propagates, pg-boss retries the whole worker. Commission worker's race guard handles "PRIZES not yet committed."

---

### 8. `backend/src/scripts/trigger-pgboss-cron.mjs` — MODIFIED (extend allowlist)

**Role:** bootstrap (MODIFIED, additive)
**Analog:** self — the `ALLOWED_QUEUES` set at lines 32-45.

**Single-line addition inside the Set:**
```javascript
const ALLOWED_QUEUES = new Set([
  // ... existing entries 32-44 unchanged ...
  'cleanup-logs',
  // Phase 12 — weekly settlement snapshot, fired Monday 06:00 VE
  'weekly-settlement-snapshot',
]);
```

**DEPLOY.md note (out of session — call out for planner):**
```cron
0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot
# 10:00 UTC = 06:00 VE (UTC-4, no DST since 2007)
```

---

### 9. `backend/src/scripts/backfill-provider-commissions.mjs` — NEW backfill script

**Role:** script (NEW, batch + chunked + dry-run-gated + reconciliation CSV)
**Analog:** `backend/src/scripts/backfill-draw-financials.mjs` — copy near-verbatim. The whole structure (DRY_RUN gate, chunk size flag, main+finally, prisma.$disconnect, reconciliation CSV) maps 1:1.

**Header + flag pattern (copy from `backfill-draw-financials.mjs:1-52`):**
```javascript
/**
 * Phase 12 Backfill — ProviderCommissionLedger for all DRAWN draws since 2026-04-17.
 *
 * Safeguards:
 *   D-07 chunked + resumable via LEFT JOIN on ProviderCommissionLedger
 *   D-02 dry-run-required (refuses to write without --confirm)
 *   F-17 abort if any candidate draw has drawnAt < 2026-04-17
 *   D-01 silent-skip count surfaced in summary
 *
 * Invocation (process.cwd() MUST be backend/):
 *   cd backend
 *   node src/scripts/backfill-provider-commissions.mjs                # exits 2, prints refusal
 *   node src/scripts/backfill-provider-commissions.mjs --dry-run      # inspects
 *   node src/scripts/backfill-provider-commissions.mjs --confirm      # real run
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { computeAndUpsertLedgerForDraw } from '../services/commission.service.js';
import fs from 'fs/promises';
import path from 'path';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CONFIRM = argv.includes('--confirm');

// F-17 gate constant — locked by REQUIREMENTS.md / CONTEXT.md pitfall mitigations
const COMMISSION_GO_LIVE = new Date('2026-04-17T00:00:00-04:00');

const chunkArg = argv.find((a) => a.startsWith('--chunk-size='));
const rawChunk = chunkArg ? parseInt(chunkArg.split('=')[1], 10) : 100;
const CHUNK_SIZE = Number.isFinite(rawChunk) ? Math.min(500, Math.max(50, rawChunk)) : 100;

function log(msg, data) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, data);
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

if (!DRY_RUN && !CONFIRM) {
  process.stderr.write(
    'Refusing to write without --confirm. Run with --dry-run first, inspect the output, then re-run with --confirm.\n'
  );
  process.exit(2);
}
```

**main() body — copy chunked loop + reconciliation CSV from `backfill-draw-financials.mjs:54-161`. Phase 12 ADDITIONS:**

1. **F-17 enforcement** — replace the enum check at lines 57-65 with go-live boundary assertion:
```javascript
// F-17 — abort if any DRAWN draw older than COMMISSION_GO_LIVE
const oldest = await prisma.$queryRaw`
  SELECT MIN(d."drawnAt") AS min_drawn_at
  FROM "Draw" d
  WHERE d.status = 'DRAWN' AND d."prizesProcessed" = true
`;
log(`Oldest DRAWN draw: ${oldest[0].min_drawn_at}`);
// We DO process draws older than COMMISSION_GO_LIVE — we just gate them OUT of the WHERE clause.
// If somehow a candidate slips through, abort. (Defense in depth.)
```

2. **Candidate-draws query — DIFFER from Phase 11 by filtering to `drawnAt >= COMMISSION_GO_LIVE` and LEFT JOIN on ProviderCommissionLedger absence:**
```javascript
const remaining = await prisma.$queryRaw`
  SELECT d.id, d."drawnAt"
  FROM   "Draw" d
  WHERE  d.status = 'DRAWN'
    AND  d."prizesProcessed" = true
    AND  d."drawnAt" >= ${COMMISSION_GO_LIVE}
    AND  NOT EXISTS (
      SELECT 1 FROM "ProviderCommissionLedger" cl
      WHERE cl."drawId" = d.id
    )
    AND  EXISTS (
      SELECT 1 FROM "DrawFinancialProvider" dfp
      WHERE dfp."drawId" = d.id AND dfp."apiSystemId" IS NOT NULL
    )
  ORDER  BY d."drawnAt" ASC
`;
log(`Remaining draws to backfill: ${remaining.length} (chunk size ${CHUNK_SIZE})`);
```

3. **Per-draw call (chunked loop, mirror lines 80-105):**
```javascript
let totalSkipped = 0;
for (const draw of slice) {
  if (DRY_RUN) { processed++; continue; }
  try {
    const r = await computeAndUpsertLedgerForDraw(draw.id);
    processed++;
    totalSkipped += r.skipped; // D-01 silent-skip count surfaced (CONTEXT.md D-01)
  } catch (err) {
    errors++;
    logger.error(`Backfill error draw=${draw.id}: ${err.message}`, { stack: err.stack });
  }
}
```

4. **Reconciliation CSV** — write to `backend/storage/backfill-reports/provider-commission-recon-{stamp}.csv` (mirror lines 123-160) with columns per D-07: `drawId, apiSystemId, formulaType, salesBase, utilityBase, computedAmount, configEffectiveFrom`.

5. **Summary line at end** — surface skipped count per D-01:
```javascript
log(`Summary: ledgerWritten=${processed - errors}, skipped(no_config)=${totalSkipped}, errors=${errors}`);
```

**main + finally (verbatim copy from `backfill-draw-financials.mjs:163-171`):**
```javascript
main()
  .catch((err) => {
    logger.error(`Backfill aborted: ${err.message}`, { stack: err.stack });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

### 10. `backend/src/controllers/commission.controller.js` — NEW controller

**Role:** controller (NEW, request-response)
**Analogs:**
- `backend/src/controllers/provider.controller.js` lines 48-100 — class + `export default new ProviderController()`, async methods, try/catch + res.status pattern.
- `backend/src/controllers/admin-jobs.controller.js:100-142` — AuditLog write pattern (used here for CONFIRM/ADJUST transitions).
- `backend/src/controllers/monitor.controller.js:130-220` — PDFKit streaming response.

**Class shape (copy from `provider.controller.js:48` style):**
```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import * as commissionService from '../services/commission.service.js';

class CommissionController {
  // GET /api/commissions/configs/:apiSystemId — list config history (append-only)
  async listConfigs(req, res) {
    try {
      const { apiSystemId } = req.params;
      const configs = await prisma.providerCommissionConfig.findMany({
        where: { apiSystemId },
        include: { tiers: { orderBy: { minSales: 'asc' } } },
        orderBy: { effectiveFrom: 'desc' },
      });
      res.json({ success: true, data: configs });
    } catch (err) {
      logger.error('Error en listConfigs:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/commissions/configs — create NEW config row (append-only, F-5)
  // Body validation: formulaType ∈ enum, rates ∈ [0, 100], TIERED requires tiers array
  async createConfig(req, res) { /* ... */ }

  // GET /api/commissions/ledger?apiSystemId=&from=&to=&status=
  async getLedger(req, res) { /* ... */ }

  // GET /api/commissions/settlements?isoYear=&isoWeek=&apiSystemId=&status=
  async getSettlements(req, res) { /* ... */ }

  // GET /api/commissions/settlements/:id — drill-down with ledger rows
  async getSettlementDetail(req, res) { /* ... */ }

  // PATCH /api/commissions/settlements/:id/confirm — DRAFT → CONFIRMED
  async confirmSettlement(req, res) {
    try {
      const { id } = req.params;
      // RESEARCH.md Security: compound where for atomic transition (avoids race)
      const updated = await prisma.providerWeeklySettlement.update({
        where: { id /* + status: 'DRAFT' would be ideal but Prisma requires unique-only here — use updateMany or runtime check */ },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: req.user.id },
      });
      // AuditLog — MIRROR admin-jobs.controller.js:126-134
      await prisma.auditLog.create({
        data: {
          action: 'SETTLEMENT_CONFIRMED',
          entity: 'ProviderWeeklySettlement',
          entityId: id,
          userId: req.user?.id || null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          changes: { previousStatus: 'DRAFT', newStatus: 'CONFIRMED', amount: updated.amount.toString() },
        },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error('Error en confirmSettlement:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/commissions/settlements/:id/adjust — CONFIRMED/ADJUSTED → ADJUSTED
  // Body: { amount, adjustmentReason }
  async adjustSettlement(req, res) { /* ... mirror confirmSettlement with originalAmount snapshot ... */ }

  // GET /api/commissions/settlements/:id/excel — stream xlsx
  async exportSettlementExcel(req, res) {
    try {
      const buffer = await commissionService.buildSettlementExcel(req.params.id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${req.params.id}.xlsx"`);
      res.send(buffer);
    } catch (err) {
      logger.error('Error en exportSettlementExcel:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/commissions/settlements/:id/pdf — stream pdf
  // MIRROR monitor.controller.js:130-220 for PDFKit setup + table helper
  async exportSettlementPdf(req, res) {
    try {
      const settlement = await commissionService.getSettlementWithLedger(req.params.id);
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 70, left: 50, right: 50 }, bufferPages: true });
      const tag = `${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${tag}-${settlement.apiSystem.slug}.pdf"`);
      doc.pipe(res);

      const fmt = (n) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(Number(n) ?? 0);

      // Title — MIRROR monitor.controller.js:160-167
      doc.fontSize(18).font('Helvetica-Bold').text('LIQUIDACIÓN DE COMISIÓN', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`${settlement.apiSystem.name} — ${tag}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Reuse drawTable helper logic from monitor.controller.js:141-157 (copy inline)
      // ... rendering ...

      doc.end();
    } catch (err) {
      logger.error('Error en exportSettlementPdf:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new CommissionController();
```

---

### 11. `backend/src/routes/commission.routes.js` — NEW route file

**Role:** route (NEW, request-response)
**Analog:** `backend/src/routes/provider.routes.js` (exact shape — top-level `router.use(authenticate, authorize('ADMIN'))` + `.bind(controller)` per route).

**Full file pattern — copy verbatim from `provider.routes.js:1-40`:**
```javascript
import express from 'express';
import commissionController from '../controllers/commission.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas son admin-only (PROVIDER role explicitly NOT permitted — Security ASVS V4)
router.use(authenticate, authorize('ADMIN'));

// Config (append-only per F-5 — no PUT, no DELETE)
router.get('/configs/:apiSystemId', commissionController.listConfigs.bind(commissionController));
router.post('/configs', commissionController.createConfig.bind(commissionController));

// Ledger (read-only)
router.get('/ledger', commissionController.getLedger.bind(commissionController));

// Settlements
router.get('/settlements', commissionController.getSettlements.bind(commissionController));
router.get('/settlements/:id', commissionController.getSettlementDetail.bind(commissionController));
router.patch('/settlements/:id/confirm', commissionController.confirmSettlement.bind(commissionController));
router.patch('/settlements/:id/adjust', commissionController.adjustSettlement.bind(commissionController));
router.get('/settlements/:id/excel', commissionController.exportSettlementExcel.bind(commissionController));
router.get('/settlements/:id/pdf', commissionController.exportSettlementPdf.bind(commissionController));

export default router;
```

**Mount in `backend/src/index.js` or wherever providers route is mounted** — mirror that line.

---

### 12. `backend/src/lib/dateUtils.js` — MODIFIED (add VE ISO-week helpers)

**Role:** utility (MODIFIED, additive)
**Analog:** self — existing date helpers at lines 25-60.

**ADDITIONS — date-fns + date-fns-tz based (RESEARCH.md Pattern 4):**
```javascript
// At top — extend existing date-fns import block (line 6):
import { format, parseISO, startOfDay, endOfDay, getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// (Existing const VENEZUELA_TIMEZONE at line 9 is reusable.)

/**
 * Returns { isoYear, isoWeek } for a Date in Venezuela wall-clock terms.
 * D-04: a draw at "Monday 00:00:00.001 VE" falls in the NEW week.
 * F-15: uses getISOWeekYear (NOT getFullYear) — correct for Dec/Jan boundaries.
 */
export function getISOWeekVE(date) {
  const ve = toZonedTime(date, VENEZUELA_TIMEZONE);
  return { isoYear: getISOWeekYear(ve), isoWeek: getISOWeek(ve) };
}

/**
 * Returns the UTC Date corresponding to VE Monday 00:00 of the ISO week containing `date`.
 * Venezuela is UTC-4 year-round (no DST since 2007) — magic 4-hour shift is safe.
 */
export function startOfISOWeekVE(date) {
  const ve = toZonedTime(date, VENEZUELA_TIMEZONE);
  const monStart = startOfISOWeek(ve); // local Monday 00:00 in ve frame
  return new Date(monStart.getTime() + 4 * 60 * 60 * 1000);
}

export function endOfISOWeekVE(date) {
  const ve = toZonedTime(date, VENEZUELA_TIMEZONE);
  const sunEnd = endOfISOWeek(ve);
  return new Date(sunEnd.getTime() + 4 * 60 * 60 * 1000);
}
```

**Required edge-case tests in `dateUtils.test.js` (F-15):**
- 2026-12-29 Tuesday → `{ isoYear: 2026, isoWeek: 53 }`
- 2027-01-01 Friday → `{ isoYear: 2026, isoWeek: 53 }`
- 2027-01-04 Monday → `{ isoYear: 2027, isoWeek: 1 }`

---

### 13. `frontend/app/admin/proveedores/[id]/comisiones/page.js` — NEW (Comisiones tab in provider detail)

**Role:** component (NEW, request-response client component)
**Analog:**
- `frontend/app/admin/proveedores/page.js:1-80` — `'use client'`, hooks, tab-state pattern at line 14 `const [activeTab, setActiveTab] = useState('configurations')`, API_URL env at line 7, JWT header pattern at lines 50-53.
- `frontend/app/admin/proveedores/logs/page.js:29-100` — modal pattern for "Nueva configuración" form (overlay + click-outside close).

**Imports + page shell — copy boilerplate from `proveedores/page.js:1-9`:**
```javascript
'use client';
import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export default function ProveedorComisionesPage() {
  const { id: apiSystemId } = useParams();
  const [configs, setConfigs] = useState([]);
  const [showNewConfigModal, setShowNewConfigModal] = useState(false);
  // ... mirror loadData from proveedores/page.js:47-79
}
```

**Form modal pattern** — copy `LogInspectorModal` shell from `proveedores/logs/page.js:29-90` (fixed inset + bg-opacity overlay + click-outside close).

**Table for history** — append-only timeline; mirror `ConciliacionTable` style (no inline edit buttons — append-only enforces "Nueva configuración" only).

---

### 14. `frontend/app/admin/comisiones/page.js` — NEW (top-level section, tab switcher)

**Role:** component (NEW)
**Analogs:**
- `frontend/app/admin/proveedores/page.js:14` — tab state pattern.
- `frontend/app/admin/conciliacion/page.js:1-77` — filters + table layout.

**Tab switcher — copy two-tab pattern from `proveedores/page.js`:**
```javascript
'use client';
import { useState } from 'react';

export default function ComisionesPage() {
  const [activeTab, setActiveTab] = useState('settlements'); // default to settlements per D-05

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Comisiones</h1>
        <p className="text-sm text-gray-500">Ledger por sorteo y liquidaciones semanales</p>
      </div>
      <div className="border-b border-gray-200">
        <nav className="flex gap-4" aria-label="Tabs">
          <button onClick={() => setActiveTab('settlements')} className={tabClass(activeTab === 'settlements')}>Liquidaciones</button>
          <button onClick={() => setActiveTab('ledger')} className={tabClass(activeTab === 'ledger')}>Ledger</button>
        </nav>
      </div>
      {activeTab === 'settlements' ? <SettlementsTab /> : <LedgerTab />}
    </div>
  );
}
```

---

### 15. `frontend/app/admin/comisiones/settlements/[id]/page.js` — NEW (drill-down + exports)

**Role:** component (NEW)
**Analog:** `frontend/app/admin/proveedores/logs/page.js` (filter + table + modal inspector + status-badge styling at lines 8-27).

**Status badges — copy directly from `proveedores/logs/page.js:8-27`** (adjust for DRAFT/CONFIRMED/ADJUSTED):
```javascript
const STATUS_STYLES = {
  DRAFT:     'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  ADJUSTED:  'bg-orange-100 text-orange-800',
};
const STATUS_LABELS = {
  DRAFT:     'Borrador',
  CONFIRMED: 'Confirmada',
  ADJUSTED:  'Ajustada',
};
function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-800'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
```

**Export buttons — file-download pattern (no existing analog uses `<a download>` for blob; use fetch + blob URL):**
```javascript
async function downloadExcel() {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_URL}/commissions/settlements/${id}/excel`, { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `liquidacion-${tag}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
```

---

## Shared Patterns

### Prisma Singleton Import
**Source:** `backend/src/lib/prisma.js` (existing — used by 50+ files including `draw-financial.service.js:30`)
**Apply to:** all backend code
```javascript
import { prisma } from '../../lib/prisma.js';  // workers (2 levels)
import { prisma } from '../lib/prisma.js';     // services + controllers + scripts (1 level)
```

### Winston Logger
**Source:** `backend/src/lib/logger.js`
**Apply to:** all backend code
```javascript
logger.info('[commission] phase=PRIZES drawId=...');
logger.warn('[commission] no_config_at_drawnAt', { drawId, apiSystemId, reason: 'no_config_at_drawnAt' });
logger.error('Error en confirmSettlement:', err);
```
**Convention:** structured second argument with object for queryable searches (mirror Phase 11 `draw-financial.service.js:127`).

### pg-boss v10 Handler Signature (mandatory unwrap)
**Source:** Every worker — Phase 11 `calculate-draw-financials.worker.js:19-22`
**Apply to:** `calculate-provider-commission.worker.js`, `weekly-settlement-snapshot.worker.js`
```javascript
export async function workerFn(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data; // or destructure as needed
}
```

### F-11 — `boss.createQueue()` BEFORE `boss.work()` (MANDATORY)
**Source:** `register.js:75-90` (EXECUTE_DRAW), `:127-135` (SYNC_SCRAPE_TICKETS with explicit warning comment), Phase 11 PATTERNS section 6.
**Apply to:** every new queue in Phase 12. Smoke-test:
```sql
SELECT name FROM pgboss.queue WHERE name = 'weekly-settlement-snapshot';
```

### `boss.send()` with singletonKey + QUEUE_CONFIGS spread
**Source:** `step-process-prizes.worker.js:50-53` (and Phase 11 add at :55-59)
**Apply to:** the new add in `step-process-prizes.worker.js`
```javascript
await boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, { drawId }, {
  singletonKey: `comm-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
});
```

### D-08 — Explicit findFirst + update/create (NEVER `prisma.upsert` for nullable-FK or state-conditional rows)
**Source:** `draw-financial.service.js:104-124` (nullable apiSystemId), Phase 11 PATTERNS section 3.
**Apply to:**
- Commission ledger upsert (consistency with `draw-financial.service.js` even though `apiSystemId` is NOT NULL on ledger).
- Settlement snapshot (state-conditional — CONFIRMED/ADJUSTED frozen per D-03 — see worker section 4 above).

### Decimal.js for money math
**Source:** RESEARCH.md Pattern 2, CONTEXT.md assumption 1.
**Apply to:** every monetary computation in `commission.service.js`.
```javascript
import Decimal from 'decimal.js';
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
// Prisma Decimal → .toString() → new Decimal() → .toFixed(8) → Prisma string lossless
```
**Never:** `Number(prismaDecimal)` (precision loss).

### AuditLog write on state transitions
**Source:** `backend/src/controllers/admin-jobs.controller.js:126-134` (JOB_RETRIED) + `backend/src/services/draw-cascade.service.js:124-138` (DRAW_EXECUTED, with `.catch(() => {})` best-effort).
**Apply to:** `confirmSettlement`, `adjustSettlement` in `commission.controller.js`.
**Schema reference:** `AuditLog` model at `prisma/schema.prisma:404-422` — fields: `userId`, `action`, `entity`, `entityId`, `changes Json`, `ipAddress`, `userAgent`, `createdAt`.
**Convention:** non-blocking — wrap in `.catch(() => {})` if the operation should NOT fail when audit write fails. For commission confirmation, DO let it block (financial trust per D-03).

### Admin auth — `authenticate + authorize('ADMIN')`
**Source:** `backend/src/routes/provider.routes.js:8`, `backend/src/routes/conciliacion.routes.js:7-8`, `backend/src/middlewares/auth.middleware.js:7-80`.
**Apply to:** `commission.routes.js` (top-level `router.use` — single line covers all routes).

### Dry-run gating in scripts (D-02 carry-over from Phase 11)
**Source:** `backfill-draw-financials.mjs:31-52`
**Apply to:** `backfill-provider-commissions.mjs`
```javascript
const DRY_RUN = argv.includes('--dry-run');
const CONFIRM = argv.includes('--confirm');
if (!DRY_RUN && !CONFIRM) {
  process.stderr.write('Refusing to write without --confirm.\n');
  process.exit(2);
}
```

### Script entry/exit boilerplate (prisma.$disconnect in finally)
**Source:** `backfill-draw-financials.mjs:163-171`
**Apply to:** `backfill-provider-commissions.mjs`
```javascript
main()
  .catch((err) => { logger.error(`Backfill aborted: ${err.message}`, { stack: err.stack }); console.error(err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
```

### Cron Linux integration (out of session scope, but planner needs to call out in DEPLOY.md)
**Source:** `/etc/cron.d/tote-triggers` on VPS 94 (referenced in CLAUDE.md + `trigger-pgboss-cron.mjs:15-17`).
**Apply to:** DEPLOY.md addition for Phase 12:
```cron
# Weekly settlement snapshot — Monday 06:00 VE (10:00 UTC, UTC-4 no DST)
0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot
```
**F-12 mitigation:** the planner MUST include "update /etc/cron.d/tote-triggers" as an explicit deploy-step checklist item in the eventual DEPLOY.md. Code deploy without cron update = settlements never created.

### ExcelJS audit-grade SUM formulas
**Source:** `accounting-report.service.js:248-261`
**Apply to:** `buildSettlementExcel` in `commission.service.js`.
**Why:** the TOTAL row uses `{ formula: 'SUM(C2:C50)' }` so the auditor can verify the sum live in Excel — not just trust a pre-computed number.

### PDFKit streaming + drawTable helper
**Source:** `monitor.controller.js:130-220`
**Apply to:** `exportSettlementPdf` in `commission.controller.js`.
**Key elements to copy:** `bufferPages: true`, `Content-Disposition: attachment`, `doc.pipe(res)`, the `drawTable(doc, headers, colWidths, rows)` helper at lines 141-157 (lift this helper as-is into commission.controller.js — it has no dependencies on monitor-specific state).

### Frontend tab-state pattern
**Source:** `frontend/app/admin/proveedores/page.js:14` (`const [activeTab, setActiveTab] = useState('configurations')`)
**Apply to:** `/admin/comisiones/page.js` (Liquidaciones / Ledger tabs) AND `/admin/proveedores/[id]/comisiones/page.js` (if planner decides to split current+history).

### Frontend status-badge component
**Source:** `frontend/app/admin/proveedores/logs/page.js:8-27`
**Apply to:** every settlement/ledger display — drop into a shared component `frontend/components/admin/comisiones/StatusBadge.js` (planner decides on lifting vs inline).

### Frontend JWT auth header (client-side fetch)
**Source:** `frontend/app/admin/conciliacion/page.js:24-26`, `proveedores/page.js:50-53`
**Apply to:** all frontend fetches in Phase 12.
```javascript
const token = localStorage.getItem('accessToken');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
```

---

## "DIFFER FROM" Notes (intentional inversions)

| File | Analog | Differ on |
|------|--------|-----------|
| `ProviderCommissionLedger` model | `DrawFinancialProvider` model | **Decimal precision: `(18, 8)` NOT `(12, 2)`.** Phase 12's whole point per F-4 is the higher precision. |
| `ProviderCommissionLedger.apiSystemId` | `DrawFinancialProvider.apiSystemId` | **NOT NULL** (commission requires real provider; D-01 says no row for missing config; no TAQUILLA_ONLINE bucket). |
| `weekly-settlement-snapshot.worker.js` | `cleanup-logs.worker.js` (cron-trigger shape) | This worker does state-conditional `findFirst + branch`, NOT a single update. CONFIRMED/ADJUSTED are FROZEN per D-03. |
| `commission.service.js` | `draw-financial.service.js` | Reads `DrawFinancialProvider` (Phase 11 materialized output), NOT raw `TicketDetail`. The whole point of Phase 11 (see Phase 11 PATTERNS section 3 "DIFFER FROM" inverted reading — this is the OPPOSITE inversion: Phase 12 trusts Phase 11's output). |
| `commission.controller.js` configs | `provider.controller.js` configs | **Append-only — no PUT/DELETE endpoint for configs.** Only `createConfig`. F-5 enforcement. |
| `commission.service.js` Excel | `accounting-report.service.js` Excel | Per-settlement export (single provider × week), not per-period (range × multi-game). Header is `{provider} — {YYYY-W##}` not `{dateFrom} a {dateTo}`. |

---

## No Analog Found

All Phase 12 files have strong analogs. Two minor gaps:

| File | Role | Concern | Note |
|------|------|---------|------|
| `ProviderCommissionConfig` (append-only versioning) | model | No existing model in the codebase uses formal append-only with `effectiveFrom` versioning. Closest precedent is `ApiConfiguration` (mutable). | Service-layer enforcement (F-5) + unit test that asserts `prisma.providerCommissionConfig.update` is never called by any service export. Planner should add this as an explicit acceptance criterion. |
| Frontend blob-download (Excel/PDF) | frontend pattern | No existing admin page uses `URL.createObjectURL` + `<a download>` for backend-streamed files. Closest precedent is the image download pattern in WhatsApp manager (uses direct `<img src>` though, not blob). | Pattern shown above in section 15 (`downloadExcel`). Standard browser API, no library needed. |

---

## Metadata

**Analog search scope:**
- `backend/src/queue/workers/*.js` (all 27 workers scanned for cron-trigger shape + parallel-send patterns)
- `backend/src/queue/register.js`, `constants.js`, `boss.js`, `scripts/trigger-pgboss-cron.mjs`
- `backend/src/services/accounting-report.service.js`, `draw-financial.service.js`, `draw-stats.service.js`, `conciliacion.service.js`
- `backend/src/controllers/monitor.controller.js`, `provider.controller.js`, `admin-jobs.controller.js`, `conciliacion.controller.js`
- `backend/src/routes/provider.routes.js`, `conciliacion.routes.js`
- `backend/src/scripts/backfill-draw-financials.mjs`
- `backend/src/lib/dateUtils.js`, `prisma.js`, `logger.js`
- `backend/src/middlewares/auth.middleware.js`
- `backend/prisma/schema.prisma` (DrawFinancial, DrawFinancialProvider, ApiSystem, AuditLog, ApiConfiguration, enum patterns)
- `frontend/app/admin/proveedores/page.js`, `proveedores/logs/page.js`, `conciliacion/page.js`
- `frontend/components/admin/conciliacion/*.js`
- `.planning/phases/11-drawfinancial-foundation/11-PATTERNS.md` (reusable analog map — Phase 11 patterns inherit cleanly into Phase 12 worker/service/script shape)

**Files scanned:** ~40
**Pattern extraction date:** 2026-05-15
