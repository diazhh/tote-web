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
});
