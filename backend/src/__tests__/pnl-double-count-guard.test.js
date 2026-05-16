/**
 * Phase 14 Plan 14-03 Task 2 — P-B: PAYMENT does NOT inflate weekExpenses.
 *
 * Seeds ISO 1998-W1 with:
 *   - one Provider + one ProviderWeeklySettlement(amount=200, CONFIRMED)
 *   - one AccountingEntry(type=PAYMENT, amountBsF=200, settlementId=<settlement>)
 *   - one AccountingEntry(type=EXPENSE, amountBsF=50)
 *
 * Asserts:
 *   - weekExpenses === "50.00"  (NOT "250.00" — PAYMENT invisible)
 *   - weekCommissions === "200.00"
 *   - weekNet reflects only EXPENSE + commissions, not double-deducted
 *
 * This is the explicit P-B regression net guarding against the
 * "money going out" feels-like-same-bucket trap (14-RESEARCH P-B).
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest \
 *   --testPathPattern='pnl-double-count-guard' --runInBand
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: pnlReportService } = await import('../services/pnl-report.service.js');
const { prisma } = await import('../lib/prisma.js');
const { getMondayOfISOWeek } = await import('../lib/dateUtils.js');

const ISO_YEAR = 1998;
const ISO_WEEK = 1;
const TEST_PREFIX = `__test-14-03-pb-${Date.now()}-${process.pid}`;

let apiSystemId;
let settlementId;
let paymentEntryId;
let expenseEntryId;
let userId;
let categoryExpenseId;
let categoryPaymentId;

describe('Phase 14 Plan 14-03 — P-B PAYMENT double-count guard', () => {
  beforeAll(async () => {
    const windowStartUtc = getMondayOfISOWeek(ISO_YEAR, ISO_WEEK);
    const entryDate = new Date(windowStartUtc.getTime() + 2 * 24 * 60 * 60 * 1000);

    const user = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (!user) throw new Error('No active ADMIN user in DB');
    userId = user.id;

    let expCat = await prisma.category.findFirst({ where: { appliesTo: 'EXPENSE', isActive: true } });
    if (!expCat) {
      expCat = await prisma.category.create({
        data: { name: `${TEST_PREFIX}-exp-cat`, appliesTo: 'EXPENSE', createdById: userId },
      });
    }
    categoryExpenseId = expCat.id;
    let payCat = await prisma.category.findFirst({ where: { appliesTo: 'PAYMENT', isActive: true } });
    if (!payCat) {
      payCat = await prisma.category.create({
        data: { name: `${TEST_PREFIX}-pay-cat`, appliesTo: 'PAYMENT', createdById: userId },
      });
    }
    categoryPaymentId = payCat.id;

    // Provider + CONFIRMED settlement for the week (commissions=200)
    const sys = await prisma.apiSystem.create({
      data: {
        name: `${TEST_PREFIX}-sys`,
        slug: `${TEST_PREFIX.toLowerCase()}-sys`,
        mode: 'PUSH',
        isActive: true,
      },
    });
    apiSystemId = sys.id;

    const settlement = await prisma.providerWeeklySettlement.create({
      data: {
        apiSystemId,
        isoYear: ISO_YEAR,
        isoWeek: ISO_WEEK,
        amount: '200.00000000',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedById: userId,
        ledgerRowCount: 1,
      },
    });
    settlementId = settlement.id;

    // PAYMENT entry linked to the settlement — must NOT appear in weekExpenses
    const payment = await prisma.accountingEntry.create({
      data: {
        type: 'PAYMENT',
        entryDate,
        categoryId: categoryPaymentId,
        amountBsF: '200.00000000',
        originalCurrency: 'BsF',
        description: `${TEST_PREFIX}-payment`,
        createdById: userId,
        settlementId,
        accountId: '00000000-0000-0000-0000-000000000001', // v2 default account
      },
    });
    paymentEntryId = payment.id;

    // EXPENSE entry — the ONLY thing weekExpenses should see
    const expense = await prisma.accountingEntry.create({
      data: {
        type: 'EXPENSE',
        entryDate,
        categoryId: categoryExpenseId,
        amountBsF: '50.00000000',
        originalCurrency: 'BsF',
        description: `${TEST_PREFIX}-expense`,
        createdById: userId,
        accountId: '00000000-0000-0000-0000-000000000001', // v2 default account
      },
    });
    expenseEntryId = expense.id;
  });

  test('P-B: PAYMENT entry linked to settlement does NOT inflate weekExpenses', async () => {
    const result = await pnlReportService.getWeeklyPnl({ isoYear: ISO_YEAR, isoWeek: ISO_WEEK });

    // weekExpenses sees ONLY the EXPENSE row (50), NOT the PAYMENT row (200)
    expect(result.weekExpenses).toBe('50.00');
    // Sanity: PAYMENT amount nowhere in expenses bucket
    expect(result.weekExpenses).not.toBe('250.00');
    expect(result.weekExpenses).not.toBe('200.00');

    // Commissions come from the settlement, not the PAYMENT row
    expect(result.weekCommissions).toBe('200.00');

    // Drill-down: PAYMENT entry id must NOT appear in expenseEntryIds
    expect(result.drillDown.expenseEntryIds).toContain(expenseEntryId);
    expect(result.drillDown.expenseEntryIds).not.toContain(paymentEntryId);

    // Settlement id IS in commissionsSettlementIds
    expect(result.drillDown.commissionsSettlementIds).toContain(settlementId);

    // weekNet = (0 - 0) - 200 - 50 = -250. NOT -450 (no double-deduct).
    // (No draws seeded here so income/prizes are 0.)
    expect(result.weekIncome).toBe('0.00');
    expect(result.weekPrizes).toBe('0.00');
    expect(result.weekGrossUtility).toBe('0.00');
    expect(result.weekNet).toBe('-250.00');
  });

  afterAll(async () => {
    try {
      if (paymentEntryId) await prisma.accountingEntry.deleteMany({ where: { id: paymentEntryId } });
      if (expenseEntryId) await prisma.accountingEntry.deleteMany({ where: { id: expenseEntryId } });
      if (settlementId)   await prisma.providerWeeklySettlement.deleteMany({ where: { id: settlementId } });
      if (apiSystemId)    await prisma.apiSystem.deleteMany({ where: { id: apiSystemId } });
      await prisma.category.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });
});
