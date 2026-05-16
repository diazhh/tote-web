/**
 * Phase 14 Plan 14-03 Task 2 — FIN-REPORT-07: Excel/PDF export builders.
 *
 * Assertions:
 *   - buildPnlExcel returns a Buffer with at least one {formula: ...} cell
 *     (auditable totals — required by FIN-REPORT-07).
 *   - buildPnlPdf returns a Buffer starting with the %PDF magic header.
 *   - Both builders gracefully render an EMPTY week (no throw).
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest \
 *   --testPathPattern='pnl-excel-pdf' --runInBand
 */

import { describe, test, expect, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: pnlReportService } = await import('../services/pnl-report.service.js');
const { prisma } = await import('../lib/prisma.js');

/**
 * Walks every worksheet/cell in the workbook and returns true if at least
 * one cell value carries a `formula` property — proving that totals are
 * auditable (FIN-REPORT-07 / Phase 12 pattern).
 */
function workbookHasFormulaCell(wb) {
  let found = false;
  wb.worksheets.forEach((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) {
          found = true;
        }
      });
    });
  });
  return found;
}

describe('Phase 14 Plan 14-03 — FIN-REPORT-07 export builders', () => {
  test('buildPnlExcel — returns Buffer with auditable {formula: ...} cells', async () => {
    // Use an empty week so the test does not depend on seeded data.
    const buf = await pnlReportService.buildPnlExcel({ isoYear: 2099, isoWeek: 1 });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1024); // a real xlsx is several KB even when sparse

    // Parse the workbook back and inspect cells.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.length).toBeGreaterThan(0);
    expect(workbookHasFormulaCell(wb)).toBe(true);
  });

  test('buildPnlPdf — returns Buffer starting with %PDF magic', async () => {
    const buf = await pnlReportService.buildPnlPdf({ isoYear: 2099, isoWeek: 1 });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(256);
    expect(buf.toString('ascii', 0, 4)).toBe('%PDF');
  });

  test('Both builders work on an empty week without throwing', async () => {
    // This is implicit in the two tests above (they use 2099-W1 — empty) — but
    // we re-assert explicitly for documentation.
    await expect(pnlReportService.buildPnlExcel({ isoYear: 2099, isoWeek: 2 })).resolves.toBeDefined();
    await expect(pnlReportService.buildPnlPdf({ isoYear: 2099, isoWeek: 2 })).resolves.toBeDefined();
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => {});
  });
});
