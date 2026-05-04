# Webhook Item Quota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to cap bet amount per item per draw, enforced on webhook PUSH tickets (all-or-nothing rejection when cap exceeded). UI lives in the Monitor "Números" tab.

**Architecture:** New `DrawItemQuota` table. Central `quota.service.js` with `SELECT FOR UPDATE` for race-free checks. Webhook flow wraps quota check + ticket creation in one Prisma transaction. Admin CRUD via three endpoints under `/api/draws/:drawId/quotas`. Frontend adds two columns + a set/remove modal to the existing Números tab.

**Tech Stack:** Prisma 5, PostgreSQL 16, Express, Next.js 14, React 18, Tailwind, Jest (ESM via `unstable_mockModule`).

**Spec:** `docs/superpowers/specs/2026-04-24-webhook-item-quota-design.md`

---

## File Structure

### New files
- `backend/src/services/quota.service.js` — central service (check + CRUD + live view).
- `backend/src/services/__tests__/quota.service.test.js` — unit tests.
- `backend/src/controllers/quota.controller.js` — thin admin controller.
- `backend/src/routes/quota.routes.js` — admin routes.
- `frontend/lib/api/quota.js` — API client.
- `frontend/app/admin/monitor/QuotaModal.jsx` — modal component.

### Modified files
- `backend/prisma/schema.prisma` — add `DrawItemQuota` model + relations on `Draw` and `GameItem`.
- `backend/src/services/webhook.service.js` — wrap quota check + ticket creation in transaction; refactor `createWebhookTicket` to accept `tx`.
- `backend/src/index.js` — mount `quotaRoutes`.
- `frontend/app/admin/monitor/page.js` — merge quotas into itemStats, add columns, add action button, wire modal.

---

## Task 1: Schema change

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the model to `schema.prisma`**

Add this block at the end of the schema file (after the last model):

```prisma
model DrawItemQuota {
  id         String   @id @default(uuid())
  drawId     String
  gameItemId String
  maxAmount  Decimal  @db.Decimal(12, 2)
  createdBy  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  draw     Draw     @relation(fields: [drawId], references: [id], onDelete: Cascade)
  gameItem GameItem @relation(fields: [gameItemId], references: [id], onDelete: Cascade)

  @@unique([drawId, gameItemId])
  @@index([drawId])
}
```

- [ ] **Step 2: Add inverse relations**

In the `Draw` model (around line 111-161), add inside the relations block:

```prisma
itemQuotas      DrawItemQuota[]
```

In the `GameItem` model (around line 61-82), add inside the relations block:

```prisma
drawQuotas         DrawItemQuota[]
```

- [ ] **Step 3: Push schema to the local DB**

Run: `cd backend && npm run db:push`
Expected: "Your database is now in sync with your Prisma schema" + regenerated client.

- [ ] **Step 4: Verify the table exists**

Run: `docker exec tote_postgres psql -U tote_user -d tote_db -c '\d "DrawItemQuota"'`
Expected: table description with the 6 columns and the unique constraint `DrawItemQuota_drawId_gameItemId_key`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(schema): add DrawItemQuota for per-item per-draw caps

Opt-in quota model keyed by (drawId, gameItemId). Cascading delete on
both sides since the quota has no meaning without its draw or item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `quota.service.js` — `getDrawQuotas` (read path)

**Files:**
- Create: `backend/src/services/quota.service.js`
- Create: `backend/src/services/__tests__/quota.service.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/quota.service.test.js`:

```js
/**
 * Tests for quota.service.js
 * Uses Jest ESM mock pattern (unstable_mockModule) consistent with the codebase.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn() },
  gameItem: { findMany: jest.fn() },
  drawItemQuota: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  ticketDetail: { groupBy: jest.fn() },
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('quota.service — getDrawQuotas', () => {
  let getDrawQuotas;

  beforeAll(async () => {
    ({ getDrawQuotas } = await import('../quota.service.js'));
  });

  beforeEach(() => jest.clearAllMocks());

  test('returns items with maxAmount null when no quota exists, and correct soldAmount', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ id: 'draw-1', gameId: 'game-1', status: 'SCHEDULED' });
    mockPrisma.gameItem.findMany.mockResolvedValue([
      { id: 'item-30', number: '30', name: 'CARNERO' },
      { id: 'item-31', number: '31', name: 'TIGRE' },
    ]);
    mockPrisma.drawItemQuota.findMany.mockResolvedValue([]);
    mockPrisma.ticketDetail.groupBy.mockResolvedValue([
      { gameItemId: 'item-30', _sum: { amount: 5000 } },
    ]);

    const result = await getDrawQuotas('draw-1');

    expect(result).toEqual([
      {
        gameItemId: 'item-30',
        number: '30',
        name: 'CARNERO',
        maxAmount: null,
        soldAmount: 5000,
        availableAmount: null,
        exceeded: false,
      },
      {
        gameItemId: 'item-31',
        number: '31',
        name: 'TIGRE',
        maxAmount: null,
        soldAmount: 0,
        availableAmount: null,
        exceeded: false,
      },
    ]);
  });

  test('computes availableAmount and exceeded when quota exists', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ id: 'draw-1', gameId: 'game-1', status: 'SCHEDULED' });
    mockPrisma.gameItem.findMany.mockResolvedValue([
      { id: 'item-30', number: '30', name: 'CARNERO' },
    ]);
    mockPrisma.drawItemQuota.findMany.mockResolvedValue([
      { gameItemId: 'item-30', maxAmount: 10000 },
    ]);
    mockPrisma.ticketDetail.groupBy.mockResolvedValue([
      { gameItemId: 'item-30', _sum: { amount: 15000 } },
    ]);

    const result = await getDrawQuotas('draw-1');

    expect(result[0]).toEqual({
      gameItemId: 'item-30',
      number: '30',
      name: 'CARNERO',
      maxAmount: 10000,
      soldAmount: 15000,
      availableAmount: -5000,
      exceeded: true,
    });
  });

  test('throws when draw does not exist', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue(null);
    await expect(getDrawQuotas('missing')).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run the test (expect fail — service does not exist)**

Run: `cd backend && npm test -- --testPathPattern=quota.service`
Expected: FAIL with "Cannot find module '../quota.service.js'".

- [ ] **Step 3: Create `quota.service.js` with `getDrawQuotas`**

Create `backend/src/services/quota.service.js`:

```js
/**
 * Quota service — per-item per-draw caps on bet amount.
 *
 * Central service consumed by webhook flow. Designed to extend to
 * online/PULL sources without refactor.
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Return quota + live utilization for every item in the draw's game.
 * Items without a quota get maxAmount = null (no cap configured).
 *
 * @param {string} drawId
 * @returns {Promise<Array<{
 *   gameItemId: string, number: string, name: string,
 *   maxAmount: number|null, soldAmount: number,
 *   availableAmount: number|null, exceeded: boolean
 * }>>}
 */
export async function getDrawQuotas(drawId) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { id: true, gameId: true, status: true },
  });
  if (!draw) throw new Error(`Draw ${drawId} not found`);

  const [items, quotas, sold] = await Promise.all([
    prisma.gameItem.findMany({
      where: { gameId: draw.gameId, isActive: true },
      select: { id: true, number: true, name: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.drawItemQuota.findMany({
      where: { drawId },
      select: { gameItemId: true, maxAmount: true },
    }),
    prisma.ticketDetail.groupBy({
      by: ['gameItemId'],
      where: {
        drawId,
        status: 'ACTIVE',
        ticket: { status: 'ACTIVE' },
      },
      _sum: { amount: true },
    }),
  ]);

  const quotaByItem = new Map(quotas.map((q) => [q.gameItemId, Number(q.maxAmount)]));
  const soldByItem = new Map(sold.map((s) => [s.gameItemId, Number(s._sum.amount ?? 0)]));

  return items.map((item) => {
    const maxAmount = quotaByItem.has(item.id) ? quotaByItem.get(item.id) : null;
    const soldAmount = soldByItem.get(item.id) ?? 0;
    const availableAmount = maxAmount === null ? null : maxAmount - soldAmount;
    return {
      gameItemId: item.id,
      number: item.number,
      name: item.name,
      maxAmount,
      soldAmount,
      availableAmount,
      exceeded: maxAmount !== null && soldAmount > maxAmount,
    };
  });
}
```

- [ ] **Step 4: Run the test (expect pass)**

Run: `cd backend && npm test -- --testPathPattern=quota.service`
Expected: 3 tests pass.

> Note: Prisma's `ticketDetail.groupBy` with a relation filter (`ticket: { status: 'ACTIVE' }`) is not supported in all Prisma versions. If the test mocks it directly the unit tests pass — real integration will be covered in later tasks.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/quota.service.js backend/src/services/__tests__/quota.service.test.js
git commit -m "$(cat <<'EOF'
feat(quota): add getDrawQuotas read path

Returns per-item cap + live utilization for a draw. Foundation for
the Monitor UI integration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `quota.service.js` — `setQuota` and `removeQuota`

**Files:**
- Modify: `backend/src/services/quota.service.js`
- Modify: `backend/src/services/__tests__/quota.service.test.js`

- [ ] **Step 1: Write failing tests**

Append to `backend/src/services/__tests__/quota.service.test.js`:

```js
describe('quota.service — setQuota', () => {
  let setQuota;
  beforeAll(async () => {
    ({ setQuota } = await import('../quota.service.js'));
  });
  beforeEach(() => jest.clearAllMocks());

  test('upserts by (drawId, gameItemId) with maxAmount and createdBy', async () => {
    mockPrisma.drawItemQuota.upsert.mockResolvedValue({
      id: 'q-1', drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000, createdBy: 'user-1',
    });
    const result = await setQuota({ drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000, userId: 'user-1' });

    expect(mockPrisma.drawItemQuota.upsert).toHaveBeenCalledWith({
      where: { drawId_gameItemId: { drawId: 'draw-1', gameItemId: 'item-30' } },
      create: { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000, createdBy: 'user-1' },
      update: { maxAmount: 20000 },
    });
    expect(result.maxAmount).toBe(20000);
  });

  test('rejects non-positive maxAmount', async () => {
    await expect(setQuota({ drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 0 })).rejects.toThrow(/positive/i);
    await expect(setQuota({ drawId: 'draw-1', gameItemId: 'item-30', maxAmount: -100 })).rejects.toThrow(/positive/i);
  });
});

describe('quota.service — removeQuota', () => {
  let removeQuota;
  beforeAll(async () => {
    ({ removeQuota } = await import('../quota.service.js'));
  });
  beforeEach(() => jest.clearAllMocks());

  test('deletes by unique key', async () => {
    mockPrisma.drawItemQuota.delete.mockResolvedValue({ id: 'q-1' });
    await removeQuota({ drawId: 'draw-1', gameItemId: 'item-30' });
    expect(mockPrisma.drawItemQuota.delete).toHaveBeenCalledWith({
      where: { drawId_gameItemId: { drawId: 'draw-1', gameItemId: 'item-30' } },
    });
  });

  test('is idempotent — swallows "record not found" errors', async () => {
    const err = new Error('Record not found');
    err.code = 'P2025';
    mockPrisma.drawItemQuota.delete.mockRejectedValue(err);
    await expect(removeQuota({ drawId: 'draw-1', gameItemId: 'item-30' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests (expect fail)**

Run: `cd backend && npm test -- --testPathPattern=quota.service`
Expected: new tests fail with "setQuota is not a function" / "removeQuota is not a function".

- [ ] **Step 3: Implement `setQuota` and `removeQuota`**

Append to `backend/src/services/quota.service.js`:

```js
/**
 * Set or update a quota for (drawId, gameItemId).
 * @param {object} params
 * @param {string} params.drawId
 * @param {string} params.gameItemId
 * @param {number} params.maxAmount
 * @param {string} [params.userId]
 */
export async function setQuota({ drawId, gameItemId, maxAmount, userId }) {
  if (typeof maxAmount !== 'number' || maxAmount <= 0) {
    throw new Error('maxAmount must be a positive number');
  }
  return prisma.drawItemQuota.upsert({
    where: { drawId_gameItemId: { drawId, gameItemId } },
    create: { drawId, gameItemId, maxAmount, createdBy: userId ?? null },
    update: { maxAmount },
  });
}

/**
 * Remove a quota. Idempotent — swallows Prisma P2025 (record not found).
 */
export async function removeQuota({ drawId, gameItemId }) {
  try {
    await prisma.drawItemQuota.delete({
      where: { drawId_gameItemId: { drawId, gameItemId } },
    });
  } catch (err) {
    if (err.code === 'P2025') return;
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests (expect pass)**

Run: `cd backend && npm test -- --testPathPattern=quota.service`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/quota.service.js backend/src/services/__tests__/quota.service.test.js
git commit -m "$(cat <<'EOF'
feat(quota): add setQuota and removeQuota

Upsert + idempotent delete. setQuota validates maxAmount > 0 and
persists createdBy when provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `quota.service.js` — `checkTicketQuotas` (enforcement path)

**Files:**
- Modify: `backend/src/services/quota.service.js`
- Modify: `backend/src/services/__tests__/quota.service.test.js`

- [ ] **Step 1: Write failing tests**

Append to `backend/src/services/__tests__/quota.service.test.js`:

```js
describe('quota.service — checkTicketQuotas', () => {
  let checkTicketQuotas;
  let mockTx;

  beforeAll(async () => {
    ({ checkTicketQuotas } = await import('../quota.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTx = {
      $queryRaw: jest.fn(),
      ticketDetail: { groupBy: jest.fn() },
      gameItem: { findUnique: jest.fn() },
      draw: { findUnique: jest.fn() },
    };
  });

  test('returns ok when no quotas exist for any play', async () => {
    mockTx.$queryRaw.mockResolvedValue([]); // no quota rows
    const result = await checkTicketQuotas(
      [{ drawId: 'draw-1', gameItemId: 'item-30', amount: 500 }],
      mockTx,
    );
    expect(result).toEqual({ ok: true });
    expect(mockTx.ticketDetail.groupBy).not.toHaveBeenCalled(); // early exit
  });

  test('returns ok when sold + attempt <= max', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', _sum: { amount: 19500 } },
    ]);
    const result = await checkTicketQuotas(
      [{ drawId: 'draw-1', gameItemId: 'item-30', amount: 500 }],
      mockTx,
    );
    expect(result).toEqual({ ok: true });
  });

  test('rejects when sold + attempt > max, includes item number and drawTime in reason', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', _sum: { amount: 19500 } },
    ]);
    mockTx.gameItem.findUnique.mockResolvedValue({ number: '30', name: 'CARNERO' });
    mockTx.draw.findUnique.mockResolvedValue({ drawTime: '10:00:00' });

    const result = await checkTicketQuotas(
      [{ drawId: 'draw-1', gameItemId: 'item-30', amount: 1000 }],
      mockTx,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/30/);
    expect(result.reason).toMatch(/CARNERO/);
    expect(result.reason).toMatch(/10:00/);
    expect(result.reason).toMatch(/20500/);
    expect(result.reason).toMatch(/20000/);
  });

  test('aggregates multiple plays on the same (draw, item) before checking', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 1000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([]);
    mockTx.gameItem.findUnique.mockResolvedValue({ number: '30', name: 'CARNERO' });
    mockTx.draw.findUnique.mockResolvedValue({ drawTime: '10:00:00' });

    // Two plays of 600 on same item = 1200, exceeds 1000
    const result = await checkTicketQuotas(
      [
        { drawId: 'draw-1', gameItemId: 'item-30', amount: 600 },
        { drawId: 'draw-1', gameItemId: 'item-30', amount: 600 },
      ],
      mockTx,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/1200/);
  });

  test('rejects ticket when any single (draw, item) exceeds (all-or-nothing)', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000 },
      { drawId: 'draw-1', gameItemId: 'item-31', maxAmount: 5000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', _sum: { amount: 100 } },
      { drawId: 'draw-1', gameItemId: 'item-31', _sum: { amount: 4900 } },
    ]);
    mockTx.gameItem.findUnique.mockResolvedValue({ number: '31', name: 'TIGRE' });
    mockTx.draw.findUnique.mockResolvedValue({ drawTime: '10:00:00' });

    const result = await checkTicketQuotas(
      [
        { drawId: 'draw-1', gameItemId: 'item-30', amount: 500 }, // ok
        { drawId: 'draw-1', gameItemId: 'item-31', amount: 200 }, // exceeds
      ],
      mockTx,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/31/);
  });

  test('requires tx parameter', async () => {
    await expect(
      checkTicketQuotas([{ drawId: 'd', gameItemId: 'i', amount: 1 }], null),
    ).rejects.toThrow(/tx is required/i);
  });
});
```

- [ ] **Step 2: Run the tests (expect fail)**

Run: `cd backend && npm test -- --testPathPattern=quota.service`
Expected: new tests fail with "checkTicketQuotas is not a function".

- [ ] **Step 3: Implement `checkTicketQuotas`**

Append to `backend/src/services/quota.service.js`:

```js
/**
 * Validate a ticket's plays against configured quotas.
 * All-or-nothing: first failing (draw, item) aborts the whole ticket.
 *
 * Must run inside a Prisma transaction (tx) — uses SELECT ... FOR UPDATE
 * on matched quota rows to serialize concurrent webhooks targeting the
 * same (drawId, gameItemId) combination.
 *
 * @param {Array<{drawId:string, gameItemId:string, amount:number}>} plays
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<{ok:true} | {ok:false, reason:string}>}
 */
export async function checkTicketQuotas(plays, tx) {
  if (!tx) throw new Error('tx is required');
  if (!Array.isArray(plays) || plays.length === 0) return { ok: true };

  // Aggregate attempted amount per (drawId, gameItemId) — same ticket may repeat.
  const attempted = new Map(); // key: "drawId|gameItemId" -> { drawId, gameItemId, amount }
  for (const p of plays) {
    const key = `${p.drawId}|${p.gameItemId}`;
    const prev = attempted.get(key);
    if (prev) {
      prev.amount += Number(p.amount);
    } else {
      attempted.set(key, { drawId: p.drawId, gameItemId: p.gameItemId, amount: Number(p.amount) });
    }
  }
  const combos = Array.from(attempted.values());

  // Step 1: Lock and fetch quotas for these combos using raw SQL.
  // Prisma's findMany does not support FOR UPDATE; $queryRaw keeps the lock
  // within the active transaction passed as tx.
  const drawIds = [...new Set(combos.map((c) => c.drawId))];
  const itemIds = [...new Set(combos.map((c) => c.gameItemId))];
  const quotaRows = await tx.$queryRaw`
    SELECT "drawId", "gameItemId", "maxAmount"
    FROM "DrawItemQuota"
    WHERE "drawId" = ANY(${drawIds}::text[])
      AND "gameItemId" = ANY(${itemIds}::text[])
    FOR UPDATE
  `;

  // Index quotas by key, and filter to only combos we actually play in.
  const quotaByKey = new Map();
  for (const q of quotaRows) {
    const key = `${q.drawId}|${q.gameItemId}`;
    if (attempted.has(key)) quotaByKey.set(key, Number(q.maxAmount));
  }

  // Early exit: no quotas apply to this ticket.
  if (quotaByKey.size === 0) return { ok: true };

  // Step 2: Fetch current ACTIVE sold totals for only the capped combos.
  const cappedCombos = combos.filter((c) => quotaByKey.has(`${c.drawId}|${c.gameItemId}`));
  const soldRows = await tx.ticketDetail.groupBy({
    by: ['drawId', 'gameItemId'],
    where: {
      OR: cappedCombos.map((c) => ({ drawId: c.drawId, gameItemId: c.gameItemId })),
      status: 'ACTIVE',
      ticket: { status: 'ACTIVE' },
    },
    _sum: { amount: true },
  });

  const soldByKey = new Map();
  for (const s of soldRows) {
    soldByKey.set(`${s.drawId}|${s.gameItemId}`, Number(s._sum.amount ?? 0));
  }

  // Step 3: Check each capped combo.
  for (const combo of cappedCombos) {
    const key = `${combo.drawId}|${combo.gameItemId}`;
    const max = quotaByKey.get(key);
    const sold = soldByKey.get(key) ?? 0;
    const total = sold + combo.amount;
    if (total > max) {
      const [item, draw] = await Promise.all([
        tx.gameItem.findUnique({
          where: { id: combo.gameItemId },
          select: { number: true, name: true },
        }),
        tx.draw.findUnique({
          where: { id: combo.drawId },
          select: { drawTime: true },
        }),
      ]);
      const itemLabel = item ? `${item.number} (${item.name})` : combo.gameItemId;
      const timeLabel = draw?.drawTime ? draw.drawTime.slice(0, 5) : combo.drawId;
      return {
        ok: false,
        reason: `Cupo excedido para item ${itemLabel} en sorteo ${timeLabel}: vendido ${sold} + intento ${combo.amount} = ${total} > cupo ${max}`,
      };
    }
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the tests (expect pass)**

Run: `cd backend && npm test -- --testPathPattern=quota.service`
Expected: all tests (getDrawQuotas + setQuota + removeQuota + checkTicketQuotas) pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/quota.service.js backend/src/services/__tests__/quota.service.test.js
git commit -m "$(cat <<'EOF'
feat(quota): add checkTicketQuotas with SELECT FOR UPDATE

Serializes concurrent webhooks targeting the same (drawId, gameItemId)
via $queryRaw...FOR UPDATE inside the caller's transaction. Early exit
when no quotas apply — zero cost for uncapped traffic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire quota check into `webhook.service.js`

**Files:**
- Modify: `backend/src/services/webhook.service.js`
- Create: `backend/src/__tests__/webhook-service-quota.test.js`

- [ ] **Step 1: Write failing integration test**

Create `backend/src/__tests__/webhook-service-quota.test.js`:

```js
/**
 * Integration test: quota check inside webhook dispatch.
 * Mocks prisma + quota.service to verify dispatch wiring.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  webhookLog: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  draw: { findFirst: jest.fn() },
  gameItem: { findFirst: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};

const mockTx = {
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  webhookLog: { update: jest.fn() },
};

const mockQuota = { checkTicketQuotas: jest.fn() };

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-04-24'),
}));
jest.unstable_mockModule('../services/quota.service.js', () => mockQuota);

const apiSystem = { id: 'api-1', slug: 'virtuales', name: 'Virtuales' };
const headers = { 'x-webhook-token': 'tok' };

function payload() {
  return JSON.stringify({
    ticketId: 't-quota-1',
    game: 'lotoanimalito',
    plays: [{ drawSlotId: 5, amount: 1000, animal: 'perro', number: '30' }],
    timestamp: '2026-04-24T10:00:00Z',
  });
}

describe('dispatchWebhook — quota enforcement', () => {
  let dispatchWebhook;

  beforeAll(async () => {
    ({ dispatchWebhook } = await import('../services/webhook.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.webhookLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.webhookLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'DISCOVERED' });
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-1', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'item-30', multiplier: 30 });
    mockTx.ticket.findFirst.mockResolvedValue(null); // no duplicate
    mockTx.ticket.create.mockResolvedValue({ id: 'ticket-1', ticketNumber: 999 });
  });

  test('quota OK → ticket is created and log PROCESSED', async () => {
    mockQuota.checkTicketQuotas.mockResolvedValue({ ok: true });

    const result = await dispatchWebhook(apiSystem, payload(), headers);

    expect(mockQuota.checkTicketQuotas).toHaveBeenCalled();
    expect(mockTx.ticket.create).toHaveBeenCalled();
    expect(result.status).toBe('processed');
    expect(result.ticketNumber).toBe(999);
  });

  test('quota rejects → ticket NOT created, log FAILED, rejected status returned', async () => {
    mockQuota.checkTicketQuotas.mockResolvedValue({
      ok: false,
      reason: 'Cupo excedido para item 30 (CARNERO) en sorteo 10:00: vendido 19500 + intento 1000 = 20500 > cupo 20000',
    });

    const result = await dispatchWebhook(apiSystem, payload(), headers);

    expect(mockTx.ticket.create).not.toHaveBeenCalled();
    expect(mockPrisma.webhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: {
        status: 'FAILED',
        errorMessage: expect.stringMatching(/Cupo excedido/),
      },
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/Cupo excedido/);
  });
});
```

- [ ] **Step 2: Run the test (expect fail — wiring not yet in service)**

Run: `cd backend && npm test -- --testPathPattern=webhook-service-quota`
Expected: the "quota rejects" test fails because the current `dispatchWebhook` ignores quotas.

- [ ] **Step 3: Refactor `createWebhookTicket` to accept a tx**

In `backend/src/services/webhook.service.js`, replace the current `createWebhookTicket` function (lines 17-58) with:

```js
async function createWebhookTicket(normalized, logId, apiSystemId, tx = prisma) {
  const existing = await tx.ticket.findFirst({
    where: {
      externalTicketId: normalized.externalTicketId,
      source: 'WEBHOOK_PUSH',
      apiSystemId,
    },
  });

  if (existing) {
    await tx.webhookLog.update({
      where: { id: logId },
      data: { status: 'DUPLICATE' },
    });
    return existing;
  }

  const ticket = await tx.ticket.create({
    data: {
      drawId: normalized.drawId,
      source: 'WEBHOOK_PUSH',
      externalTicketId: normalized.externalTicketId,
      totalAmount: normalized.totalAmount,
      totalPrize: 0,
      status: 'ACTIVE',
      apiSystemId,
      providerData: normalized.providerData ?? null,
      details: {
        create: normalized.details.map((d) => ({
          gameItemId: d.gameItemId,
          amount: d.amount,
          multiplier: d.multiplier,
          prize: 0,
          status: 'ACTIVE',
          ...(d.drawId ? { drawId: d.drawId } : {}),
        })),
      },
    },
  });

  return ticket;
}
```

- [ ] **Step 4: Add quota import and wire check inside dispatchWebhook**

At the top of `backend/src/services/webhook.service.js`, add:

```js
import { checkTicketQuotas } from './quota.service.js';
```

Then in `dispatchWebhook`, replace the block that currently calls `createWebhookTicket` (around lines 189-195) with:

```js
    // Wrap quota check + ticket creation in one transaction so the
    // SELECT ... FOR UPDATE lock inside checkTicketQuotas stays held
    // until the ticket insert commits.
    const txResult = await prisma.$transaction(async (tx) => {
      const quotaCheck = await checkTicketQuotas(normalized.details, tx);
      if (!quotaCheck.ok) {
        return { rejected: true, reason: quotaCheck.reason };
      }
      const ticket = await createWebhookTicket(normalized, log.id, apiSystem.id, tx);
      return { rejected: false, ticket };
    });

    if (txResult.rejected) {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: txResult.reason },
      });
      logger.warn(`[webhook] Rejected by quota — slug="${slug}" logId=${log.id} reason=${txResult.reason}`);
      return { status: 'rejected', logId: log.id, reason: txResult.reason };
    }

    const ticket = txResult.ticket;

    // Check if the log was updated to DUPLICATE by createWebhookTicket
    const currentLog = await prisma.webhookLog.findUnique({ where: { id: log.id } });
    if (currentLog?.status === 'DUPLICATE') {
      return { status: 'duplicate', logId: log.id, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
    }

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'PROCESSED' },
    });

    return { status: 'processed', logId: log.id, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
```

- [ ] **Step 5: Run the new quota test (expect pass)**

Run: `cd backend && npm test -- --testPathPattern=webhook-service-quota`
Expected: both tests pass.

- [ ] **Step 6: Run the pre-existing webhook tests (no regression)**

Run: `cd backend && npm test -- --testPathPattern=webhook-service`
Expected: all webhook tests still pass (the existing rejection + D-01 tests).

> Note: the existing tests mock `prisma.ticket.create` directly. With the new `$transaction` wrapper, those tests may need `$transaction: jest.fn((fn) => fn(mockPrisma))` added to the mock. If a pre-existing test fails, extend its `mockPrisma` stub with `$transaction` pointing to itself — do not change assertions.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/webhook.service.js backend/src/__tests__/webhook-service-quota.test.js
git commit -m "$(cat <<'EOF'
feat(webhook): enforce per-item quotas before ticket creation

Wraps quota check + ticket insert in one Prisma transaction so the
SELECT FOR UPDATE lock stays held until commit. Adapters are not
touched — the check is transversal across Premier, Virtuales, and
any future PUSH adapter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin REST endpoints

**Files:**
- Create: `backend/src/controllers/quota.controller.js`
- Create: `backend/src/routes/quota.routes.js`
- Modify: `backend/src/index.js`

- [ ] **Step 1: Create the controller**

Create `backend/src/controllers/quota.controller.js`:

```js
/**
 * Controller for DrawItemQuota admin operations.
 * Thin layer — delegates to quota.service.js.
 */
import { prisma } from '../lib/prisma.js';
import { getDrawQuotas, setQuota, removeQuota } from '../services/quota.service.js';
import logger from '../lib/logger.js';

const MUTABLE_DRAW_STATUSES = ['SCHEDULED', 'CLOSED'];

async function assertDrawAndItem(drawId, gameItemId, requireMutable) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { id: true, gameId: true, status: true },
  });
  if (!draw) return { error: { status: 404, message: 'Draw not found' } };

  if (requireMutable && !MUTABLE_DRAW_STATUSES.includes(draw.status)) {
    return { error: { status: 400, message: `Draw is ${draw.status} — quotas cannot be modified` } };
  }

  if (gameItemId) {
    const item = await prisma.gameItem.findUnique({
      where: { id: gameItemId },
      select: { id: true, gameId: true },
    });
    if (!item) return { error: { status: 404, message: 'GameItem not found' } };
    if (item.gameId !== draw.gameId) {
      return { error: { status: 400, message: 'GameItem does not belong to the draw\'s game' } };
    }
  }
  return { draw };
}

class QuotaController {
  /** GET /api/draws/:drawId/quotas */
  async list(req, res) {
    try {
      const { drawId } = req.params;
      const check = await assertDrawAndItem(drawId, null, false);
      if (check.error) return res.status(check.error.status).json({ success: false, error: check.error.message });
      const data = await getDrawQuotas(drawId);
      return res.json({ success: true, data });
    } catch (err) {
      logger.error('[quota.controller] list failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /** PUT /api/draws/:drawId/quotas/:gameItemId  body: { maxAmount } */
  async upsert(req, res) {
    try {
      const { drawId, gameItemId } = req.params;
      const { maxAmount } = req.body ?? {};
      const amount = Number(maxAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'maxAmount must be a positive number' });
      }
      const check = await assertDrawAndItem(drawId, gameItemId, true);
      if (check.error) return res.status(check.error.status).json({ success: false, error: check.error.message });

      const quota = await setQuota({ drawId, gameItemId, maxAmount: amount, userId: req.user?.id ?? null });
      return res.json({ success: true, data: quota });
    } catch (err) {
      logger.error('[quota.controller] upsert failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /** DELETE /api/draws/:drawId/quotas/:gameItemId */
  async remove(req, res) {
    try {
      const { drawId, gameItemId } = req.params;
      const check = await assertDrawAndItem(drawId, gameItemId, true);
      if (check.error) return res.status(check.error.status).json({ success: false, error: check.error.message });

      await removeQuota({ drawId, gameItemId });
      return res.status(204).send();
    } catch (err) {
      logger.error('[quota.controller] remove failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new QuotaController();
```

- [ ] **Step 2: Create the router**

Create `backend/src/routes/quota.routes.js`:

```js
/**
 * Admin routes for DrawItemQuota.
 * Mounted at /api/draws in index.js.
 */
import { Router } from 'express';
import quotaController from '../controllers/quota.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/:drawId/quotas', (req, res) => quotaController.list(req, res));
router.put('/:drawId/quotas/:gameItemId', (req, res) => quotaController.upsert(req, res));
router.delete('/:drawId/quotas/:gameItemId', (req, res) => quotaController.remove(req, res));

export default router;
```

- [ ] **Step 3: Mount the router in `index.js`**

In `backend/src/index.js`, locate the import block around line 180 and add:

```js
import quotaRoutes from './routes/quota.routes.js';
```

Then locate the existing `app.use('/api/draws', drawRoutes);` line (around line 199) and add immediately after:

```js
app.use('/api/draws', quotaRoutes);
```

> Note: Express merges routers mounted at the same path. `drawRoutes` owns the existing `/:id` patterns; `quotaRoutes` owns `/:drawId/quotas*`. The more specific `/quotas` subpath will not conflict.

- [ ] **Step 4: Manual smoke test with curl**

Start the backend: `cd backend && npm run dev`

In a separate shell, first get an admin JWT (use an existing admin account — e.g. by logging in via the frontend and copying the token from localStorage, or using an existing admin credential):

```bash
TOKEN="<paste admin JWT>"
# Pick any existing draw ID
DRAW_ID=$(docker exec tote_postgres psql -U tote_user -d tote_db -tAc "SELECT id FROM \"Draw\" WHERE status='SCHEDULED' LIMIT 1")
ITEM_ID=$(docker exec tote_postgres psql -U tote_user -d tote_db -tAc "SELECT id FROM \"GameItem\" LIMIT 1")

# List (all items with null maxAmount)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/draws/$DRAW_ID/quotas | head -c 500

# Set
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"maxAmount": 20000}' \
  http://localhost:3001/api/draws/$DRAW_ID/quotas/$ITEM_ID

# Delete
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/draws/$DRAW_ID/quotas/$ITEM_ID -o /dev/null -w "%{http_code}\n"
```

Expected: list returns JSON with `success: true`, set returns 200 with the quota row, delete returns `204`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/quota.controller.js backend/src/routes/quota.routes.js backend/src/index.js
git commit -m "$(cat <<'EOF'
feat(quota): add admin REST endpoints for draw item quotas

GET list / PUT upsert / DELETE remove under /api/draws/:drawId/quotas.
Blocks mutations on DRAWN/CANCELLED draws; GET works regardless for
historical inspection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend API client

**Files:**
- Create: `frontend/lib/api/quota.js`

- [ ] **Step 1: Create the client**

Create `frontend/lib/api/quota.js`:

```js
/**
 * API client for DrawItemQuota admin endpoints.
 */
import axios from './axios';

const quotaApi = {
  /** GET /api/draws/:drawId/quotas → per-item cap + utilization */
  async getDrawQuotas(drawId) {
    const response = await axios.get(`/draws/${drawId}/quotas`);
    return response.data;
  },

  /** PUT /api/draws/:drawId/quotas/:gameItemId */
  async setQuota(drawId, gameItemId, maxAmount) {
    const response = await axios.put(`/draws/${drawId}/quotas/${gameItemId}`, { maxAmount });
    return response.data;
  },

  /** DELETE /api/draws/:drawId/quotas/:gameItemId */
  async removeQuota(drawId, gameItemId) {
    const response = await axios.delete(`/draws/${drawId}/quotas/${gameItemId}`);
    return response.data;
  },
};

export default quotaApi;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api/quota.js
git commit -m "$(cat <<'EOF'
feat(frontend): add quota API client

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Monitor UI — integrate quota columns + modal

**Files:**
- Create: `frontend/app/admin/monitor/QuotaModal.jsx`
- Modify: `frontend/app/admin/monitor/page.js`

- [ ] **Step 1: Create the QuotaModal component**

Create `frontend/app/admin/monitor/QuotaModal.jsx`:

```jsx
'use client';

import { useState, useEffect } from 'react';
import { X, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import quotaApi from '@/lib/api/quota';

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Modal for setting / removing the cap on a specific (draw, item).
 * @param {object} props
 * @param {object} props.draw          - { id, drawTime, game, status }
 * @param {object} props.item          - { gameItemId, number, name, maxAmount, soldAmount }
 * @param {function} props.onClose     - () => void
 * @param {function} props.onSaved     - () => void (reload monitor)
 */
export default function QuotaModal({ draw, item, onClose, onSaved }) {
  const [value, setValue] = useState(item.maxAmount ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(item.maxAmount ?? '');
  }, [item]);

  const hasExistingQuota = item.maxAmount !== null && item.maxAmount !== undefined;

  const handleSave = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Monto máximo debe ser un número mayor a 0');
      return;
    }
    setSaving(true);
    try {
      await quotaApi.setQuota(draw.id, item.gameItemId, n);
      toast.success('Cupo guardado');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando cupo');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await quotaApi.removeQuota(draw.id, item.gameItemId);
      toast.success('Cupo eliminado');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando cupo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Cupo del item {item.number} — {item.name}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" disabled={saving}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-600">
            <div>Sorteo: <span className="font-medium">{draw.game} — {(draw.drawTime || '').slice(0, 5)}</span></div>
            <div className="mt-1">
              Vendido actual: <span className="font-bold text-green-600">{formatCurrency(item.soldAmount)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto máximo (Bs)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={saving}
              autoFocus
            />
            {hasExistingQuota && Number(value) < item.soldAmount && (
              <p className="text-xs text-red-600 mt-1">
                Atención: el cupo que estás poniendo ({formatCurrency(Number(value))}) es menor al vendido actual. Las ventas existentes no se ven afectadas, pero nuevas ventas serán rechazadas.
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between gap-2">
          <div>
            {hasExistingQuota && (
              <button
                onClick={handleRemove}
                className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-2"
                disabled={saving}
              >
                <Trash2 className="w-4 h-4" />
                Eliminar cupo
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add quota fetch + state to `page.js`**

In `frontend/app/admin/monitor/page.js`:

Add the import at the top:

```js
import quotaApi from '@/lib/api/quota';
import QuotaModal from './QuotaModal';
```

Replace the icon imports block (around line 4-8) with one that includes `Shield`:

```js
import {
  Building2, Hash, FileText, Calendar, Gamepad2, Clock,
  DollarSign, Trophy, Ticket, AlertTriangle, ChevronRight,
  X, Eye, Layers, Shield
} from 'lucide-react';
```

Add new state hooks next to the other `useState` declarations (around line 36):

```js
  const [quotas, setQuotas] = useState([]); // array of { gameItemId, maxAmount, soldAmount, availableAmount, exceeded }
  const [quotaModal, setQuotaModal] = useState({ open: false, item: null });
```

- [ ] **Step 3: Merge quotas into the `numeros` tab fetch**

Replace the `else if (activeTab === 'numeros') { ... }` block inside `fetchData` (around lines 110-122) with:

```js
      } else if (activeTab === 'numeros') {
        const [statsResult, quotasResult] = await Promise.all([
          monitorApi.getItemStats(selectedDraw),
          quotaApi.getDrawQuotas(selectedDraw).catch(() => ({ data: [] })),
        ]);
        setItemStats(statsResult.data);
        setQuotas(quotasResult.data || []);

        // Fetch last seen data for all numbers
        if (selectedGame) {
          try {
            const lastSeenResult = await numberHistoryApi.getAllLastSeen(selectedGame);
            setLastSeenData(lastSeenResult.data || {});
          } catch (error) {
            console.error('Error loading last seen data:', error);
          }
        }
      }
```

- [ ] **Step 4: Add a helper to look up quota by itemId and add the columns**

Above the `return (` statement (around line 214), add:

```js
  const quotaByItem = new Map(quotas.map((q) => [q.gameItemId, q]));
  const getQuota = (itemId) => quotaByItem.get(itemId) || null;

  const currentDraw = draws.find((d) => d.id === selectedDraw);
  const canEditQuota = currentDraw && (currentDraw.status === 'SCHEDULED' || currentDraw.status === 'CLOSED');
```

Then find the Números tab's `<ResponsiveTable>` columns array (around lines 417-459) and, after the existing `totalPotentialPrize` column, add these two new columns:

```js
                      {
                        key: 'cupo',
                        label: 'Cupo',
                        align: 'right',
                        render: (i) => {
                          const q = getQuota(i.itemId);
                          if (!q || q.maxAmount === null) return <span className="text-gray-400">—</span>;
                          return <span className="font-medium text-gray-900">{formatCurrency(q.maxAmount)}</span>;
                        },
                      },
                      {
                        key: 'disponible',
                        label: 'Disponible',
                        align: 'right',
                        render: (i) => {
                          const q = getQuota(i.itemId);
                          if (!q || q.maxAmount === null) return <span className="text-gray-400">—</span>;
                          if (q.exceeded) {
                            return (
                              <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                                Excedido
                              </span>
                            );
                          }
                          const pct = q.maxAmount > 0 ? q.availableAmount / q.maxAmount : 0;
                          const color = pct > 0.2 ? 'text-green-600' : 'text-yellow-600';
                          return <span className={`font-medium ${color}`}>{formatCurrency(q.availableAmount)}</span>;
                        },
                      },
```

- [ ] **Step 5: Add the Shield action button to the Números table**

Find the `actions={(item) => ( ... )}` prop of the Números `<ResponsiveTable>` (around lines 460-479). Replace the whole `actions` prop with:

```js
                    actions={(item) => (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewTicketsByItem(item.itemId)}
                          className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
                          title="Ver tickets"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {item.tripletaCount > 0 && (
                          <button
                            onClick={() => handleViewTripletas(item.itemId)}
                            className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg"
                            title="Ver tripletas"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                        )}
                        {canEditQuota && (
                          <button
                            onClick={() => {
                              const q = getQuota(item.itemId);
                              setQuotaModal({
                                open: true,
                                item: {
                                  gameItemId: item.itemId,
                                  number: item.number,
                                  name: item.name,
                                  maxAmount: q?.maxAmount ?? null,
                                  soldAmount: q?.soldAmount ?? item.totalAmount ?? 0,
                                },
                              });
                            }}
                            className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg"
                            title="Configurar cupo"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
```

- [ ] **Step 6: Update the row-danger styling to also flag exceeded quota**

Find the `rowClassName` and `cardClassName` props of the Números `<ResponsiveTable>` (around lines 415-416). Replace them with:

```js
                    rowClassName={(item) => {
                      const q = getQuota(item.itemId);
                      if (q?.exceeded) return 'bg-red-50';
                      return item.totalPotentialPrize > itemStats.totalSales * 0.7 ? 'bg-red-50' : '';
                    }}
                    cardClassName={(item) => {
                      const q = getQuota(item.itemId);
                      if (q?.exceeded) return 'border-red-300 bg-red-50';
                      return item.totalPotentialPrize > itemStats.totalSales * 0.7 ? 'border-red-300 bg-red-50' : '';
                    }}
```

- [ ] **Step 7: Render the QuotaModal**

At the very end of the JSX, just before the final closing `</div>` of the outer wrapper (right before the closing tag of the component's return — after the last existing modal, around line 893), add:

```js
      {quotaModal.open && quotaModal.item && currentDraw && (
        <QuotaModal
          draw={{
            id: currentDraw.id,
            drawTime: currentDraw.drawTime,
            game: itemStats?.game,
            status: currentDraw.status,
          }}
          item={quotaModal.item}
          onClose={() => setQuotaModal({ open: false, item: null })}
          onSaved={() => fetchData()}
        />
      )}
```

- [ ] **Step 8: Manual UI verification**

Start frontend: `cd frontend && npm run dev`

Open http://localhost:10000/admin/monitor, login as admin, navigate to the Monitor and:

1. Select today's date, a game, and a SCHEDULED draw.
2. Switch to "Números" tab — verify the two new columns (Cupo, Disponible) show `—` for all items.
3. Click the Shield icon on any item — modal opens.
4. Enter 20000 and save — verify toast "Cupo guardado" and the row now shows Cupo=20,000.00 and Disponible in green or yellow depending on current sales.
5. Click Shield again — verify modal pre-fills with 20000 and shows "Eliminar cupo" button.
6. Click "Eliminar cupo" — verify toast and the row returns to `—`.
7. Select a DRAWN draw — verify the Shield button is hidden on all rows.

Report back what you saw (pass/fail per step).

- [ ] **Step 9: Commit**

```bash
git add frontend/app/admin/monitor/QuotaModal.jsx frontend/app/admin/monitor/page.js
git commit -m "$(cat <<'EOF'
feat(monitor): add per-item quota columns and set/remove modal

Adds Cupo and Disponible columns to the Números tab plus a Shield
action button that opens a modal for setting or removing the cap.
Exceeded quotas highlight the row in red. Button hidden on DRAWN/
CANCELLED draws to match backend validation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: End-to-end webhook smoke test

**Files:** (no edits — only verification)

- [ ] **Step 1: Set a tight quota via the API**

With backend + frontend running and logged in as admin:

```bash
TOKEN="<admin JWT>"
DRAW_ID=$(docker exec tote_postgres psql -U tote_user -d tote_db -tAc "SELECT id FROM \"Draw\" WHERE status='SCHEDULED' AND \"gameId\" = (SELECT id FROM \"Game\" WHERE slug='lotoanimalito') ORDER BY \"drawTime\" LIMIT 1")
ITEM_ID=$(docker exec tote_postgres psql -U tote_user -d tote_db -tAc "SELECT id FROM \"GameItem\" WHERE \"gameId\" = (SELECT id FROM \"Game\" WHERE slug='lotoanimalito') AND number='05' LIMIT 1")

curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"maxAmount": 100}' \
  http://localhost:3001/api/draws/$DRAW_ID/quotas/$ITEM_ID
```

Expected: `{"success":true,"data":{...,"maxAmount":"100"}}`.

- [ ] **Step 2: Send a webhook for a valid provider over the cap**

Get an active PUSH provider's slug + token:

```bash
docker exec tote_postgres psql -U tote_user -d tote_db -c "SELECT slug, \"webhookToken\" FROM \"ApiSystem\" WHERE mode='PUSH' AND \"isActive\"=true LIMIT 1"
```

Send two webhooks — first within cap, second over cap. Use the `virtuales` adapter's drawSlotId=5 (LOTOANIMALITO 12:00:00) — adjust if the selected draw is at a different time:

```bash
SLUG="<slug>"
TKN="<webhookToken>"

# Play #1: 80 on number 05 — should be ACCEPTED
curl -s -X POST -H "X-Webhook-Token: $TKN" -H 'Content-Type: application/json' \
  -d '{"ticketId":"quota-test-1","game":"lotoanimalito","plays":[{"drawSlotId":5,"amount":80,"animal":"perro","number":"05"}],"timestamp":"2026-04-24T10:00:00Z"}' \
  http://localhost:3001/api/webhooks/$SLUG

# Play #2: 30 on same number — total 110 > 100 → should be REJECTED
curl -s -X POST -H "X-Webhook-Token: $TKN" -H 'Content-Type: application/json' \
  -d '{"ticketId":"quota-test-2","game":"lotoanimalito","plays":[{"drawSlotId":5,"amount":30,"animal":"perro","number":"05"}],"timestamp":"2026-04-24T10:00:00Z"}' \
  http://localhost:3001/api/webhooks/$SLUG
```

Expected:
- Response 1: `{"received":true,"logId":"...","ticket":{"id":<num>,"status":"ACCEPTED"}}`
- Response 2: `{"received":true,"logId":"...","ticket":{"status":"REJECTED","reason":"Cupo excedido..."}}`

- [ ] **Step 3: Verify in the UI**

Navigate to the monitor, select the draw used above, Números tab. The row for number 05 should show:
- Apostado: 80.00 Bs
- Cupo: 100.00 Bs
- Disponible: 20.00 Bs (in yellow since < 20% of cap)

Navigate to `/admin/proveedores/logs` — verify two log rows:
- `quota-test-1` → status PROCESSED
- `quota-test-2` → status FAILED with errorMessage containing "Cupo excedido"

- [ ] **Step 4: Cleanup the test quota**

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/draws/$DRAW_ID/quotas/$ITEM_ID -o /dev/null -w "%{http_code}\n"
```

Expected: `204`.

If any of the above fails, investigate before moving on. Nothing to commit in this task.

---

## Verification checklist

- [ ] `npm test` in backend — all quota + webhook tests pass, no regressions.
- [ ] Admin can set/remove quota from the Monitor Números tab.
- [ ] Webhook over the cap receives `REJECTED` with a clear reason.
- [ ] Webhook under the cap still creates the ticket normally.
- [ ] Anulación (same externalTicketId sent empty while draw is `SCHEDULED`) liberates the cap — verify manually by annulling `quota-test-1` and re-sending `quota-test-2`.
- [ ] Shield button hidden on DRAWN/CANCELLED draws.
- [ ] No migration files left untracked (project uses `db push`).
