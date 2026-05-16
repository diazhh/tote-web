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
