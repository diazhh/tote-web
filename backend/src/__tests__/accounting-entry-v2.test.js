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
