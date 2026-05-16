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
