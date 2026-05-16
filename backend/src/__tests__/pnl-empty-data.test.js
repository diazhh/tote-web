/**
 * Phase 14 Plan 14-03 Task 1 — P-C: empty week returns a clean zero row, NOT 500.
 *
 * Calls getWeeklyPnl against a guaranteed-empty future ISO week (2099-W1) and
 * asserts every monetary field is "0.00", drillDown arrays are empty, byProvider
 * is empty. The service must NOT throw.
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest \
 *   --testPathPattern='pnl-empty-data' --runInBand
 */

import { describe, test, expect, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: pnlReportService } = await import('../services/pnl-report.service.js');
const { prisma } = await import('../lib/prisma.js');

describe('Phase 14 Plan 14-03 — P-C empty week resilience', () => {
  test('empty future ISO week returns clean zero row, no 500', async () => {
    const result = await pnlReportService.getWeeklyPnl({ isoYear: 2099, isoWeek: 1 });

    expect(result).toBeDefined();
    expect(result.isoYear).toBe(2099);
    expect(result.isoWeek).toBe(1);

    // All monetary fields are "0.00" — never undefined / NaN / null (except
    // expenses/otherIncome can be null in provider-filtered mode; unfiltered
    // here, so they're "0.00").
    expect(result.weekIncome).toBe('0.00');
    expect(result.weekPrizes).toBe('0.00');
    expect(result.weekGrossUtility).toBe('0.00');
    expect(result.weekCommissions).toBe('0.00');
    expect(result.weekExpenses).toBe('0.00');
    expect(result.weekNet).toBe('0.00');
    expect(result.otherIncome).toBe('0.00');

    // Drill-down arrays empty
    expect(result.drillDown).toBeDefined();
    expect(result.drillDown.commissionsSettlementIds).toEqual([]);
    expect(result.drillDown.expenseEntryIds).toEqual([]);
    expect(result.drillDown.otherIncomeEntryIds).toEqual([]);

    // byProvider empty (no draws in window)
    expect(result.byProvider).toEqual([]);

    // Rate may be present (any pre-existing ExchangeRate <= 2099 Monday) or null.
    // If null → usdEquivalent is null. If non-null → usdEquivalent is "0.00".
    if (result.rate === null) {
      expect(result.usdEquivalent).toBeNull();
    } else {
      expect(result.rate.id).toBeDefined();
      expect(result.rate.rateType).toBeDefined();
      expect(result.usdEquivalent).toBe('0.00');
    }

    // Window is sane: 7-day delta
    expect(result.windowEndUtc.getTime() - result.windowStartUtc.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => {});
  });
});
