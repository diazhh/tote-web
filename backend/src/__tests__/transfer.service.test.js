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
  const acctIds = [bsfA?.id, bsfB?.id, usdA?.id].filter(Boolean);
  if (acctIds.length > 0) {
    await prisma.transfer.deleteMany({
      where: { OR: [{ fromAccountId: { in: acctIds } }, { toAccountId: { in: acctIds } }] },
    });
    await prisma.account.deleteMany({ where: { id: { in: acctIds } } });
  }
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
