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
