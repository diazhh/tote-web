/**
 * Phase 14 Plan 14-02 Task 1 — P-A regression net for monitor.service.js#getDailyReport.
 *
 * Asserts that calling `getDailyReport({ ..._input, useMaterialized: false })` returns a
 * response that is JSON.stringify-equal to the pre-refactor snapshot captured into
 * `fixtures/legacy-report-snapshot.json`. ANY byte-level drift fails CI.
 *
 * The fixture was captured by `fixtures/_capture-legacy-snapshot.mjs` BEFORE the legacy
 * branch was refactored. The post-refactor `_getDailyReportLegacy` body is a verbatim
 * move of the original `getDailyReport` body (only the apiSystem resolution block was
 * swapped for the shared `resolveApiSystemFilter` helper — same downstream behavior).
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --testPathPattern='daily-report-legacy-snapshot' --runInBand
 */

import { describe, test, expect, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env so DATABASE_URL is set before importing prisma.
dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: monitorService } = await import('../services/monitor.service.js');
const { prisma } = await import('../lib/prisma.js');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'legacy-report-snapshot.json');

describe('P-A: getDailyReport legacy branch is byte-equivalent to pre-refactor snapshot', () => {
  test('JSON.stringify(result) deep-equals JSON.stringify(fixture._response)', async () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    const result = await monitorService.getDailyReport({
      ...fixture._input,
      useMaterialized: false,
    });

    // Serialize both for byte-level comparison. Use JSON.stringify with no indentation
    // so Date / Decimal serialization is normalized identically on both sides.
    const expectedJson = JSON.stringify(fixture._response);
    const actualJson   = JSON.stringify(result);

    if (actualJson !== expectedJson) {
      // Dump the first 2 KB of each for debuggability.
      const dumpSize = 2048;
      // eslint-disable-next-line no-console
      console.error(
        '[P-A regression] legacy response drift detected.\n' +
          `EXPECTED (first ${dumpSize} chars):\n${expectedJson.slice(0, dumpSize)}\n\n` +
          `ACTUAL   (first ${dumpSize} chars):\n${actualJson.slice(0, dumpSize)}`,
      );
    }

    expect(actualJson).toBe(expectedJson);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
