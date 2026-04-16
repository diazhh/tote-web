# Provider Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only portal for PUSH providers (Virtuales, Premier) to log into tote-web and view their own tickets + draw results, scoped strictly by `apiSystemId`.

**Architecture:** Extend existing `User` model with a `PROVIDER` role + FK to `ApiSystem`. Reuse existing JWT auth (add `apiSystemId` to payload). New `/api/portal/*` routes gated by `authenticate` + `requireProvider` middleware. New frontend area at `/proveedor/*` in Next.js App Router. Deploy via git pull + `prisma migrate deploy` + `pm2 restart` on VPS 144.

**Tech Stack:** Node.js ES modules, Express, Prisma, PostgreSQL, Jest (`jest.unstable_mockModule`), Next.js 14 App Router, TailwindCSS, bcryptjs, jsonwebtoken, express-rate-limit (existing or add).

**Reference spec:** `docs/superpowers/specs/2026-04-16-provider-portal-design.md`

---

## Phase A — Schema, migration, backfill

### Task A1: Update Prisma schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add `PROVIDER` to `UserRole` enum**

Open `backend/prisma/schema.prisma`, find the `UserRole` enum (around line 382), add `PROVIDER`:

```prisma
enum UserRole {
  ADMIN           // Acceso completo
  OPERATOR        // Gestión de sorteos
  VIEWER          // Solo lectura
  PLAYER          // Usuario jugador (taquilla online)
  TAQUILLA_ADMIN  // Administrador de taquilla online
  PROVIDER        // Usuario del portal de proveedores
}
```

- [ ] **Step 2: Add `apiSystemId` FK to `User`**

Find the `User` model and add inside the model body (after existing fields, before closing `}`):

```prisma
  // Portal de proveedores: vincula el User con el ApiSystem al que pertenece (solo PROVIDER role)
  apiSystemId   String?
  apiSystem     ApiSystem?  @relation(fields: [apiSystemId], references: [id])

  @@index([apiSystemId])
```

- [ ] **Step 3: Add inverse relation on `ApiSystem`**

Find the `ApiSystem` model, add (near other relations like `configurations`, `webhookLogs`):

```prisma
  users User[]
```

- [ ] **Step 4: Add `apiSystemId` FK to `Ticket`**

Find the `Ticket` model, add:

```prisma
  apiSystemId  String?
  apiSystem    ApiSystem?  @relation(fields: [apiSystemId], references: [id])

  @@index([apiSystemId, createdAt])
```

- [ ] **Step 5: Add inverse relation on `ApiSystem` for tickets**

In `ApiSystem` model, add:

```prisma
  tickets Ticket[]
```

- [ ] **Step 6: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/prisma/schema.prisma
git commit -m "feat(schema): add PROVIDER role and apiSystemId FKs on User/Ticket"
```

---

### Task A2: Generate and apply migration locally

**Files:** none (schema was committed in A1; this task only applies it to DB)

**Workflow note:** this project uses `prisma db push` (not `prisma migrate`). The `prisma/migrations/` folder is gitignored and not versioned. `db push` applies schema changes directly — additive-only changes (our case) are safe; any destructive change will make `db push` prompt, which we refuse in production.

- [ ] **Step 1: Ensure docker Postgres is up**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
docker-compose up -d
docker ps --format "table {{.Names}}\t{{.Status}}" | grep tote_postgres
```

Expected: `tote_postgres ... Up ...`

- [ ] **Step 2: Apply schema to local DB via `db push`**

```bash
cd backend
npx prisma db push
```

Expected: output contains "Your database is now in sync with your Prisma schema" and lists only ADDITIVE changes:
- `Added the required column 'apiSystemId' to the 'User' table` (nullable, so actually "Added the optional column")
- new enum value `PROVIDER`
- new index on `Ticket(apiSystemId, createdAt)`

**If the output mentions ANY "would cause data loss", "drop column", or asks to confirm `--accept-data-loss`:** STOP. Do NOT proceed. Report BLOCKED — our change set is purely additive; any destructive prompt means something else drifted.

- [ ] **Step 3: Verify schema in DB**

```bash
docker exec tote_postgres psql -U tote_user -d tote_db -c "\d \"User\"" | grep apiSystemId
docker exec tote_postgres psql -U tote_user -d tote_db -c "\d \"Ticket\"" | grep -i "apisystemid"
docker exec tote_postgres psql -U tote_user -d tote_db -c "SELECT unnest(enum_range(NULL::\"UserRole\"))"
```

Expected:
- User table shows `apiSystemId | text`
- Ticket table shows `apiSystemId` column and both indexes
- Enum list includes `PROVIDER`

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client".

- [ ] **Step 5: No commit**

Nothing to commit — `db push` doesn't create migration files (that folder is gitignored). The schema change was committed in Task A1.

---

### Task A3: Backfill existing WEBHOOK_PUSH tickets

**Files:**
- Create: `backend/src/scripts/backfill-ticket-apisystem.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/scripts/__tests__/backfill-ticket-apisystem.test.js`:

```js
import { jest } from '@jest/globals';

const mockPrisma = {
  ticket: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  webhookLog: {
    findFirst: jest.fn(),
  },
  apiSystem: {
    findMany: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { backfill } = await import('../backfill-ticket-apisystem.js');

beforeEach(() => {
  Object.values(mockPrisma).forEach(m => {
    if (typeof m === 'object') Object.values(m).forEach(fn => fn.mockReset?.());
  });
});

test('assigns apiSystemId to WEBHOOK_PUSH tickets with no apiSystemId', async () => {
  mockPrisma.apiSystem.findMany.mockResolvedValue([
    { id: 'sys-virtuales', slug: 'virtuales' },
    { id: 'sys-premier', slug: 'premier' },
  ]);
  mockPrisma.ticket.findMany.mockResolvedValueOnce([
    { id: 't1', providerData: { providerSlug: 'virtuales' } },
    { id: 't2', providerData: { providerSlug: 'premier' } },
  ]).mockResolvedValueOnce([]);
  mockPrisma.ticket.update.mockResolvedValue({});

  const result = await backfill({ batchSize: 100 });

  expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
    where: { id: 't1' },
    data: { apiSystemId: 'sys-virtuales' },
  });
  expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
    where: { id: 't2' },
    data: { apiSystemId: 'sys-premier' },
  });
  expect(result.updated).toBe(2);
});

test('skips tickets when provider slug cannot be resolved', async () => {
  mockPrisma.apiSystem.findMany.mockResolvedValue([{ id: 'sys-v', slug: 'virtuales' }]);
  mockPrisma.ticket.findMany.mockResolvedValueOnce([
    { id: 't3', providerData: { providerSlug: 'unknown' } },
  ]).mockResolvedValueOnce([]);

  const result = await backfill({ batchSize: 100 });

  expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  expect(result.updated).toBe(0);
  expect(result.skipped).toBe(1);
});

test('falls back to webhookLog lookup when providerData lacks slug', async () => {
  mockPrisma.apiSystem.findMany.mockResolvedValue([{ id: 'sys-v', slug: 'virtuales' }]);
  mockPrisma.ticket.findMany.mockResolvedValueOnce([
    { id: 't4', providerData: {} },
  ]).mockResolvedValueOnce([]);
  mockPrisma.webhookLog.findFirst.mockResolvedValue({ apiSystemId: 'sys-v' });

  const result = await backfill({ batchSize: 100 });

  expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
    where: { id: 't4' },
    data: { apiSystemId: 'sys-v' },
  });
  expect(result.updated).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
npx jest src/scripts/__tests__/backfill-ticket-apisystem.test.js
```

Expected: FAIL with "Cannot find module '../backfill-ticket-apisystem.js'".

- [ ] **Step 3: Write the script**

Create `backend/src/scripts/backfill-ticket-apisystem.js`:

```js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Backfill apiSystemId on existing WEBHOOK_PUSH tickets.
 * Idempotent: only touches tickets where apiSystemId IS NULL.
 * Resolution order:
 *   1. providerData.providerSlug -> ApiSystem.slug -> id
 *   2. fallback: WebhookLog with matching ticketId -> apiSystemId
 */
export async function backfill({ batchSize = 500 } = {}) {
  const systems = await prisma.apiSystem.findMany({ select: { id: true, slug: true } });
  const slugToId = new Map(systems.map(s => [s.slug, s.id]));

  let updated = 0;
  let skipped = 0;
  let processed = 0;

  while (true) {
    const batch = await prisma.ticket.findMany({
      where: { source: 'WEBHOOK_PUSH', apiSystemId: null },
      take: batchSize,
      select: { id: true, providerData: true },
    });
    if (batch.length === 0) break;

    for (const t of batch) {
      processed++;
      let apiSystemId = null;

      const slug = t.providerData?.providerSlug;
      if (slug && slugToId.has(slug)) {
        apiSystemId = slugToId.get(slug);
      } else {
        const log = await prisma.webhookLog.findFirst({
          where: { ticketId: t.id },
          select: { apiSystemId: true },
        });
        if (log?.apiSystemId) apiSystemId = log.apiSystemId;
      }

      if (apiSystemId) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: { apiSystemId },
        });
        updated++;
      } else {
        skipped++;
        logger.warn(`Could not resolve apiSystemId for ticket ${t.id}`);
      }
    }

    if (batch.length < batchSize) break;
  }

  logger.info(`Backfill finished: processed=${processed} updated=${updated} skipped=${skipped}`);
  return { processed, updated, skipped };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  backfill()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      logger.error('Backfill failed:', err);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
npx jest src/scripts/__tests__/backfill-ticket-apisystem.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 5: Dry-run the script against local DB**

```bash
cd backend
node src/scripts/backfill-ticket-apisystem.js
```

Expected log line: `Backfill finished: processed=N updated=N skipped=0` (skipped may be >0 if local DB has orphan test data — that's OK).

- [ ] **Step 6: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/scripts/backfill-ticket-apisystem.js backend/src/scripts/__tests__/backfill-ticket-apisystem.test.js
git commit -m "feat(scripts): backfill apiSystemId on existing WEBHOOK_PUSH tickets"
```

---

### Task A4: Update webhook service to set apiSystemId on new tickets

**Files:**
- Modify: `backend/src/services/webhook.service.js`

- [ ] **Step 1: Inspect current ticket creation**

```bash
grep -n "prisma.ticket.create\|createWebhookTicket" backend/src/services/webhook.service.js
```

Note the exact function name and line where `prisma.ticket.create({ data: { ... } })` is called.

- [ ] **Step 2: Write the failing test**

Create or extend `backend/src/services/__tests__/webhook-service-apisystem.test.js`:

```js
import { jest } from '@jest/globals';

const mockPrisma = {
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  ticketDetail: { create: jest.fn() },
  webhookLog: { update: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { createWebhookTicket } = await import('../webhook.service.js');

beforeEach(() => {
  mockPrisma.ticket.findFirst.mockReset();
  mockPrisma.ticket.create.mockReset();
});

test('persists apiSystemId on newly created ticket', async () => {
  mockPrisma.ticket.findFirst.mockResolvedValue(null);
  mockPrisma.ticket.create.mockResolvedValue({ id: 'new-t', status: 'ACTIVE' });

  await createWebhookTicket({
    apiSystem: { id: 'sys-x', slug: 'virtuales' },
    webhookLogId: 'log-1',
    normalized: {
      externalTicketId: 'EXT-1',
      totalAmount: 100,
      drawId: 'd1',
      providerData: { foo: 'bar' },
      details: [{ gameItemId: 'gi1', amount: 100, multiplier: 1, drawId: 'd1' }],
    },
  });

  expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        apiSystemId: 'sys-x',
        source: 'WEBHOOK_PUSH',
      }),
    })
  );
});
```

Note: adapt the import path and exported function signature to match what's actually in `webhook.service.js`. If it's a default-exported object, adjust accordingly.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend
npx jest src/services/__tests__/webhook-service-apisystem.test.js
```

Expected: FAIL — the assertion about `apiSystemId` in `create` data will not match.

- [ ] **Step 4: Modify `webhook.service.js`**

In the function that calls `prisma.ticket.create`, add `apiSystemId` to the `data` object. Example diff pattern:

```js
// Inside createWebhookTicket (or equivalent), in the prisma.ticket.create call:
await prisma.ticket.create({
  data: {
    // ... existing fields
    source: 'WEBHOOK_PUSH',
    apiSystemId: apiSystem.id,   // <-- ADD THIS LINE
    // ... rest
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend
npx jest src/services/__tests__/webhook-service-apisystem.test.js
```

Expected: PASS.

- [ ] **Step 6: Run full webhook tests to check no regression**

```bash
cd backend
npx jest src/services/__tests__ src/__tests__/webhook-service-rejection.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/services/webhook.service.js backend/src/services/__tests__/webhook-service-apisystem.test.js
git commit -m "feat(webhook): set apiSystemId on tickets created from push webhooks"
```

---

## Phase B — Auth extension

### Task B1: Include apiSystemId in JWT payload

**Files:**
- Modify: `backend/src/services/auth.service.js:116-128`
- Modify: `backend/src/services/auth.service.js` (login method — must select `apiSystemId` from DB)

- [ ] **Step 1: Locate the `generateToken` method**

```bash
grep -n "generateToken\|login(" backend/src/services/auth.service.js
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/services/__tests__/auth-service-jwt.test.js`:

```js
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { default: authService } = await import('../auth.service.js');

test('generateToken includes apiSystemId when user is PROVIDER', () => {
  const token = authService.generateToken({
    id: 'u1',
    username: 'virtuales',
    email: null,
    role: 'PROVIDER',
    apiSystemId: 'sys-virtuales',
  });
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-change-in-production');
  expect(decoded.apiSystemId).toBe('sys-virtuales');
  expect(decoded.role).toBe('PROVIDER');
});

test('generateToken sets apiSystemId to null for non-provider users', () => {
  const token = authService.generateToken({
    id: 'u2',
    username: 'admin',
    email: 'a@a.com',
    role: 'ADMIN',
  });
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-change-in-production');
  expect(decoded.apiSystemId).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend
npx jest src/services/__tests__/auth-service-jwt.test.js
```

Expected: FAIL — `apiSystemId` is not in the payload.

- [ ] **Step 4: Modify `generateToken` in `auth.service.js`**

Replace the `payload` block in `generateToken` (line 117) with:

```js
const payload = {
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  apiSystemId: user.apiSystemId ?? null,
};
```

- [ ] **Step 5: Ensure login() selects apiSystemId from DB**

In the `login` method of `authService`, find the `prisma.user.findUnique` or `findFirst` call. Add `apiSystemId: true` to the `select` block if a select exists, or ensure it's returned (if no select, it's already included by default).

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend
npx jest src/services/__tests__/auth-service-jwt.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/services/auth.service.js backend/src/services/__tests__/auth-service-jwt.test.js
git commit -m "feat(auth): include apiSystemId in JWT payload"
```

---

## Phase C — Admin UI and endpoint for creating portal credentials

### Task C1: Backend endpoint to create/reset portal user

**Files:**
- Modify: `backend/src/controllers/provider.controller.js`
- Modify: `backend/src/routes/provider.routes.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/controllers/__tests__/provider-portal-user.test.js`:

```js
import { jest } from '@jest/globals';

const mockPrisma = {
  apiSystem: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockBcrypt = { hash: jest.fn(async () => 'hashed-pw') };
jest.unstable_mockModule('bcryptjs', () => ({ default: mockBcrypt }));

const { default: providerController } = await import('../provider.controller.js');

function mockReq(params = {}, body = {}) { return { params, body }; }
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  mockPrisma.apiSystem.findUnique.mockReset();
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.user.create.mockReset();
  mockPrisma.user.update.mockReset();
});

test('createPortalUser rejects when ApiSystem is not PUSH', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PULL' });
  const req = mockReq({ id: 'sys1' }, { username: 'x', password: 'password123' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/PUSH/i) }));
});

test('createPortalUser rejects short passwords', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH' });
  const req = mockReq({ id: 'sys1' }, { username: 'provider-x', password: 'short' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('createPortalUser creates new User with PROVIDER role + apiSystemId', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH', slug: 'virtuales' });
  mockPrisma.user.findUnique.mockResolvedValue(null); // no existing user
  mockPrisma.user.create.mockResolvedValue({ id: 'u1', username: 'provider-x' });

  const req = mockReq({ id: 'sys1' }, { username: 'provider-x', password: 'password123' });
  const res = mockRes();
  await providerController.createPortalUser(req, res);

  expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      username: 'provider-x',
      role: 'PROVIDER',
      apiSystemId: 'sys1',
      passwordHash: 'hashed-pw',
    }),
  }));
  expect(res.status).toHaveBeenCalledWith(201);
});

test('resetPortalUserPassword updates existing user', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'sys1', mode: 'PUSH' });
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'PROVIDER', apiSystemId: 'sys1' });
  mockPrisma.user.update.mockResolvedValue({ id: 'u1' });

  const req = mockReq({ id: 'sys1' }, { password: 'newpassword99' });
  const res = mockRes();
  await providerController.resetPortalUserPassword(req, res);

  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: 'u1' },
    data: { passwordHash: 'hashed-pw' },
  });
  expect(res.status).toHaveBeenCalledWith(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
npx jest src/controllers/__tests__/provider-portal-user.test.js
```

Expected: FAIL — `createPortalUser` not defined on controller.

- [ ] **Step 3: Add the two methods to `provider.controller.js`**

Add at the top of the file (if not already imported):

```js
import bcrypt from 'bcryptjs';
```

Add two methods to the `providerController` object:

```js
async createPortalUser(req, res) {
  try {
    const { id } = req.params;
    const { username, password } = req.body || {};

    if (!username || typeof username !== 'string' || username.length < 3) {
      return res.status(400).json({ error: 'Username inválido (mínimo 3 chars)' });
    }
    if (!password || typeof password !== 'string' || password.length < 10) {
      return res.status(400).json({ error: 'Password debe tener al menos 10 caracteres' });
    }

    const system = await prisma.apiSystem.findUnique({ where: { id } });
    if (!system) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (system.mode !== 'PUSH') {
      return res.status(400).json({ error: 'Solo proveedores PUSH pueden tener portal' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ error: 'Username ya existe' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'PROVIDER',
        apiSystemId: id,
        isActive: true,
      },
      select: { id: true, username: true, role: true, apiSystemId: true, createdAt: true },
    });

    return res.status(201).json(user);
  } catch (error) {
    logger.error('Error en createPortalUser:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
},

async resetPortalUserPassword(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || password.length < 10) {
      return res.status(400).json({ error: 'Password debe tener al menos 10 caracteres' });
    }

    const system = await prisma.apiSystem.findUnique({ where: { id } });
    if (!system) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (system.mode !== 'PUSH') {
      return res.status(400).json({ error: 'Solo proveedores PUSH pueden tener portal' });
    }

    const user = await prisma.user.findUnique({
      where: { apiSystemId: id },    // if unique constraint; else use findFirst
    }).catch(() => null);
    const target = user ?? await prisma.user.findFirst({ where: { apiSystemId: id, role: 'PROVIDER' } });
    if (!target) return res.status(404).json({ error: 'No hay usuario portal para este proveedor' });

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error en resetPortalUserPassword:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
},
```

- [ ] **Step 4: Wire the routes**

In `backend/src/routes/provider.routes.js`, add (keep auth/authorize pattern consistent with existing admin-only routes in that file):

```js
router.post(
  '/systems/:id/portal-user',
  authenticate,
  authorize('ADMIN'),
  providerController.createPortalUser.bind(providerController)
);
router.put(
  '/systems/:id/portal-user/password',
  authenticate,
  authorize('ADMIN'),
  providerController.resetPortalUserPassword.bind(providerController)
);
```

Also add the GET endpoint to check portal status:

```js
router.get(
  '/systems/:id/portal-user',
  authenticate,
  authorize('ADMIN'),
  providerController.getPortalUser.bind(providerController)
);
```

And add `getPortalUser` to the controller:

```js
async getPortalUser(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findFirst({
      where: { apiSystemId: id, role: 'PROVIDER' },
      select: { id: true, username: true, isActive: true, createdAt: true },
    });
    return res.json({ exists: !!user, user: user || null });
  } catch (error) {
    logger.error('Error en getPortalUser:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
},
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend
npx jest src/controllers/__tests__/provider-portal-user.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/controllers/provider.controller.js backend/src/routes/provider.routes.js backend/src/controllers/__tests__/provider-portal-user.test.js
git commit -m "feat(provider): admin endpoints to create/reset portal user credentials"
```

---

### Task C2: Admin UI — "Acceso al portal" section in provider modal

**Files:**
- Modify: `frontend/app/admin/proveedores/page.js`

- [ ] **Step 1: Locate the edit-provider modal**

```bash
grep -n "Editar\|editingSystem\|modal" frontend/app/admin/proveedores/page.js | head -20
```

Identify where the modal body renders fields.

- [ ] **Step 2: Add "Acceso al portal" section**

Inside the edit-provider modal JSX, after existing fields and before the Save/Cancel buttons, add:

```jsx
{editingSystem?.id && editingSystem.mode === 'PUSH' && (
  <div className="border-t pt-4 mt-4">
    <h3 className="font-semibold mb-2">Acceso al portal</h3>
    <PortalUserSection systemId={editingSystem.id} />
  </div>
)}
```

- [ ] **Step 3: Add the `PortalUserSection` component**

At the top of the file (after imports), add:

```jsx
function PortalUserSection({ systemId }) {
  const [status, setStatus] = React.useState({ loading: true, exists: false, user: null });
  const [showCreate, setShowCreate] = React.useState(false);
  const [showReset, setShowReset] = React.useState(false);
  const [form, setForm] = React.useState({ username: '', password: '' });
  const [msg, setMsg] = React.useState('');

  const load = async () => {
    setStatus({ loading: true });
    const res = await fetch(`/api/providers/systems/${systemId}/portal-user`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const data = await res.json();
    setStatus({ loading: false, ...data });
  };
  React.useEffect(() => { load(); }, [systemId]);

  const onCreate = async () => {
    setMsg('');
    const res = await fetch(`/api/providers/systems/${systemId}/portal-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error || 'Error'); return; }
    setMsg(`Usuario creado: ${data.username}`);
    setShowCreate(false);
    setForm({ username: '', password: '' });
    load();
  };

  const onReset = async () => {
    setMsg('');
    const res = await fetch(`/api/providers/systems/${systemId}/portal-user/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ password: form.password }),
    });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error || 'Error'); return; }
    setMsg('Contraseña reseteada');
    setShowReset(false);
    setForm({ username: '', password: '' });
  };

  if (status.loading) return <div className="text-sm text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-2">
      {!status.exists && (
        <>
          <p className="text-sm text-gray-600">Sin usuario portal configurado.</p>
          {!showCreate ? (
            <button type="button" onClick={() => setShowCreate(true)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
              Crear usuario portal
            </button>
          ) : (
            <div className="space-y-2 border p-3 rounded bg-gray-50">
              <input placeholder="Username" value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                className="border rounded px-2 py-1 w-full text-sm" />
              <input placeholder="Password (mín 10 chars)" type="text" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="border rounded px-2 py-1 w-full text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={onCreate}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm">Crear</button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-3 py-1 bg-gray-400 text-white rounded text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
      {status.exists && (
        <>
          <p className="text-sm">
            Usuario: <strong>{status.user.username}</strong>
            {!status.user.isActive && <span className="ml-2 text-red-600">(desactivado)</span>}
          </p>
          {!showReset ? (
            <button type="button" onClick={() => setShowReset(true)}
              className="px-3 py-1 bg-yellow-600 text-white rounded text-sm">
              Resetear contraseña
            </button>
          ) : (
            <div className="space-y-2 border p-3 rounded bg-gray-50">
              <input placeholder="Nueva password (mín 10 chars)" type="text" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="border rounded px-2 py-1 w-full text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={onReset}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm">Resetear</button>
                <button type="button" onClick={() => setShowReset(false)}
                  className="px-3 py-1 bg-gray-400 text-white rounded text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="text-sm text-blue-700">{msg}</p>}
    </div>
  );
}
```

Note: If `React` isn't imported as default in this file, use explicit hooks imports instead.

- [ ] **Step 4: Manual verification in dev**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:10000/admin/proveedores`, log in as admin, click "Editar" on Virtuales (PUSH provider), verify the "Acceso al portal" section renders and shows "Sin usuario portal configurado" with a button.

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/admin/proveedores/page.js
git commit -m "feat(admin): portal user management section in provider edit modal"
```

---

## Phase D — Portal backend

### Task D1: provider-scope middleware

**Files:**
- Create: `backend/src/middlewares/provider-scope.middleware.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/middlewares/__tests__/provider-scope.test.js`:

```js
import { jest } from '@jest/globals';

const { requireProvider } = await import('../provider-scope.middleware.js');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('rejects when user is not present', () => {
  const req = {};
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('rejects when role is not PROVIDER', () => {
  const req = { user: { role: 'ADMIN', apiSystemId: null } };
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
});

test('rejects when PROVIDER but missing apiSystemId', () => {
  const req = { user: { role: 'PROVIDER', apiSystemId: null } };
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
});

test('passes and sets req.apiSystemId when valid', () => {
  const req = { user: { role: 'PROVIDER', apiSystemId: 'sys-1' } };
  const res = mockRes();
  const next = jest.fn();
  requireProvider(req, res, next);
  expect(next).toHaveBeenCalled();
  expect(req.apiSystemId).toBe('sys-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
npx jest src/middlewares/__tests__/provider-scope.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the middleware**

Create `backend/src/middlewares/provider-scope.middleware.js`:

```js
export function requireProvider(req, res, next) {
  const user = req.user;
  if (!user || user.role !== 'PROVIDER') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!user.apiSystemId) {
    return res.status(403).json({ error: 'Cuenta mal configurada, contacte admin' });
  }
  req.apiSystemId = user.apiSystemId;
  return next();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
npx jest src/middlewares/__tests__/provider-scope.test.js
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/middlewares/provider-scope.middleware.js backend/src/middlewares/__tests__/provider-scope.test.js
git commit -m "feat(middleware): requireProvider scope enforcement"
```

---

### Task D2: portal.service.js — tickets listing with forced scope

**Files:**
- Create: `backend/src/services/portal.service.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/portal-service.test.js`:

```js
import { jest } from '@jest/globals';

const mockPrisma = {
  ticket: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  draw: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  apiSystem: { findUnique: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { default: portalService } = await import('../portal.service.js');

beforeEach(() => {
  Object.values(mockPrisma).forEach(m => Object.values(m).forEach(fn => fn.mockReset()));
});

test('listTickets forces apiSystemId in where, ignores hostile filters', async () => {
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  mockPrisma.ticket.count.mockResolvedValue(0);

  await portalService.listTickets({
    apiSystemId: 'sys-ok',
    filters: { apiSystemId: 'sys-attacker', gameId: 'g1' },
    page: 1,
    pageSize: 25,
  });

  expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      apiSystemId: 'sys-ok',   // NOT sys-attacker
      source: 'WEBHOOK_PUSH',
      gameId: 'g1',
    }),
  }));
});

test('listTickets applies default date range of last 7 days', async () => {
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  mockPrisma.ticket.count.mockResolvedValue(0);
  const now = Date.now();

  await portalService.listTickets({ apiSystemId: 'sys-ok', filters: {}, page: 1, pageSize: 25 });

  const call = mockPrisma.ticket.findMany.mock.calls[0][0];
  expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  expect(call.where.createdAt.lte).toBeInstanceOf(Date);
  const spanDays = (call.where.createdAt.lte - call.where.createdAt.gte) / 86400000;
  expect(spanDays).toBeGreaterThanOrEqual(6.9);
  expect(spanDays).toBeLessThanOrEqual(7.1);
});

test('listTickets caps pageSize at 100', async () => {
  mockPrisma.ticket.findMany.mockResolvedValue([]);
  mockPrisma.ticket.count.mockResolvedValue(0);
  await portalService.listTickets({ apiSystemId: 'sys', filters: {}, page: 1, pageSize: 5000 });
  expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
});

test('getTicket returns 404-like null when ticket belongs to another provider', async () => {
  mockPrisma.ticket.findFirst.mockResolvedValue(null);
  const result = await portalService.getTicket({ apiSystemId: 'sys-a', ticketId: 't1' });
  expect(result).toBeNull();
  expect(mockPrisma.ticket.findFirst).toHaveBeenCalledWith({
    where: { id: 't1', apiSystemId: 'sys-a', source: 'WEBHOOK_PUSH' },
    include: expect.any(Object),
  });
});

test('getMe returns apiSystem info', async () => {
  mockPrisma.apiSystem.findUnique.mockResolvedValue({
    id: 'sys-1', name: 'Virtuales', slug: 'virtuales', mode: 'PUSH',
  });
  const result = await portalService.getMe({ apiSystemId: 'sys-1', user: { username: 'u1' } });
  expect(result).toEqual({
    apiSystem: { id: 'sys-1', name: 'Virtuales', slug: 'virtuales', mode: 'PUSH' },
    user: { username: 'u1' },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
npx jest src/services/__tests__/portal-service.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the service**

Create `backend/src/services/portal.service.js`:

```js
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DRAW_COMPLETED_STATUSES = ['DRAWN', 'PUBLISHED']; // PUBLISHED is legacy prod status
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function resolveDateRange(filters) {
  const now = new Date();
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(now - SEVEN_DAYS_MS);
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : now;
  return { dateFrom, dateTo };
}

function clampPageSize(size) {
  const n = Number(size) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, n), MAX_PAGE_SIZE);
}

const portalService = {
  async getMe({ apiSystemId, user }) {
    const apiSystem = await prisma.apiSystem.findUnique({
      where: { id: apiSystemId },
      select: { id: true, name: true, slug: true, mode: true },
    });
    return {
      apiSystem,
      user: { username: user.username },
    };
  },

  async listTickets({ apiSystemId, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
    const { dateFrom, dateTo } = resolveDateRange(filters);
    const take = clampPageSize(pageSize);
    const skip = (Math.max(1, Number(page)) - 1) * take;

    const where = {
      apiSystemId,                 // FORCED — cannot be overridden by filters
      source: 'WEBHOOK_PUSH',
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(filters.gameId && { gameId: filters.gameId }),
      ...(filters.status && { status: filters.status }),
    };

    const [rows, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          details: {
            include: {
              gameItem: { select: { id: true, number: true, animal: true } },
              draw: { select: { id: true, drawTime: true, status: true, winningNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.ticket.count({ where }),
    ]);

    return { rows, total, page: Number(page) || 1, pageSize: take };
  },

  async getTicket({ apiSystemId, ticketId }) {
    return prisma.ticket.findFirst({
      where: { id: ticketId, apiSystemId, source: 'WEBHOOK_PUSH' },
      include: {
        details: {
          include: {
            gameItem: { select: { id: true, number: true, animal: true } },
            draw: { select: { id: true, drawTime: true, status: true, winningNumber: true } },
          },
        },
      },
    });
  },

  async listDraws({ apiSystemId, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
    const { dateFrom, dateTo } = resolveDateRange(filters);
    const take = clampPageSize(pageSize);
    const skip = (Math.max(1, Number(page)) - 1) * take;

    // Find distinct drawIds in TicketDetail joined via Tickets of this provider
    const draws = await prisma.draw.findMany({
      where: {
        drawTime: { gte: dateFrom, lte: dateTo },
        ...(filters.gameId && { gameId: filters.gameId }),
        details: { some: { ticket: { apiSystemId, source: 'WEBHOOK_PUSH' } } },
      },
      select: {
        id: true, drawTime: true, status: true, winningNumber: true,
        game: { select: { id: true, name: true } },
        _count: { select: { details: { where: { ticket: { apiSystemId, source: 'WEBHOOK_PUSH' } } } } },
      },
      orderBy: { drawTime: 'desc' },
      skip,
      take,
    });

    const total = await prisma.draw.count({
      where: {
        drawTime: { gte: dateFrom, lte: dateTo },
        ...(filters.gameId && { gameId: filters.gameId }),
        details: { some: { ticket: { apiSystemId, source: 'WEBHOOK_PUSH' } } },
      },
    });

    return { rows: draws, total, page: Number(page) || 1, pageSize: take };
  },

  async getDraw({ apiSystemId, drawId }) {
    const draw = await prisma.draw.findFirst({
      where: { id: drawId },
      select: {
        id: true, drawTime: true, status: true, winningNumber: true,
        game: { select: { id: true, name: true } },
      },
    });
    if (!draw) return null;

    const tickets = await prisma.ticket.findMany({
      where: { apiSystemId, source: 'WEBHOOK_PUSH', details: { some: { drawId } } },
      include: {
        details: {
          where: { drawId },
          include: { gameItem: { select: { number: true, animal: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (tickets.length === 0) return null; // provider has no tickets here → hide draw

    return { draw, tickets };
  },
};

export default portalService;
```

**Note on the `_count` syntax:** Prisma may not support filtered counts nested exactly like this. If `_count.select.details.where` is rejected at runtime, replace that `select` with a plain `select` and compute the count with a post-process reduce. Verify in Step 4.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
npx jest src/services/__tests__/portal-service.test.js
```

Expected: 5 tests PASS. If the `_count` syntax fails at runtime, simplify `listDraws` to remove the `_count` field and compute ticket count separately via a second query (one count per draw is acceptable for page sizes ≤ 100).

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/services/portal.service.js backend/src/services/__tests__/portal-service.test.js
git commit -m "feat(portal): portal.service with forced apiSystemId scope"
```

---

### Task D3: portal.controller.js and portal.routes.js

**Files:**
- Create: `backend/src/controllers/portal.controller.js`
- Create: `backend/src/routes/portal.routes.js`
- Modify: `backend/src/app.js` or `backend/src/index.js` (whichever mounts routes)

- [ ] **Step 1: Locate the route-mounting file**

```bash
grep -rln "app.use.*providers\|app.use.*auth" backend/src/ --include="*.js" | head -3
```

Identify the file and the line where other routes are mounted (e.g., `app.use('/api/providers', providerRoutes)`).

- [ ] **Step 2: Write a controller integration test**

Create `backend/src/controllers/__tests__/portal-controller.test.js`:

```js
import { jest } from '@jest/globals';

const mockService = {
  getMe: jest.fn(),
  listTickets: jest.fn(),
  getTicket: jest.fn(),
  listDraws: jest.fn(),
  getDraw: jest.fn(),
};
jest.unstable_mockModule('../../services/portal.service.js', () => ({ default: mockService }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { default: portalController } = await import('../portal.controller.js');

function mockReq(overrides = {}) {
  return {
    apiSystemId: 'sys-1',
    user: { id: 'u1', username: 'uuu', apiSystemId: 'sys-1', role: 'PROVIDER' },
    params: {},
    query: {},
    ...overrides,
  };
}
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => Object.values(mockService).forEach(fn => fn.mockReset()));

test('getMe returns 200 with service result', async () => {
  mockService.getMe.mockResolvedValue({ apiSystem: { id: 'sys-1' }, user: { username: 'uuu' } });
  const req = mockReq();
  const res = mockRes();
  await portalController.getMe(req, res);
  expect(mockService.getMe).toHaveBeenCalledWith({ apiSystemId: 'sys-1', user: req.user });
  expect(res.json).toHaveBeenCalledWith({ apiSystem: { id: 'sys-1' }, user: { username: 'uuu' } });
});

test('getTicket returns 404 when service returns null', async () => {
  mockService.getTicket.mockResolvedValue(null);
  const req = mockReq({ params: { id: 'wrong' } });
  const res = mockRes();
  await portalController.getTicket(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('listTickets passes query filters to service', async () => {
  mockService.listTickets.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });
  const req = mockReq({ query: { gameId: 'g1', status: 'ACTIVE', page: '2', pageSize: '50' } });
  const res = mockRes();
  await portalController.listTickets(req, res);
  expect(mockService.listTickets).toHaveBeenCalledWith({
    apiSystemId: 'sys-1',
    filters: expect.objectContaining({ gameId: 'g1', status: 'ACTIVE' }),
    page: '2',
    pageSize: '50',
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend
npx jest src/controllers/__tests__/portal-controller.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create the controller**

Create `backend/src/controllers/portal.controller.js`:

```js
import portalService from '../services/portal.service.js';
import logger from '../lib/logger.js';

const portalController = {
  async getMe(req, res) {
    try {
      const result = await portalService.getMe({ apiSystemId: req.apiSystemId, user: req.user });
      return res.json(result);
    } catch (err) {
      logger.error('portal.getMe:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async listTickets(req, res) {
    try {
      const { dateFrom, dateTo, gameId, status, page, pageSize } = req.query;
      const result = await portalService.listTickets({
        apiSystemId: req.apiSystemId,
        filters: { dateFrom, dateTo, gameId, status },
        page, pageSize,
      });
      return res.json(result);
    } catch (err) {
      logger.error('portal.listTickets:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async getTicket(req, res) {
    try {
      const result = await portalService.getTicket({
        apiSystemId: req.apiSystemId,
        ticketId: req.params.id,
      });
      if (!result) return res.status(404).json({ error: 'No encontrado' });
      return res.json(result);
    } catch (err) {
      logger.error('portal.getTicket:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async listDraws(req, res) {
    try {
      const { dateFrom, dateTo, gameId, page, pageSize } = req.query;
      const result = await portalService.listDraws({
        apiSystemId: req.apiSystemId,
        filters: { dateFrom, dateTo, gameId },
        page, pageSize,
      });
      return res.json(result);
    } catch (err) {
      logger.error('portal.listDraws:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async getDraw(req, res) {
    try {
      const result = await portalService.getDraw({
        apiSystemId: req.apiSystemId,
        drawId: req.params.id,
      });
      if (!result) return res.status(404).json({ error: 'No encontrado' });
      return res.json(result);
    } catch (err) {
      logger.error('portal.getDraw:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },
};

export default portalController;
```

- [ ] **Step 5: Create the routes**

Create `backend/src/routes/portal.routes.js`:

```js
import express from 'express';
import portalController from '../controllers/portal.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireProvider } from '../middlewares/provider-scope.middleware.js';

const router = express.Router();

router.use(authenticate, requireProvider);

router.get('/me', portalController.getMe);
router.get('/tickets', portalController.listTickets);
router.get('/tickets/:id', portalController.getTicket);
router.get('/draws', portalController.listDraws);
router.get('/draws/:id', portalController.getDraw);

export default router;
```

- [ ] **Step 6: Mount the routes**

In the Express app bootstrap file (`backend/src/app.js` or `backend/src/index.js`), add:

```js
import portalRoutes from './routes/portal.routes.js';
// ... where other routes are mounted:
app.use('/api/portal', portalRoutes);
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd backend
npx jest src/controllers/__tests__/portal-controller.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 8: Smoke test the running server**

In one terminal:
```bash
cd backend && npm run dev
```

In another:
```bash
# Should return 401 (no token)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/portal/me
```

Expected: `401`.

- [ ] **Step 9: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/controllers/portal.controller.js backend/src/controllers/__tests__/portal-controller.test.js backend/src/routes/portal.routes.js backend/src/app.js backend/src/index.js
git commit -m "feat(portal): routes and controller under /api/portal"
```

(Only stage `app.js` or `index.js` if you actually modified them.)

---

### Task D4: Rate limit on /api/portal

**Files:**
- Modify: `backend/src/routes/portal.routes.js`
- Possibly modify: `backend/package.json` (only if `express-rate-limit` not installed)

- [ ] **Step 1: Check if express-rate-limit is installed**

```bash
grep express-rate-limit backend/package.json
```

If not present:
```bash
cd backend && npm install express-rate-limit
```

- [ ] **Step 2: Add rate limiter to portal routes**

Edit `backend/src/routes/portal.routes.js`. Add after imports, before `router.use(authenticate, ...)`:

```js
import rateLimit from 'express-rate-limit';

const portalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

router.use(portalLimiter);
router.use(authenticate, requireProvider);
```

- [ ] **Step 3: Manual smoke test**

With backend running, hammer the endpoint:

```bash
for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/portal/me; done | sort | uniq -c
```

Expected: ~120 of `401` (auth rejected but passed limiter), then `429` once limit hits.

- [ ] **Step 4: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/routes/portal.routes.js backend/package.json backend/package-lock.json
git commit -m "feat(portal): rate limit 120 req/min on /api/portal"
```

---

## Phase E — Frontend portal

### Task E1: Login redirect by role

**Files:**
- Modify: `frontend/app/admin/login/page.js`

- [ ] **Step 1: Locate the post-login redirect**

```bash
grep -n "router.replace\|router.push" frontend/app/admin/login/page.js
```

- [ ] **Step 2: Modify the redirect logic**

Find the block that runs on successful login (where the existing redirect to `/admin` happens). Replace it with (adapting variable names to match the file — the token/user may be under different names):

```js
// After login success; `user` comes from the login response
const role = user?.role;
if (role === 'PROVIDER') router.replace('/proveedor');
else if (role === 'PLAYER') router.replace('/jugar');
else router.replace('/admin');
```

- [ ] **Step 3: Manual test**

```bash
cd frontend && npm run dev
```

Create a test PROVIDER user via the admin panel or seed script. Log in at `http://localhost:10000/admin/login`. Verify it redirects to `/proveedor` (the page will 404 until Task E2 — that's expected).

- [ ] **Step 4: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/admin/login/page.js
git commit -m "feat(auth-ui): role-based redirect after login"
```

---

### Task E2: Provider portal layout + guard

**Files:**
- Create: `frontend/app/proveedor/layout.js`
- Create: `frontend/app/proveedor/page.js`

- [ ] **Step 1: Create the layout**

Create `frontend/app/proveedor/layout.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export default function ProviderLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const decoded = token ? decodeJwt(token) : null;
    if (!decoded || decoded.role !== 'PROVIDER' || !decoded.apiSystemId) {
      router.replace('/admin/login');
      return;
    }
    fetch('/api/portal/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setMe(data); setReady(true); })
      .catch(() => router.replace('/admin/login'));
  }, [router]);

  const logout = () => {
    localStorage.removeItem('token');
    router.replace('/admin/login');
  };

  if (!ready) return <div className="p-8 text-gray-500">Cargando...</div>;

  const nav = [
    { href: '/proveedor/tickets', label: 'Tickets' },
    { href: '/proveedor/sorteos', label: 'Sorteos' },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r p-4 flex flex-col">
        <div className="mb-6">
          <div className="text-xs text-gray-500">Portal</div>
          <div className="font-semibold">{me.apiSystem.name}</div>
        </div>
        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={`block px-3 py-2 rounded text-sm ${pathname?.startsWith(n.href) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout}
          className="mt-4 px-3 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">
          Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create the root page (redirect to tickets)**

Create `frontend/app/proveedor/page.js`:

```jsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProviderHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/proveedor/tickets'); }, [router]);
  return null;
}
```

- [ ] **Step 3: Manual test**

Visit `http://localhost:10000/proveedor` logged in as PROVIDER — should redirect to `/proveedor/tickets` (404 for now until E3).
Log out, visit `http://localhost:10000/proveedor` — should redirect to `/admin/login`.

- [ ] **Step 4: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/proveedor/layout.js frontend/app/proveedor/page.js
git commit -m "feat(portal-ui): layout with guard and sidebar"
```

---

### Task E3: Tickets list page

**Files:**
- Create: `frontend/app/proveedor/tickets/page.js`
- Create: `frontend/lib/portal-api.js` (shared fetch helpers)

- [ ] **Step 1: Create the shared API helper**

Create `frontend/lib/portal-api.js`:

```js
export async function portalFetch(path, { params } = {}) {
  const token = localStorage.getItem('token');
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.pathname + url.search, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Create the tickets list page**

Create `frontend/app/proveedor/tickets/page.js`:

```jsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-api';

function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

export default function TicketsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);

  const filters = {
    dateFrom: sp.get('dateFrom') ?? todayISO(-7),
    dateTo: sp.get('dateTo') ?? todayISO(0),
    gameId: sp.get('gameId') ?? '',
    status: sp.get('status') ?? '',
    page: sp.get('page') ?? '1',
    pageSize: '25',
  };

  useEffect(() => {
    setLoading(true);
    portalFetch('/api/portal/tickets', { params: filters })
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo, filters.gameId, filters.status, filters.page]);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.set('page', '1');
    router.replace(`/proveedor/tickets?${next.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Tickets</h1>
      <div className="flex gap-2 mb-4 items-end">
        <label className="text-sm">Desde
          <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
            className="block border rounded px-2 py-1" />
        </label>
        <label className="text-sm">Hasta
          <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)}
            className="block border rounded px-2 py-1" />
        </label>
        <label className="text-sm">Estado
          <select value={filters.status} onChange={e => setFilter('status', e.target.value)}
            className="block border rounded px-2 py-1">
            <option value="">Todos</option>
            <option value="ACTIVE">Active</option>
            <option value="WINNING">Winning</option>
            <option value="LOSING">Losing</option>
            <option value="ANNULLED">Annulled</option>
          </select>
        </label>
      </div>

      {loading ? <div className="text-gray-500">Cargando...</div> : (
        <>
          <div className="bg-white border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">ID Externo</th>
                  <th className="text-left px-3 py-2">Monto</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2"># Jugadas</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(t => (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{new Date(t.createdAt).toLocaleString('es-VE')}</td>
                    <td className="px-3 py-2">
                      <Link className="text-blue-600 hover:underline" href={`/proveedor/tickets/${t.id}`}>
                        {t.externalTicketId}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{Number(t.totalAmount).toLocaleString('es-VE')}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.details?.length ?? 0}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4 text-sm">
            <div>Total: {data.total}</div>
            <div className="flex gap-2 items-center">
              <button disabled={data.page <= 1}
                onClick={() => setFilter('page', String(Number(filters.page) - 1))}
                className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
              <span>Página {data.page} / {totalPages}</span>
              <button disabled={data.page >= totalPages}
                onClick={() => setFilter('page', String(Number(filters.page) + 1))}
                className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual test**

Log in as PROVIDER. Visit `/proveedor/tickets`. Verify tickets load, filters update URL, pagination works. Try `/proveedor/tickets?dateFrom=2026-01-01&dateTo=2026-12-31` to confirm deep-link works.

- [ ] **Step 4: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/proveedor/tickets/page.js frontend/lib/portal-api.js
git commit -m "feat(portal-ui): tickets list page with filters and pagination"
```

---

### Task E4: Ticket detail page

**Files:**
- Create: `frontend/app/proveedor/tickets/[id]/page.js`

- [ ] **Step 1: Create the detail page**

Create `frontend/app/proveedor/tickets/[id]/page.js`:

```jsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '@/lib/portal-api';

export default function TicketDetailPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    portalFetch(`/api/portal/tickets/${id}`)
      .then(setTicket)
      .catch(e => setError(e.message));
  }, [id]);

  if (error) return <div className="text-red-600">No encontrado</div>;
  if (!ticket) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div>
      <Link className="text-sm text-blue-600 hover:underline" href="/proveedor/tickets">← Volver</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">Ticket {ticket.externalTicketId}</h1>

      <div className="bg-white border rounded p-4 mb-4 grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-gray-500">Fecha:</span> {new Date(ticket.createdAt).toLocaleString('es-VE')}</div>
        <div><span className="text-gray-500">Estado:</span> {ticket.status}</div>
        <div><span className="text-gray-500">Monto total:</span> {Number(ticket.totalAmount).toLocaleString('es-VE')}</div>
        <div><span className="text-gray-500">Jugadas:</span> {ticket.details?.length ?? 0}</div>
      </div>

      <h2 className="font-semibold mb-2">Jugadas</h2>
      <div className="bg-white border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Número</th>
              <th className="text-left px-3 py-2">Animal</th>
              <th className="text-left px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Mult</th>
              <th className="text-left px-3 py-2">Sorteo</th>
              <th className="text-left px-3 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {ticket.details?.map(d => {
              const drawDone = d.draw?.status === 'DRAWN' || d.draw?.status === 'PUBLISHED';
              const isWinner = drawDone && d.draw?.winningNumber === d.gameItem?.number;
              return (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2">{d.gameItem?.number}</td>
                  <td className="px-3 py-2">{d.gameItem?.animal ?? '-'}</td>
                  <td className="px-3 py-2">{Number(d.amount).toLocaleString('es-VE')}</td>
                  <td className="px-3 py-2">{d.multiplier ?? 1}</td>
                  <td className="px-3 py-2">{d.draw ? new Date(d.draw.drawTime).toLocaleString('es-VE') : '-'}</td>
                  <td className="px-3 py-2">
                    {!drawDone ? <span className="text-gray-400">Pendiente</span>
                      : isWinner ? <span className="text-green-700 font-semibold">GANADOR</span>
                      : <span className="text-gray-500">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual test**

Click on a ticket from the list page. Verify details render and the "GANADOR" flag appears correctly on plays where the draw already happened and the number matches.

- [ ] **Step 3: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/proveedor/tickets/[id]/page.js
git commit -m "feat(portal-ui): ticket detail page with winner indicator"
```

---

### Task E5: Sorteos list page

**Files:**
- Create: `frontend/app/proveedor/sorteos/page.js`

- [ ] **Step 1: Create the page**

Create `frontend/app/proveedor/sorteos/page.js`:

```jsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-api';

function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

export default function SorteosPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);

  const filters = {
    dateFrom: sp.get('dateFrom') ?? todayISO(-7),
    dateTo: sp.get('dateTo') ?? todayISO(0),
    gameId: sp.get('gameId') ?? '',
    page: sp.get('page') ?? '1',
    pageSize: '25',
  };

  useEffect(() => {
    setLoading(true);
    portalFetch('/api/portal/draws', { params: filters })
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo, filters.gameId, filters.page]);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.set('page', '1');
    router.replace(`/proveedor/sorteos?${next.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Sorteos</h1>
      <div className="flex gap-2 mb-4 items-end">
        <label className="text-sm">Desde
          <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
            className="block border rounded px-2 py-1" />
        </label>
        <label className="text-sm">Hasta
          <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)}
            className="block border rounded px-2 py-1" />
        </label>
      </div>

      {loading ? <div className="text-gray-500">Cargando...</div> : (
        <>
          <div className="bg-white border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Juego</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Número ganador</th>
                  <th className="text-left px-3 py-2"># Tickets</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(d => (
                  <tr key={d.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{new Date(d.drawTime).toLocaleString('es-VE')}</td>
                    <td className="px-3 py-2">
                      <Link className="text-blue-600 hover:underline" href={`/proveedor/sorteos/${d.id}`}>
                        {d.game?.name ?? '-'}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{d.status}</td>
                    <td className="px-3 py-2">
                      {(d.status === 'DRAWN' || d.status === 'PUBLISHED') ? d.winningNumber : <span className="text-gray-400">Pendiente</span>}
                    </td>
                    <td className="px-3 py-2">{d._count?.details ?? '-'}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4 text-sm">
            <div>Total: {data.total}</div>
            <div className="flex gap-2 items-center">
              <button disabled={data.page <= 1}
                onClick={() => setFilter('page', String(Number(filters.page) - 1))}
                className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
              <span>Página {data.page} / {totalPages}</span>
              <button disabled={data.page >= totalPages}
                onClick={() => setFilter('page', String(Number(filters.page) + 1))}
                className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual test**

Visit `/proveedor/sorteos`. Verify draws load, only those where the provider has tickets appear, winning number shows for completed draws.

- [ ] **Step 3: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/proveedor/sorteos/page.js
git commit -m "feat(portal-ui): sorteos list page"
```

---

### Task E6: Sorteo detail page

**Files:**
- Create: `frontend/app/proveedor/sorteos/[id]/page.js`

- [ ] **Step 1: Create the page**

Create `frontend/app/proveedor/sorteos/[id]/page.js`:

```jsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '@/lib/portal-api';

export default function SorteoDetailPage() {
  const { id } = useParams();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    portalFetch(`/api/portal/draws/${id}`)
      .then(setPayload)
      .catch(e => setError(e.message));
  }, [id]);

  if (error) return <div className="text-red-600">No encontrado</div>;
  if (!payload) return <div className="text-gray-500">Cargando...</div>;

  const { draw, tickets } = payload;
  const drawDone = draw.status === 'DRAWN' || draw.status === 'PUBLISHED';

  return (
    <div>
      <Link className="text-sm text-blue-600 hover:underline" href="/proveedor/sorteos">← Volver</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">{draw.game?.name}</h1>

      <div className="bg-white border rounded p-4 mb-4 grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-gray-500">Fecha:</span> {new Date(draw.drawTime).toLocaleString('es-VE')}</div>
        <div><span className="text-gray-500">Estado:</span> {draw.status}</div>
        <div className="col-span-2">
          <span className="text-gray-500">Número ganador:</span>{' '}
          {drawDone ? <span className="font-bold text-lg">{draw.winningNumber}</span> : <span className="text-gray-400">Pendiente</span>}
        </div>
      </div>

      <h2 className="font-semibold mb-2">Tickets</h2>
      <div className="bg-white border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">ID Externo</th>
              <th className="text-left px-3 py-2">Jugadas en este sorteo</th>
              <th className="text-left px-3 py-2">Ganador</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => {
              const hasWinner = drawDone && t.details.some(d => d.gameItem?.number === draw.winningNumber);
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2">{new Date(t.createdAt).toLocaleString('es-VE')}</td>
                  <td className="px-3 py-2">
                    <Link className="text-blue-600 hover:underline" href={`/proveedor/tickets/${t.id}`}>
                      {t.externalTicketId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {t.details.map(d => d.gameItem?.number).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    {!drawDone ? <span className="text-gray-400">—</span>
                      : hasWinner ? <span className="text-green-700 font-semibold">SÍ</span>
                      : <span className="text-gray-500">No</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual test**

Click on a draw from the list. Verify tickets in that draw appear, winning number shows, "SÍ" flag is green where applicable.

- [ ] **Step 3: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add frontend/app/proveedor/sorteos/[id]/page.js
git commit -m "feat(portal-ui): sorteo detail page with winner flag"
```

---

## Phase F — Local verification and production deploy

### Task F1: Local end-to-end verification checklist

**Files:** none (manual checklist)

- [ ] **Step 1: Ensure everything is running**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
docker-compose up -d
cd backend && npm run dev &
cd ../frontend && npm run dev &
```

- [ ] **Step 2: Run full backend test suite**

```bash
cd backend && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Create a test PROVIDER via admin UI**

1. Go to `http://localhost:10000/admin/login`, log in as admin
2. Go to `/admin/proveedores`, click "Editar" on Virtuales
3. In "Acceso al portal" section, click "Crear usuario portal"
4. Username: `test-virtuales`, password: `testpass1234`
5. Save — verify the UI now shows the user exists

- [ ] **Step 4: Log in as the provider**

1. Log out
2. Log in at `/admin/login` with `test-virtuales` / `testpass1234`
3. Verify redirect to `/proveedor/tickets`

- [ ] **Step 5: Walk the UI**

- Tickets list loads; filters update URL; pagination works; clicking row opens detail
- Ticket detail shows jugadas, winner flag behaves correctly
- Sorteos list shows only sorteos with this provider's tickets
- Sorteo detail shows tickets + winner flag
- Navigate to `/admin/usuarios` — should be blocked (redirect to login or 403 depending on existing admin guard)

- [ ] **Step 6: Negative test — cross-provider isolation**

If you have two different PUSH providers with tickets in the DB:
1. Note a `ticketId` belonging to Premier
2. Log in as Virtuales provider
3. Visit `/proveedor/tickets/<premier-ticket-id>`
4. Expected: "No encontrado" (404, not 403)

- [ ] **Step 7: No commit** (checklist only)

---

### Task F2: Production deploy to VPS 144

**Files:** none (shell operations)

- [ ] **Step 1: Push `diazhh` branch**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git push origin diazhh
```

- [ ] **Step 2: Backup prod DB**

```bash
ssh 144 "PGPASSWORD='ToteSecure2024*' pg_dump -U tote_user -h localhost -p 5433 tote_db > /var/backups/tote_db_$(date +%Y%m%d_%H%M%S).sql && ls -lh /var/backups/ | tail -3"
```

Expected: listing shows new backup file, non-zero size.

- [ ] **Step 3: Pull code on VPS**

```bash
ssh 144 "cd /var/proyectos/tote-web && git fetch origin && git checkout diazhh && git pull"
```

Expected: "Fast-forward" or "Already up to date" + correct branch.

- [ ] **Step 4: Backend — install deps, apply schema, regenerate client**

**Production-safety note:** this project uses `prisma db push` (not migrations). `db push` WITHOUT the `--accept-data-loss` flag will refuse to run if it detects any destructive change, making it safe for our additive-only schema changes. Do NOT add `--accept-data-loss` under any circumstance.

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && npm ci"
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma db push"
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma generate"
```

Expected: `db push` reports only additive changes (`PROVIDER` enum value, `User.apiSystemId` column + FK + index, composite `Ticket(apiSystemId, createdAt)` index). If the command exits non-zero with a "data loss" error, STOP and investigate — production schema has drifted from the version tested locally.

- [ ] **Step 5: Run backfill in production**

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/backfill-ticket-apisystem.js"
```

Expected log: `Backfill finished: processed=N updated=N skipped=M`. Check `M` (skipped) — if > 0, inspect a few of those tickets for why slug resolution failed.

- [ ] **Step 6: Frontend build**

```bash
ssh 144 "cd /var/proyectos/tote-web/frontend && npm ci && npm run build"
```

Expected: build succeeds with no TypeScript/ESLint errors that fail the build.

- [ ] **Step 7: Restart pm2 processes**

```bash
ssh 144 "pm2 restart tote-backend && pm2 restart tote-frontend && pm2 save"
```

- [ ] **Step 8: Smoke test in production**

```bash
ssh 144 "pm2 logs tote-backend --lines 30 --nostream"
curl -s -o /dev/null -w "portal-me: %{http_code}\n" https://tote.atilax.io/api/portal/me
```

Expected: backend log shows server up (no crash loops), `portal-me: 401` (auth required).

- [ ] **Step 9: Create real provider credentials**

Log into `https://tote.atilax.io/admin/proveedores` as admin:
1. Edit Virtuales → "Crear usuario portal" → chosen username + strong password
2. Edit Premier → same
3. Deliver credentials to each provider through a secure channel (out-of-band)

- [ ] **Step 10: Verify provider can log in (one coordinated test with the real provider)**

Ask one provider to log in and confirm they see tickets. Monitor `pm2 logs tote-backend` for errors during their session.

- [ ] **Step 11: Monitor for 24-48 hours before considering the feature stable**

Watch logs, watch for 5xx spikes. Rollback plan (Task F3) is available if needed.

---

### Task F3: Rollback plan (reference only — only execute if something fails)

**Files:** none (shell operations)

- [ ] **Step 1: Revert code to previous commit on VPS**

```bash
# Identify the pre-deploy commit
ssh 144 "cd /var/proyectos/tote-web && git log --oneline -5"
# Checkout the previous commit
ssh 144 "cd /var/proyectos/tote-web && git checkout <pre-deploy-sha>"
```

- [ ] **Step 2: Roll back the schema changes**

Project uses `db push`, not migrations. Revert schema by dropping only what this feature added:
- `User.apiSystemId` column + its index (ADDED by this feature)
- `Ticket(apiSystemId, createdAt)` composite index (ADDED by this feature)

**Do NOT drop `Ticket.apiSystemId` column or its single-column index — those pre-existed.** Leaving the `PROVIDER` enum value in `UserRole` is harmless (Postgres enum values can't be removed without recreating the type; no User rows should have `role='PROVIDER'` after this rollback since the column is dropped).

```bash
ssh 144 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 tote_db -c '
  DROP INDEX IF EXISTS \"User_apiSystemId_idx\";
  ALTER TABLE \"User\" DROP COLUMN IF EXISTS \"apiSystemId\";
  DROP INDEX IF EXISTS \"Ticket_apiSystemId_createdAt_idx\";
'"
```

After dropping columns/indexes, reset `backend/prisma/schema.prisma` to the pre-feature state (via `git checkout <pre-deploy-sha> -- backend/prisma/schema.prisma`) and regenerate the client:

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma generate"
```

- [ ] **Step 3: If data corruption — restore backup**

```bash
ssh 144 "ls -lt /var/backups/ | head -3"
ssh 144 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 tote_db < /var/backups/tote_db_<timestamp>.sql"
```

- [ ] **Step 4: Rebuild frontend and restart**

```bash
ssh 144 "cd /var/proyectos/tote-web/frontend && npm ci && npm run build"
ssh 144 "pm2 restart tote-backend tote-frontend"
```

---

## Done criteria

- [ ] All backend unit and integration tests pass locally (`cd backend && npm test`)
- [ ] Local manual walkthrough (Task F1) succeeds end-to-end
- [ ] Production smoke test (Task F2 step 8) returns 401 on `/api/portal/me`
- [ ] At least one real provider logs in successfully and sees their tickets
- [ ] No 5xx error spike in `pm2 logs tote-backend` during the 24h monitoring window

---

## Notes for the implementer

- **ESM tests:** this codebase uses `jest.unstable_mockModule` with dynamic `import` — do not use `jest.mock()` from CommonJS. See `backend/src/controllers/__tests__/provider.controller.test.js` for the canonical pattern.
- **Existing auth middleware:** `authenticate` in `backend/src/middlewares/auth.middleware.js` populates `req.user` from JWT. Don't try to re-verify the token in the portal middleware.
- **Status `PUBLISHED` vs `DRAWN`:** production uses the legacy `PUBLISHED` status for completed draws. Always filter with `IN ('DRAWN', 'PUBLISHED')` in portal queries. Local dev uses only `DRAWN`.
- **Game IDs:** identical between local and production (see `CLAUDE.md`). You can use production-style seed data locally.
- **No dev-only features:** the portal is read-only and has no destructive endpoints. If you find yourself adding one, stop and ask.
