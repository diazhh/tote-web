/**
 * One-off snapshot capture script for Phase 14 Plan 14-02 Task 1.
 *
 * Calls the CURRENT (pre-refactor) monitorService.getDailyReport with a deterministic
 * date range and writes the response to `legacy-report-snapshot.json`. This fixture
 * is the P-A regression net: the post-refactor _getDailyReportLegacy must return an
 * IDENTICAL value (byte-for-byte JSON.stringify match) when called with the same input.
 *
 * Usage:
 *   cd backend && node src/__tests__/fixtures/_capture-legacy-snapshot.mjs
 *
 * Safe to delete after the fixture is in place — the file is only needed to
 * (re-)generate the fixture if the refactor needs to be re-baselined.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env so DATABASE_URL is set before importing prisma
dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: monitorService } = await import('../../services/monitor.service.js');

const INPUT = {
  dateFrom: '2026-05-14',
  dateTo: '2026-05-14',
  gameId: null,
  source: null,
  apiSystemId: null,
};

console.log('[capture] calling monitorService.getDailyReport with', INPUT);
const response = await monitorService.getDailyReport(INPUT);

const fixture = {
  _description:
    'Phase 14 Plan 14-02 — P-A regression net for monitor.service.js#getDailyReport legacy branch. ' +
    'Captured BEFORE the useMaterialized branch refactor; post-refactor _getDailyReportLegacy ' +
    'with the same _input MUST produce a JSON.stringify-equal _response.',
  _capturedAt: new Date().toISOString(),
  _input: INPUT,
  _response: response,
};

const outPath = path.join(__dirname, 'legacy-report-snapshot.json');
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));

console.log(`[capture] wrote ${outPath}`);
console.log(`[capture] response.draws.length=${response.draws.length}`);
console.log(`[capture] response.totals=${JSON.stringify(response.totals)}`);

await (await import('../../lib/prisma.js')).prisma.$disconnect();
process.exit(0);
