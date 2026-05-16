/**
 * Phase 14 Plan 14-02 Task 2 — FIN-REPORT-04 backend half.
 *
 * Asserts that drawService.getDrawById returns the new financial + financialProviders
 * relations populated against a real draw from the local prod-mirror DB that has a
 * DrawFinancial row.
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --testPathPattern='draws-getById-financial' --runInBand
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: drawService } = await import('../services/draw.service.js');
const { prisma } = await import('../lib/prisma.js');

let targetDrawId;

describe('FIN-REPORT-04: drawService.getDrawById returns financial + financialProviders', () => {
  beforeAll(async () => {
    // Pick a real draw that has BOTH a DrawFinancial row AND at least one provider row.
    const candidate = await prisma.drawFinancial.findFirst({
      where: {
        ticketCount: { gt: 0 },
        draw: { financialProviders: { some: {} } },
      },
      orderBy: { drawId: 'asc' },
      select: { drawId: true },
    });
    if (!candidate) {
      throw new Error('No DrawFinancial row with providers found — seed missing');
    }
    targetDrawId = candidate.drawId;
  });

  test('result.financial is a non-null object with the four materialized fields', async () => {
    const result = await drawService.getDrawById(targetDrawId);
    expect(result).toBeTruthy();
    expect(result.financial).toBeTruthy();
    expect(result.financial.totalSales).toBeDefined();
    expect(result.financial.totalPrize).toBeDefined();
    expect(result.financial.utility).toBeDefined();
    expect(result.financial.ticketCount).toBeDefined();
    // Decimal/number coercion-friendly check
    expect(Number(result.financial.totalSales)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(Number(result.financial.totalSales))).toBe(true);
  });

  test('result.financialProviders is an array; each row has apiSystem populated or apiSystemId null (D-06 house bucket)', async () => {
    const result = await drawService.getDrawById(targetDrawId);
    expect(Array.isArray(result.financialProviders)).toBe(true);
    expect(result.financialProviders.length).toBeGreaterThan(0);

    for (const row of result.financialProviders) {
      // Either apiSystem is an object with the joined fields, OR apiSystemId is null
      // (TAQUILLA_ONLINE house bucket per Phase 11 D-06).
      if (row.apiSystemId === null) {
        expect(row.apiSystem).toBeNull();
      } else {
        expect(row.apiSystem).toBeTruthy();
        expect(row.apiSystem.id).toBe(row.apiSystemId);
        expect(row.apiSystem.name).toBeDefined();
        expect(row.apiSystem.slug).toBeDefined();
        expect(row.apiSystem.mode).toBeDefined();
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
