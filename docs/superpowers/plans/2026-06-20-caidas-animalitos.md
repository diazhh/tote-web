# Caídas de animalitos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar las "caídas" (animales relacionados al ganador del sorteo anterior) en el monitor del front (marca en la tabla de números) y en el mensaje de Telegram de preselección, enriquecidas con tiempo sin salir, venta, premio, utilidad y riesgo.

**Architecture:** Tabla estática curada (`backend/src/data/caidas.js`) → servicio único (`backend/src/services/caida.service.js`) que resuelve el ganador del sorteo previo del día y enriquece sus caídas con métricas de la venta actual → consumido por (a) el bloque de Telegram en `admin-notification.service.js` y (b) un endpoint `GET /api/monitor/caidas/:drawId` que el monitor usa para marcar filas.

**Tech Stack:** Node.js ESM, Express, Prisma, Jest (ESM `unstable_mockModule`), Next.js 14 (App Router), React, Tailwind.

## Global Constraints

- Backend es ES modules (`import`/`export`), Prisma singleton desde `lib/prisma.js`.
- Solo aplica a `lotoanimalito` (0-36) y `lottopantera` (0-48). Triple/Terminal Pantera → el servicio devuelve `null`, nada se rompe.
- "Sorteo anterior" = mismo juego, **mismo `drawDate`**, `drawTime` menor, con `winnerItemId` no nulo, el más reciente. El primer sorteo del día no tiene caída.
- Métricas de venta = sobre el **sorteo actual**. Riesgo = exposición financiera (premio potencial vs `maxPayout`).
- Umbrales de riesgo sobre `maxPayout`: `ALTO` ≥ maxPayout · `MEDIO` ≥ 50% · `BAJO` < 50% (y `BAJO` si premioPotencial ≤ 0).
- `maxPayout` se calcula igual que `prewinner-selection.service.js`: `maxPayoutFixed` si > 0, si no `totalSales * percentageToDistribute/100` (default 70), acotado a `totalSales`.
- **No hacer push ni deploy** hasta autorización explícita del usuario. Commits locales en una rama de feature.
- Spec de referencia: `docs/superpowers/specs/2026-06-20-caidas-animalitos-design.md`.

---

## File Structure

- **Create** `backend/src/data/caidas.js` — tabla estática (edge list → mapas dirigidos por juego), `getCaidas(slug, number)`, `hasCaidas(slug)`.
- **Create** `backend/src/data/__tests__/caidas.test.js` — reciprocidad, espejos, grado, filtrado animalito.
- **Create** `backend/src/services/caida.service.js` — `getCaidasForDraw(drawId)`.
- **Create** `backend/src/services/__tests__/caida.service.test.js`.
- **Modify** `backend/src/controllers/monitor.controller.js` — método `getCaidas`.
- **Modify** `backend/src/routes/monitor.routes.js` — ruta `GET /caidas/:drawId`.
- **Modify** `backend/src/services/prewinner-selection.service.js` — calcular caídas y pasarlas a la notificación.
- **Modify** `backend/src/services/admin-notification.service.js` — render del bloque de caídas.
- **Create** `backend/src/services/__tests__/admin-notification.caidas.test.js` — render con/sin caídas.
- **Modify** `frontend/lib/api/monitor.js` — `getCaidas(drawId)`.
- **Modify** `frontend/app/admin/monitor/page.js` — fetch + leyenda + marca 🔮 en filas.

---

## Task 1: Módulo de datos de caídas

**Files:**
- Create: `backend/src/data/caidas.js`
- Test: `backend/src/data/__tests__/caidas.test.js`

**Interfaces:**
- Produces:
  - `getCaidas(gameSlug: string, number: string): Array<{number: string, name: string, reason: string}>` (vacío si no hay)
  - `hasCaidas(gameSlug: string): boolean`
  - `CAIDAS: { lottopantera: Map, lotoanimalito: Map }` (export para tests)

- [ ] **Step 1: Write the failing test**

Create `backend/src/data/__tests__/caidas.test.js`:

```js
import { describe, test, expect } from '@jest/globals';
import { getCaidas, hasCaidas, CAIDAS } from '../caidas.js';

const NUMS = (arr) => arr.map((c) => c.number);

describe('caidas data module', () => {
  test('hasCaidas only for animalito games', () => {
    expect(hasCaidas('lotoanimalito')).toBe(true);
    expect(hasCaidas('lottopantera')).toBe(true);
    expect(hasCaidas('triple-pantera')).toBe(false);
    expect(hasCaidas('terminal-pantera')).toBe(false);
  });

  test('reciprocity is 100% in both tables', () => {
    for (const slug of ['lotoanimalito', 'lottopantera']) {
      const map = CAIDAS[slug];
      for (const [a, list] of map) {
        for (const c of list) {
          const back = map.get(c.number) || [];
          expect(NUMS(back)).toContain(a);
        }
      }
    }
  });

  test('mirror numbers are present when both exist', () => {
    // 03<->30, 12<->21, 13<->31 in animalito
    expect(NUMS(getCaidas('lotoanimalito', '03'))).toContain('30');
    expect(NUMS(getCaidas('lotoanimalito', '30'))).toContain('03');
    expect(NUMS(getCaidas('lotoanimalito', '12'))).toContain('21');
    expect(NUMS(getCaidas('lotoanimalito', '13'))).toContain('31');
    // 04<->40 only in pantera (40 doesn't exist in animalito)
    expect(NUMS(getCaidas('lottopantera', '04'))).toContain('40');
    expect(NUMS(getCaidas('lottopantera', '40'))).toContain('04');
  });

  test('reciprocal affinity: perro<->gato', () => {
    expect(NUMS(getCaidas('lotoanimalito', '27'))).toContain('11');
    expect(NUMS(getCaidas('lotoanimalito', '11'))).toContain('27');
  });

  test('degree within range and no orphans', () => {
    for (const [slug, min] of [['lottopantera', 5], ['lotoanimalito', 4]]) {
      const map = CAIDAS[slug];
      for (const [n, list] of map) {
        expect(list.length).toBeGreaterThanOrEqual(min);
        expect(list.length).toBeLessThanOrEqual(7);
      }
    }
  });

  test('animalito never references pantera-only animals (37-48)', () => {
    for (const [, list] of CAIDAS.lotoanimalito) {
      for (const c of list) {
        const n = parseInt(c.number, 10);
        expect(n).toBeLessThanOrEqual(36);
      }
    }
  });

  test('every caida carries number, name and reason', () => {
    const c = getCaidas('lottopantera', '13')[0];
    expect(c).toHaveProperty('number');
    expect(c).toHaveProperty('name');
    expect(c).toHaveProperty('reason');
  });

  test('unknown game returns empty', () => {
    expect(getCaidas('triple-pantera', '00')).toEqual([]);
    expect(getCaidas('lotoanimalito', '99')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/data/__tests__/caidas.test.js`
Expected: FAIL — `Cannot find module '../caidas.js'`.

- [ ] **Step 3: Write the data module**

Create `backend/src/data/caidas.js`:

```js
/**
 * Tabla estática de "caídas" de animalitos (folklore curado).
 * Fuente = aristas no dirigidas con un criterio (reason); se simetrizan al
 * construir los mapas → reciprocidad garantizada por construcción.
 * Ver docs/superpowers/specs/2026-06-20-caidas-animalitos-design.md
 */

const NAMES = {
  '0':'DELFÍN','00':'BALLENA','01':'CARNERO','02':'TORO','03':'CIEMPIES','04':'ALACRÁN',
  '05':'LEÓN','06':'RANA','07':'PERICO','08':'RATÓN','09':'ÁGUILA','10':'TIGRE',
  '11':'GATO','12':'CABALLO','13':'MONO','14':'PALOMA','15':'ZORRO','16':'OSO',
  '17':'PAVO','18':'BURRO','19':'CHIVO','20':'COCHINO','21':'GALLO','22':'CAMELLO',
  '23':'CEBRA','24':'IGUANA','25':'GALLINA','26':'VACA','27':'PERRO','28':'ZAMURO',
  '29':'ELEFANTE','30':'CAIMÁN','31':'LAPA','32':'ARDILLA','33':'PESCADO','34':'VENADO',
  '35':'JIRAFA','36':'CULEBRA','37':'CHIGÜIRE','38':'TURPIAL','39':'ARAÑA','40':'PANTERA',
  '41':'CONEJO','42':'GUACAMAYA','43':'TORTUGA','44':'BÚHO','45':'PATO','46':'TIBURÓN',
  '47':'CANGREJO','48':'TUCÁN',
};

const ORDER = Object.keys(NAMES);

// Aristas base (válidas para pantera; animalito = base filtrada a 0-36)
const EDGES = [
  // espejo numérico
  ['01','10','espejo'],['02','20','espejo'],['03','30','espejo'],['04','40','espejo'],
  ['12','21','espejo'],['13','31','espejo'],['14','41','espejo'],['23','32','espejo'],
  ['24','42','espejo'],['34','43','espejo'],
  // acuáticos
  ['0','00','familia:acuáticos'],['0','33','familia:acuáticos'],['0','46','familia:acuáticos'],
  ['0','43','familia:acuáticos'],['0','47','familia:acuáticos'],
  ['00','33','familia:acuáticos'],['00','46','familia:acuáticos'],['00','47','familia:acuáticos'],
  ['33','46','familia:acuáticos'],['33','47','familia:acuáticos'],['33','06','familia:acuáticos'],['33','45','familia:acuáticos'],
  ['46','47','familia:acuáticos'],['46','30','afinidad:agua'],
  ['47','43','familia:acuáticos'],
  ['43','24','familia:reptiles'],['43','30','afinidad:agua'],
  ['06','36','depredador'],['06','24','afinidad:agua'],['06','30','afinidad:agua'],['06','45','afinidad:agua'],
  ['45','25','familia:aves'],['45','21','familia:aves'],['45','48','familia:aves'],
  // aves
  ['09','07','familia:aves'],['09','42','familia:aves'],['09','44','familia:aves'],['09','48','familia:aves'],['09','14','familia:aves'],['09','28','familia:aves'],
  ['07','42','familia:aves'],['07','48','familia:aves'],['07','21','familia:aves'],['07','17','familia:aves'],['07','38','familia:aves'],
  ['14','25','familia:aves'],['14','38','familia:aves'],['14','11','depredador'],['14','28','familia:aves'],
  ['21','25','familia:aves'],['21','15','depredador'],
  ['25','17','familia:aves'],['25','15','depredador'],['25','27','depredador'],
  ['17','42','familia:aves'],['17','48','familia:aves'],['17','28','familia:aves'],
  ['28','44','familia:aves'],['28','38','familia:aves'],
  ['38','42','familia:aves'],['38','48','familia:aves'],
  ['42','48','familia:aves'],
  ['44','08','depredador'],['44','39','depredador'],['44','48','familia:aves'],
  // felinos
  ['05','10','familia:felinos'],['05','11','familia:felinos'],['05','40','familia:felinos'],['05','34','depredador'],['05','23','depredador'],
  ['10','11','familia:felinos'],['10','40','familia:felinos'],['10','23','depredador'],['10','34','depredador'],
  ['11','27','recíproco'],['11','08','depredador'],
  ['40','34','depredador'],
  // roedores / pequeños
  ['08','36','depredador'],['08','32','familia:roedores'],['08','37','familia:roedores'],['08','41','familia:roedores'],
  ['32','37','familia:roedores'],['32','39','afinidad'],['32','41','familia:roedores'],
  ['31','37','familia:roedores'],['31','41','familia:roedores'],['31','16','afinidad'],['31','34','afinidad'],
  ['37','41','familia:roedores'],['37','30','afinidad:agua'],
  ['41','27','depredador'],['41','15','depredador'],
  // bichos / artrópodos
  ['03','04','familia:bichos'],['03','39','familia:bichos'],['03','36','afinidad:rastreros'],['03','24','afinidad:rastreros'],
  ['04','39','familia:bichos'],['04','36','afinidad:rastreros'],['04','24','afinidad:rastreros'],
  ['39','36','afinidad:rastreros'],
  // reptiles
  ['36','24','familia:reptiles'],['36','30','familia:reptiles'],
  ['24','30','familia:reptiles'],
  // ganado / corral
  ['02','26','familia:ganado'],['02','12','familia:ganado'],['02','18','familia:ganado'],['02','01','familia:ganado'],
  ['26','12','familia:ganado'],['26','18','familia:ganado'],['26','19','familia:ganado'],['26','01','familia:ganado'],
  ['12','18','familia:ganado'],['12','23','familia:ganado'],
  ['18','22','familia:ganado'],['18','01','familia:ganado'],
  ['01','19','familia:ganado'],
  ['19','22','afinidad'],['19','16','afinidad'],['19','34','afinidad'],
  ['20','22','familia:ganado'],['20','37','afinidad'],['20','26','familia:ganado'],['20','01','familia:ganado'],
  ['22','29','familia:safari'],['22','35','familia:safari'],['22','23','familia:safari'],
  ['27','15','familia:cánidos'],['27','25','depredador'],['27','08','depredador'],
  // salvajes / monte
  ['16','33','depredador'],['16','13','familia:monte'],['16','29','familia:monte'],
  ['13','32','afinidad'],['13','35','familia:monte'],['13','29','familia:monte'],
  ['29','35','familia:safari'],['29','23','familia:safari'],
  ['35','23','familia:safari'],['35','34','familia:safari'],
  // balance de grado
  ['15','45','depredador'],['40','11','familia:felinos'],['00','43','familia:acuáticos'],
];

// Suplementos SOLO-animalito (dentro de 0-36) para rellenar nodos que perdían
// caídas al quitar los animales 37-48 de pantera.
const ANIMALITO_EXTRA = [
  ['0','30','afinidad:agua'],['0','06','afinidad:agua'],['0','24','afinidad:agua'],
  ['00','30','afinidad:agua'],['00','06','afinidad:agua'],
  ['15','17','depredador'],['15','08','depredador'],
  ['17','21','familia:aves'],
  ['28','25','familia:aves'],['28','21','familia:aves'],
  ['31','32','familia:roedores'],['31','08','familia:roedores'],
  ['32','16','afinidad'],
  ['04','30','afinidad:rastreros'],
  ['07','14','familia:aves'],
  ['09','25','depredador'],['09','21','familia:aves'],
];

function buildMap(edges) {
  const m = new Map();
  const add = (a, b, r) => {
    if (!m.has(a)) m.set(a, []);
    if (!m.get(a).some((x) => x.number === b)) {
      m.get(a).push({ number: b, name: NAMES[b], reason: r });
    }
  };
  for (const [a, b, r] of edges) { add(a, b, r); add(b, a, r); }
  for (const list of m.values()) {
    list.sort((x, y) => ORDER.indexOf(x.number) - ORDER.indexOf(y.number));
  }
  return m;
}

const isAnimalito = (n) => n === '0' || n === '00' || (parseInt(n, 10) >= 1 && parseInt(n, 10) <= 36);

export const CAIDAS = {
  lottopantera: buildMap(EDGES),
  lotoanimalito: buildMap([
    ...EDGES.filter(([a, b]) => isAnimalito(a) && isAnimalito(b)),
    ...ANIMALITO_EXTRA,
  ]),
};

export function hasCaidas(gameSlug) {
  return Object.prototype.hasOwnProperty.call(CAIDAS, gameSlug);
}

export function getCaidas(gameSlug, number) {
  const map = CAIDAS[gameSlug];
  if (!map) return [];
  return map.get(number) || [];
}

export default { CAIDAS, hasCaidas, getCaidas };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/data/__tests__/caidas.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/data/caidas.js backend/src/data/__tests__/caidas.test.js
git commit -m "feat(caidas): tabla estática de caídas de animalitos (data module)"
```

---

## Task 2: Servicio `caida.service.js`

**Files:**
- Create: `backend/src/services/caida.service.js`
- Test: `backend/src/services/__tests__/caida.service.test.js`

**Interfaces:**
- Consumes: `getCaidas`, `hasCaidas` (Task 1); `prisma` singleton; `loadDrawTicketDetails`, `sumDetailsAmount` from `lib/drawDetailsLoader.js`.
- Produces: `getCaidasForDraw(drawId: string): Promise<CaidaResult | null>` where
  ```
  CaidaResult = {
    game: string,
    previousDraw: { id, drawTime, winner: { number, name } },
    caidas: Array<{ number, name, reason, sorteosSinSalir: number|null,
      diasSinSalir: number|null, ventaActual: number, premioPotencial: number,
      utilidadSobreVenta: number, riesgo: 'ALTO'|'MEDIO'|'BAJO' }>,
    preselectedEnCaidas: boolean
  }
  ```
  `sorteosSinSalir`/`diasSinSalir` son `null` si el animal nunca ha ganado.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/caida.service.test.js`:

```js
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  gameItem: { findMany: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../lib/drawDetailsLoader.js', () => ({
  loadDrawTicketDetails: jest.fn(),
  sumDetailsAmount: (details) => details.reduce((s, d) => s + parseFloat(d.amount), 0),
}));

let getCaidasForDraw, loadDrawTicketDetails;

beforeAll(async () => {
  ({ loadDrawTicketDetails } = await import('../../lib/drawDetailsLoader.js'));
  ({ getCaidasForDraw } = await import('../caida.service.js'));
});
beforeEach(() => jest.clearAllMocks());

const baseDraw = {
  id: 'd2', gameId: 'g1', drawDate: new Date('2026-06-20T00:00:00Z'),
  drawTime: '13:00:00', preselectedItemId: 'it31', winnerItemId: null,
  game: { slug: 'lotoanimalito', config: { percentageToDistribute: 70 } },
};

test('returns null for game without caidas table', async () => {
  mockPrisma.draw.findUnique.mockResolvedValue({ ...baseDraw, game: { slug: 'triple-pantera', config: {} } });
  expect(await getCaidasForDraw('d2')).toBeNull();
});

test('returns null when there is no previous draw the same day', async () => {
  mockPrisma.draw.findUnique.mockResolvedValue(baseDraw);
  mockPrisma.draw.findFirst.mockResolvedValue(null); // no previous winner today
  expect(await getCaidasForDraw('d2')).toBeNull();
});

test('builds enriched caidas from previous winner (MONO 13) and flags preselected', async () => {
  mockPrisma.draw.findUnique.mockResolvedValue(baseDraw);
  // previous draw winner = MONO (13)
  mockPrisma.draw.findFirst.mockResolvedValue({
    id: 'd1', drawTime: '12:00:00', winnerItem: { number: '13', name: 'MONO' },
  });
  // caidas of 13 (animalito) include 31 (LAPA) which is the preselected
  // gameItems for caida numbers + the preselected item
  mockPrisma.gameItem.findMany.mockResolvedValue([
    { id: 'it31', number: '31', name: 'LAPA', multiplier: '30' },
    { id: 'it16', number: '16', name: 'OSO', multiplier: '30' },
    { id: 'it29', number: '29', name: 'ELEFANTE', multiplier: '30' },
    { id: 'it32', number: '32', name: 'ARDILLA', multiplier: '30' },
    { id: 'it35', number: '35', name: 'JIRAFA', multiplier: '30' },
    { id: 'it08', number: '08', name: 'RATÓN', multiplier: '30' },
  ]);
  // current-draw details: 100 bet on LAPA (31), 10 on OSO (16)
  loadDrawTicketDetails.mockResolvedValue([
    { gameItemId: 'it31', amount: '100' },
    { gameItemId: 'it16', amount: '10' },
  ]);
  // executed draws before current (for tiempo sin salir): LAPA won 1 draw ago
  mockPrisma.draw.findMany.mockResolvedValue([
    { winnerItemId: 'it31', drawDate: new Date('2026-06-20T00:00:00Z'), drawTime: '12:00:00' },
    { winnerItemId: 'it99', drawDate: new Date('2026-06-19T00:00:00Z'), drawTime: '20:00:00' },
  ]);

  const res = await getCaidasForDraw('d2');
  expect(res.game).toBe('lotoanimalito');
  expect(res.previousDraw.winner.number).toBe('13');
  expect(res.preselectedEnCaidas).toBe(true); // 31 is a caida of 13
  const lapa = res.caidas.find((c) => c.number === '31');
  expect(lapa.ventaActual).toBe(100);
  expect(lapa.premioPotencial).toBe(3000); // 100 * 30
  expect(lapa.sorteosSinSalir).toBe(0);     // won the immediately previous executed draw
  // totalSales = 110, maxPayout = 77 -> premio 3000 >= maxPayout -> ALTO
  expect(lapa.riesgo).toBe('ALTO');
  const oso = res.caidas.find((c) => c.number === '16');
  expect(oso.sorteosSinSalir).toBeNull(); // never won in the executed list
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/services/__tests__/caida.service.test.js`
Expected: FAIL — `Cannot find module '../caida.service.js'`.

- [ ] **Step 3: Write the service**

Create `backend/src/services/caida.service.js`:

```js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getCaidas, hasCaidas } from '../data/caidas.js';
import { loadDrawTicketDetails, sumDetailsAmount } from '../lib/drawDetailsLoader.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function computeMaxPayout(config, totalSales) {
  const pct = config?.percentageToDistribute || 70;
  let maxPayout = config?.maxPayoutFixed && config.maxPayoutFixed > 0
    ? parseFloat(config.maxPayoutFixed)
    : (totalSales * pct) / 100;
  return Math.min(maxPayout, totalSales);
}

function riskOf(premioPotencial, maxPayout) {
  if (premioPotencial <= 0 || maxPayout <= 0) return 'BAJO';
  if (premioPotencial >= maxPayout) return 'ALTO';
  if (premioPotencial >= maxPayout * 0.5) return 'MEDIO';
  return 'BAJO';
}

/**
 * Caídas enriquecidas para un sorteo, según el ganador del sorteo anterior del
 * mismo día. Devuelve null si el juego no tiene tabla o no hay sorteo previo.
 */
async function getCaidasForDraw(drawId) {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: {
        id: true, gameId: true, drawDate: true, drawTime: true,
        preselectedItemId: true, winnerItemId: true,
        game: { select: { slug: true, config: true } },
      },
    });
    if (!draw || !hasCaidas(draw.game.slug)) return null;

    // Ganador del sorteo anterior del MISMO día
    const prev = await prisma.draw.findFirst({
      where: {
        gameId: draw.gameId,
        drawDate: draw.drawDate,
        drawTime: { lt: draw.drawTime },
        winnerItemId: { not: null },
      },
      orderBy: { drawTime: 'desc' },
      select: { id: true, drawTime: true, winnerItem: { select: { number: true, name: true } } },
    });
    if (!prev || !prev.winnerItem) return null;

    const caidaDefs = getCaidas(draw.game.slug, prev.winnerItem.number);
    if (caidaDefs.length === 0) return null;
    const caidaNumbers = caidaDefs.map((c) => c.number);

    // GameItems de las caídas (id + multiplier)
    const items = await prisma.gameItem.findMany({
      where: { gameId: draw.gameId, number: { in: caidaNumbers } },
      select: { id: true, number: true, name: true, multiplier: true },
    });
    const itemByNumber = new Map(items.map((i) => [i.number, i]));

    // Ventas del sorteo ACTUAL
    const details = await loadDrawTicketDetails(drawId, { ticketSelect: { id: true } });
    const totalSales = sumDetailsAmount(details);
    const salesByItemId = new Map();
    for (const d of details) {
      salesByItemId.set(d.gameItemId, (salesByItemId.get(d.gameItemId) || 0) + parseFloat(d.amount));
    }
    const maxPayout = computeMaxPayout(draw.game.config, totalSales);

    // Histórico para "tiempo sin salir": sorteos ejecutados antes del actual
    const executed = await prisma.draw.findMany({
      where: {
        gameId: draw.gameId,
        winnerItemId: { not: null },
        OR: [
          { drawDate: { lt: draw.drawDate } },
          { drawDate: draw.drawDate, drawTime: { lt: draw.drawTime } },
        ],
      },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
      select: { winnerItemId: true, drawDate: true },
    });

    const caidas = caidaDefs.map((def) => {
      const item = itemByNumber.get(def.number);
      const multiplier = item ? parseFloat(item.multiplier) : 0;
      const ventaActual = item ? (salesByItemId.get(item.id) || 0) : 0;
      const premioPotencial = ventaActual * multiplier;
      const utilidadSobreVenta = totalSales > 0
        ? ((totalSales - premioPotencial) / totalSales) * 100
        : 100;

      let sorteosSinSalir = null;
      let diasSinSalir = null;
      if (item) {
        const idx = executed.findIndex((e) => e.winnerItemId === item.id);
        if (idx >= 0) {
          sorteosSinSalir = idx; // 0 = ganó el sorteo inmediato anterior
          diasSinSalir = Math.round((draw.drawDate - executed[idx].drawDate) / DAY_MS);
        }
      }

      return {
        number: def.number,
        name: def.name,
        reason: def.reason,
        sorteosSinSalir,
        diasSinSalir,
        ventaActual,
        premioPotencial,
        utilidadSobreVenta,
        riesgo: riskOf(premioPotencial, maxPayout),
      };
    });

    // Número objetivo (ganador si existe, si no el preseleccionado). Se busca
    // primero en los items ya cargados (las caídas); solo si no está ahí se
    // hace una query puntual. Así el caso común (coincide con una caída) no
    // requiere query extra.
    const resolveNumber = async (id) => {
      if (!id) return null;
      const inItems = items.find((i) => i.id === id);
      if (inItems) return inItems.number;
      const gi = await prisma.gameItem.findUnique({ where: { id }, select: { number: true } });
      return gi?.number || null;
    };
    const targetNumber = await resolveNumber(draw.winnerItemId);
    const preselNumber = await resolveNumber(draw.preselectedItemId);
    const preselectedEnCaidas = caidaNumbers.includes(targetNumber) || caidaNumbers.includes(preselNumber);

    return {
      game: draw.game.slug,
      previousDraw: { id: prev.id, drawTime: prev.drawTime, winner: prev.winnerItem },
      caidas,
      preselectedEnCaidas,
    };
  } catch (error) {
    logger.error(`Error en getCaidasForDraw(${drawId}): ${error.message}`);
    return null;
  }
}

export { getCaidasForDraw };
export default { getCaidasForDraw };
```

> Nota: el test mockea `gameItem.findMany` para devolver también el item preseleccionado (`it31`), por lo que `items.find(... preselectedItemId)` lo resuelve sin la query extra `findUnique`. La query `findUnique` solo corre en producción cuando el preseleccionado NO es una caída.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/services/__tests__/caida.service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/caida.service.js backend/src/services/__tests__/caida.service.test.js
git commit -m "feat(caidas): servicio getCaidasForDraw con métricas y riesgo"
```

---

## Task 3: Endpoint del monitor

**Files:**
- Modify: `backend/src/controllers/monitor.controller.js`
- Modify: `backend/src/routes/monitor.routes.js`

**Interfaces:**
- Consumes: `getCaidasForDraw` (Task 2).
- Produces: `GET /api/monitor/caidas/:drawId` → `{ success: true, data: CaidaResult | null }`.

- [ ] **Step 1: Add the controller method**

In `backend/src/controllers/monitor.controller.js`, add the import at the top (junto a los demás imports de servicios):

```js
import caidaService from '../services/caida.service.js';
```

Add this method to the controller object (junto a `getItemStats`):

```js
  async getCaidas(req, res) {
    try {
      const { drawId } = req.params;
      const data = await caidaService.getCaidasForDraw(drawId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error en getCaidas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
```

> Si el controlador es un objeto literal exportado, agregar la coma; si es una clase, declarar `async getCaidas(req, res) { ... }` como método. Seguir el estilo existente de `getItemStats` en el mismo archivo.

- [ ] **Step 2: Add the route**

In `backend/src/routes/monitor.routes.js`, add after the items routes (antes de las rutas de tickets para evitar colisiones de path):

```js
// Caídas del ganador del sorteo anterior (marca en la tabla de números)
router.get('/caidas/:drawId', monitorController.getCaidas);
```

- [ ] **Step 3: Verify it loads and responds**

Run (con backend local levantado, `npm run dev`, y un drawId real local):

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/monitor/caidas/<drawId> | head -c 400
```

Expected: JSON `{"success":true,"data": ... }` (objeto con `caidas` o `null` si es el primer sorteo del día). Sin error 500.

Alternativa sin token (verificación de carga del módulo): `cd backend && node --check src/controllers/monitor.controller.js && node --check src/routes/monitor.routes.js` → sin errores de sintaxis.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/monitor.controller.js backend/src/routes/monitor.routes.js
git commit -m "feat(caidas): endpoint GET /api/monitor/caidas/:drawId"
```

---

## Task 4: Bloque de caídas en Telegram

**Files:**
- Modify: `backend/src/services/prewinner-selection.service.js:158-175` (la llamada a `notifyPrewinnerSelected`)
- Modify: `backend/src/services/admin-notification.service.js`
- Test: `backend/src/services/__tests__/admin-notification.caidas.test.js`

**Interfaces:**
- Consumes: `getCaidasForDraw` (Task 2); `formatPrewinnerMessage` recibe nuevo campo `caidas` (el objeto `CaidaResult | null`).
- Produces: `formatCaidasBlock(caidaResult): string` (vacío si null).

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/admin-notification.caidas.test.js`:

```js
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../admin-telegram-bot.service.js', () => ({
  default: { notifyGameAdmins: jest.fn() },
}));

let service;
beforeAll(async () => { service = (await import('../admin-notification.service.js')).default; });
beforeEach(() => jest.clearAllMocks());

const caidaResult = {
  game: 'lotoanimalito',
  previousDraw: { drawTime: '12:00:00', winner: { number: '13', name: 'MONO' } },
  preselectedEnCaidas: true,
  caidas: [
    { number: '31', name: 'LAPA', reason: 'espejo', sorteosSinSalir: 0, diasSinSalir: 0, ventaActual: 100, premioPotencial: 3000, utilidadSobreVenta: -12, riesgo: 'ALTO' },
    { number: '08', name: 'RATÓN', reason: 'familia:roedores', sorteosSinSalir: 9, diasSinSalir: 2, ventaActual: 15, premioPotencial: 450, utilidadSobreVenta: 88, riesgo: 'BAJO' },
  ],
};

test('formatCaidasBlock renders previous winner, rows and risk', () => {
  const out = service.formatCaidasBlock(caidaResult);
  expect(out).toContain('MONO');
  expect(out).toContain('13');
  expect(out).toContain('31');
  expect(out).toContain('LAPA');
  expect(out).toContain('ALTO');
  expect(out).toContain('preseleccionado'); // marca de coincidencia
});

test('formatCaidasBlock returns empty string for null', () => {
  expect(service.formatCaidasBlock(null)).toBe('');
});

test('formatPrewinnerMessage includes caidas block when provided', () => {
  const msg = service.formatPrewinnerMessage({
    game: { name: 'LOTOANIMALITO', config: {} },
    drawDate: new Date('2026-06-20T00:00:00Z'),
    drawTime: '13:00:00',
    prewinnerItem: { number: '31', name: 'LAPA', multiplier: '30' },
    totalSales: 110, maxPayout: 77, potentialPayout: 3000,
    salesByItem: {}, tripletaRiskTop5: [],
    caidas: caidaResult,
  });
  expect(msg).toContain('Caídas del anterior');
  expect(msg).toContain('LAPA');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/services/__tests__/admin-notification.caidas.test.js`
Expected: FAIL — `service.formatCaidasBlock is not a function`.

- [ ] **Step 3: Implement the block and wire it into the message**

In `backend/src/services/admin-notification.service.js`, add the method to the class (junto a `formatSourceStatusBlock`):

```js
  /**
   * Bloque "Caídas del anterior" — caídas del ganador del sorteo previo del día,
   * con métricas de la venta actual. `caidaResult` = salida de caida.service o null.
   */
  formatCaidasBlock(caidaResult) {
    if (!caidaResult || !caidaResult.caidas?.length) return '';
    const prev = caidaResult.previousDraw.winner;
    const riskEmoji = { ALTO: '🔴', MEDIO: '🟡', BAJO: '🟢' };
    const fmtMoney = (n) => `$${Number(n).toFixed(2)}`;

    let block = `\n🔮 <b>Caídas del anterior — ${prev.name} (${prev.number}):</b>\n`;
    if (caidaResult.preselectedEnCaidas) {
      block += `   ✅ <i>El preseleccionado está entre las caídas</i>\n`;
    }
    for (const c of caidaResult.caidas) {
      const tiempo = c.sorteosSinSalir == null
        ? 'sin registro'
        : `${c.sorteosSinSalir} sorteos / ${c.diasSinSalir}d sin salir`;
      block += `▫️ ${c.number} ${c.name} · ${tiempo} · jugado ${fmtMoney(c.ventaActual)} · `
        + `premio ${fmtMoney(c.premioPotencial)} · util ${c.utilidadSobreVenta.toFixed(0)}% · `
        + `${riskEmoji[c.riesgo]} ${c.riesgo}\n`;
    }
    return block;
  }
```

Then destructure `caidas` and insert the block. Change the destructure in `formatPrewinnerMessage` to include `caidas`:

```js
    const {
      game,
      drawDate,
      drawTime,
      prewinnerItem,
      totalSales,
      maxPayout,
      potentialPayout,
      salesByItem,
      tripletaRiskTop5,
      sourceStatus,
      caidas,
    } = data;
```

And insert the block into the template, right after `${tripletaRiskStr}` and before `${this.formatSourceStatusBlock(sourceStatus)}`:

```js
${topItemsStr}${tripletaRiskStr}${this.formatCaidasBlock(caidas)}${this.formatSourceStatusBlock(sourceStatus)}
```

Also pass `caidas` through `notifyPrewinnerSelected`. In `notifyPrewinnerSelected`, add `caidas` to the destructure and to the `formatPrewinnerMessage(...)` call:

```js
    const {
      drawId, game, drawDate, drawTime, prewinnerItem, totalSales, maxPayout,
      potentialPayout, salesByItem, tripletaRiskTop5, isTerminal, terminalTickets,
      sourceStatus, caidas,
    } = data;
```

```js
        : this.formatPrewinnerMessage({
            game, drawDate, drawTime, prewinnerItem, totalSales,
            maxPayout, potentialPayout, salesByItem, tripletaRiskTop5, sourceStatus, caidas,
          });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/services/__tests__/admin-notification.caidas.test.js`
Expected: PASS.

- [ ] **Step 5: Compute caidas in prewinner-selection and pass them through**

In `backend/src/services/prewinner-selection.service.js`, add the import at the top:

```js
import { getCaidasForDraw } from './caida.service.js';
```

Right before the `adminNotificationService.notifyPrewinnerSelected({...})` call (currently ~line 158), compute the caídas:

```js
      // Caídas del ganador del sorteo anterior del día (folklore + exposición)
      let caidas = null;
      try {
        caidas = await getCaidasForDraw(drawId);
      } catch (caidaError) {
        logger.warn(`No se pudieron calcular caídas para ${drawId}: ${caidaError.message}`);
      }
```

Then add `caidas` to the object passed to `notifyPrewinnerSelected`:

```js
        await adminNotificationService.notifyPrewinnerSelected({
          drawId,
          game: draw.game,
          drawDate: draw.drawDate,
          drawTime: draw.drawTime,
          prewinnerItem: selectedItem,
          totalSales,
          maxPayout,
          potentialPayout,
          salesByItem: salesByItemForNotification,
          tripletaRiskTop5,
          optimizerMethod: result.method,
          optimizerAnalysis: analysisData,
          caidas,
        });
```

- [ ] **Step 6: Verify no regression in the existing prewinner flow**

Run: `cd backend && npm test -- src/services/__tests__/`
Expected: PASS (todos los tests de servicios, incluidos los previos, en verde).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/admin-notification.service.js backend/src/services/prewinner-selection.service.js backend/src/services/__tests__/admin-notification.caidas.test.js
git commit -m "feat(caidas): bloque de caídas en notificación Telegram de preselección"
```

---

## Task 5: Marca de caídas en el monitor (frontend)

**Files:**
- Modify: `frontend/lib/api/monitor.js`
- Modify: `frontend/app/admin/monitor/page.js`

**Interfaces:**
- Consumes: `GET /api/monitor/caidas/:drawId` (Task 3).
- Produces: `monitorApi.getCaidas(drawId)`; estado `caidaInfo` y `caidaByNumber` en el monitor.

> El frontend no tiene harness de tests unitarios; la verificación es manual con la app corriendo.

- [ ] **Step 1: Add the API client method**

In `frontend/lib/api/monitor.js`, add inside `monitorApi` (junto a `getItemStats`):

```js
  /**
   * Caídas del ganador del sorteo anterior (para marcar la tabla de números)
   */
  getCaidas: async (drawId) => {
    const response = await axios.get(`/monitor/caidas/${drawId}`);
    return response.data;
  },
```

- [ ] **Step 2: Fetch caidas when the selected draw changes**

In `frontend/app/admin/monitor/page.js`, add state near the other `useState` hooks (junto a `lastSeenData`, ~line 40):

```js
  const [caidaInfo, setCaidaInfo] = useState(null);
```

In the effect that loads stats for `selectedDraw` (el que llama a `monitorApi.getItemStats`, ~line 126-145), add a parallel fetch and store the result. Inside that effect's async body, after the existing fetches:

```js
        try {
          const caidaRes = await monitorApi.getCaidas(selectedDraw);
          setCaidaInfo(caidaRes?.data || null);
        } catch {
          setCaidaInfo(null);
        }
```

- [ ] **Step 3: Derive a lookup map**

Near `currentDraw` / `filteredSortedItems` (~line 248), add:

```js
  const caidaByNumber = useMemo(() => {
    const m = new Map();
    if (caidaInfo?.caidas) for (const c of caidaInfo.caidas) m.set(c.number, c);
    return m;
  }, [caidaInfo]);
```

- [ ] **Step 4: Render the legend ONCE in the common container (visible en móvil y desktop)**

La vista de Números tiene un header compartido (~line 442-466) y luego DOS bloques: móvil (`md:hidden`, ~line 522) y desktop (`hidden md:block`, ~line 788). Colocar la leyenda **una sola vez** justo después del header compartido (después del `</div>` de la línea ~466, antes de las alertas de tripletas en ~468), para que se vea en ambas vistas:

```jsx
  {caidaInfo?.previousDraw?.winner && (
    <div className="mb-4 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
      🔮 Caídas de <b>{caidaInfo.previousDraw.winner.name} ({caidaInfo.previousDraw.winner.number})</b> — marcadas en la tabla
      {caidaInfo.preselectedEnCaidas && <span className="ml-2 text-green-700">✅ el ganador/preseleccionado coincide</span>}
    </div>
  )}
```

- [ ] **Step 5a: Marcar filas en la vista MÓVIL (`md:hidden`, `filteredSortedItems.map`)**

Dentro de `filteredSortedItems.map((item) => { ... })` (~line 623), agregar después de `const isWinner = ...`:

```js
                          const caida = caidaByNumber.get(item.number);
```

En la fila del nombre (junto a `{isWinner && <Trophy .../>}`, ~line 653), agregar el marcador:

```jsx
                                    {caida && (
                                      <span
                                        title={`Caída de ${caidaInfo.previousDraw.winner.name} · ${caida.reason} · riesgo ${caida.riesgo}`}
                                        className="text-[11px] shrink-0"
                                      >
                                        🔮{caida.riesgo === 'ALTO' ? '🔴' : caida.riesgo === 'MEDIO' ? '🟡' : '🟢'}
                                      </span>
                                    )}
```

En el detalle expandido (~line 674, dentro del bloque `expanded`), agregar una fila:

```jsx
                                    {caida && (
                                      <div className="flex justify-between gap-2 col-span-2">
                                        <span className="text-gray-500">Caída</span>
                                        <span className="font-medium text-purple-700">
                                          {caida.reason} · {caida.sorteosSinSalir == null ? 's/registro' : `${caida.sorteosSinSalir} sorteos`} · {caida.riesgo}
                                        </span>
                                      </div>
                                    )}
```

- [ ] **Step 5b: Marcar filas en la vista DESKTOP (`hidden md:block`, `<ResponsiveTable>`)**

La tabla desktop (~line 789) recibe `columns`. Modificar la columna `name` (~line 803) para anexar el marcador 🔮 (usa `caidaByNumber`, que indexa por número, aunque la data sea `itemStats.items`):

```jsx
                      { key: 'name', label: 'Nombre', render: (i) => {
                        const caida = caidaByNumber.get(i.number);
                        return (
                          <span className="inline-flex items-center gap-1">
                            {i.name}
                            {caida && (
                              <span title={`Caída de ${caidaInfo.previousDraw.winner.name} · ${caida.reason} · riesgo ${caida.riesgo}`}>
                                🔮{caida.riesgo === 'ALTO' ? '🔴' : caida.riesgo === 'MEDIO' ? '🟡' : '🟢'}
                              </span>
                            )}
                          </span>
                        );
                      } },
```

Y dar un tinte morado a la fila/card de caída cuando no esté ya en rojo. Reemplazar `rowClassName` y `cardClassName` (~line 791-800) por:

```jsx
                    rowClassName={(item) => {
                      const q = getQuota(item.itemId);
                      if (q?.exceeded) return 'bg-red-50';
                      if (item.totalPotentialPrize > itemStats.totalSales * 0.7) return 'bg-red-50';
                      if (caidaByNumber.has(item.number)) return 'bg-purple-50';
                      return '';
                    }}
                    cardClassName={(item) => {
                      const q = getQuota(item.itemId);
                      if (q?.exceeded) return 'border-red-300 bg-red-50';
                      if (item.totalPotentialPrize > itemStats.totalSales * 0.7) return 'border-red-300 bg-red-50';
                      if (caidaByNumber.has(item.number)) return 'border-purple-300 bg-purple-50';
                      return '';
                    }}
```

- [ ] **Step 6: Verify in BOTH layouts in the running app**

Run frontend (`cd frontend && npm run dev`) y backend (`cd backend && npm run dev`, con `DISABLE_SOCIAL_CHANNELS=true`). En `/admin/monitor`, pestaña Números:
- **Desktop** (ventana ancha, ≥ md): seleccionar un sorteo que NO sea el primero del día → leyenda 🔮 arriba + columna Nombre con marca 🔮 + fila con tinte morado.
- **Móvil** (DevTools responsive < md): misma leyenda + tarjetas marcadas; expandir una → línea "Caída · criterio · sorteos · riesgo".
- Seleccionar el primer sorteo del día → sin leyenda ni marcas en ambas vistas.

Si `npm run build` se usa para validar, recordar (feedback memory): el build del front puede fallar de forma intermitente; no es bloqueante para la verificación en dev.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/api/monitor.js frontend/app/admin/monitor/page.js
git commit -m "feat(caidas): marca de caídas en la tabla de números del monitor"
```

---

## Self-Review (completado por el autor del plan)

- **Cobertura del spec:** §3.1 tabla → Task 1 · §3.2 servicio → Task 2 · §3.3 Telegram → Task 4 · §3.4 monitor → Tasks 3+5 · §5 tests → Tasks 1,2,4. ✔️
- **Sin placeholders:** todo el código está completo e inline. ✔️
- **Consistencia de tipos:** `getCaidasForDraw` devuelve la forma `CaidaResult` usada idéntica en Task 3 (endpoint), Task 4 (`formatCaidasBlock`/`formatPrewinnerMessage` campo `caidas`) y Task 5 (`caidaInfo.caidas`, `caidaInfo.previousDraw.winner`). `getCaidas`/`hasCaidas` firmas idénticas entre Task 1 y Task 2. ✔️
```
