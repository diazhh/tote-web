# Contabilidad v2 — Cuentas, Saldo Inicial, Flujo de Caja y Mobile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolucionar el módulo `/admin/contabilidad` para soportar múltiples cuentas/billeteras con saldo inicial, transferencias entre cuentas, reportes de flujo de caja diario/semanal/mensual con Excel y PDF, upload de comprobantes al crear asiento, y UI 100% mobile en español.

**Architecture:** Reusa el patrón existente del módulo (service puro + controller con AuditLog + routes con auth + frontend con `lib/api/contabilidad.js`). Tres modelos Prisma nuevos (`Account`, `Transfer`, `TransferAttachment`) + un campo `accountId` agregado a `AccountingEntry`. Nuevo servicio `cash-flow.service.js` con motor de cálculo dinámico (sin snapshots) y exports Excel/PDF heredando del patrón de `pnl-report.service.js`. Frontend rediseña la home como dashboard, agrega tabs Cuentas/Transferencias/Reportes, y refactoriza la lista de asientos en una vista cards-en-móvil.

**Tech Stack:** Node.js + Express + Prisma + PostgreSQL 16 (backend), Next.js 14 App Router + TailwindCSS v4 + Zustand (frontend), Jest (tests), decimal.js (aritmética), exceljs + pdfkit (exports).

**Spec:** `docs/superpowers/specs/2026-05-16-contabilidad-cuentas-flujo-caja-design.md`

---

## File Structure

### Backend — archivos nuevos

| Path | Responsabilidad |
|---|---|
| `backend/prisma/migrations/<ts>_contabilidad_v2/migration.sql` | Crear `Account`, `Transfer`, `TransferAttachment`; agregar `accountId` a `AccountingEntry`; insertar cuenta "Sin clasificar"; backfill. |
| `backend/src/services/account.service.js` | CRUD de cuentas + cálculo de saldo actual. |
| `backend/src/services/transfer.service.js` | CRUD de transferencias + reversal. |
| `backend/src/services/cash-flow.service.js` | Motor de reportes diario/semanal/mensual/rango + exports Excel/PDF. |
| `backend/src/services/transfer-attachment.service.js` | Validación + persistencia de comprobantes de transferencias (mismo patrón que `attachment.service.js`). |
| `backend/src/controllers/account.controller.js` | HTTP handlers de cuentas. |
| `backend/src/controllers/transfer.controller.js` | HTTP handlers de transferencias + adjuntos. |
| `backend/src/controllers/cash-flow.controller.js` | HTTP handlers de flujo de caja + descargas. |
| `backend/src/__tests__/account.service.test.js` | Tests de servicio cuenta. |
| `backend/src/__tests__/transfer.service.test.js` | Tests de servicio transferencia. |
| `backend/src/__tests__/cash-flow.service.test.js` | Tests del motor de reportes. |
| `backend/src/__tests__/contabilidad-v2.integration.test.js` | E2E sobre el inline-app pattern. |

### Backend — archivos a modificar

| Path | Cambio |
|---|---|
| `backend/prisma/schema.prisma` | Modelos `Account` / `Transfer` / `TransferAttachment` + campo `accountId` en `AccountingEntry`. |
| `backend/src/services/accounting-entry.service.js` | Validar `accountId` + moneda al crear. |
| `backend/src/controllers/accounting-entry.controller.js` | Aceptar `accountId` en body; rechazarlo en PATCH. |
| `backend/src/routes/contabilidad.routes.js` | Registrar rutas nuevas. |

### Frontend — archivos nuevos

| Path | Responsabilidad |
|---|---|
| `frontend/app/admin/contabilidad/cuentas/page.js` | Lista de cuentas con saldos actuales. |
| `frontend/app/admin/contabilidad/cuentas/nueva/page.js` | Form de cuenta nueva con saldo inicial. |
| `frontend/app/admin/contabilidad/cuentas/[id]/page.js` | Detalle de cuenta + últimos movimientos + edit limitado. |
| `frontend/app/admin/contabilidad/transferencias/page.js` | Lista de transferencias. |
| `frontend/app/admin/contabilidad/transferencias/nueva/page.js` | Form crear transferencia. |
| `frontend/app/admin/contabilidad/transferencias/[id]/page.js` | Detalle + adjuntos + reversal. |
| `frontend/app/admin/contabilidad/reportes/page.js` | Selector vista + reporte de flujo de caja. |
| `frontend/components/contabilidad/AttachmentPicker.js` | Widget compartido para tomar foto / elegir archivo con thumbnail. |
| `frontend/components/contabilidad/MoneyBadge.js` | Badge tipo/monto compartido (español, color por tipo). |

### Frontend — archivos a modificar

| Path | Cambio |
|---|---|
| `frontend/lib/api/contabilidad.js` | Funciones cuentas, transferencias, flujo-caja. |
| `frontend/app/admin/contabilidad/page.js` | Convertir en dashboard. |
| `frontend/app/admin/contabilidad/asientos/page.js` | Vista cards móvil, filtros colapsables, filtro cuenta, badges en español. |
| `frontend/app/admin/contabilidad/asientos/nueva/page.js` | Selector cuenta + AttachmentPicker integrado + español. |
| `frontend/app/admin/contabilidad/asientos/[id]/page.js` | Mostrar cuenta, españolizar badges. |
| `frontend/app/admin/contabilidad/pagos/page.js` | Mobile pulido + español. |
| `frontend/app/admin/contabilidad/categorias/page.js` | Mobile pulido. |
| `frontend/app/admin/contabilidad/tasas/page.js` | Mobile pulido. |

---

## Phase A — Backend Foundation (schema + services)

### Task A1: Prisma schema — agregar Account, Transfer, TransferAttachment y accountId

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Añadir los enums si fueran necesarios (no se necesita ninguno nuevo — `AccountingCurrency` ya existe)**

Verifica que `AccountingCurrency` ya tenga `BsF` y `USD`:

```bash
grep -A 3 "enum AccountingCurrency" backend/prisma/schema.prisma
```

Expected: dos valores `BsF` y `USD`.

- [ ] **Step 2: Agregar `accountId` opcional a `AccountingEntry`**

En `backend/prisma/schema.prisma`, dentro de `model AccountingEntry`, añade el campo y la relación. Ubícalo justo después de `settlementId`:

```prisma
  // v2: cuenta/billetera afectada. NULLABLE para retrocompatibilidad — el servicio
  // exige que esté presente en creates nuevos. IMMUTABLE post-create.
  accountId String?
  account   Account? @relation(fields: [accountId], references: [id])
```

Y agrega el index al final del bloque:

```prisma
  @@index([accountId, entryDate])
```

- [ ] **Step 3: Agregar los tres modelos nuevos al final del schema**

Justo antes del marcador `// Phase v1.4 — performance / cache layer`, agrega:

```prisma
// ============================================================================
// v2 contabilidad — cuentas, transferencias (spec 2026-05-16)
// ============================================================================

model Account {
  id             String             @id @default(uuid())
  name           String
  currency       AccountingCurrency
  openingBalance Decimal            @db.Decimal(18, 8)
  openingDate    DateTime           @db.Date
  isActive       Boolean            @default(true)
  sortOrder      Int                @default(0)
  createdById    String
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  createdBy    User              @relation("AccountCreatedBy", fields: [createdById], references: [id])
  entries      AccountingEntry[]
  transfersOut Transfer[]        @relation("TransferFrom")
  transfersIn  Transfer[]        @relation("TransferTo")

  @@index([isActive, sortOrder])
}

model Transfer {
  id             String   @id @default(uuid())
  transferDate   DateTime @db.Date
  fromAccountId  String
  toAccountId    String
  amountFrom     Decimal  @db.Decimal(18, 8)
  amountTo       Decimal  @db.Decimal(18, 8)
  exchangeRateId String?
  description    String
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  reversesId     String?  @unique
  reversedById   String?  @unique
  reversalReason String?

  sequentialNo   Int      @unique @default(autoincrement())

  fromAccount  Account              @relation("TransferFrom", fields: [fromAccountId], references: [id])
  toAccount    Account              @relation("TransferTo",   fields: [toAccountId],   references: [id])
  exchangeRate ExchangeRate?        @relation(fields: [exchangeRateId], references: [id])
  createdBy    User                 @relation("TransferCreatedBy", fields: [createdById], references: [id])
  attachments  TransferAttachment[]

  reverses   Transfer? @relation("TransferReversal", fields: [reversesId], references: [id])
  reversedBy Transfer? @relation("TransferReversal")

  @@index([transferDate])
  @@index([fromAccountId, transferDate])
  @@index([toAccountId, transferDate])
}

model TransferAttachment {
  id           String   @id @default(uuid())
  transferId   String
  filename     String
  originalName String
  mimeType     String
  sizeBytes    Int
  uploadedById String
  uploadedAt   DateTime @default(now())

  transfer   Transfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  uploadedBy User     @relation("TransferAttachmentUploader", fields: [uploadedById], references: [id])

  @@index([transferId])
}
```

- [ ] **Step 4: Agregar las back-relations al modelo `User`**

Busca `model User` en `schema.prisma` y dentro de él añade:

```prisma
  accountsCreated      Account[]            @relation("AccountCreatedBy")
  transfersCreated     Transfer[]           @relation("TransferCreatedBy")
  transferAttachments  TransferAttachment[] @relation("TransferAttachmentUploader")
```

- [ ] **Step 5: Agregar back-relation a `ExchangeRate`**

Busca `model ExchangeRate` y dentro de él añade:

```prisma
  transfers Transfer[]
```

- [ ] **Step 6: Generar migración**

```bash
cd backend && npx prisma migrate dev --name contabilidad_v2_accounts_transfers --create-only
```

Expected: archivo nuevo en `backend/prisma/migrations/<ts>_contabilidad_v2_accounts_transfers/migration.sql`.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(contabilidad): schema + migration for accounts, transfers, attachments"
```

---

### Task A2: Migration — backfill accountId con cuenta "Sin clasificar"

**Files:**
- Modify: `backend/prisma/migrations/<ts>_contabilidad_v2_accounts_transfers/migration.sql`

- [ ] **Step 1: Editar la migración generada para añadir el INSERT + UPDATE de backfill**

Abre el archivo `migration.sql` recién generado y añade al FINAL (después de los `CREATE TABLE` y `CREATE INDEX`):

```sql
-- v2: seed default account "Sin clasificar" + backfill orphan entries
INSERT INTO "Account" (
  id, name, currency, "openingBalance", "openingDate",
  "isActive", "sortOrder", "createdById", "createdAt", "updatedAt"
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'Sin clasificar',
  'BsF'::"AccountingCurrency",
  0,
  '2025-01-01'::date,
  TRUE,
  999,
  u.id,
  NOW(),
  NOW()
FROM "User" u
WHERE u.role = 'ADMIN'
ORDER BY u."createdAt"
LIMIT 1;

-- If no admin user existed yet, abort to avoid orphan account
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Account" WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Cannot create default Account: no ADMIN user exists. Create an admin first.';
  END IF;
END $$;

-- Backfill orphan entries to the default account
UPDATE "AccountingEntry"
SET "accountId" = '00000000-0000-0000-0000-000000000001'
WHERE "accountId" IS NULL;
```

- [ ] **Step 2: Aplicar la migración**

```bash
cd backend && npx prisma migrate dev
```

Expected: la migración se aplica sin error. Verificar con:

```bash
docker exec tote_postgres psql -U tote_user -d tote_db -c \
  "SELECT id, name, currency FROM \"Account\";"
```

Debe haber una fila "Sin clasificar".

- [ ] **Step 3: Verificar backfill**

```bash
docker exec tote_postgres psql -U tote_user -d tote_db -c \
  "SELECT COUNT(*) FROM \"AccountingEntry\" WHERE \"accountId\" IS NULL;"
```

Expected: `0`.

- [ ] **Step 4: Regenerar Prisma client**

```bash
cd backend && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/migrations/
git commit -m "feat(contabilidad): backfill orphan entries to 'Sin clasificar' default account"
```

---

### Task A3: account.service.js — CRUD + saldo actual

**Files:**
- Create: `backend/src/services/account.service.js`
- Test: `backend/src/__tests__/account.service.test.js`

- [ ] **Step 1: Escribir el test falla `createAccount + getCurrentBalance`**

Crea `backend/src/__tests__/account.service.test.js`:

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { prisma } = await import('../lib/prisma.js');
const accountService = await import('../services/account.service.js');

const TEST_PREFIX = `TEST-A3-${Date.now()}-${process.pid}`;
let adminId;

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.accountingEntry.deleteMany({ where: { description: { startsWith: TEST_PREFIX } } });
  await prisma.account.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('account.service', () => {
  test('createAccount persists with openingBalance and openingDate', async () => {
    const account = await accountService.createAccount({
      name: `${TEST_PREFIX} Caja`,
      currency: 'BsF',
      openingBalance: '1000.00',
      openingDate: new Date('2026-01-01'),
      createdById: adminId,
    });
    expect(account.id).toBeDefined();
    expect(account.name).toBe(`${TEST_PREFIX} Caja`);
    expect(Number(account.openingBalance)).toBe(1000);
  });

  test('getCurrentBalance returns openingBalance when no entries', async () => {
    const account = await accountService.createAccount({
      name: `${TEST_PREFIX} Empty`,
      currency: 'BsF',
      openingBalance: '500.00',
      openingDate: new Date('2026-01-01'),
      createdById: adminId,
    });
    const balance = await accountService.getCurrentBalance(account.id);
    expect(balance).toBe('500.00000000');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd backend && npm test -- account.service
```

Expected: FAIL `Cannot find module '../services/account.service.js'`.

- [ ] **Step 3: Crear `account.service.js` con `createAccount` y `getCurrentBalance`**

Crea `backend/src/services/account.service.js`:

```javascript
/**
 * v2 contabilidad — Account service (spec 2026-05-16).
 *
 * Diseño:
 *   - openingBalance / openingDate IMMUTABLE post-create (mismo patrón FIN-LEDGER-09).
 *   - currency IMMUTABLE post-create.
 *   - getCurrentBalance: openingBalance + Σ entries.signed + Σ transfers.signed
 *     a partir de openingDate. Cálculo on-the-fly (no snapshot).
 *   - deactivate rechaza si saldo != 0.
 */

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

const IMMUTABLE = new Set(['openingBalance', 'openingDate', 'currency']);

export async function createAccount({ name, currency, openingBalance, openingDate, createdById, sortOrder }) {
  if (!name || typeof name !== 'string') throw new Error('name requerido');
  if (!['BsF', 'USD'].includes(currency)) throw new Error('currency debe ser BsF o USD');
  if (openingBalance === undefined || openingBalance === null) throw new Error('openingBalance requerido');
  if (!(openingDate instanceof Date) && typeof openingDate !== 'string') throw new Error('openingDate requerido');

  const account = await prisma.account.create({
    data: {
      name,
      currency,
      openingBalance: new Decimal(openingBalance).toFixed(8),
      openingDate: new Date(openingDate),
      createdById,
      sortOrder: sortOrder ?? 0,
    },
  });
  logger.info(`[account] CREATE id=${account.id} name=${name} currency=${currency}`);
  return account;
}

export async function listAccounts({ includeInactive = false } = {}) {
  return prisma.account.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getAccount(id) {
  return prisma.account.findUniqueOrThrow({ where: { id } });
}

export async function updateAccount(id, patch) {
  const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => !IMMUTABLE.has(k)));
  return prisma.account.update({ where: { id }, data: safe });
}

/**
 * Saldo actual = openingBalance
 *   + Σ entries con entryDate >= openingDate, signed by type (INCOME +, EXPENSE/PAYMENT -)
 *   + Σ transfers entrantes (amountTo) − Σ transfers salientes (amountFrom)
 *
 * Excluye asientos reversados (los dos lados se cancelan al sumar reversedById = null).
 */
export async function getCurrentBalance(accountId) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

  const entries = await prisma.accountingEntry.findMany({
    where: {
      accountId,
      entryDate: { gte: account.openingDate },
      reversedById: null,
      reversesId: null,
    },
    select: { type: true, amountBsF: true },
  });

  const transfersOut = await prisma.transfer.findMany({
    where: {
      fromAccountId: accountId,
      transferDate: { gte: account.openingDate },
      reversedById: null,
      reversesId: null,
    },
    select: { amountFrom: true },
  });

  const transfersIn = await prisma.transfer.findMany({
    where: {
      toAccountId: accountId,
      transferDate: { gte: account.openingDate },
      reversedById: null,
      reversesId: null,
    },
    select: { amountTo: true },
  });

  let balance = new Decimal(account.openingBalance.toString());
  for (const e of entries) {
    const sign = e.type === 'INCOME' ? 1 : -1;
    balance = balance.plus(new Decimal(e.amountBsF.toString()).times(sign));
  }
  for (const t of transfersOut) {
    balance = balance.minus(new Decimal(t.amountFrom.toString()));
  }
  for (const t of transfersIn) {
    balance = balance.plus(new Decimal(t.amountTo.toString()));
  }
  return balance.toFixed(8);
}

export async function deactivateAccount(id) {
  const balance = await getCurrentBalance(id);
  if (!new Decimal(balance).isZero()) {
    throw new Error(`No se puede desactivar la cuenta — saldo actual: ${balance}`);
  }
  return prisma.account.update({ where: { id }, data: { isActive: false } });
}

export async function reactivateAccount(id) {
  return prisma.account.update({ where: { id }, data: { isActive: true } });
}
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

```bash
cd backend && npm test -- account.service
```

Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/account.service.js backend/src/__tests__/account.service.test.js
git commit -m "feat(contabilidad): account.service with createAccount and getCurrentBalance"
```

---

### Task A4: account.service — tests adicionales (saldo con entries, deactivate guard, IMMUTABLE)

**Files:**
- Modify: `backend/src/__tests__/account.service.test.js`

- [ ] **Step 1: Añadir tests al final del `describe`**

```javascript
test('getCurrentBalance suma entries signed por tipo', async () => {
  const account = await accountService.createAccount({
    name: `${TEST_PREFIX} Mix`,
    currency: 'BsF',
    openingBalance: '1000.00',
    openingDate: new Date('2026-01-01'),
    createdById: adminId,
  });
  const category = await prisma.category.findFirst({ where: { appliesTo: 'INCOME' } });
  await prisma.accountingEntry.create({
    data: {
      type: 'INCOME',
      entryDate: new Date('2026-02-01'),
      categoryId: category.id,
      description: `${TEST_PREFIX} income1`,
      amountBsF: '300.00000000',
      originalCurrency: 'BsF',
      createdById: adminId,
      accountId: account.id,
    },
  });
  const expenseCategory = await prisma.category.findFirst({ where: { appliesTo: 'EXPENSE' } });
  await prisma.accountingEntry.create({
    data: {
      type: 'EXPENSE',
      entryDate: new Date('2026-02-02'),
      categoryId: expenseCategory.id,
      description: `${TEST_PREFIX} expense1`,
      amountBsF: '100.00000000',
      originalCurrency: 'BsF',
      createdById: adminId,
      accountId: account.id,
    },
  });
  const balance = await accountService.getCurrentBalance(account.id);
  expect(balance).toBe('1200.00000000');  // 1000 + 300 − 100
});

test('deactivateAccount rechaza si saldo != 0', async () => {
  const account = await accountService.createAccount({
    name: `${TEST_PREFIX} HasBalance`,
    currency: 'BsF',
    openingBalance: '500.00',
    openingDate: new Date('2026-01-01'),
    createdById: adminId,
  });
  await expect(accountService.deactivateAccount(account.id)).rejects.toThrow(
    /saldo actual/,
  );
});

test('updateAccount strips IMMUTABLE keys', async () => {
  const account = await accountService.createAccount({
    name: `${TEST_PREFIX} ImmutTest`,
    currency: 'BsF',
    openingBalance: '0',
    openingDate: new Date('2026-01-01'),
    createdById: adminId,
  });
  const updated = await accountService.updateAccount(account.id, {
    name: `${TEST_PREFIX} Renamed`,
    openingBalance: '9999',  // debe ignorarse
    currency: 'USD',          // debe ignorarse
  });
  expect(updated.name).toBe(`${TEST_PREFIX} Renamed`);
  expect(Number(updated.openingBalance)).toBe(0);
  expect(updated.currency).toBe('BsF');
});
```

- [ ] **Step 2: Correr el test**

```bash
cd backend && npm test -- account.service
```

Expected: 5 tests passing.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/account.service.test.js
git commit -m "test(contabilidad): account.service balance, deactivate guard, IMMUTABLE strip"
```

---

### Task A5: Update accounting-entry.service — exigir accountId y validar moneda

**Files:**
- Modify: `backend/src/services/accounting-entry.service.js`
- Test: `backend/src/__tests__/accounting-entry-v2.test.js` (nuevo)

- [ ] **Step 1: Test que falla — exige accountId y moneda coherente**

Crea `backend/src/__tests__/accounting-entry-v2.test.js`:

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { prisma } = await import('../lib/prisma.js');
const entryService = await import('../services/accounting-entry.service.js');
const accountService = await import('../services/account.service.js');

const TEST_PREFIX = `TEST-A5-${Date.now()}-${process.pid}`;
let adminId, bsfAccount, usdAccount, incomeCategory;

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  adminId = admin.id;
  incomeCategory = await prisma.category.findFirst({ where: { appliesTo: 'INCOME' } });
  bsfAccount = await accountService.createAccount({
    name: `${TEST_PREFIX} BsF`, currency: 'BsF', openingBalance: '0',
    openingDate: new Date('2026-01-01'), createdById: adminId,
  });
  usdAccount = await accountService.createAccount({
    name: `${TEST_PREFIX} USD`, currency: 'USD', openingBalance: '0',
    openingDate: new Date('2026-01-01'), createdById: adminId,
  });
});

afterAll(async () => {
  await prisma.accountingEntry.deleteMany({ where: { description: { startsWith: TEST_PREFIX } } });
  await prisma.account.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('accounting-entry.service v2', () => {
  test('createEntry rechaza sin accountId', async () => {
    await expect(entryService.createEntry({
      type: 'INCOME',
      entryDate: new Date('2026-02-01'),
      categoryId: incomeCategory.id,
      description: `${TEST_PREFIX} nopey`,
      currency: 'BsF',
      amount: '100',
      createdById: adminId,
    })).rejects.toThrow(/accountId/);
  });

  test('createEntry rechaza moneda inconsistente con cuenta', async () => {
    await expect(entryService.createEntry({
      type: 'INCOME',
      entryDate: new Date('2026-02-01'),
      categoryId: incomeCategory.id,
      description: `${TEST_PREFIX} mismatch`,
      currency: 'BsF',
      amount: '100',
      accountId: usdAccount.id,
      createdById: adminId,
    })).rejects.toThrow(/moneda/i);
  });

  test('createEntry persiste con accountId válido', async () => {
    const entry = await entryService.createEntry({
      type: 'INCOME',
      entryDate: new Date('2026-02-01'),
      categoryId: incomeCategory.id,
      description: `${TEST_PREFIX} good`,
      currency: 'BsF',
      amount: '250',
      accountId: bsfAccount.id,
      createdById: adminId,
    });
    expect(entry.accountId).toBe(bsfAccount.id);
  });
});
```

- [ ] **Step 2: Correr el test, verificar que falla**

```bash
cd backend && npm test -- accounting-entry-v2
```

Expected: FAIL (acepta sin accountId — no valida moneda).

- [ ] **Step 3: Modificar `createEntry` para exigir y validar accountId**

En `backend/src/services/accounting-entry.service.js`, modifica la signature y la lógica de `createEntry`:

Cambia la firma para incluir `accountId`:

```javascript
export async function createEntry({
  type,
  entryDate,
  categoryId,
  description,
  currency,
  amount,
  settlementId,
  accountId,        // v2
  createdById,
}) {
```

Y al inicio del cuerpo (antes del `if (currency === 'USD')`), añade:

```javascript
  // v2: accountId requerido + moneda debe coincidir con cuenta
  if (!accountId) {
    throw new Error('accountId es requerido');
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new Error(`Cuenta ${accountId} no existe`);
  }
  if (!account.isActive) {
    throw new Error(`Cuenta ${account.name} está inactiva`);
  }
  if (account.currency !== currency) {
    throw new Error(
      `Moneda del asiento (${currency}) no coincide con la moneda de la cuenta ${account.name} (${account.currency})`,
    );
  }
```

Y en el `prisma.accountingEntry.create` añade `accountId` a `data`:

```javascript
  const entry = await prisma.accountingEntry.create({
    data: {
      type,
      entryDate,
      categoryId,
      description,
      amountBsF,
      originalAmount,
      originalCurrency: currency,
      exchangeRateId,
      settlementId: settlementId ?? null,
      accountId,                          // v2
      createdById,
    },
  });
```

- [ ] **Step 4: Añadir `accountId` a `IMMUTABLE`**

En el mismo archivo, actualiza:

```javascript
const IMMUTABLE = new Set([
  'amountBsF',
  'originalAmount',
  'originalCurrency',
  'entryDate',
  'exchangeRateId',
  'type',
  'accountId',  // v2 — no se puede mover un asiento entre cuentas
]);
```

- [ ] **Step 5: Añadir `account` a `getEntry` include**

En `getEntry`, modifica el include:

```javascript
include: {
  category: true,
  exchangeRate: true,
  settlement: true,
  attachments: true,
  account: true,    // v2
  reverses: true,
  reversedBy: true,
},
```

Y lo mismo en `listEntries`:

```javascript
include: {
  category: true,
  exchangeRate: true,
  settlement: true,
  account: true,    // v2
},
```

- [ ] **Step 6: Correr el test, confirmar que pasa**

```bash
cd backend && npm test -- accounting-entry-v2
```

Expected: 3 passing.

- [ ] **Step 7: Correr tests existentes para confirmar que no rompimos nada**

```bash
cd backend && npm test -- contabilidad.integration
```

Si falla por falta de `accountId` en seeds, sigue con el siguiente paso.

- [ ] **Step 8: Actualizar `contabilidad.integration.test.js` y `pnl-report-service.test.js` para incluir accountId**

Busca las llamadas a `createEntry` o inserts directos a `accountingEntry`. Para cada uno:

```javascript
// Antes de crear entries, obtén la cuenta default (o crea una)
const defaultAccount = await prisma.account.findUnique({
  where: { id: '00000000-0000-0000-0000-000000000001' },
});
// Pasa accountId: defaultAccount.id en cada llamada de createEntry
```

En tests que insertan vía POST HTTP, añadir `accountId: defaultAccount.id` al body.

- [ ] **Step 9: Re-correr todos los tests de contabilidad**

```bash
cd backend && npm test -- contabilidad
cd backend && npm test -- pnl
```

Expected: todo verde.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/accounting-entry.service.js backend/src/__tests__/
git commit -m "feat(contabilidad): require accountId on createEntry with currency match"
```

---

### Task A6: transfer.service — crear, listar, get, reverse

**Files:**
- Create: `backend/src/services/transfer.service.js`
- Test: `backend/src/__tests__/transfer.service.test.js`

- [ ] **Step 1: Test que falla**

Crea `backend/src/__tests__/transfer.service.test.js`:

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { prisma } = await import('../lib/prisma.js');
const transferService = await import('../services/transfer.service.js');
const accountService = await import('../services/account.service.js');

const TEST_PREFIX = `TEST-A6-${Date.now()}-${process.pid}`;
let adminId, bsfA, bsfB, usdA;

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  adminId = admin.id;
  bsfA = await accountService.createAccount({
    name: `${TEST_PREFIX} BsF-A`, currency: 'BsF', openingBalance: '10000',
    openingDate: new Date('2026-01-01'), createdById: adminId,
  });
  bsfB = await accountService.createAccount({
    name: `${TEST_PREFIX} BsF-B`, currency: 'BsF', openingBalance: '0',
    openingDate: new Date('2026-01-01'), createdById: adminId,
  });
  usdA = await accountService.createAccount({
    name: `${TEST_PREFIX} USD-A`, currency: 'USD', openingBalance: '0',
    openingDate: new Date('2026-01-01'), createdById: adminId,
  });
});

afterAll(async () => {
  await prisma.transfer.deleteMany({ where: { description: { startsWith: TEST_PREFIX } } });
  await prisma.account.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('transfer.service', () => {
  test('createTransfer mismo moneda — amountTo = amountFrom', async () => {
    const t = await transferService.createTransfer({
      transferDate: new Date('2026-02-01'),
      fromAccountId: bsfA.id,
      toAccountId: bsfB.id,
      amountFrom: '500',
      description: `${TEST_PREFIX} simple`,
      createdById: adminId,
    });
    expect(Number(t.amountFrom)).toBe(500);
    expect(Number(t.amountTo)).toBe(500);
    expect(t.exchangeRateId).toBeNull();
  });

  test('createTransfer USD→BsF requiere exchangeRate', async () => {
    await expect(transferService.createTransfer({
      transferDate: new Date('2026-02-01'),
      fromAccountId: usdA.id,
      toAccountId: bsfA.id,
      amountFrom: '100',
      description: `${TEST_PREFIX} nor`,
      createdById: adminId,
    })).rejects.toThrow(/tasa de cambio/i);
  });

  test('reverseTransfer crea inverso y marca original', async () => {
    const orig = await transferService.createTransfer({
      transferDate: new Date('2026-02-02'),
      fromAccountId: bsfA.id,
      toAccountId: bsfB.id,
      amountFrom: '100',
      description: `${TEST_PREFIX} toreverse`,
      createdById: adminId,
    });
    const rev = await transferService.reverseTransfer(orig.id, `${TEST_PREFIX} reason`, adminId);
    expect(rev.reversesId).toBe(orig.id);
    expect(Number(rev.amountFrom)).toBe(100);
    const refetched = await prisma.transfer.findUnique({ where: { id: orig.id } });
    expect(refetched.reversedById).toBe(rev.id);
  });
});
```

- [ ] **Step 2: Correr — verificar FAIL**

```bash
cd backend && npm test -- transfer.service
```

Expected: FAIL (no module).

- [ ] **Step 3: Crear `transfer.service.js`**

Crea `backend/src/services/transfer.service.js`:

```javascript
/**
 * v2 contabilidad — Transfer service (spec 2026-05-16).
 *
 * Diseño:
 *   - Misma cuenta from/to → rechazo.
 *   - Si fromAccount.currency === toAccount.currency → amountTo = amountFrom, sin tasa.
 *   - Si difieren → exchangeRateId requerido. Conversión BsF→USD usa 1/rate; USD→BsF usa rate.
 *   - Reversal: mismo patrón que accounting-entry — $transaction interactivo,
 *     crea Transfer inverso (from↔to swap, mismos montos) y flippea reversedById.
 */

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getEffectiveRateForDate } from './exchange-rate.service.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export class NoRateForTransferError extends Error {
  constructor(date) {
    const d = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
    super(`No hay tasa de cambio para ${d} — ingresa una tasa primero.`);
    this.name = 'NoRateForTransferError';
  }
}

export async function createTransfer({
  transferDate,
  fromAccountId,
  toAccountId,
  amountFrom,
  description,
  createdById,
}) {
  if (!fromAccountId || !toAccountId) throw new Error('fromAccountId y toAccountId requeridos');
  if (fromAccountId === toAccountId) throw new Error('No se puede transferir a la misma cuenta');
  if (!description || description.trim() === '') throw new Error('description es requerido');

  const [fromAcct, toAcct] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: fromAccountId } }),
    prisma.account.findUniqueOrThrow({ where: { id: toAccountId } }),
  ]);
  if (!fromAcct.isActive || !toAcct.isActive) throw new Error('Cuenta inactiva');

  const amountFromDec = new Decimal(amountFrom);
  if (amountFromDec.lte(0)) throw new Error('amountFrom debe ser positivo');

  let amountTo;
  let exchangeRateId = null;

  if (fromAcct.currency === toAcct.currency) {
    amountTo = amountFromDec.toFixed(8);
  } else {
    const rate = await getEffectiveRateForDate(transferDate);
    if (!rate) throw new NoRateForTransferError(transferDate);
    exchangeRateId = rate.id;
    const rateDec = new Decimal(rate.rateBsPerUsd.toString());
    if (fromAcct.currency === 'USD' && toAcct.currency === 'BsF') {
      amountTo = amountFromDec.times(rateDec).toFixed(8);
    } else {
      // BsF → USD
      amountTo = amountFromDec.div(rateDec).toFixed(8);
    }
  }

  const transfer = await prisma.transfer.create({
    data: {
      transferDate,
      fromAccountId,
      toAccountId,
      amountFrom: amountFromDec.toFixed(8),
      amountTo,
      exchangeRateId,
      description,
      createdById,
    },
    include: { fromAccount: true, toAccount: true, exchangeRate: true },
  });
  logger.info(`[transfer] CREATE id=${transfer.id} ${fromAcct.name}→${toAcct.name} ${amountFromDec.toFixed(2)}`);
  return transfer;
}

export async function listTransfers({ from, to, accountId, includeReversed = false } = {}) {
  const dateFilter = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;

  const where = {
    ...(Object.keys(dateFilter).length > 0 && { transferDate: dateFilter }),
    ...(accountId && { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] }),
    ...(!includeReversed && { reversedById: null, reversesId: null }),
  };

  return prisma.transfer.findMany({
    where,
    orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
    include: { fromAccount: true, toAccount: true, exchangeRate: true, attachments: true },
  });
}

export async function getTransfer(id) {
  return prisma.transfer.findUniqueOrThrow({
    where: { id },
    include: {
      fromAccount: true,
      toAccount: true,
      exchangeRate: true,
      attachments: true,
      reverses: true,
      reversedBy: true,
    },
  });
}

export async function reverseTransfer(originalId, reversalReason, userId) {
  if (!reversalReason || reversalReason.trim() === '') throw new Error('reversalReason requerido');

  return prisma.$transaction(async (tx) => {
    const original = await tx.transfer.findUniqueOrThrow({ where: { id: originalId } });
    if (original.reversedById) throw new Error('Transfer ya reversado');
    if (original.reversesId) throw new Error('No se puede reversar un reversal');

    const newReversal = await tx.transfer.create({
      data: {
        transferDate: original.transferDate,
        fromAccountId: original.toAccountId,    // swap
        toAccountId: original.fromAccountId,    // swap
        amountFrom: original.amountTo,          // swap montos (cada uno en su moneda original)
        amountTo: original.amountFrom,
        exchangeRateId: original.exchangeRateId,
        description: `Reversal de #${original.sequentialNo ?? original.id.slice(0, 8)}`,
        reversesId: original.id,
        reversalReason,
        createdById: userId,
      },
    });

    await tx.transfer.update({
      where: { id: original.id },
      data: { reversedById: newReversal.id },
    });

    logger.info(`[transfer] REVERSE original=${original.id} reversal=${newReversal.id}`);
    return newReversal;
  });
}
```

- [ ] **Step 4: Correr tests, confirmar verde**

```bash
cd backend && npm test -- transfer.service
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/transfer.service.js backend/src/__tests__/transfer.service.test.js
git commit -m "feat(contabilidad): transfer.service with create, reverse, and rate locking"
```

---

### Task A7: transfer-attachment.service — adjuntos para transferencias

**Files:**
- Create: `backend/src/services/transfer-attachment.service.js`

- [ ] **Step 1: Crear el servicio (refleja attachment.service.js para AccountingEntry)**

Crea `backend/src/services/transfer-attachment.service.js`:

```javascript
import { prisma } from '../lib/prisma.js';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { format } from 'date-fns';

/**
 * v2 contabilidad — comprobantes de transferencia.
 * Mismo patrón F-14 byte-validation que attachment.service.js para AccountingEntry.
 * Bucket de disco: storage/transfer-receipts/YYYY/MM/{uuid}.{ext}
 */

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'transfer-receipts');
const MAX_BYTES = 5 * 1024 * 1024;

export async function validateAndStore({ buffer, originalName, transferDate, uploadedById, transferId }) {
  if (buffer.length > MAX_BYTES) {
    const err = new Error('Archivo excede 5MB');
    err.statusCode = 413;
    throw err;
  }
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    const err = new Error(`Tipo de archivo no permitido: ${detected?.mime ?? 'desconocido'}`);
    err.statusCode = 422;
    throw err;
  }
  const yyyymm = format(transferDate, 'yyyy/MM');
  const uuid = randomUUID();
  const filename = `${uuid}.${detected.ext}`;
  const dir = path.join(STORAGE_ROOT, yyyymm);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return prisma.transferAttachment.create({
    data: { transferId, filename, originalName, mimeType: detected.mime, sizeBytes: buffer.length, uploadedById },
  });
}

export async function getAttachmentStream(attachmentId) {
  const att = await prisma.transferAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { transfer: { select: { transferDate: true } } },
  });
  const yyyymm = format(att.transfer.transferDate, 'yyyy/MM');
  const full = path.join(STORAGE_ROOT, yyyymm, att.filename);
  return { att, stream: createReadStream(full) };
}

export async function deleteAttachment(attachmentId) {
  const att = await prisma.transferAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { transfer: { select: { transferDate: true } } },
  });
  const yyyymm = format(att.transfer.transferDate, 'yyyy/MM');
  const full = path.join(STORAGE_ROOT, yyyymm, att.filename);
  await fs.unlink(full).catch(() => {});
  return prisma.transferAttachment.delete({ where: { id: attachmentId } });
}
```

- [ ] **Step 2: Actualizar `static-storage-guard.middleware.js` para bloquear `/storage/transfer-receipts/*`**

Lee el archivo:

```bash
cat backend/src/middlewares/static-storage-guard.middleware.js
```

Identifica el patrón que bloquea `/storage/receipts/*`. Añade `transfer-receipts` al mismo bloqueo. Por ejemplo, si dice `req.path.startsWith('/storage/receipts')`, cámbialo a:

```javascript
if (req.path.startsWith('/storage/receipts') || req.path.startsWith('/storage/transfer-receipts')) {
  return res.status(401).json({ error: 'No autorizado' });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/transfer-attachment.service.js backend/src/middlewares/static-storage-guard.middleware.js
git commit -m "feat(contabilidad): transfer-attachment.service with same F-14 guard"
```

---

### Task A8: cash-flow.service — motor de cálculo (saldo inicial + entradas + salidas + saldo final)

**Files:**
- Create: `backend/src/services/cash-flow.service.js`
- Test: `backend/src/__tests__/cash-flow.service.test.js`

- [ ] **Step 1: Test que falla**

Crea `backend/src/__tests__/cash-flow.service.test.js`:

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { prisma } = await import('../lib/prisma.js');
const cashFlow = await import('../services/cash-flow.service.js');
const accountService = await import('../services/account.service.js');

const TEST_PREFIX = `TEST-A8-${Date.now()}-${process.pid}`;
let adminId, acctBsF, incomeCat, expenseCat;

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  adminId = admin.id;
  acctBsF = await accountService.createAccount({
    name: `${TEST_PREFIX} CFA`, currency: 'BsF', openingBalance: '1000',
    openingDate: new Date('2026-01-01'), createdById: adminId,
  });
  incomeCat = await prisma.category.findFirst({ where: { appliesTo: 'INCOME' } });
  expenseCat = await prisma.category.findFirst({ where: { appliesTo: 'EXPENSE' } });

  await prisma.accountingEntry.create({
    data: {
      type: 'INCOME', entryDate: new Date('2026-02-05'),
      categoryId: incomeCat.id, description: `${TEST_PREFIX} feb-in`,
      amountBsF: '300', originalCurrency: 'BsF',
      createdById: adminId, accountId: acctBsF.id,
    },
  });
  await prisma.accountingEntry.create({
    data: {
      type: 'EXPENSE', entryDate: new Date('2026-02-10'),
      categoryId: expenseCat.id, description: `${TEST_PREFIX} feb-out`,
      amountBsF: '100', originalCurrency: 'BsF',
      createdById: adminId, accountId: acctBsF.id,
    },
  });
});

afterAll(async () => {
  await prisma.accountingEntry.deleteMany({ where: { description: { startsWith: TEST_PREFIX } } });
  await prisma.account.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('cash-flow.service', () => {
  test('getReport con accountId calcula saldos correctos', async () => {
    const report = await cashFlow.getReport({
      from: new Date('2026-02-01'),
      to: new Date('2026-02-28'),
      accountId: acctBsF.id,
    });
    expect(report.byCurrency.BsF.openingBalance).toBe('1000.00000000');
    expect(report.byCurrency.BsF.entradas).toBe('300.00000000');
    expect(report.byCurrency.BsF.salidas).toBe('100.00000000');
    expect(report.byCurrency.BsF.neto).toBe('200.00000000');
    expect(report.byCurrency.BsF.closingBalance).toBe('1200.00000000');
  });

  test('getReport sin accountId consolida todas las cuentas activas', async () => {
    const report = await cashFlow.getReport({
      from: new Date('2026-02-01'),
      to: new Date('2026-02-28'),
    });
    expect(report.byCurrency.BsF).toBeDefined();
    expect(Number(report.byCurrency.BsF.entradas)).toBeGreaterThanOrEqual(300);
  });
});
```

- [ ] **Step 2: Correr — FAIL**

```bash
cd backend && npm test -- cash-flow.service
```

- [ ] **Step 3: Crear `cash-flow.service.js`**

Crea `backend/src/services/cash-flow.service.js`:

```javascript
/**
 * v2 contabilidad — cash-flow report engine (spec 2026-05-16).
 *
 * Cálculo dinámico (sin snapshots). Devuelve por moneda:
 *   openingBalance (al inicio del período)
 *   entradas (INCOME en el período)
 *   salidas (EXPENSE + PAYMENT en el período)
 *   neto = entradas − salidas
 *   closingBalance = openingBalance + neto
 *
 * Transferencias:
 *   - Consolidado (sin accountId): NO afectan neto (suma cero entre cuentas).
 *   - Por accountId: afectan saldos (entrante: +amountTo, saliente: −amountFrom).
 *
 * Breakdown por categoría: lista de { categoryId, name, total } para INCOME y EXPENSE/PAYMENT.
 *
 * Reversados: excluidos por defecto (reversedById=null AND reversesId=null).
 */

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

function emptyBucket() {
  return new Decimal(0);
}

function bucketFor(map, currency) {
  if (!map[currency]) {
    map[currency] = {
      openingBalance: emptyBucket(),
      entradas: emptyBucket(),
      salidas: emptyBucket(),
      transfersIn: emptyBucket(),
      transfersOut: emptyBucket(),
      categoriesIn: {},   // { categoryId: { name, total: Decimal } }
      categoriesOut: {},
    };
  }
  return map[currency];
}

function finalize(bucket) {
  const entradas = bucket.entradas;
  const salidas = bucket.salidas;
  const transfersIn = bucket.transfersIn;
  const transfersOut = bucket.transfersOut;
  const neto = entradas.minus(salidas);
  const closing = bucket.openingBalance
    .plus(neto)
    .plus(transfersIn)
    .minus(transfersOut);

  const cleanCats = (cats) =>
    Object.entries(cats).map(([categoryId, { name, total }]) => ({
      categoryId,
      name,
      total: total.toFixed(8),
    }));

  return {
    openingBalance: bucket.openingBalance.toFixed(8),
    entradas: entradas.toFixed(8),
    salidas: salidas.toFixed(8),
    transfersIn: transfersIn.toFixed(8),
    transfersOut: transfersOut.toFixed(8),
    neto: neto.toFixed(8),
    closingBalance: closing.toFixed(8),
    categoriesIn: cleanCats(bucket.categoriesIn),
    categoriesOut: cleanCats(bucket.categoriesOut),
  };
}

export async function getReport({ from, to, accountId } = {}) {
  if (!(from instanceof Date) || !(to instanceof Date)) throw new Error('from y to requeridos como Date');

  const accountFilter = accountId ? { id: accountId } : { isActive: true };
  const accounts = await prisma.account.findMany({ where: accountFilter });

  const byCurrency = {};

  // 1. Opening balances (de cada cuenta seleccionada)
  for (const acct of accounts) {
    const b = bucketFor(byCurrency, acct.currency);
    b.openingBalance = b.openingBalance.plus(new Decimal(acct.openingBalance.toString()));

    // Movimientos previos al período (efectivamente parte del opening del período)
    const priorEntries = await prisma.accountingEntry.findMany({
      where: {
        accountId: acct.id,
        entryDate: { gte: acct.openingDate, lt: from },
        reversedById: null,
        reversesId: null,
      },
      select: { type: true, amountBsF: true, originalAmount: true, exchangeRate: true },
    });
    for (const e of priorEntries) {
      const amt = pickAmount(e, acct.currency);
      const sign = e.type === 'INCOME' ? 1 : -1;
      b.openingBalance = b.openingBalance.plus(amt.times(sign));
    }

    const priorTransfersOut = await prisma.transfer.findMany({
      where: {
        fromAccountId: acct.id,
        transferDate: { lt: from },
        reversedById: null,
        reversesId: null,
      },
      select: { amountFrom: true },
    });
    const priorTransfersIn = await prisma.transfer.findMany({
      where: {
        toAccountId: acct.id,
        transferDate: { lt: from },
        reversedById: null,
        reversesId: null,
      },
      select: { amountTo: true },
    });
    for (const t of priorTransfersOut) {
      b.openingBalance = b.openingBalance.minus(new Decimal(t.amountFrom.toString()));
    }
    for (const t of priorTransfersIn) {
      b.openingBalance = b.openingBalance.plus(new Decimal(t.amountTo.toString()));
    }
  }

  // 2. Movimientos del período
  const periodAccountIds = accounts.map((a) => a.id);
  const periodEntries = await prisma.accountingEntry.findMany({
    where: {
      accountId: { in: periodAccountIds },
      entryDate: { gte: from, lte: to },
      reversedById: null,
      reversesId: null,
    },
    include: { account: true, category: true, exchangeRate: true },
  });

  for (const e of periodEntries) {
    const b = bucketFor(byCurrency, e.account.currency);
    const amt = pickAmount(e, e.account.currency);
    const sign = e.type === 'INCOME' ? 'in' : 'out';

    if (sign === 'in') {
      b.entradas = b.entradas.plus(amt);
      addToCategory(b.categoriesIn, e.category, amt);
    } else {
      b.salidas = b.salidas.plus(amt);
      addToCategory(b.categoriesOut, e.category, amt);
    }
  }

  // 3. Transferencias del período (sólo si accountId — consolidado las ignora para neto)
  const periodTransfers = await prisma.transfer.findMany({
    where: {
      transferDate: { gte: from, lte: to },
      OR: accountId
        ? [{ fromAccountId: accountId }, { toAccountId: accountId }]
        : undefined,
      reversedById: null,
      reversesId: null,
    },
    include: { fromAccount: true, toAccount: true },
  });

  if (accountId) {
    for (const t of periodTransfers) {
      if (t.fromAccountId === accountId) {
        const b = bucketFor(byCurrency, t.fromAccount.currency);
        b.transfersOut = b.transfersOut.plus(new Decimal(t.amountFrom.toString()));
      }
      if (t.toAccountId === accountId) {
        const b = bucketFor(byCurrency, t.toAccount.currency);
        b.transfersIn = b.transfersIn.plus(new Decimal(t.amountTo.toString()));
      }
    }
  }

  // 4. Finalize
  const result = {};
  for (const [currency, bucket] of Object.entries(byCurrency)) {
    result[currency] = finalize(bucket);
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    accountId: accountId ?? null,
    byCurrency: result,
    transfers: periodTransfers.map((t) => ({
      id: t.id,
      transferDate: t.transferDate,
      fromAccount: { id: t.fromAccount.id, name: t.fromAccount.name, currency: t.fromAccount.currency },
      toAccount: { id: t.toAccount.id, name: t.toAccount.name, currency: t.toAccount.currency },
      amountFrom: t.amountFrom.toString(),
      amountTo: t.amountTo.toString(),
      description: t.description,
    })),
  };
}

// F-7: amountBsF está en BsF nativo; si la cuenta es USD, usamos originalAmount (que es lo
// registrado en USD nativo). Si la cuenta es BsF, devolvemos amountBsF.
function pickAmount(entry, accountCurrency) {
  if (accountCurrency === 'USD') {
    // entry.originalAmount está en USD nativo (registrado por el operador)
    const v = entry.originalAmount;
    return v ? new Decimal(v.toString()) : new Decimal(0);
  }
  return new Decimal(entry.amountBsF.toString());
}

function addToCategory(map, category, amount) {
  const key = category.id;
  if (!map[key]) map[key] = { name: category.name, total: new Decimal(0) };
  map[key].total = map[key].total.plus(amount);
}
```

- [ ] **Step 4: Correr test — verde**

```bash
cd backend && npm test -- cash-flow.service
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cash-flow.service.js backend/src/__tests__/cash-flow.service.test.js
git commit -m "feat(contabilidad): cash-flow.service report engine"
```

---

### Task A9: cash-flow.service — Excel + PDF builders

**Files:**
- Modify: `backend/src/services/cash-flow.service.js`

- [ ] **Step 1: Verificar deps (`exceljs`, `pdfkit`)**

```bash
cd backend && node -e "import('exceljs').then(()=>console.log('ok'))"
cd backend && node -e "import('pdfkit').then(()=>console.log('ok'))"
```

Si alguno no existe:

```bash
cd backend && npm install exceljs pdfkit
```

- [ ] **Step 2: Añadir `buildExcel` y `buildPdf` al final de `cash-flow.service.js`**

Añade al final de `backend/src/services/cash-flow.service.js`:

```javascript
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export async function buildExcel(report) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flujo de caja');

  ws.addRow(['Período', `${report.from} → ${report.to}`]);
  ws.addRow(['Cuenta', report.accountId ?? 'Consolidado']);
  ws.addRow([]);

  for (const [currency, b] of Object.entries(report.byCurrency)) {
    ws.addRow([`Moneda: ${currency}`]).font = { bold: true };
    ws.addRow(['Saldo inicial', b.openingBalance]);
    ws.addRow(['Entradas', b.entradas]);
    ws.addRow(['Salidas', b.salidas]);
    if (Number(b.transfersIn) || Number(b.transfersOut)) {
      ws.addRow(['Transferencias entrantes', b.transfersIn]);
      ws.addRow(['Transferencias salientes', b.transfersOut]);
    }
    ws.addRow(['Neto', b.neto]);
    ws.addRow(['Saldo final', b.closingBalance]);
    ws.addRow([]);

    if (b.categoriesIn.length > 0) {
      ws.addRow(['Categorías — Entradas']).font = { bold: true };
      for (const c of b.categoriesIn) ws.addRow([c.name, c.total]);
      ws.addRow([]);
    }
    if (b.categoriesOut.length > 0) {
      ws.addRow(['Categorías — Salidas']).font = { bold: true };
      for (const c of b.categoriesOut) ws.addRow([c.name, c.total]);
      ws.addRow([]);
    }
  }

  return await wb.xlsx.writeBuffer();
}

export async function buildPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Reporte de flujo de caja', { align: 'center' });
    doc.fontSize(10).text(`Período: ${report.from} → ${report.to}`, { align: 'center' });
    doc.moveDown();

    for (const [currency, b] of Object.entries(report.byCurrency)) {
      doc.fontSize(12).text(`Moneda: ${currency}`, { underline: true });
      doc.fontSize(10);
      doc.text(`Saldo inicial: ${b.openingBalance}`);
      doc.text(`Entradas: ${b.entradas}`);
      doc.text(`Salidas: ${b.salidas}`);
      if (Number(b.transfersIn) || Number(b.transfersOut)) {
        doc.text(`Transferencias entrantes: ${b.transfersIn}`);
        doc.text(`Transferencias salientes: ${b.transfersOut}`);
      }
      doc.text(`Neto: ${b.neto}`);
      doc.text(`Saldo final: ${b.closingBalance}`);
      doc.moveDown();

      if (b.categoriesIn.length > 0) {
        doc.text('Categorías — Entradas:');
        for (const c of b.categoriesIn) doc.text(`  ${c.name}: ${c.total}`);
        doc.moveDown();
      }
      if (b.categoriesOut.length > 0) {
        doc.text('Categorías — Salidas:');
        for (const c of b.categoriesOut) doc.text(`  ${c.name}: ${c.total}`);
        doc.moveDown();
      }
    }

    doc.end();
  });
}
```

- [ ] **Step 3: Test rápido manual de los buffers**

Añade al `describe('cash-flow.service')` de su test:

```javascript
test('buildExcel y buildPdf retornan buffers no vacíos', async () => {
  const report = await cashFlow.getReport({
    from: new Date('2026-02-01'),
    to: new Date('2026-02-28'),
    accountId: acctBsF.id,
  });
  const excel = await cashFlow.buildExcel(report);
  const pdf = await cashFlow.buildPdf(report);
  expect(excel.length).toBeGreaterThan(1000);
  expect(pdf.length).toBeGreaterThan(500);
});
```

- [ ] **Step 4: Correr — 3 tests verde**

```bash
cd backend && npm test -- cash-flow.service
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cash-flow.service.js backend/src/__tests__/cash-flow.service.test.js
git commit -m "feat(contabilidad): cash-flow Excel and PDF builders"
```

---

## Phase B — Backend HTTP layer

### Task B1: account.controller + routes

**Files:**
- Create: `backend/src/controllers/account.controller.js`
- Modify: `backend/src/routes/contabilidad.routes.js`

- [ ] **Step 1: Crear el controller**

Crea `backend/src/controllers/account.controller.js`:

```javascript
import * as accountService from '../services/account.service.js';
import logger from '../lib/logger.js';

class AccountController {
  async create(req, res) {
    try {
      const { name, currency, openingBalance, openingDate, sortOrder } = req.body ?? {};
      if (!name) return res.status(400).json({ success: false, error: 'name requerido' });
      if (!['BsF', 'USD'].includes(currency)) {
        return res.status(400).json({ success: false, error: 'currency debe ser BsF o USD' });
      }
      const account = await accountService.createAccount({
        name, currency, openingBalance, openingDate,
        createdById: req.user.id, sortOrder,
      });
      res.status(201).json({ success: true, data: account });
    } catch (err) {
      logger.error('[account.controller] create', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async list(req, res) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const accounts = await accountService.listAccounts({ includeInactive });
      const withBalances = await Promise.all(accounts.map(async (a) => ({
        ...a,
        currentBalance: await accountService.getCurrentBalance(a.id),
      })));
      res.json({ success: true, data: withBalances });
    } catch (err) {
      logger.error('[account.controller] list', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getOne(req, res) {
    try {
      const account = await accountService.getAccount(req.params.id);
      const currentBalance = await accountService.getCurrentBalance(account.id);
      res.json({ success: true, data: { ...account, currentBalance } });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async update(req, res) {
    try {
      const patch = req.body ?? {};
      const account = await accountService.updateAccount(req.params.id, patch);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deactivate(req, res) {
    try {
      const account = await accountService.deactivateAccount(req.params.id);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async reactivate(req, res) {
    try {
      const account = await accountService.reactivateAccount(req.params.id);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export default new AccountController();
```

- [ ] **Step 2: Registrar rutas en `contabilidad.routes.js`**

Después de las rutas existentes y antes del handler de error multer, añade:

```javascript
import accountController from '../controllers/account.controller.js';

// ============================================================================
// Cuentas (v2)
// ============================================================================
router.get('/cuentas', accountController.list.bind(accountController));
router.get('/cuentas/:id', accountController.getOne.bind(accountController));
router.post('/cuentas', accountController.create.bind(accountController));
router.patch('/cuentas/:id', accountController.update.bind(accountController));
router.patch('/cuentas/:id/deactivate', accountController.deactivate.bind(accountController));
router.patch('/cuentas/:id/reactivate', accountController.reactivate.bind(accountController));
```

- [ ] **Step 3: Smoke test manual con curl**

```bash
cd backend && npm run dev &
sleep 3
TOKEN=$(curl -sX POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<password>"}' | jq -r '.data.accessToken')
curl -s http://localhost:3001/api/contabilidad/cuentas -H "Authorization: Bearer $TOKEN" | jq
kill %1
```

Expected: array con la cuenta "Sin clasificar".

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/account.controller.js backend/src/routes/contabilidad.routes.js
git commit -m "feat(contabilidad): account HTTP endpoints"
```

---

### Task B2: transfer.controller + attachment routes

**Files:**
- Create: `backend/src/controllers/transfer.controller.js`
- Modify: `backend/src/routes/contabilidad.routes.js`
- Modify: `backend/src/middlewares/upload.middleware.js`

- [ ] **Step 1: Añadir `uploadTransferReceipt` al middleware**

Edita `backend/src/middlewares/upload.middleware.js` y exporta una segunda instancia:

```javascript
export const uploadTransferReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});
```

- [ ] **Step 2: Crear `transfer.controller.js`**

Crea `backend/src/controllers/transfer.controller.js`:

```javascript
import * as transferService from '../services/transfer.service.js';
import * as transferAttachmentService from '../services/transfer-attachment.service.js';
import { NoRateForTransferError } from '../services/transfer.service.js';
import logger from '../lib/logger.js';

class TransferController {
  async create(req, res) {
    try {
      const { transferDate, fromAccountId, toAccountId, amountFrom, description } = req.body ?? {};
      if (!transferDate) return res.status(400).json({ success: false, error: 'transferDate requerido' });
      const parsedDate = new Date(transferDate);
      if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ success: false, error: 'transferDate inválido' });
      const transfer = await transferService.createTransfer({
        transferDate: parsedDate,
        fromAccountId, toAccountId, amountFrom, description,
        createdById: req.user.id,
      });
      res.status(201).json({ success: true, data: transfer });
    } catch (err) {
      if (err instanceof NoRateForTransferError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      logger.error('[transfer.controller] create', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async list(req, res) {
    try {
      const { from, to, accountId, includeReversed } = req.query;
      const transfers = await transferService.listTransfers({
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        accountId,
        includeReversed: includeReversed === 'true',
      });
      res.json({ success: true, data: transfers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getOne(req, res) {
    try {
      const transfer = await transferService.getTransfer(req.params.id);
      res.json({ success: true, data: transfer });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async reverse(req, res) {
    try {
      const { reversalReason } = req.body ?? {};
      const reversal = await transferService.reverseTransfer(
        req.params.id, reversalReason, req.user.id,
      );
      res.status(201).json({ success: true, data: reversal });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async uploadAttachment(req, res) {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'Archivo requerido' });
      const transfer = await transferService.getTransfer(req.params.id);
      const att = await transferAttachmentService.validateAndStore({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        transferDate: transfer.transferDate,
        uploadedById: req.user.id,
        transferId: transfer.id,
      });
      res.status(201).json({ success: true, data: att });
    } catch (err) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }

  async downloadAttachment(req, res) {
    try {
      const { att, stream } = await transferAttachmentService.getAttachmentStream(req.params.attId);
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${att.originalName}"`);
      stream.pipe(res);
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async deleteAttachment(req, res) {
    try {
      await transferAttachmentService.deleteAttachment(req.params.attId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export default new TransferController();
```

- [ ] **Step 3: Registrar rutas**

En `backend/src/routes/contabilidad.routes.js`, añade después de las rutas de cuentas:

```javascript
import transferController from '../controllers/transfer.controller.js';
import { uploadTransferReceipt } from '../middlewares/upload.middleware.js';

// ============================================================================
// Transferencias (v2)
// ============================================================================
router.get('/transferencias', transferController.list.bind(transferController));
router.get('/transferencias/:id', transferController.getOne.bind(transferController));
router.post('/transferencias', transferController.create.bind(transferController));
router.post('/transferencias/:id/reverse', transferController.reverse.bind(transferController));
router.post(
  '/transferencias/:id/attachments',
  uploadTransferReceipt.single('file'),
  transferController.uploadAttachment.bind(transferController),
);
router.get(
  '/transferencias/:id/attachments/:attId',
  transferController.downloadAttachment.bind(transferController),
);
router.delete(
  '/transferencias/:id/attachments/:attId',
  transferController.deleteAttachment.bind(transferController),
);
```

- [ ] **Step 4: Smoke test con curl**

```bash
cd backend && npm run dev &
sleep 3
# POST transferencia entre dos cuentas
# ... usando $TOKEN obtenido antes
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/transfer.controller.js backend/src/middlewares/upload.middleware.js backend/src/routes/contabilidad.routes.js
git commit -m "feat(contabilidad): transfer HTTP endpoints + attachments"
```

---

### Task B3: cash-flow.controller + rutas (JSON + Excel + PDF)

**Files:**
- Create: `backend/src/controllers/cash-flow.controller.js`
- Modify: `backend/src/routes/contabilidad.routes.js`

- [ ] **Step 1: Crear el controller**

Crea `backend/src/controllers/cash-flow.controller.js`:

```javascript
import * as cashFlow from '../services/cash-flow.service.js';
import logger from '../lib/logger.js';

function parseRange(req) {
  const { from, to, accountId } = req.query;
  if (!from || !to) {
    const err = new Error('from y to son requeridos (YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    const err = new Error('from o to inválido');
    err.statusCode = 400;
    throw err;
  }
  return { fromDate, toDate, accountId: accountId || undefined };
}

class CashFlowController {
  async getJson(req, res) {
    try {
      const { fromDate, toDate, accountId } = parseRange(req);
      const report = await cashFlow.getReport({ from: fromDate, to: toDate, accountId });
      res.json({ success: true, data: report });
    } catch (err) {
      logger.error('[cash-flow.controller] getJson', err);
      res.status(err.statusCode ?? 500).json({ success: false, error: err.message });
    }
  }

  async getExcel(req, res) {
    try {
      const { fromDate, toDate, accountId } = parseRange(req);
      const report = await cashFlow.getReport({ from: fromDate, to: toDate, accountId });
      const buffer = await cashFlow.buildExcel(report);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="flujo-caja-${report.from}-${report.to}.xlsx"`);
      res.send(buffer);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ success: false, error: err.message });
    }
  }

  async getPdf(req, res) {
    try {
      const { fromDate, toDate, accountId } = parseRange(req);
      const report = await cashFlow.getReport({ from: fromDate, to: toDate, accountId });
      const buffer = await cashFlow.buildPdf(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="flujo-caja-${report.from}-${report.to}.pdf"`);
      res.send(buffer);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ success: false, error: err.message });
    }
  }
}

export default new CashFlowController();
```

- [ ] **Step 2: Registrar rutas — Excel/PDF ANTES del JSON para evitar matching prefix**

En `contabilidad.routes.js`, añade:

```javascript
import cashFlowController from '../controllers/cash-flow.controller.js';

// ============================================================================
// Flujo de caja (v2)
//   /flujo-caja/excel y /pdf van ANTES del JSON para que el router no los matchee
//   contra /:id (no aplica aquí porque no hay params, pero consistencia con pnl).
// ============================================================================
router.get('/flujo-caja/excel', cashFlowController.getExcel.bind(cashFlowController));
router.get('/flujo-caja/pdf',   cashFlowController.getPdf.bind(cashFlowController));
router.get('/flujo-caja',       cashFlowController.getJson.bind(cashFlowController));
```

- [ ] **Step 3: Smoke test**

```bash
cd backend && npm run dev &
sleep 3
curl -s "http://localhost:3001/api/contabilidad/flujo-caja?from=2026-02-01&to=2026-02-28" \
  -H "Authorization: Bearer $TOKEN" | jq
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/cash-flow.controller.js backend/src/routes/contabilidad.routes.js
git commit -m "feat(contabilidad): cash-flow report endpoints (JSON, Excel, PDF)"
```

---

### Task B4: Update accounting-entry.controller — aceptar accountId

**Files:**
- Modify: `backend/src/controllers/accounting-entry.controller.js`

- [ ] **Step 1: Añadir validación de `accountId` en `create()`**

En `backend/src/controllers/accounting-entry.controller.js`, dentro del método `create`, después de la validación de `amount` y antes de llamar a `entryService.createEntry`, añade:

```javascript
      const { accountId } = body;
      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({ success: false, error: 'accountId es requerido' });
      }
```

Y pasa `accountId` a `createEntry`:

```javascript
      const entry = await entryService.createEntry({
        type, entryDate: parsedDate, categoryId, description, currency, amount,
        settlementId, accountId, createdById: req.user.id,
      });
```

- [ ] **Step 2: Rechazar `accountId` en PATCH (es IMMUTABLE)**

En el método `update`, dentro del bloque que filtra `EDITABLE_PATCH_KEYS`, añade un explicit reject para `accountId`:

```javascript
      if ('accountId' in body) {
        return res.status(400).json({ success: false, error: 'accountId es inmutable post-creación' });
      }
```

- [ ] **Step 3: Smoke test**

```bash
cd backend && npm run dev &
sleep 3
curl -sX POST http://localhost:3001/api/contabilidad/asientos \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"INCOME","entryDate":"2026-05-16","categoryId":"<id>","description":"smoke","currency":"BsF","amount":"100","accountId":"00000000-0000-0000-0000-000000000001"}' | jq
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/accounting-entry.controller.js
git commit -m "feat(contabilidad): require accountId in POST asientos, reject in PATCH"
```

---

### Task B5: Integration test — contabilidad v2 end-to-end

**Files:**
- Create: `backend/src/__tests__/contabilidad-v2.integration.test.js`

- [ ] **Step 1: Crear test que ejerce el flujo completo**

Crea `backend/src/__tests__/contabilidad-v2.integration.test.js` con la estructura inline-app del existente `contabilidad.integration.test.js` y los siguientes 4 casos:

```javascript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const { prisma } = await import('../lib/prisma.js');
const { staticStorageGuard } = await import('../middlewares/static-storage-guard.middleware.js');
const contabilidadRoutes = (await import('../routes/contabilidad.routes.js')).default;

const TEST_PREFIX = `TEST-B5-${Date.now()}-${process.pid}`;
let app, server, baseUrl, adminToken, adminUser;

beforeAll(async () => {
  adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  adminToken = jwt.sign({ id: adminUser.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/storage', staticStorageGuard);
  app.use('/api/contabilidad', contabilidadRoutes);
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}/api/contabilidad`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await prisma.transfer.deleteMany({ where: { description: { startsWith: TEST_PREFIX } } });
  await prisma.accountingEntry.deleteMany({ where: { description: { startsWith: TEST_PREFIX } } });
  await prisma.account.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

async function api(method, p, body) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

describe('contabilidad v2 end-to-end', () => {
  test('POST /cuentas crea cuenta con saldo inicial', async () => {
    const r = await api('POST', '/cuentas', {
      name: `${TEST_PREFIX} Caja`, currency: 'BsF',
      openingBalance: '1000', openingDate: '2026-01-01',
    });
    expect(r.status).toBe(201);
    expect(r.data.data.name).toBe(`${TEST_PREFIX} Caja`);
  });

  test('POST /asientos rechaza sin accountId', async () => {
    const category = await prisma.category.findFirst({ where: { appliesTo: 'INCOME' } });
    const r = await api('POST', '/asientos', {
      type: 'INCOME', entryDate: '2026-02-01',
      categoryId: category.id, description: `${TEST_PREFIX} nope`,
      currency: 'BsF', amount: '100',
    });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/accountId/);
  });

  test('POST /transferencias entre cuentas BsF', async () => {
    const cuenta1 = await prisma.account.create({
      data: { name: `${TEST_PREFIX} T1`, currency: 'BsF',
        openingBalance: '5000', openingDate: new Date('2026-01-01'),
        createdById: adminUser.id },
    });
    const cuenta2 = await prisma.account.create({
      data: { name: `${TEST_PREFIX} T2`, currency: 'BsF',
        openingBalance: '0', openingDate: new Date('2026-01-01'),
        createdById: adminUser.id },
    });
    const r = await api('POST', '/transferencias', {
      transferDate: '2026-02-15',
      fromAccountId: cuenta1.id, toAccountId: cuenta2.id,
      amountFrom: '500', description: `${TEST_PREFIX} transfer1`,
    });
    expect(r.status).toBe(201);
    expect(Number(r.data.data.amountTo)).toBe(500);
  });

  test('GET /flujo-caja devuelve saldos correctos', async () => {
    const r = await api('GET', '/flujo-caja?from=2026-02-01&to=2026-02-28');
    expect(r.status).toBe(200);
    expect(r.data.data.byCurrency.BsF).toBeDefined();
  });
});
```

- [ ] **Step 2: Correr — verde**

```bash
cd backend && npm test -- contabilidad-v2
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/contabilidad-v2.integration.test.js
git commit -m "test(contabilidad): v2 end-to-end integration"
```

---

## Phase C — Frontend API client

### Task C1: Extender lib/api/contabilidad.js con cuentas, transferencias y flujo-caja

**Files:**
- Modify: `frontend/lib/api/contabilidad.js`

- [ ] **Step 1: Añadir funciones de cuentas al final del archivo**

Añade al final de `frontend/lib/api/contabilidad.js`:

```javascript
// ---------- Cuentas (v2) ----------

export async function fetchAccounts({ includeInactive = false } = {}) {
  const res = await fetch(
    `${API_URL}/contabilidad/cuentas${qs({ includeInactive: includeInactive ? 'true' : '' })}`,
    { headers: authHeaders() },
  );
  return jsonOrThrow(res);
}

export async function fetchAccount(id) {
  const res = await fetch(`${API_URL}/contabilidad/cuentas/${id}`, { headers: authHeaders() });
  return jsonOrThrow(res);
}

export async function createAccount(body) {
  const res = await fetch(`${API_URL}/contabilidad/cuentas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateAccount(id, patch) {
  const res = await fetch(`${API_URL}/contabilidad/cuentas/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  return jsonOrThrow(res);
}

export async function deactivateAccount(id) {
  const res = await fetch(`${API_URL}/contabilidad/cuentas/${id}/deactivate`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return jsonOrThrow(res);
}

export async function reactivateAccount(id) {
  const res = await fetch(`${API_URL}/contabilidad/cuentas/${id}/reactivate`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return jsonOrThrow(res);
}
```

- [ ] **Step 2: Añadir funciones de transferencias**

```javascript
// ---------- Transferencias (v2) ----------

export async function fetchTransfers(filters = {}) {
  const res = await fetch(
    `${API_URL}/contabilidad/transferencias${qs(filters)}`,
    { headers: authHeaders() },
  );
  return jsonOrThrow(res);
}

export async function fetchTransfer(id) {
  const res = await fetch(`${API_URL}/contabilidad/transferencias/${id}`, { headers: authHeaders() });
  return jsonOrThrow(res);
}

export async function createTransfer(body) {
  const res = await fetch(`${API_URL}/contabilidad/transferencias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function reverseTransfer(id, reversalReason) {
  const res = await fetch(`${API_URL}/contabilidad/transferencias/${id}/reverse`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reversalReason }),
  });
  return jsonOrThrow(res);
}

export async function uploadTransferAttachment(transferId, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_URL}/contabilidad/transferencias/${transferId}/attachments`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });
  return jsonOrThrow(res);
}

export function downloadTransferAttachmentUrl(transferId, attId) {
  return `${API_URL}/contabilidad/transferencias/${transferId}/attachments/${attId}`;
}

export async function deleteTransferAttachment(transferId, attId) {
  const res = await fetch(`${API_URL}/contabilidad/transferencias/${transferId}/attachments/${attId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return jsonOrThrow(res);
}
```

- [ ] **Step 3: Añadir funciones de flujo de caja**

```javascript
// ---------- Flujo de caja (v2) ----------

export async function fetchCashFlow({ from, to, accountId } = {}) {
  const res = await fetch(
    `${API_URL}/contabilidad/flujo-caja${qs({ from, to, accountId })}`,
    { headers: authHeaders() },
  );
  return jsonOrThrow(res);
}

export function cashFlowExcelUrl({ from, to, accountId } = {}) {
  return `${API_URL}/contabilidad/flujo-caja/excel${qs({ from, to, accountId })}`;
}

export function cashFlowPdfUrl({ from, to, accountId } = {}) {
  return `${API_URL}/contabilidad/flujo-caja/pdf${qs({ from, to, accountId })}`;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/contabilidad.js
git commit -m "feat(contabilidad): frontend API client for accounts, transfers, cash-flow"
```

---

## Phase D — Frontend pages

### Task D1: Componentes compartidos — MoneyBadge y AttachmentPicker

**Files:**
- Create: `frontend/components/contabilidad/MoneyBadge.js`
- Create: `frontend/components/contabilidad/AttachmentPicker.js`

- [ ] **Step 1: Crear `MoneyBadge.js`**

Crea `frontend/components/contabilidad/MoneyBadge.js`:

```javascript
'use client';

const TYPE_LABELS = {
  INCOME: { label: 'Ingreso', cls: 'bg-green-100 text-green-800' },
  EXPENSE: { label: 'Gasto', cls: 'bg-red-100 text-red-800' },
  PAYMENT: { label: 'Pago', cls: 'bg-blue-100 text-blue-800' },
  TRANSFER: { label: 'Transferencia', cls: 'bg-purple-100 text-purple-800' },
};

export function TypeBadge({ type }) {
  const cfg = TYPE_LABELS[type] || { label: type, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ entry }) {
  if (entry.reversedById) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Reversado</span>;
  }
  if (entry.reversesId) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Reversión</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Activo</span>;
}

export function formatBsF(value, opts = { decimals: 2 }) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('es-VE', {
    minimumFractionDigits: opts.decimals,
    maximumFractionDigits: opts.decimals,
  });
}
```

- [ ] **Step 2: Crear `AttachmentPicker.js`**

Crea `frontend/components/contabilidad/AttachmentPicker.js`:

```javascript
'use client';

import { useRef, useState } from 'react';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function AttachmentPicker({ value, onChange, disabled }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  function handle(file) {
    setError('');
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('Archivo excede 5MB');
      return;
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      setError('Tipo no permitido (PDF, JPG, PNG)');
      return;
    }
    onChange(file);
    if (file.type?.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  function clear() {
    onChange(null);
    setPreview(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
        disabled={disabled}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
        disabled={disabled}
      />
      {!value && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={disabled}
            className="min-h-11 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50">
            📷 Tomar foto
          </button>
          <button type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="min-h-11 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50">
            📁 Elegir archivo
          </button>
        </div>
      )}
      {value && (
        <div className="flex items-center gap-3 border border-gray-200 rounded-md p-2">
          {preview ? (
            <img src={preview} alt="vista previa" className="w-16 h-16 object-cover rounded" />
          ) : (
            <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-2xl">📄</div>
          )}
          <div className="flex-1 text-sm">
            <div className="font-medium text-gray-900 truncate">{value.name}</div>
            <div className="text-xs text-gray-500">{(value.size / 1024).toFixed(1)} KB</div>
          </div>
          <button type="button" onClick={clear}
            className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700">
            Quitar
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/contabilidad/
git commit -m "feat(contabilidad): shared MoneyBadge and AttachmentPicker components"
```

---

### Task D2: Frontend — pantalla Cuentas (lista + nueva + detalle)

**Files:**
- Create: `frontend/app/admin/contabilidad/cuentas/page.js`
- Create: `frontend/app/admin/contabilidad/cuentas/nueva/page.js`
- Create: `frontend/app/admin/contabilidad/cuentas/[id]/page.js`

- [ ] **Step 1: Lista de cuentas**

Crea `frontend/app/admin/contabilidad/cuentas/page.js`:

```javascript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchAccounts } from '@/lib/api/contabilidad';
import { formatBsF } from '@/components/contabilidad/MoneyBadge';

const TABS = [
  { key: 'asientos',       label: 'Asientos',       href: '/admin/contabilidad/asientos' },
  { key: 'transferencias', label: 'Transferencias', href: '/admin/contabilidad/transferencias' },
  { key: 'pagos',          label: 'Pagos',          href: '/admin/contabilidad/pagos' },
  { key: 'tasas',          label: 'Tasas',          href: '/admin/contabilidad/tasas' },
  { key: 'categorias',     label: 'Categorías',     href: '/admin/contabilidad/categorias' },
  { key: 'cuentas',        label: 'Cuentas',        href: '/admin/contabilidad/cuentas' },
  { key: 'reportes',       label: 'Reportes',       href: '/admin/contabilidad/reportes' },
];

export default function CuentasPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchAccounts({ includeInactive })
      .then((r) => setAccounts(Array.isArray(r?.data) ? r.data : []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [includeInactive]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
          <p className="text-sm text-gray-500">Cuentas y billeteras</p>
        </div>
        <Link href="/admin/contabilidad/cuentas/nueva"
          className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Nueva cuenta
        </Link>
      </div>

      <nav className="flex gap-2 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              t.key === 'cuentas'
                ? 'text-blue-700 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-blue-700'
            }`}>{t.label}</Link>
        ))}
      </nav>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        Incluir inactivas
      </label>

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {!loading && accounts.length === 0 && <p className="text-sm text-gray-400">Sin cuentas</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {accounts.map((a) => (
          <Link key={a.id} href={`/admin/contabilidad/cuentas/${a.id}`}
            className="block bg-white shadow rounded-lg p-4 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{a.name}</h3>
                <p className="text-xs text-gray-500">Inicio: {String(a.openingDate).slice(0, 10)}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{a.currency}</span>
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500">Saldo actual</p>
              <p className="text-2xl font-mono font-bold text-gray-900">
                {formatBsF(a.currentBalance)} <span className="text-sm text-gray-500">{a.currency}</span>
              </p>
            </div>
            {!a.isActive && (
              <p className="mt-2 text-xs text-red-600">Inactiva</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Nueva cuenta**

Crea `frontend/app/admin/contabilidad/cuentas/nueva/page.js`:

```javascript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createAccount } from '@/lib/api/contabilidad';

function today() { return new Date().toISOString().slice(0, 10); }

export default function NuevaCuentaPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', currency: 'BsF', openingBalance: '0', openingDate: today(), sortOrder: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Nombre requerido');
    setSubmitting(true);
    try {
      await createAccount(form);
      toast.success('Cuenta creada');
      router.push('/admin/contabilidad/cuentas');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Nueva cuenta</h1>
        <Link href="/admin/contabilidad/cuentas" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>
      <form onSubmit={submit} className="bg-white shadow rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
          <input className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            placeholder="Ej: Caja BsF, Zelle USD, Banco Mercantil"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Moneda</label>
            <select className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="BsF">BsF (Bolívares)</option>
              <option value="USD">USD (Dólares)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio</label>
            <input type="date" className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} required />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Saldo inicial ({form.currency})</label>
          <input type="number" step="0.01" className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} required />
          <p className="text-xs text-gray-500 mt-1">
            Este es el saldo que tenías en esta cuenta el día indicado. Es inmutable después de crear.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Link href="/admin/contabilidad/cuentas"
            className="min-h-11 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting}
            className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Detalle de cuenta**

Crea `frontend/app/admin/contabilidad/cuentas/[id]/page.js`:

```javascript
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchAccount, updateAccount, deactivateAccount, reactivateAccount,
  fetchEntries,
} from '@/lib/api/contabilidad';
import { formatBsF, TypeBadge } from '@/components/contabilidad/MoneyBadge';

export default function CuentaDetailPage() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [entries, setEntries] = useState([]);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchAccount(id);
      setAccount(r.data);
      setEditName(r.data.name);
      const eRes = await fetchEntries({ accountId: id });
      setEntries(Array.isArray(eRes?.data) ? eRes.data.slice(0, 30) : []);
    } catch (err) {
      toast.error(err.message);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  async function saveName() {
    setSavingName(true);
    try {
      await updateAccount(id, { name: editName });
      toast.success('Cuenta actualizada');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally { setSavingName(false); }
  }

  async function toggleActive() {
    try {
      if (account.isActive) await deactivateAccount(id);
      else await reactivateAccount(id);
      toast.success('Estado actualizado');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!account) return <p className="text-sm text-gray-500">Cargando…</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{account.name}</h1>
        <Link href="/admin/contabilidad/cuentas" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>

      <section className="bg-white shadow rounded-lg p-4 space-y-2">
        <div>
          <p className="text-xs text-gray-500">Saldo actual</p>
          <p className="text-3xl font-mono font-bold text-gray-900">
            {formatBsF(account.currentBalance)} <span className="text-base text-gray-500">{account.currency}</span>
          </p>
        </div>
        <div className="text-sm text-gray-600">
          Saldo inicial: <span className="font-mono">{formatBsF(account.openingBalance)} {account.currency}</span>
          {' · '}desde {String(account.openingDate).slice(0, 10)}
        </div>
        <div className="text-sm">
          Estado: {account.isActive
            ? <span className="text-green-700 font-medium">Activa</span>
            : <span className="text-red-700 font-medium">Inactiva</span>}
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Configuración</h2>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
          <div className="flex gap-2">
            <input className="flex-1 min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={editName} onChange={(e) => setEditName(e.target.value)} />
            <button onClick={saveName} disabled={savingName || editName === account.name}
              className="min-h-11 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {savingName ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        <button onClick={toggleActive}
          className={`min-h-11 px-4 py-2 text-sm text-white rounded-md ${account.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
          {account.isActive ? 'Desactivar cuenta' : 'Reactivar cuenta'}
        </button>
        {account.isActive && (
          <p className="text-xs text-gray-500">Sólo se permite desactivar si el saldo es 0.</p>
        )}
      </section>

      <section className="bg-white shadow rounded-lg p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Últimos movimientos</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400">Sin movimientos</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/contabilidad/asientos/${e.id}`}
                  className="flex items-center justify-between py-2 hover:bg-gray-50 -mx-2 px-2 rounded">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeBadge type={e.type} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{e.description}</p>
                      <p className="text-xs text-gray-500">{String(e.entryDate).slice(0, 10)} · {e.category?.name}</p>
                    </div>
                  </div>
                  <p className="text-sm font-mono text-gray-900 whitespace-nowrap ml-2">{formatBsF(e.amountBsF)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Probar en navegador**

```bash
cd backend && npm run dev &
cd frontend && npm run dev &
sleep 5
# abre http://localhost:10000/admin/contabilidad/cuentas
```

Verifica que la lista cargue, crear una cuenta funcione, y el detalle muestre el saldo correcto.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/contabilidad/cuentas/
git commit -m "feat(contabilidad): UI for accounts list, create, and detail"
```

---

### Task D3: Frontend — Asientos con cuenta + upload-at-create + español + mobile cards

**Files:**
- Modify: `frontend/app/admin/contabilidad/asientos/nueva/page.js`
- Modify: `frontend/app/admin/contabilidad/asientos/page.js`
- Modify: `frontend/app/admin/contabilidad/asientos/[id]/page.js`

- [ ] **Step 1: Form "Nueva asiento" con selector de cuenta + AttachmentPicker**

Edita `frontend/app/admin/contabilidad/asientos/nueva/page.js`. Importa:

```javascript
import { fetchAccounts, uploadAttachment } from '@/lib/api/contabilidad';
import AttachmentPicker from '@/components/contabilidad/AttachmentPicker';
```

Añade estado al inicio del componente:

```javascript
const [accounts, setAccounts] = useState([]);
const [attachment, setAttachment] = useState(null);
```

Y, junto a los demás useEffect, carga las cuentas:

```javascript
useEffect(() => {
  fetchAccounts({ includeInactive: false })
    .then((r) => setAccounts(Array.isArray(r?.data) ? r.data : []))
    .catch(() => {});
}, []);
```

Añade `accountId` al `formData` inicial:

```javascript
const [formData, setFormData] = useState({
  type: qsType || 'EXPENSE',
  entryDate: todayIsoDate(),
  categoryId: '',
  description: '',
  currency: 'BsF',
  amount: '',
  accountId: '',
  settlementId: qsSettlementId || null,
});
```

Cuando seleccionan cuenta, fija la moneda automáticamente. Añade un useEffect:

```javascript
useEffect(() => {
  if (!formData.accountId) return;
  const a = accounts.find((x) => x.id === formData.accountId);
  if (a && a.currency !== formData.currency) {
    setFormData((fd) => ({ ...fd, currency: a.currency }));
  }
}, [formData.accountId, accounts]);
```

En el render, añade el select de cuenta (después de Tipo y antes de Categoría):

```jsx
<div>
  <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta</label>
  <select required
    value={formData.accountId}
    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
    className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md">
    <option value="">— Selecciona —</option>
    {accounts.map((a) => (
      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
    ))}
  </select>
</div>
```

Españoliza el select de tipo:

```jsx
<select value={formData.type} onChange={...}>
  <option value="EXPENSE">Gasto</option>
  <option value="INCOME">Ingreso</option>
  <option value="PAYMENT">Pago a proveedor</option>
</select>
```

Antes del botón submit, añade:

```jsx
<div>
  <label className="block text-xs font-medium text-gray-700 mb-1">Recibo (opcional)</label>
  <AttachmentPicker value={attachment} onChange={setAttachment} disabled={submitting} />
</div>
```

Y modifica `handleSubmit` para subir el archivo después de crear el asiento:

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  if (usdBlocked) return;
  const amountNum = Number(formData.amount);
  if (!(amountNum > 0)) return toast.error('Monto debe ser positivo');
  if (!formData.categoryId) return toast.error('Categoría requerida');
  if (!formData.accountId) return toast.error('Cuenta requerida');

  setSubmitting(true);
  try {
    const payload = {
      type: formData.type,
      entryDate: formData.entryDate,
      categoryId: formData.categoryId,
      description: formData.description || undefined,
      currency: formData.currency,
      amount: amountNum,
      accountId: formData.accountId,
    };
    if (formData.type === 'PAYMENT' && formData.settlementId) {
      payload.settlementId = formData.settlementId;
    }
    const res = await createEntry(payload);
    const newId = res?.data?.id;
    if (attachment && newId) {
      try {
        await uploadAttachment(newId, attachment);
      } catch (attErr) {
        toast.error('Asiento creado, pero falló subir el recibo. Súbelo desde el detalle.');
      }
    }
    toast.success('Asiento creado');
    router.push(newId ? `/admin/contabilidad/asientos/${newId}` : '/admin/contabilidad/asientos');
  } catch (err) {
    toast.error(err.message || 'Error creando asiento');
  } finally {
    setSubmitting(false);
  }
};
```

- [ ] **Step 2: Lista de asientos — cards en móvil, filtros colapsables, filtro de cuenta, español**

Edita `frontend/app/admin/contabilidad/asientos/page.js`. Importa:

```javascript
import { fetchAccounts } from '@/lib/api/contabilidad';
import { TypeBadge, StatusBadge, formatBsF } from '@/components/contabilidad/MoneyBadge';
```

Añade el estado de cuentas y carga:

```javascript
const [accounts, setAccounts] = useState([]);
useEffect(() => {
  fetchAccounts({ includeInactive: true })
    .then((r) => setAccounts(Array.isArray(r?.data) ? r.data : []))
    .catch(() => {});
}, []);
```

Añade `accountId` a `filters` inicial. En el bloque de filtros, envuélvelo en un `<details>` que sea colapsable en móvil y abierto por default en desktop:

```jsx
<details open className="bg-white shadow rounded-lg group" >
  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 list-none flex items-center justify-between">
    <span>Filtros</span>
    <span className="text-xs text-gray-500 group-open:rotate-180 transition">▼</span>
  </summary>
  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
    {/* tipo, fechas, categoría, cuenta, includeReversed */}
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta</label>
      <select value={filters.accountId || ''}
        onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
        className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md">
        <option value="">Todas</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
      </select>
    </div>
    {/* … resto … */}
  </div>
</details>
```

Reemplaza el render de tabla con uno dual: tabla en `md:block` + cards en `<md`. Después del bloque de filtros:

```jsx
{/* Cards en móvil */}
<div className="md:hidden space-y-2">
  {entries.map((e) => (
    <div key={e.id} onClick={() => router.push(`/admin/contabilidad/asientos/${e.id}`)}
      className="bg-white shadow rounded-lg p-4 cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TypeBadge type={e.type} />
          <p className="text-sm text-gray-600 truncate">{String(e.entryDate).slice(0, 10)}</p>
        </div>
        <StatusBadge entry={e} />
      </div>
      <p className="text-2xl font-mono font-bold text-gray-900">{formatBsF(e.amountBsF)} <span className="text-xs text-gray-500">BsF</span></p>
      <p className="text-sm text-gray-700 mt-1 line-clamp-2">{e.description || '—'}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span>{e.category?.name}</span>
        {e.account && <><span>·</span><span>{e.account.name}</span></>}
      </div>
    </div>
  ))}
</div>

{/* Tabla en desktop */}
<div className="hidden md:block bg-white shadow rounded-lg overflow-x-auto">
  {/* (la tabla existente, añadiéndole columna "Cuenta") */}
</div>
```

Y en la tabla existente, españoliza las cabeceras de tipo (usa TypeBadge), añade columna "Cuenta" con `e.account?.name`, y reemplaza los badges crudos con `<TypeBadge />` y `<StatusBadge />`.

- [ ] **Step 3: Detalle de asiento — mostrar cuenta, españolizar badges**

Edita `frontend/app/admin/contabilidad/asientos/[id]/page.js`. Importa:

```javascript
import { TypeBadge, StatusBadge } from '@/components/contabilidad/MoneyBadge';
```

Reemplaza los badges hardcodeados en el render por `<TypeBadge type={entry.type} />` y `<StatusBadge entry={entry} />`. Añade una sección "Cuenta" después de "Montos":

```jsx
{entry.account && (
  <section className="bg-white shadow rounded-lg p-4">
    <h2 className="text-base font-semibold text-gray-900">Cuenta</h2>
    <Link href={`/admin/contabilidad/cuentas/${entry.account.id}`}
      className="text-sm text-blue-700 hover:underline">
      {entry.account.name} ({entry.account.currency})
    </Link>
  </section>
)}
```

- [ ] **Step 4: Probar en navegador**

Recarga `/admin/contabilidad/asientos/nueva`. Verifica:
- El selector de cuenta aparece y filtra moneda
- Los tipos dicen "Ingreso/Gasto/Pago a proveedor"
- Tomar foto desde celular abre la cámara
- Al enviar con foto, el asiento se crea con el adjunto

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/contabilidad/asientos/
git commit -m "feat(contabilidad): account selector + upload-at-create + español + mobile cards in asientos"
```

---

### Task D4: Frontend — Transferencias (lista + nueva + detalle)

**Files:**
- Create: `frontend/app/admin/contabilidad/transferencias/page.js`
- Create: `frontend/app/admin/contabilidad/transferencias/nueva/page.js`
- Create: `frontend/app/admin/contabilidad/transferencias/[id]/page.js`

- [ ] **Step 1: Lista**

Crea `frontend/app/admin/contabilidad/transferencias/page.js`:

```javascript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchTransfers, fetchAccounts } from '@/lib/api/contabilidad';
import { formatBsF, StatusBadge } from '@/components/contabilidad/MoneyBadge';

export default function TransferenciasListPage() {
  const router = useRouter();
  const [transfers, setTransfers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', accountId: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts({ includeInactive: true }).then((r) => setAccounts(r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTransfers(filters)
      .then((r) => setTransfers(r?.data || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transferencias</h1>
          <p className="text-sm text-gray-500">Movimientos entre cuentas</p>
        </div>
        <Link href="/admin/contabilidad/transferencias/nueva"
          className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Nueva
        </Link>
      </div>

      <details open className="bg-white shadow rounded-lg">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 list-none">Filtros</summary>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta</label>
            <select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md">
              <option value="">Todas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      </details>

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {!loading && transfers.length === 0 && <p className="text-sm text-gray-400">Sin transferencias</p>}

      <div className="space-y-2">
        {transfers.map((t) => (
          <div key={t.id} onClick={() => router.push(`/admin/contabilidad/transferencias/${t.id}`)}
            className="bg-white shadow rounded-lg p-4 cursor-pointer hover:shadow-md">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm text-gray-600">{String(t.transferDate).slice(0, 10)}</p>
              <StatusBadge entry={t} />
            </div>
            <div className="text-sm text-gray-900">
              <span className="font-medium">{t.fromAccount?.name}</span>
              {' → '}
              <span className="font-medium">{t.toAccount?.name}</span>
            </div>
            <p className="text-xl font-mono font-bold text-gray-900 mt-1">
              {formatBsF(t.amountFrom)} {t.fromAccount?.currency}
              {t.fromAccount?.currency !== t.toAccount?.currency &&
                <span className="text-sm text-gray-500"> ≈ {formatBsF(t.amountTo)} {t.toAccount?.currency}</span>
              }
            </p>
            <p className="text-sm text-gray-700 mt-1 line-clamp-2">{t.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Nueva transferencia con AttachmentPicker**

Crea `frontend/app/admin/contabilidad/transferencias/nueva/page.js`:

```javascript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchAccounts, createTransfer, uploadTransferAttachment, fetchRates,
} from '@/lib/api/contabilidad';
import AttachmentPicker from '@/components/contabilidad/AttachmentPicker';

function today() { return new Date().toISOString().slice(0, 10); }

export default function NuevaTransferenciaPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    transferDate: today(), fromAccountId: '', toAccountId: '',
    amountFrom: '', description: '',
  });
  const [attachment, setAttachment] = useState(null);
  const [rate, setRate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAccounts({ includeInactive: false }).then((r) => setAccounts(r?.data || [])).catch(() => {});
  }, []);

  const fromAcct = accounts.find((a) => a.id === form.fromAccountId);
  const toAcct = accounts.find((a) => a.id === form.toAccountId);
  const needsRate = fromAcct && toAcct && fromAcct.currency !== toAcct.currency;

  useEffect(() => {
    if (!needsRate) { setRate(null); return; }
    fetchRates({ from: form.transferDate, to: form.transferDate })
      .then((r) => setRate(r?.data?.[0] || null))
      .catch(() => setRate(null));
  }, [needsRate, form.transferDate]);

  const livePreview = (() => {
    if (!form.amountFrom || !fromAcct || !toAcct) return null;
    if (fromAcct.currency === toAcct.currency) return null;
    if (!rate) return null;
    const r = Number(rate.rateBsPerUsd);
    if (fromAcct.currency === 'USD' && toAcct.currency === 'BsF') return (Number(form.amountFrom) * r).toFixed(2);
    if (fromAcct.currency === 'BsF' && toAcct.currency === 'USD') return (Number(form.amountFrom) / r).toFixed(2);
    return null;
  })();

  async function submit(e) {
    e.preventDefault();
    if (form.fromAccountId === form.toAccountId) return toast.error('Cuentas deben ser distintas');
    if (!Number(form.amountFrom) > 0) return toast.error('Monto debe ser positivo');
    if (needsRate && !rate) return toast.error(`No hay tasa para ${form.transferDate}`);

    setSubmitting(true);
    try {
      const res = await createTransfer(form);
      const tId = res?.data?.id;
      if (attachment && tId) {
        try { await uploadTransferAttachment(tId, attachment); }
        catch { toast.error('Transferencia creada pero falló subir comprobante'); }
      }
      toast.success('Transferencia creada');
      router.push(tId ? `/admin/contabilidad/transferencias/${tId}` : '/admin/contabilidad/transferencias');
    } catch (err) {
      toast.error(err.message);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Nueva transferencia</h1>
        <Link href="/admin/contabilidad/transferencias" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>
      <form onSubmit={submit} className="bg-white shadow rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input type="date" required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <select required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.fromAccountId} onChange={(e) => setForm({ ...form, fromAccountId: e.target.value })}>
              <option value="">— Selecciona —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hacia</label>
            <select required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.toAccountId} onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}>
              <option value="">— Selecciona —</option>
              {accounts.filter((a) => a.id !== form.fromAccountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monto ({fromAcct?.currency || ''})</label>
            <input type="number" step="0.01" required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.amountFrom} onChange={(e) => setForm({ ...form, amountFrom: e.target.value })} />
          </div>
        </div>
        {needsRate && !rate && (
          <p className="text-sm text-red-600">No hay tasa para {form.transferDate} — ingresa una tasa primero.</p>
        )}
        {livePreview && (
          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2">
            Equivalente: <strong>{livePreview} {toAcct?.currency}</strong>
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
          <textarea rows={2} required className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Comprobante (opcional)</label>
          <AttachmentPicker value={attachment} onChange={setAttachment} disabled={submitting} />
        </div>
        <div className="flex justify-end gap-2">
          <Link href="/admin/contabilidad/transferencias"
            className="min-h-11 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting || (needsRate && !rate)}
            className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creando…' : 'Crear transferencia'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Detalle de transferencia**

Crea `frontend/app/admin/contabilidad/transferencias/[id]/page.js`:

```javascript
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchTransfer, reverseTransfer,
  uploadTransferAttachment, downloadTransferAttachmentUrl, deleteTransferAttachment,
} from '@/lib/api/contabilidad';
import { StatusBadge, formatBsF } from '@/components/contabilidad/MoneyBadge';
import AttachmentPicker from '@/components/contabilidad/AttachmentPicker';

export default function TransferDetailPage() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [reason, setReason] = useState('');
  const [showReverse, setShowReverse] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [att, setAtt] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetchTransfer(id); setT(r.data); } catch (e) { toast.error(e.message); }
  }, [id]);
  useEffect(() => { if (id) load(); }, [id, load]);

  async function doReverse() {
    if (!reason.trim()) return toast.error('Motivo requerido');
    setReversing(true);
    try {
      await reverseTransfer(id, reason);
      toast.success('Transferencia reversada');
      setShowReverse(false);
      await load();
    } catch (e) { toast.error(e.message); } finally { setReversing(false); }
  }

  async function doUpload() {
    if (!att) return;
    setUploading(true);
    try {
      await uploadTransferAttachment(id, att);
      toast.success('Comprobante subido');
      setAtt(null);
      await load();
    } catch (e) { toast.error(e.message); } finally { setUploading(false); }
  }

  async function downloadAtt(a) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(downloadTransferAttachmentUrl(id, a.id), { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = a.originalName; link.click();
    URL.revokeObjectURL(url);
  }

  async function delAtt(a) {
    if (!confirm(`¿Eliminar "${a.originalName}"?`)) return;
    try { await deleteTransferAttachment(id, a.id); toast.success('Eliminado'); await load(); }
    catch (e) { toast.error(e.message); }
  }

  if (!t) return <p className="text-sm text-gray-500">Cargando…</p>;

  const canReverse = !t.reversedById && !t.reversesId;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Transferencia</h1>
        <Link href="/admin/contabilidad/transferencias" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>

      <section className="bg-white shadow rounded-lg p-4 space-y-2">
        <StatusBadge entry={t} />
        <p className="text-sm text-gray-600">{String(t.transferDate).slice(0, 10)}</p>
        <div className="text-sm text-gray-900">
          <span className="font-medium">{t.fromAccount?.name}</span>
          <span className="mx-2 text-gray-400">→</span>
          <span className="font-medium">{t.toAccount?.name}</span>
        </div>
        <p className="text-2xl font-mono font-bold text-gray-900">
          {formatBsF(t.amountFrom)} {t.fromAccount?.currency}
        </p>
        {t.fromAccount?.currency !== t.toAccount?.currency && (
          <p className="text-sm text-gray-700">≈ {formatBsF(t.amountTo)} {t.toAccount?.currency}</p>
        )}
        <p className="text-sm text-gray-700 mt-2">{t.description}</p>
      </section>

      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Comprobantes</h2>
        {(t.attachments || []).length === 0 && <p className="text-sm text-gray-400">Sin comprobantes</p>}
        <ul className="space-y-2">
          {(t.attachments || []).map((a) => (
            <li key={a.id} className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
              <span className="text-sm text-gray-900">{a.originalName}</span>
              <div className="flex gap-2">
                <button onClick={() => downloadAtt(a)} className="px-2 py-1 text-xs text-white bg-blue-600 rounded">Descargar</button>
                <button onClick={() => delAtt(a)} className="px-2 py-1 text-xs text-white bg-red-600 rounded">Quitar</button>
              </div>
            </li>
          ))}
        </ul>
        <AttachmentPicker value={att} onChange={setAtt} disabled={uploading} />
        {att && (
          <button onClick={doUpload} disabled={uploading}
            className="min-h-11 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {uploading ? 'Subiendo…' : 'Subir comprobante'}
          </button>
        )}
      </section>

      {canReverse && (
        <div className="flex justify-end">
          <button onClick={() => setShowReverse(true)}
            className="min-h-11 px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700">
            Reversar transferencia
          </button>
        </div>
      )}

      {showReverse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2" onClick={() => setShowReverse(false)}>
          <div className="bg-white rounded-lg p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Reversar transferencia</h2>
            <textarea rows={3} placeholder="Motivo…" value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowReverse(false)} className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md">Cancelar</button>
              <button onClick={doReverse} disabled={!reason.trim() || reversing}
                className="px-3 py-2 text-sm text-white bg-red-600 rounded-md disabled:opacity-50">
                {reversing ? 'Reversando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/contabilidad/transferencias/
git commit -m "feat(contabilidad): UI for transfers list, create, and detail"
```

---

### Task D5: Frontend — pantalla Reportes con vistas diaria/semanal/mensual/rango

**Files:**
- Create: `frontend/app/admin/contabilidad/reportes/page.js`

- [ ] **Step 1: Crear la pantalla**

Crea `frontend/app/admin/contabilidad/reportes/page.js`:

```javascript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchAccounts, fetchCashFlow, cashFlowExcelUrl, cashFlowPdfUrl } from '@/lib/api/contabilidad';
import { formatBsF } from '@/components/contabilidad/MoneyBadge';

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

function isoWeekRange(d) {
  const date = new Date(d);
  const day = date.getDay() || 7;
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + 6);
  return { from: isoDate(date), to: isoDate(sunday) };
}

function monthRange(d) {
  const date = new Date(d);
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

export default function ReportesPage() {
  const [view, setView] = useState('semanal');
  const [range, setRange] = useState(() => isoWeekRange(new Date()));
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts({ includeInactive: true }).then((r) => setAccounts(r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCashFlow({ from: range.from, to: range.to, accountId: accountId || undefined })
      .then((r) => setReport(r.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [range.from, range.to, accountId]);

  function selectView(v) {
    setView(v);
    const today = new Date();
    if (v === 'semanal') setRange(isoWeekRange(today));
    else if (v === 'mensual') setRange(monthRange(today));
    else if (v === 'diario') setRange({ from: isoDate(today), to: isoDate(today) });
    // 'rango' deja al usuario seteando los inputs
  }

  function dlExcel() {
    const token = localStorage.getItem('accessToken');
    fetch(cashFlowExcelUrl({ from: range.from, to: range.to, accountId: accountId || undefined }),
      { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `flujo-caja-${range.from}-${range.to}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      });
  }

  function dlPdf() {
    const token = localStorage.getItem('accessToken');
    fetch(cashFlowPdfUrl({ from: range.from, to: range.to, accountId: accountId || undefined }),
      { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `flujo-caja-${range.from}-${range.to}.pdf`; a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Reportes de flujo de caja</h1>

      <div className="bg-white shadow rounded-lg p-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto">
          {['semanal', 'mensual', 'diario', 'rango'].map((v) => (
            <button key={v} onClick={() => selectView(v)}
              className={`min-h-11 px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap ${
                view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md">
              <option value="">Todas (consolidado)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={dlExcel} className="min-h-11 px-3 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700">Descargar Excel</button>
          <button onClick={dlPdf} className="min-h-11 px-3 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700">Descargar PDF</button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando reporte…</p>}

      {report && !loading && (
        <div className="space-y-3">
          {Object.entries(report.byCurrency).map(([currency, b]) => (
            <div key={currency} className="bg-white shadow rounded-lg p-4 space-y-2">
              <h2 className="text-lg font-bold text-gray-900">Moneda: {currency}</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Saldo inicial:</span> <span className="font-mono">{formatBsF(b.openingBalance)}</span></div>
                <div><span className="text-gray-500">Saldo final:</span> <span className="font-mono font-bold">{formatBsF(b.closingBalance)}</span></div>
                <div className="text-green-700"><span className="text-gray-500">Entradas:</span> <span className="font-mono">+{formatBsF(b.entradas)}</span></div>
                <div className="text-red-700"><span className="text-gray-500">Salidas:</span> <span className="font-mono">−{formatBsF(b.salidas)}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Neto:</span> <span className="font-mono font-bold">{Number(b.neto) >= 0 ? '+' : ''}{formatBsF(b.neto)}</span></div>
              </div>
              {b.categoriesIn.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-700">Entradas por categoría</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {b.categoriesIn.map((c) => (
                      <li key={c.categoryId} className="flex justify-between">
                        <span>{c.name}</span><span className="font-mono">{formatBsF(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {b.categoriesOut.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-700">Salidas por categoría</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {b.categoriesOut.map((c) => (
                      <li key={c.categoryId} className="flex justify-between">
                        <span>{c.name}</span><span className="font-mono">{formatBsF(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}

          {report.transfers.length > 0 && (
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Transferencias internas en el período</h2>
              <ul className="space-y-2 text-sm">
                {report.transfers.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span>{String(t.transferDate).slice(0, 10)} · {t.fromAccount.name} → {t.toAccount.name}</span>
                    <span className="font-mono">{formatBsF(t.amountFrom)} {t.fromAccount.currency}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/admin/contabilidad/reportes/
git commit -m "feat(contabilidad): cash-flow report page (daily/weekly/monthly/range + exports)"
```

---

### Task D6: Frontend — Home dashboard rediseñado

**Files:**
- Modify: `frontend/app/admin/contabilidad/page.js`

- [ ] **Step 1: Reescribir como dashboard**

Reemplaza `frontend/app/admin/contabilidad/page.js`:

```javascript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchAccounts, fetchCashFlow } from '@/lib/api/contabilidad';
import { formatBsF } from '@/components/contabilidad/MoneyBadge';

const TABS = [
  { key: 'home',           label: 'Resumen',        href: '/admin/contabilidad' },
  { key: 'asientos',       label: 'Asientos',       href: '/admin/contabilidad/asientos' },
  { key: 'transferencias', label: 'Transferencias', href: '/admin/contabilidad/transferencias' },
  { key: 'pagos',          label: 'Pagos',          href: '/admin/contabilidad/pagos' },
  { key: 'tasas',          label: 'Tasas',          href: '/admin/contabilidad/tasas' },
  { key: 'categorias',     label: 'Categorías',     href: '/admin/contabilidad/categorias' },
  { key: 'cuentas',        label: 'Cuentas',        href: '/admin/contabilidad/cuentas' },
  { key: 'reportes',       label: 'Reportes',       href: '/admin/contabilidad/reportes' },
];

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

function isoWeekRange() {
  const date = new Date();
  const day = date.getDay() || 7;
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + 6);
  return { from: isoDate(date), to: isoDate(sunday) };
}

export default function ContabilidadHome() {
  const [accounts, setAccounts] = useState([]);
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState(null);

  useEffect(() => {
    fetchAccounts().then((r) => setAccounts(r?.data || [])).catch((e) => toast.error(e.message));
    const todayStr = isoDate(new Date());
    fetchCashFlow({ from: todayStr, to: todayStr }).then((r) => setToday(r.data)).catch(() => {});
    const w = isoWeekRange();
    fetchCashFlow({ from: w.from, to: w.to }).then((r) => setWeek({ ...r.data, range: w })).catch(() => {});
  }, []);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <Link href="/admin/contabilidad/asientos/nueva"
          className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Nuevo
        </Link>
      </div>

      <nav className="flex gap-2 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              t.key === 'home' ? 'text-blue-700 border-blue-600' : 'text-gray-600 border-transparent hover:text-blue-700'
            }`}>{t.label}</Link>
        ))}
      </nav>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Saldos actuales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {accounts.map((a) => (
            <Link key={a.id} href={`/admin/contabilidad/cuentas/${a.id}`}
              className="bg-white shadow rounded-lg p-3 hover:shadow-md">
              <p className="text-xs text-gray-500">{a.name}</p>
              <p className="text-xl font-mono font-bold text-gray-900 mt-1">
                {formatBsF(a.currentBalance)} <span className="text-xs text-gray-500">{a.currency}</span>
              </p>
            </Link>
          ))}
        </div>
      </section>

      {today && (
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700">Hoy · {isoDate(new Date())}</h2>
          {Object.entries(today.byCurrency).map(([cur, b]) => (
            <div key={cur} className="mt-2 text-sm">
              <p className="text-xs text-gray-500">{cur}</p>
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-green-700">+{formatBsF(b.entradas)}</span>
                <span className="text-red-700">−{formatBsF(b.salidas)}</span>
                <span className="font-bold">= {Number(b.neto) >= 0 ? '+' : ''}{formatBsF(b.neto)}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {week && (
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700">Esta semana · {week.range.from} – {week.range.to}</h2>
          {Object.entries(week.byCurrency).map(([cur, b]) => (
            <div key={cur} className="mt-2">
              <p className="text-xs text-gray-500">{cur}</p>
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-green-700">Entradas: +{formatBsF(b.entradas)}</span>
                <span className="text-red-700">Salidas: −{formatBsF(b.salidas)}</span>
              </div>
              <p className="text-lg font-mono font-bold mt-1">Neto: {Number(b.neto) >= 0 ? '+' : ''}{formatBsF(b.neto)} {cur}</p>
            </div>
          ))}
          <Link href="/admin/contabilidad/reportes" className="text-sm text-blue-700 hover:underline mt-2 inline-block">
            Ver reportes →
          </Link>
        </section>
      )}

      <Link href="/admin/contabilidad/asientos/nueva"
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-3xl flex items-center justify-center shadow-lg z-40">
        +
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/admin/contabilidad/page.js
git commit -m "feat(contabilidad): dashboard home with accounts, today, this week, FAB"
```

---

### Task D7: Frontend — Pagos / Categorías / Tasas mobile pulido + españolización

**Files:**
- Modify: `frontend/app/admin/contabilidad/pagos/page.js`
- Modify: `frontend/app/admin/contabilidad/categorias/page.js`
- Modify: `frontend/app/admin/contabilidad/tasas/page.js`

- [ ] **Step 1: Pagos — actualizar TABS y vista cards mobile**

En `frontend/app/admin/contabilidad/pagos/page.js`:

Reemplaza `const TABS = [...]` con la nueva lista incluyendo `home`, `transferencias`, `cuentas`, `reportes` (igual que en home).

Sustituye el bloque de la tabla por:

```jsx
{/* Cards en móvil */}
<div className="md:hidden space-y-2">
  {paymentEntries.map((e) => (
    <div key={e.id} onClick={() => router.push(`/admin/contabilidad/asientos/${e.id}`)}
      className="bg-white shadow rounded-lg p-4 cursor-pointer">
      <p className="text-xs text-gray-500">{String(e.entryDate).slice(0, 10)}</p>
      <p className="text-2xl font-mono font-bold mt-1">{formatAmount(e.amountBsF)}</p>
      <p className="text-sm text-gray-700 mt-1 line-clamp-2">{e.description || '—'}</p>
      <p className="text-xs text-gray-500 mt-1">
        Liq: {e.settlement ? `${e.settlement.isoYear}-W${e.settlement.isoWeek}` : '—'}
      </p>
    </div>
  ))}
</div>

{/* Tabla en desktop — el bloque existente, dentro de un div con hidden md:block */}
<div className="hidden md:block bg-white shadow rounded-lg overflow-x-auto">
  {/* … (tabla actual) … */}
</div>
```

Y en el `<select>` y opciones que digan `CONFIRMED` / `ADJUSTED`, mantén el `value` pero traduce el label visible (sigue siendo válido el value en backend).

- [ ] **Step 2: Categorías — TABS actualizados, inputs grandes, mobile-friendly**

En `frontend/app/admin/contabilidad/categorias/page.js`:
- Actualiza `TABS` igual.
- Añade clase `min-h-11` a todos los `<input>` y `<select>`.
- Cambia la tabla a vista de cards en `md:hidden` similar al patrón anterior.

- [ ] **Step 3: Tasas — TABS actualizados, mobile-friendly**

En `frontend/app/admin/contabilidad/tasas/page.js`:
- TABS actualizados.
- Inputs con `min-h-11`.
- Lista en cards en móvil.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/contabilidad/pagos/ frontend/app/admin/contabilidad/categorias/ frontend/app/admin/contabilidad/tasas/
git commit -m "feat(contabilidad): mobile polish + updated tab nav for pagos/categorias/tasas"
```

---

## Phase E — Validación final

### Task E1: Build + tests completos

- [ ] **Step 1: Backend tests completos**

```bash
cd backend && npm test
```

Expected: todo verde.

- [ ] **Step 2: Frontend build**

```bash
cd frontend && npm run build
```

Expected: build exitoso (sin errores de TypeScript ni lint).

- [ ] **Step 3: Lint backend + frontend**

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

- [ ] **Step 4: Smoke test manual en navegador**

```bash
cd backend && npm run dev &
cd frontend && npm run dev &
```

Recorrer el flujo:
1. Abrir http://localhost:10000/admin/contabilidad — ver dashboard con saldos
2. Ir a "Cuentas" → crear una cuenta nueva con saldo inicial
3. Ir a "Asientos" → crear un nuevo asiento con foto del comprobante (probar también desde móvil/responsive emulado en DevTools)
4. Ir a "Transferencias" → crear una transferencia entre dos cuentas
5. Ir a "Reportes" → ver flujo semanal, mensual; descargar Excel y PDF
6. Volver al dashboard → confirmar que los saldos se actualizaron

- [ ] **Step 5: Commit final con CHANGELOG**

Si existe `CHANGELOG.md`, añade entrada:

```markdown
## v1.5 — Contabilidad v2 (2026-05-XX)

- Cuentas múltiples con moneda fija + saldo inicial inmutable
- Transferencias entre cuentas (mismo moneda o cross-currency con tasa)
- Reportes de flujo de caja diario/semanal/mensual/rango con Excel y PDF
- Upload de comprobantes al crear asiento (cámara móvil soportada)
- Home rediseñado como dashboard con saldos en vivo
- Mobile-first: cards en lugar de tablas, FAB para acción rápida, tabs scrollables
- Españolización completa de etiquetas (INCOME → Ingreso, etc.)
- Asientos legacy migrados a cuenta "Sin clasificar"
```

```bash
git add CHANGELOG.md
git commit -m "docs: contabilidad v2 changelog entry"
```

---

## Notas para el ejecutor

- **Backups**: antes de aplicar la migración en producción, hacer dump de `tote_db` (`pg_dump`). En local, suficiente con docker volumes.
- **Orden de despliegue producción**: backend primero (la migración Prisma se aplica), luego frontend. Si frontend se despliega antes que la migración corrió, las páginas de cuentas dirán "no module" pero los asientos viejos seguirán funcionando — no es catastrófico, sólo feo.
- **Pre-deploy en VPS 94**: confirmar que existe al menos un user con `role='ADMIN'` (la migración aborta si no). Verificar con `ssh 94 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db -c \"SELECT id, email FROM \\\"User\\\" WHERE role='ADMIN' LIMIT 5;\""`.
- **Storage path en VPS**: la carpeta `backend/storage/transfer-receipts/` se crea on-demand. Verificar permisos del proceso pm2 después del primer upload.
- **PUBLISHED vs DRAWN**: este feature no toca el ciclo de sorteos, así que la divergencia local/prod no aplica acá.
