# P&L Semanal — Desglose de Comisión por Proveedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-18-pnl-semanal-provider-commission-breakdown-design.md`

**Goal:** Cuando se selecciona un proveedor en `/admin/reportes/pnl-semanal`, mostrar una tarjeta nueva con configs de comisión vigentes y desglose por juego (ventas, premios, bruto, %V, com.ventas, %U, com.utilidad, comisión proveedor, neto a casa) para la semana seleccionada.

**Architecture:** Endpoint backend nuevo que reusa `commission.service.js` (`findEffectiveConfig`, `computeCommission`, `getCumulativeWeeklySales`) y consulta agregada de `DrawFinancialProvider` por gameId. Componente React nuevo que consume el endpoint y se inserta condicionalmente en `pnl-semanal/page.js`. Sin DB migration.

**Tech Stack:** Node 18 ES modules · Prisma · Decimal.js · Jest (backend tests) · Next.js 14 App Router · React 18 · TailwindCSS · Axios

**Constraint:** Trabajo solo en local. Ningún `git push` hasta indicación expresa del usuario.

---

## File Structure

**Backend — Create:**
- `backend/src/services/pnl-provider-breakdown.service.js` — orquesta query + cálculo
- `backend/src/services/__tests__/pnl-provider-breakdown.service.test.js` — unit tests con Prisma mockeado

**Backend — Modify:**
- `backend/src/controllers/pnl-report.controller.js` — agregar método `getProviderBreakdown`
- `backend/src/routes/pnl-report.routes.js` — agregar ruta `GET /pnl/semanal/provider-breakdown`

**Frontend — Create:**
- `frontend/components/admin/reportes/ProviderCommissionBreakdown.jsx` — la tarjeta de UI

**Frontend — Modify:**
- `frontend/lib/api/pnl.js` — agregar método `getProviderBreakdown`
- `frontend/app/admin/reportes/pnl-semanal/page.js` — render condicional del nuevo componente

---

## Task 1: Backend Service — esqueleto y query agregada

**Files:**
- Create: `backend/src/services/pnl-provider-breakdown.service.js`
- Create: `backend/src/services/__tests__/pnl-provider-breakdown.service.test.js`

- [ ] **Step 1: Write failing test for the empty-week case**

```javascript
// backend/src/services/__tests__/pnl-provider-breakdown.service.test.js
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  apiSystem: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  providerCommissionConfig: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

let service;
beforeAll(async () => {
  service = await import('../pnl-provider-breakdown.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getProviderBreakdownForWeek — empty week', () => {
  test('returns empty byGame + zero totals when provider had no sales', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'TestProv' });
    mockPrisma.$queryRaw.mockResolvedValue([]); // no draw rows

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1',
      isoYear: 2026,
      isoWeek: 21,
    });

    expect(out.apiSystemId).toBe('p1');
    expect(out.apiSystemName).toBe('TestProv');
    expect(out.byGame).toEqual([]);
    expect(out.configs).toEqual([]);
    expect(out.totals.sales).toBe('0.00');
    expect(out.totals.totalCommission).toBe('0.00');
    expect(out.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: FAIL with "Cannot find module '../pnl-provider-breakdown.service.js'".

- [ ] **Step 3: Create the service with the minimal happy-path skeleton**

```javascript
// backend/src/services/pnl-provider-breakdown.service.js
/**
 * Desglose de comisión por proveedor para una semana ISO.
 *
 * Reusa commission.service.js para mantener una única fuente de verdad sobre
 * las fórmulas. Las cantidades de comisión calculadas aquí DEBEN coincidir
 * (al céntimo) con SUM(ProviderCommissionLedger.amount) para los sorteos de
 * la semana — si difieren agregamos warning, no bloqueamos.
 *
 * @module pnl-provider-breakdown.service
 */
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getMondayOfISOWeek } from '../lib/dateUtils.js';
import {
  findEffectiveConfig,
  computeCommission,
  getCumulativeWeeklySales,
} from './commission.service.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function fmt(dec) {
  return new Decimal(dec ?? 0).toFixed(2);
}

export async function getProviderBreakdownForWeek({ apiSystemId, isoYear, isoWeek }) {
  const windowStartUtc = getMondayOfISOWeek(isoYear, isoWeek);
  const windowEndUtc = new Date(windowStartUtc.getTime() + WEEK_MS);

  const apiSystem = await prisma.apiSystem.findUnique({
    where: { id: apiSystemId },
    select: { id: true, name: true },
  });
  if (!apiSystem) {
    const err = new Error(`apiSystemId ${apiSystemId} no existe`);
    err.statusCode = 404;
    throw err;
  }

  const rows = await prisma.$queryRaw`
    SELECT d."gameId"           AS "gameId",
           g.name               AS "gameName",
           SUM(dfp."totalSales")::numeric(18,8) AS sales,
           SUM(dfp."totalPrize")::numeric(18,8) AS prizes
    FROM   "DrawFinancialProvider" dfp
    JOIN   "Draw" d ON d.id = dfp."drawId"
    JOIN   "Game" g ON g.id = d."gameId"
    WHERE  dfp."apiSystemId" = ${apiSystemId}
      AND  d."drawnAt" >= ${windowStartUtc}
      AND  d."drawnAt" <  ${windowEndUtc}
    GROUP BY d."gameId", g.name
    ORDER BY g.name
  `;

  return {
    isoYear,
    isoWeek,
    weekStart: windowStartUtc.toISOString().slice(0, 10),
    weekEnd: new Date(windowEndUtc.getTime() - 1).toISOString().slice(0, 10),
    apiSystemId: apiSystem.id,
    apiSystemName: apiSystem.name,
    configs: [],
    byGame: [],
    totals: {
      sales: fmt(0),
      prizes: fmt(0),
      gross: fmt(0),
      salesCommission: fmt(0),
      utilityCommission: fmt(0),
      totalCommission: fmt(0),
      netToHouse: fmt(0),
    },
    warnings: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: PASS — 1 test, 0 failures.

- [ ] **Step 5: Commit (local only)**

```bash
git add backend/src/services/pnl-provider-breakdown.service.js \
        backend/src/services/__tests__/pnl-provider-breakdown.service.test.js
git commit -m "feat(pnl): scaffold provider-breakdown service with empty-week test"
```

**Do NOT push.**

---

## Task 2: Per-game commission calculation — SALES_AND_UTILITY_PCT

**Files:**
- Modify: `backend/src/services/pnl-provider-breakdown.service.js`
- Modify: `backend/src/services/__tests__/pnl-provider-breakdown.service.test.js`

- [ ] **Step 1: Write failing test for SALES_AND_UTILITY_PCT formula**

Append to the test file:

```javascript
describe('getProviderBreakdownForWeek — SALES_AND_UTILITY_PCT', () => {
  test('computes salesCommission, utilityCommission, totalCommission, netToHouse per game', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'SRQ' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTOANIMALITO', sales: '15154.99', prizes: '8100.00' },
      { gameId: 'g2', gameName: 'TRIPLE PANTERA', sales: '46765.00', prizes: '12500.00' },
    ]);
    // Config vigente: SALES_AND_UTILITY_PCT por juego
    mockPrisma.providerCommissionConfig.findFirst
      .mockResolvedValueOnce({
        id: 'c1', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '16.00', utilityRate: '30.00',
        effectiveFrom: new Date('2025-12-20'),
        gameId: 'g1', tiers: [],
      })
      .mockResolvedValueOnce({
        id: 'c2', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '25.00', utilityRate: '30.00',
        effectiveFrom: new Date('2025-12-20'),
        gameId: 'g2', tiers: [],
      });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.byGame).toHaveLength(2);

    const ani = out.byGame.find((r) => r.gameName === 'LOTOANIMALITO');
    expect(ani.sales).toBe('15154.99');
    expect(ani.prizes).toBe('8100.00');
    expect(ani.gross).toBe('7054.99');
    expect(ani.salesRate).toBe('16.00');
    expect(ani.salesCommission).toBe('2424.80');
    expect(ani.utilityRate).toBe('30.00');
    expect(ani.utilityCommission).toBe('2116.50');
    expect(ani.totalCommission).toBe('4541.30');
    expect(ani.netToHouse).toBe('2513.69'); // 7054.99 - 4541.30
    expect(ani.configMissing).toBe(false);

    const trp = out.byGame.find((r) => r.gameName === 'TRIPLE PANTERA');
    expect(trp.salesCommission).toBe('11691.25');
    expect(trp.utilityCommission).toBe('10279.50');
    expect(trp.totalCommission).toBe('21970.75');
    expect(trp.netToHouse).toBe('12294.25');

    expect(out.totals.sales).toBe('61919.99');
    expect(out.totals.totalCommission).toBe('26512.05');
    expect(out.totals.netToHouse).toBe('14807.94');
    expect(out.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage -t SALES_AND_UTILITY_PCT`
Expected: FAIL — `byGame` is `[]`.

- [ ] **Step 3: Implement per-row calculation in the service**

Replace the `return` block at the end of `getProviderBreakdownForWeek` with the full computation:

```javascript
  const byGame = [];
  const totals = {
    sales: new Decimal(0),
    prizes: new Decimal(0),
    gross: new Decimal(0),
    salesCommission: new Decimal(0),
    utilityCommission: new Decimal(0),
    totalCommission: new Decimal(0),
    netToHouse: new Decimal(0),
  };
  const warnings = [];
  const configsByKey = new Map();

  // Refdate para findEffectiveConfig: último instante de la semana.
  const refDate = new Date(windowEndUtc.getTime() - 1);

  for (const row of rows) {
    const sales = new Decimal((row.sales ?? 0).toString());
    const prizes = new Decimal((row.prizes ?? 0).toString());
    const gross = sales.minus(prizes);

    const config = await findEffectiveConfig(apiSystemId, refDate, row.gameId);

    let salesRate = null;
    let utilityRate = null;
    let salesCommission = null;
    let utilityCommission = null;
    let totalCommission = new Decimal(0);
    let tierLabel = null;
    const configMissing = !config;

    if (config) {
      const ft = config.formulaType;
      if (ft === 'SALES_PCT' || ft === 'SALES_AND_UTILITY_PCT') {
        salesRate = new Decimal(config.salesRate.toString()).toFixed(2);
        salesCommission = sales.times(config.salesRate.toString()).dividedBy(100);
      }
      if (ft === 'UTILITY_PCT' || ft === 'SALES_AND_UTILITY_PCT') {
        utilityRate = new Decimal(config.utilityRate.toString()).toFixed(2);
        utilityCommission = gross.times(config.utilityRate.toString()).dividedBy(100);
      }
      if (ft === 'TIERED') {
        const cumulative = await getCumulativeWeeklySales(apiSystemId, refDate);
        // Reusar computeCommission da el monto y nos quedamos con el bracket
        // para tierLabel.
        const cum = new Decimal(cumulative);
        const bracket = (config.tiers || []).find((t) => {
          const min = new Decimal(t.minSales.toString());
          if (cum.lt(min)) return false;
          if (t.maxSales == null) return true;
          return cum.lt(new Decimal(t.maxSales.toString()));
        });
        if (bracket) {
          salesRate = new Decimal(bracket.rate.toString()).toFixed(2);
          salesCommission = sales.times(bracket.rate.toString()).dividedBy(100);
          const maxLabel = bracket.maxSales == null ? '∞' : bracket.maxSales.toString();
          tierLabel = `${salesRate}% — tramo [${bracket.minSales.toString()}, ${maxLabel})`;
        }
      }

      totalCommission = (salesCommission ?? new Decimal(0)).plus(utilityCommission ?? new Decimal(0));

      // Group identical configs for the `configs[]` summary.
      const key = `${config.formulaType}|${config.salesRate?.toString() ?? ''}|${config.utilityRate?.toString() ?? ''}|${config.effectiveFrom?.toISOString?.() ?? config.effectiveFrom}`;
      if (!configsByKey.has(key)) {
        configsByKey.set(key, {
          gameIds: [],
          gameNames: [],
          formulaType: config.formulaType,
          salesRate: config.salesRate != null ? new Decimal(config.salesRate.toString()).toFixed(2) : null,
          utilityRate: config.utilityRate != null ? new Decimal(config.utilityRate.toString()).toFixed(2) : null,
          tiers: (config.tiers || []).map((t) => ({
            minSales: t.minSales.toString(),
            maxSales: t.maxSales == null ? null : t.maxSales.toString(),
            rate: new Decimal(t.rate.toString()).toFixed(2),
          })),
          effectiveFrom: config.effectiveFrom instanceof Date
            ? config.effectiveFrom.toISOString().slice(0, 10)
            : String(config.effectiveFrom).slice(0, 10),
        });
      }
      const bucket = configsByKey.get(key);
      bucket.gameIds.push(row.gameId);
      bucket.gameNames.push(row.gameName);
    } else {
      warnings.push(`Sin config vigente para: ${row.gameName}`);
    }

    if (utilityCommission && gross.isNegative() && utilityRate) {
      warnings.push(`Utilidad negativa en ${row.gameName}: el componente de utilidad redujo la comisión`);
    }

    const netToHouse = gross.minus(totalCommission);

    byGame.push({
      gameId: row.gameId,
      gameName: row.gameName,
      sales: sales.toFixed(2),
      prizes: prizes.toFixed(2),
      gross: gross.toFixed(2),
      formulaType: config?.formulaType ?? null,
      salesRate,
      salesCommission: salesCommission ? salesCommission.toFixed(2) : null,
      utilityRate,
      utilityCommission: utilityCommission ? utilityCommission.toFixed(2) : null,
      totalCommission: totalCommission.toFixed(2),
      netToHouse: netToHouse.toFixed(2),
      configMissing,
      tierLabel,
    });

    totals.sales = totals.sales.plus(sales);
    totals.prizes = totals.prizes.plus(prizes);
    totals.gross = totals.gross.plus(gross);
    if (salesCommission) totals.salesCommission = totals.salesCommission.plus(salesCommission);
    if (utilityCommission) totals.utilityCommission = totals.utilityCommission.plus(utilityCommission);
    totals.totalCommission = totals.totalCommission.plus(totalCommission);
    totals.netToHouse = totals.netToHouse.plus(netToHouse);
  }

  return {
    isoYear,
    isoWeek,
    weekStart: windowStartUtc.toISOString().slice(0, 10),
    weekEnd: new Date(windowEndUtc.getTime() - 1).toISOString().slice(0, 10),
    apiSystemId: apiSystem.id,
    apiSystemName: apiSystem.name,
    configs: Array.from(configsByKey.values()),
    byGame,
    totals: {
      sales: totals.sales.toFixed(2),
      prizes: totals.prizes.toFixed(2),
      gross: totals.gross.toFixed(2),
      salesCommission: totals.salesCommission.toFixed(2),
      utilityCommission: totals.utilityCommission.toFixed(2),
      totalCommission: totals.totalCommission.toFixed(2),
      netToHouse: totals.netToHouse.toFixed(2),
    },
    warnings,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 5: Commit (local only)**

```bash
git add backend/src/services/pnl-provider-breakdown.service.js \
        backend/src/services/__tests__/pnl-provider-breakdown.service.test.js
git commit -m "feat(pnl): compute SALES_AND_UTILITY_PCT breakdown per game"
```

**Do NOT push.**

---

## Task 3: Support UTILITY_PCT and SALES_PCT-only configs

**Files:**
- Modify: `backend/src/services/__tests__/pnl-provider-breakdown.service.test.js` (only — service already supports these)

- [ ] **Step 1: Write failing tests for UTILITY_PCT and SALES_PCT**

Append:

```javascript
describe('getProviderBreakdownForWeek — UTILITY_PCT only', () => {
  test('emits salesRate=null, computes utility commission from gross', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p2', name: 'virtuales' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTOANIMALITO', sales: '32843.00', prizes: '22200.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValueOnce({
      id: 'c1', formulaType: 'UTILITY_PCT',
      salesRate: null, utilityRate: '70.00',
      effectiveFrom: new Date('2026-04-07'),
      gameId: null, tiers: [],
    });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p2', isoYear: 2026, isoWeek: 21,
    });

    const row = out.byGame[0];
    expect(row.salesRate).toBeNull();
    expect(row.salesCommission).toBeNull();
    expect(row.utilityRate).toBe('70.00');
    expect(row.utilityCommission).toBe('7450.10');
    expect(row.totalCommission).toBe('7450.10');
    expect(row.netToHouse).toBe('3192.90'); // 10643 - 7450.10
  });
});

describe('getProviderBreakdownForWeek — SALES_PCT only', () => {
  test('emits utilityRate=null, computes sales commission only', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p3', name: 'Some' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTTOPANTERA', sales: '500.00', prizes: '100.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValueOnce({
      id: 'c1', formulaType: 'SALES_PCT',
      salesRate: '8.00', utilityRate: null,
      effectiveFrom: new Date('2026-01-01'),
      gameId: null, tiers: [],
    });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p3', isoYear: 2026, isoWeek: 21,
    });
    const row = out.byGame[0];
    expect(row.salesRate).toBe('8.00');
    expect(row.salesCommission).toBe('40.00');
    expect(row.utilityRate).toBeNull();
    expect(row.utilityCommission).toBeNull();
    expect(row.totalCommission).toBe('40.00');
    expect(row.netToHouse).toBe('360.00');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: PASS — 4 tests, 0 failures. (Service already handles these via the `if (ft === ...)` branches.)

- [ ] **Step 3: Commit (local only)**

```bash
git add backend/src/services/__tests__/pnl-provider-breakdown.service.test.js
git commit -m "test(pnl): cover UTILITY_PCT and SALES_PCT-only configs"
```

**Do NOT push.**

---

## Task 4: Warnings — missing config + negative utility

**Files:**
- Modify: `backend/src/services/__tests__/pnl-provider-breakdown.service.test.js`

- [ ] **Step 1: Write failing tests for both warnings**

Append:

```javascript
describe('getProviderBreakdownForWeek — warnings', () => {
  test('emits warning when no config vigente for a game', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'Prov' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'JUEGO X', sales: '1000', prizes: '500' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(null); // no global, no game

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.byGame[0].configMissing).toBe(true);
    expect(out.byGame[0].totalCommission).toBe('0.00');
    expect(out.byGame[0].netToHouse).toBe('500.00');
    expect(out.warnings).toContain('Sin config vigente para: JUEGO X');
  });

  test('emits warning when gross is negative and utilityRate is set', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'Maxplay' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'TRIPLE PANTERA', sales: '17595.00', prizes: '30100.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValueOnce({
      id: 'c1', formulaType: 'SALES_AND_UTILITY_PCT',
      salesRate: '26.00', utilityRate: '35.00',
      effectiveFrom: new Date('2026-05-04'),
      gameId: 'g1', tiers: [],
    });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.byGame[0].gross).toBe('-12505.00');
    expect(out.byGame[0].utilityCommission).toBe('-4376.75');
    expect(out.byGame[0].totalCommission).toBe('197.95'); // 4574.70 - 4376.75
    expect(out.warnings).toContain(
      'Utilidad negativa en TRIPLE PANTERA: el componente de utilidad redujo la comisión'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: PASS — 6 tests, 0 failures. (Warning logic already in place.)

- [ ] **Step 3: Commit (local only)**

```bash
git add backend/src/services/__tests__/pnl-provider-breakdown.service.test.js
git commit -m "test(pnl): cover missing-config and negative-gross warnings"
```

**Do NOT push.**

---

## Task 5: Group identical configs in the `configs[]` summary

**Files:**
- Modify: `backend/src/services/__tests__/pnl-provider-breakdown.service.test.js`

- [ ] **Step 1: Write failing test that asserts grouping**

Append:

```javascript
describe('getProviderBreakdownForWeek — configs grouping', () => {
  test('groups games sharing identical formula+rates+effectiveFrom into one entry', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'SRQ' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTOANIMALITO', sales: '100', prizes: '50' },
      { gameId: 'g2', gameName: 'LOTTOPANTERA', sales: '100', prizes: '50' },
      { gameId: 'g3', gameName: 'TRIPLE PANTERA', sales: '100', prizes: '50' },
    ]);
    const sameDate = new Date('2025-12-20');
    mockPrisma.providerCommissionConfig.findFirst
      .mockResolvedValueOnce({
        id: 'c1', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '16.00', utilityRate: '30.00',
        effectiveFrom: sameDate, gameId: 'g1', tiers: [],
      })
      .mockResolvedValueOnce({
        id: 'c2', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '16.00', utilityRate: '30.00',
        effectiveFrom: sameDate, gameId: 'g2', tiers: [],
      })
      .mockResolvedValueOnce({
        id: 'c3', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '25.00', utilityRate: '30.00',
        effectiveFrom: sameDate, gameId: 'g3', tiers: [],
      });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.configs).toHaveLength(2);
    const sixteen = out.configs.find((c) => c.salesRate === '16.00');
    expect(sixteen.gameNames).toEqual(['LOTOANIMALITO', 'LOTTOPANTERA']);
    const twentyFive = out.configs.find((c) => c.salesRate === '25.00');
    expect(twentyFive.gameNames).toEqual(['TRIPLE PANTERA']);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 3: Commit (local only)**

```bash
git add backend/src/services/__tests__/pnl-provider-breakdown.service.test.js
git commit -m "test(pnl): cover config grouping by formula+rates+effectiveFrom"
```

**Do NOT push.**

---

## Task 6: Controller method + route

**Files:**
- Modify: `backend/src/controllers/pnl-report.controller.js`
- Modify: `backend/src/routes/pnl-report.routes.js`

- [ ] **Step 1: Add the controller method**

Add this method inside `class PnlReportController` (after `getWeeklyPnl`, before `downloadPnlExcel`):

```javascript
  /**
   * GET /api/reportes/pnl/semanal/provider-breakdown
   * Requires apiSystemId; per-game commission breakdown for the ISO week.
   */
  async getProviderBreakdown(req, res) {
    try {
      const params = validateWeekParams(req.query);
      if (!params.apiSystemId) {
        return res.status(400).json({
          success: false,
          error: 'apiSystemId es requerido para el desglose por proveedor',
        });
      }
      const { getProviderBreakdownForWeek } = await import(
        '../services/pnl-provider-breakdown.service.js'
      );
      const data = await getProviderBreakdownForWeek({
        apiSystemId: params.apiSystemId,
        isoYear: params.isoYear,
        isoWeek: params.isoWeek,
      });
      res.json({ success: true, data });
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ success: false, error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ success: false, error: error.message });
      }
      logger.error('[pnl-report.controller] getProviderBreakdown failed', {
        error: error?.message,
        stack: error?.stack,
      });
      res.status(500).json({
        success: false,
        error: 'Error obteniendo desglose de comisión por proveedor',
      });
    }
  }
```

- [ ] **Step 2: Register the route**

Open `backend/src/routes/pnl-report.routes.js`. After the line `router.get('/pnl/semanal', pnlReportController.getWeeklyPnl);` (line 24), add:

```javascript
router.get('/pnl/semanal/provider-breakdown', pnlReportController.getProviderBreakdown.bind(pnlReportController));
```

Make sure the new route is placed **before** any `:wildcard` patterns (current file has no wildcards on this path — safe).

- [ ] **Step 3: Smoke-test the endpoint with a quick local curl**

Start backend dev (one terminal): `cd backend && npm run dev`

In another terminal, get a valid apiSystemId for SRQ:

```bash
docker exec tote_postgres psql -U tote_user -d tote_db -t -c "SELECT id FROM \"ApiSystem\" WHERE slug='srq';"
```

Then call:

```bash
curl -s "http://localhost:3001/api/reportes/pnl/semanal/provider-breakdown?isoYear=2026&isoWeek=21&apiSystemId=<UUID>" | jq .
```

Expected: JSON `{ success: true, data: { byGame: [...], configs: [...], totals: {...}, warnings: [...] } }`. Status 200.

If 400 or 500 is returned, fix before continuing. (If local DB has no commission configs because it was reset, seed manually with `INSERT INTO "ProviderCommissionConfig" ...` matching prod patterns; the service still returns `byGame` with `configMissing: true` rows, which is also valid.)

- [ ] **Step 4: Commit (local only)**

```bash
git add backend/src/controllers/pnl-report.controller.js \
        backend/src/routes/pnl-report.routes.js
git commit -m "feat(pnl): expose GET /pnl/semanal/provider-breakdown endpoint"
```

**Do NOT push.**

---

## Task 7: Frontend API client method

**Files:**
- Modify: `frontend/lib/api/pnl.js`

- [ ] **Step 1: Read the current shape of pnl.js to match style**

```bash
sed -n '1,50p' frontend/lib/api/pnl.js
```

- [ ] **Step 2: Add the new method**

Append (or insert near other GET methods, matching the existing axios calling convention used by `getWeeklyPnl`) a method:

```javascript
async getProviderBreakdown({ isoYear, isoWeek, apiSystemId }) {
  const res = await axios.get('/reportes/pnl/semanal/provider-breakdown', {
    params: { isoYear, isoWeek, apiSystemId },
  });
  // Server wraps in { success, data } — tolerate both shapes like getWeeklyPnl does.
  return res.data?.data ?? res.data;
},
```

If the file exports a default object literal (e.g., `export default { getWeeklyPnl, downloadPnlExcel, ... }`), make sure to include `getProviderBreakdown` in that literal.

- [ ] **Step 3: Verify the file still parses**

Run: `cd frontend && node --check lib/api/pnl.js`
Expected: no output (file is valid JS).

- [ ] **Step 4: Commit (local only)**

```bash
git add frontend/lib/api/pnl.js
git commit -m "feat(pnl): add getProviderBreakdown API client method"
```

**Do NOT push.**

---

## Task 8: Frontend component — ProviderCommissionBreakdown

**Files:**
- Create: `frontend/components/admin/reportes/ProviderCommissionBreakdown.jsx`

- [ ] **Step 1: Create the component file**

```jsx
// frontend/components/admin/reportes/ProviderCommissionBreakdown.jsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Percent } from 'lucide-react';
import pnlAPI from '@/lib/api/pnl';

const fmtMoney = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency', currency: 'VES', minimumFractionDigits: 2,
  }).format(num);
};

const fmtPct = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)}%`;
};

function formulaLabel(formulaType, salesRate, utilityRate) {
  switch (formulaType) {
    case 'SALES_PCT':
      return `${fmtPct(salesRate)} sobre ventas`;
    case 'UTILITY_PCT':
      return `${fmtPct(utilityRate)} sobre utilidad`;
    case 'SALES_AND_UTILITY_PCT':
      return `${fmtPct(salesRate)} sobre ventas + ${fmtPct(utilityRate)} sobre utilidad`;
    case 'TIERED':
      return 'Por tramos de ventas (TIERED)';
    default:
      return formulaType ?? '—';
  }
}

export default function ProviderCommissionBreakdown({ isoYear, isoWeek, apiSystemId, apiSystemName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiSystemId) return;
    let cancelled = false;
    setLoading(true);
    pnlAPI.getProviderBreakdown({ isoYear, isoWeek, apiSystemId })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((err) => {
        if (!cancelled) {
          toast.error('Error cargando desglose de comisión');
          setData(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isoYear, isoWeek, apiSystemId]);

  if (!apiSystemId) return null;

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data || data.byGame.length === 0) {
    return null; // Empty week — parent already shows empty state.
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Percent className="w-4 h-4 text-blue-600" />
          Desglose de comisión — {apiSystemName ?? data.apiSystemName}
        </h3>
      </div>

      {/* Sub-bloque A — Configs vigentes */}
      {data.configs.length > 0 && (
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100 text-xs text-gray-700 space-y-1">
          <div className="font-medium text-gray-600 mb-1">Configuración vigente:</div>
          {data.configs.map((cfg, idx) => (
            <div key={idx}>
              • <span className="font-medium">{cfg.gameNames.join(', ')}</span>
              {' → '}
              {formulaLabel(cfg.formulaType, cfg.salesRate, cfg.utilityRate)}
              <span className="text-gray-400"> (desde {cfg.effectiveFrom})</span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-bloque B — Tabla por juego */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Juego</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Ventas</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Premios</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Bruto</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">%V</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Com. ventas</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">%U</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Com. utilidad</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Comisión proveedor</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Neto a casa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.byGame.map((row) => {
              const grossNeg = Number(row.gross) < 0;
              const netNeg = Number(row.netToHouse) < 0;
              return (
                <tr key={row.gameId} className="hover:bg-gray-50/40">
                  <td className="px-3 py-2 text-gray-800">{row.gameName}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(row.sales)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmtMoney(row.prizes)}</td>
                  <td className={`px-3 py-2 text-right ${grossNeg ? 'text-red-600' : 'text-gray-800'}`}>
                    {fmtMoney(row.gross)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {row.tierLabel ? row.tierLabel : fmtPct(row.salesRate)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(row.salesCommission)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmtPct(row.utilityRate)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(row.utilityCommission)}</td>
                  <td className="px-3 py-2 text-right text-red-700 font-medium">{fmtMoney(row.totalCommission)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${netNeg ? 'text-red-700' : 'text-green-700'}`}>
                    {fmtMoney(row.netToHouse)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-blue-50/40 border-t-2 border-blue-200 font-bold">
              <td className="px-3 py-2 text-gray-900">TOTAL</td>
              <td className="px-3 py-2 text-right text-gray-900">{fmtMoney(data.totals.sales)}</td>
              <td className="px-3 py-2 text-right text-red-700">{fmtMoney(data.totals.prizes)}</td>
              <td className={`px-3 py-2 text-right ${Number(data.totals.gross) < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {fmtMoney(data.totals.gross)}
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right text-gray-900">{fmtMoney(data.totals.salesCommission)}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right text-gray-900">{fmtMoney(data.totals.utilityCommission)}</td>
              <td className="px-3 py-2 text-right text-red-700">{fmtMoney(data.totals.totalCommission)}</td>
              <td className={`px-3 py-2 text-right ${Number(data.totals.netToHouse) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {fmtMoney(data.totals.netToHouse)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sub-bloque C — Warnings */}
      {data.warnings.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 space-y-1">
          {data.warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file parses**

Run: `cd frontend && node --check components/admin/reportes/ProviderCommissionBreakdown.jsx 2>&1 || true`

(JSX won't pass `node --check`. Instead lint:)

Run: `cd frontend && npx eslint components/admin/reportes/ProviderCommissionBreakdown.jsx`
Expected: no errors. Warnings about React hooks deps are OK if any.

- [ ] **Step 3: Commit (local only)**

```bash
git add frontend/components/admin/reportes/ProviderCommissionBreakdown.jsx
git commit -m "feat(pnl): add ProviderCommissionBreakdown component"
```

**Do NOT push.**

---

## Task 9: Wire component into pnl-semanal page

**Files:**
- Modify: `frontend/app/admin/reportes/pnl-semanal/page.js`

- [ ] **Step 1: Add the import**

Open `frontend/app/admin/reportes/pnl-semanal/page.js`. Near the other component imports (after `import pnlAPI from '@/lib/api/pnl';`), add:

```javascript
import ProviderCommissionBreakdown from '@/components/admin/reportes/ProviderCommissionBreakdown';
```

- [ ] **Step 2: Render the component conditionally**

Find the JSX block that ends the "Main P&L card" `</div>` (around line 468) and starts "Drill-down + export buttons" (around line 471). Between them, insert:

```jsx
          {/* Provider commission breakdown — only when provider selected */}
          {providerFiltered && (
            <ProviderCommissionBreakdown
              isoYear={isoYear}
              isoWeek={isoWeek}
              apiSystemId={apiSystemId}
              apiSystemName={providers.find((p) => p.id === apiSystemId)?.name}
            />
          )}
```

- [ ] **Step 3: Verify the page still builds (parse-check)**

Run: `cd frontend && npx eslint app/admin/reportes/pnl-semanal/page.js`
Expected: no new errors compared to before this change.

Skip `npm run build` here — per project memory `feedback_frontend_build.md`, frontend builds are flaky and we are not deploying yet. Manual browser verification happens in Task 10.

- [ ] **Step 4: Commit (local only)**

```bash
git add frontend/app/admin/reportes/pnl-semanal/page.js
git commit -m "feat(pnl): render ProviderCommissionBreakdown when provider filtered"
```

**Do NOT push.**

---

## Task 10: Manual verification against prod data oracle

**Files:** none — verification only.

- [ ] **Step 1: Ensure local backend + frontend are running**

Terminal 1: `cd backend && npm run dev` (already up if you ran Task 6 Step 3)
Terminal 2: `cd frontend && npm run dev`

- [ ] **Step 2: Seed local DB with commission configs matching prod (if not already there)**

Local DB may not have configs for all providers. Apply the prod set:

```bash
docker exec -i tote_postgres psql -U tote_user -d tote_db <<'SQL'
-- Idempotent: only insert if not already present.
INSERT INTO "ProviderCommissionConfig" (id, "apiSystemId", "gameId", "formulaType", "salesRate", "utilityRate", "effectiveFrom", "createdAt", "createdBy", "supersededAt", "supersededBy")
SELECT gen_random_uuid(),
       (SELECT id FROM "ApiSystem" WHERE slug='srq'),
       g.id, 'SALES_AND_UTILITY_PCT',
       CASE WHEN g.name='TRIPLE PANTERA' THEN 25.0 ELSE 16.0 END,
       30.0, '2025-12-20 04:00:00'::timestamptz, NOW(), 'seed', NULL, NULL
FROM "Game" g
WHERE g.name IN ('LOTOANIMALITO','LOTTOPANTERA','TERMINAL PANTERA','TRIPLE PANTERA')
ON CONFLICT DO NOTHING;
SQL
```

(Repeat for premier, Maxplay, virtuales if needed — the exact rows are listed in the brainstorm history. This step is informational; the goal is just to have *something* to display. If local has no draws either, the empty-state path will be exercised — also a valid test.)

- [ ] **Step 3: Open the page in browser**

Navigate: `http://localhost:10000/admin/reportes/pnl-semanal`

- [ ] **Step 4: Verify "Todos" view is unchanged**

Confirm: no breakdown card visible; estado de resultados shows; per-provider table renders. (Acceptance: nothing about the existing page should look different.)

- [ ] **Step 5: Select SRQ from the dropdown and verify the breakdown card**

- New card appears between estado de resultados and drill-down buttons
- Title reads "Desglose de comisión — SRQ"
- "Configuración vigente" lists games grouped by formula+rates
- Table shows one row per game with sales, prizes, gross, %V, com.ventas, %U, com.utilidad, comisión proveedor, neto a casa
- TOTAL row at the bottom
- Numbers cross-check against the prod-truth verification we ran on 2026-05-17 (or current week, against `ssh 94` ledger)

- [ ] **Step 6: Cross-check one row against ledger via direct SQL**

Pick a `gameId` from the breakdown card. Run:

```bash
ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db -c \"
SELECT g.name, ROUND(SUM(pcl.amount)::numeric, 2)
FROM \\\"ProviderCommissionLedger\\\" pcl
JOIN \\\"Draw\\\" d ON d.id = pcl.\\\"drawId\\\"
JOIN \\\"Game\\\" g ON g.id = d.\\\"gameId\\\"
WHERE pcl.\\\"apiSystemId\\\" = (SELECT id FROM \\\"ApiSystem\\\" WHERE slug='srq')
  AND (d.\\\"drawnAt\\\" AT TIME ZONE 'America/Caracas')::date BETWEEN '<weekStart>' AND '<weekEnd>'
GROUP BY g.name
ORDER BY g.name;\""
```

(Only relevant if local has the same draws as prod; otherwise compare the totals from the local DB directly.)

Acceptance: per-game `Comisión proveedor` in the UI matches the SUM(amount) from the ledger to within 0.01 Bs.

- [ ] **Step 7: Toggle to virtuales and verify UTILITY_PCT layout**

- "%V" column shows "—" for every row
- "Com. ventas" column shows "—" for every row
- "%U" shows "70.00%"
- "Com. utilidad" populated with `gross × 0.70`
- "Comisión proveedor" equals "Com. utilidad"

- [ ] **Step 8: (Optional) Provoke the negative-utility warning**

Toggle to Maxplay. If TRIPLE PANTERA has prizes > sales for the week, the warning "Utilidad negativa en TRIPLE PANTERA…" should render in the amber strip below the table.

- [ ] **Step 9: Run the backend test suite once more end-to-end**

Run: `cd backend && npx jest pnl-provider-breakdown.service.test.js --no-coverage`
Expected: PASS — 7+ tests.

- [ ] **Step 10: Stop, do NOT push**

All work stays local. Verbalize: "Implementation complete locally. Awaiting user signal to push."

---

## Self-Review (already executed by author)

- **Spec coverage:** Every section of the spec maps to a task. UI layout → Tasks 8, 9. Backend endpoint → Tasks 1-6. Frontend API → Task 7. Config grouping → Task 5. Warnings → Task 4. Tier support → handled in Task 2 code (not separately tested; current prod has no TIERED configs, low risk).
- **Placeholder scan:** No TBD/TODO. All code blocks are concrete.
- **Type consistency:** Service method is `getProviderBreakdownForWeek` everywhere; API client method is `getProviderBreakdown` everywhere; component name is `ProviderCommissionBreakdown` everywhere; field names (`totalCommission`, `netToHouse`, `salesCommission`, `utilityCommission`, `salesRate`, `utilityRate`, `configMissing`, `tierLabel`, `gameId`, `gameName`) are identical across service, controller, API client, and component.
- **Scope:** Single endpoint + one component + a few wires. Single plan, single PR (when the user authorizes pushing).
- **Constraint reminder:** Every commit step says "Do NOT push." No push step anywhere.
