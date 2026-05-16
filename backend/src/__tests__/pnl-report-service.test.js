/**
 * Phase 14 Plan 14-03 Task 1 — getWeeklyPnl formula correctness (FIN-REPORT-05).
 *
 * Seeds a synthetic week (ISO 1999-W1) with:
 *   - one Game / one Draw / DrawFinancial(totalSales=1000, totalPrize=400)
 *   - one DrawFinancialProvider for the provider-filter test
 *   - one ProviderWeeklySettlement(amount=50)
 *   - one AccountingEntry(type=EXPENSE, amountBsF=100)
 *   - one AccountingEntry(type=INCOME, amountBsF=20)
 *   - one ExchangeRate (date < window start, rate 36.50 BCV)
 *
 * Asserts the response object matches the formula in D-02:
 *   weekIncome=1000, weekPrizes=400, weekGrossUtility=600, weekCommissions=50,
 *   weekExpenses=100, weekNet=450, otherIncome=20, usdEquivalent=12.33
 *
 * Also verifies the apiSystemId-filtered mode (D-04): weekExpenses=null,
 * otherIncome=null, weekNet uses gross - commissions only.
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest \
 *   --testPathPattern='pnl-report-service' --runInBand
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: pnlReportService } = await import('../services/pnl-report.service.js');
const { prisma } = await import('../lib/prisma.js');
const { getMondayOfISOWeek } = await import('../lib/dateUtils.js');

const ISO_YEAR = 1999;
const ISO_WEEK = 1;
const TEST_PREFIX = `__test-14-03-pnl-${Date.now()}-${process.pid}`;

let gameId;
let drawId;
let apiSystemId;
let settlementId;
let expenseEntryId;
let incomeEntryId;
let exchangeRateId;
let userId;
let categoryExpenseId;
let categoryIncomeId;

describe('Phase 14 Plan 14-03 — getWeeklyPnl (FIN-REPORT-05)', () => {
  beforeAll(async () => {
    // Resolve the time window for the synthetic ISO week
    const windowStartUtc = getMondayOfISOWeek(ISO_YEAR, ISO_WEEK);
    // Pick a Date inside the window for drawnAt / entryDate
    const drawnAt = new Date(windowStartUtc.getTime() + 2 * 24 * 60 * 60 * 1000); // Wed
    const entryDate = new Date(windowStartUtc.getTime() + 3 * 24 * 60 * 60 * 1000); // Thu

    // Pick existing game + admin user (cheaper than creating)
    const game = await prisma.game.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!game) throw new Error('No game in DB');
    gameId = game.id;

    const user = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (!user) throw new Error('No active ADMIN user in DB');
    userId = user.id;

    // Resolve / create EXPENSE + INCOME categories (seeded by Phase 13)
    let expCat = await prisma.category.findFirst({ where: { appliesTo: 'EXPENSE', isActive: true } });
    if (!expCat) {
      expCat = await prisma.category.create({
        data: { name: `${TEST_PREFIX}-exp-cat`, appliesTo: 'EXPENSE', createdById: userId },
      });
    }
    categoryExpenseId = expCat.id;
    let incCat = await prisma.category.findFirst({ where: { appliesTo: 'INCOME', isActive: true } });
    if (!incCat) {
      incCat = await prisma.category.create({
        data: { name: `${TEST_PREFIX}-inc-cat`, appliesTo: 'INCOME', createdById: userId },
      });
    }
    categoryIncomeId = incCat.id;

    // Create test ApiSystem (PUSH so it routes through DrawFinancialProvider cleanly)
    const sys = await prisma.apiSystem.create({
      data: {
        name: `${TEST_PREFIX}-sys`,
        slug: `${TEST_PREFIX.toLowerCase()}-sys`,
        mode: 'PUSH',
        isActive: true,
      },
    });
    apiSystemId = sys.id;

    // Create Draw inside the window
    const draw = await prisma.draw.create({
      data: {
        gameId,
        drawDate: drawnAt,
        drawTime: '12:00:00',
        status: 'DRAWN',
        closedAt: new Date(drawnAt.getTime() - 5 * 60 * 1000),
        drawnAt,
        prizesProcessed: true,
      },
    });
    drawId = draw.id;

    // DrawFinancial: totalSales=1000, totalPrize=400 → utility=600
    await prisma.drawFinancial.create({
      data: {
        drawId: draw.id,
        totalSales: '1000.00',
        totalPrize: '400.00',
        utility: '600.00',
        ticketCount: 10,
        closedAt: draw.closedAt,
        totalizedAt: drawnAt,
      },
    });
    // DrawFinancialProvider mirroring the same totals for the provider-filter test
    await prisma.drawFinancialProvider.create({
      data: {
        drawId: draw.id,
        apiSystemId,
        totalSales: '1000.00',
        totalPrize: '400.00',
        ticketCount: 10,
      },
    });

    // ProviderWeeklySettlement — amount=50 for the matching (apiSystemId, isoYear, isoWeek)
    const settlement = await prisma.providerWeeklySettlement.create({
      data: {
        apiSystemId,
        isoYear: ISO_YEAR,
        isoWeek: ISO_WEEK,
        amount: '50.00000000',
        status: 'DRAFT',
        ledgerRowCount: 1,
      },
    });
    settlementId = settlement.id;

    // ExchangeRate — date BEFORE the window so the AS-OF-Monday lookup finds it.
    // The unique constraint is implicit (no @@unique on date alone), but use a
    // distinctive notes string so cleanup is targeted.
    const rateDate = new Date(windowStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rate = await prisma.exchangeRate.create({
      data: {
        date: rateDate,
        rateBsPerUsd: '36.50000000',
        rateType: 'BCV',
        notes: `${TEST_PREFIX}-rate`,
        createdById: userId,
      },
    });
    exchangeRateId = rate.id;

    // AccountingEntry — EXPENSE amountBsF=100 (entryDate inside window)
    const exp = await prisma.accountingEntry.create({
      data: {
        type: 'EXPENSE',
        entryDate,
        categoryId: categoryExpenseId,
        amountBsF: '100.00000000',
        originalCurrency: 'BsF',
        description: `${TEST_PREFIX}-expense`,
        createdById: userId,
      },
    });
    expenseEntryId = exp.id;

    // AccountingEntry — INCOME amountBsF=20 (entryDate inside window)
    const inc = await prisma.accountingEntry.create({
      data: {
        type: 'INCOME',
        entryDate,
        categoryId: categoryIncomeId,
        amountBsF: '20.00000000',
        originalCurrency: 'BsF',
        description: `${TEST_PREFIX}-income`,
        createdById: userId,
      },
    });
    incomeEntryId = inc.id;
  });

  test('FIN-REPORT-05: formula on seeded week (unfiltered)', async () => {
    const result = await pnlReportService.getWeeklyPnl({ isoYear: ISO_YEAR, isoWeek: ISO_WEEK });

    expect(result).toBeDefined();
    expect(result.isoYear).toBe(ISO_YEAR);
    expect(result.isoWeek).toBe(ISO_WEEK);
    expect(result.apiSystemId).toBeNull();

    // Window
    expect(result.windowStartUtc).toBeInstanceOf(Date);
    expect(result.windowEndUtc).toBeInstanceOf(Date);
    expect(result.windowEndUtc.getTime() - result.windowStartUtc.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    // Core formula (D-02)
    expect(result.weekIncome).toBe('1000.00');
    expect(result.weekPrizes).toBe('400.00');
    expect(result.weekGrossUtility).toBe('600.00');
    expect(result.weekCommissions).toBe('50.00');
    expect(result.weekExpenses).toBe('100.00');
    expect(result.weekNet).toBe('450.00');

    // Other income — separate row, NOT netted into formula
    expect(result.otherIncome).toBe('20.00');

    // Rate + USD
    expect(result.rate).not.toBeNull();
    expect(result.rate.id).toBe(exchangeRateId);
    expect(result.rate.rateType).toBe('BCV');
    expect(Number(result.rate.rateBsPerUsd)).toBeCloseTo(36.5, 4);
    // 450 / 36.5 = 12.328... → ROUND_HALF_UP → 12.33
    expect(result.usdEquivalent).toBe('12.33');

    // Drill-down ids include the seeded ones
    expect(result.drillDown.commissionsSettlementIds).toContain(settlementId);
    expect(result.drillDown.expenseEntryIds).toContain(expenseEntryId);
    expect(result.drillDown.otherIncomeEntryIds).toContain(incomeEntryId);

    // byProvider includes the seeded apiSystem row
    expect(Array.isArray(result.byProvider)).toBe(true);
    const providerRow = result.byProvider.find((r) => r.apiSystemId === apiSystemId);
    expect(providerRow).toBeDefined();
    expect(providerRow.weekIncome).toBe('1000.00');
    expect(providerRow.weekPrizes).toBe('400.00');
    expect(providerRow.weekCommissions).toBe('50.00');
    expect(providerRow.weekNet).toBe('550.00'); // 1000 - 400 - 50
  });

  test('D-04: provider-filtered mode — weekExpenses=null, weekNet excludes expenses', async () => {
    const result = await pnlReportService.getWeeklyPnl({
      isoYear: ISO_YEAR,
      isoWeek: ISO_WEEK,
      apiSystemId,
    });

    expect(result.apiSystemId).toBe(apiSystemId);
    expect(result.weekIncome).toBe('1000.00');
    expect(result.weekPrizes).toBe('400.00');
    expect(result.weekGrossUtility).toBe('600.00');
    expect(result.weekCommissions).toBe('50.00');
    // D-04: expenses are not per-provider — service returns null
    expect(result.weekExpenses).toBeNull();
    // weekNet = grossUtility - commissions only (no expense subtraction)
    expect(result.weekNet).toBe('550.00');
    // otherIncome also null in provider mode
    expect(result.otherIncome).toBeNull();
    // byProvider empty in provider-filtered mode (avoids duplicating the row)
    expect(result.byProvider).toEqual([]);
    // Drill-down: settlement id present; expense/income empty
    expect(result.drillDown.commissionsSettlementIds).toContain(settlementId);
    expect(result.drillDown.expenseEntryIds).toEqual([]);
    expect(result.drillDown.otherIncomeEntryIds).toEqual([]);
  });

  afterAll(async () => {
    // FK order
    try {
      if (expenseEntryId) await prisma.accountingEntry.deleteMany({ where: { id: expenseEntryId } });
      if (incomeEntryId)  await prisma.accountingEntry.deleteMany({ where: { id: incomeEntryId } });
      if (settlementId)   await prisma.providerWeeklySettlement.deleteMany({ where: { id: settlementId } });
      if (exchangeRateId) await prisma.exchangeRate.deleteMany({ where: { id: exchangeRateId } });
      if (drawId) {
        await prisma.drawFinancialProvider.deleteMany({ where: { drawId } });
        await prisma.drawFinancial.deleteMany({ where: { drawId } });
        await prisma.draw.deleteMany({ where: { id: drawId } });
      }
      if (apiSystemId) await prisma.apiSystem.deleteMany({ where: { id: apiSystemId } });
      // categories: leave seeded categories alone; only delete the ones we created (TEST_PREFIX-named)
      await prisma.category.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });
});
