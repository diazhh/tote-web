/**
 * Phase 13 — ExchangeRate service (FIN-RATE-01..05, D-01).
 *
 * CRITICAL DESIGN NOTES:
 *   1. D-01 single chokepoint: `getEffectiveRateForDate(date)` is the ONLY place in the
 *      codebase that queries ExchangeRate by date for picker/auto-conversion semantics.
 *      All accounting consumers (accounting-entry.service.js#createEntry) MUST import
 *      this function — never inline the lookup query. Rationale: predictable "last
 *      loaded of the day wins" semantics across rateType variants, single place to
 *      revise if we ever change the picker rule.
 *
 *   2. FIN-RATE-02 immutability is enforced via SURFACE AREA: no `updateRate` or
 *      `deleteRate` export. Corrections happen by inserting a new dated row (which
 *      then becomes the effective rate per D-01 createdAt DESC ordering).
 *
 *   3. The supporting DB index `[date, createdAt(sort: Desc)]` is created in Plan 13-01.
 *      `findFirst` with `orderBy: { createdAt: 'desc' }` uses it efficiently.
 *
 *   4. Module exports are named (no default). Consumers import { getEffectiveRateForDate,
 *      listRates, createRate } as needed.
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * D-01: returns the most-recently-loaded ExchangeRate for the given date, regardless
 * of rateType. Returns null when no rate exists for that date.
 *
 * Consumers (accounting-entry.service.js#createEntry) treat a null return as the
 * F-6 backend block — throwing NoRateForDateError before persisting a USD entry.
 *
 * @param {Date} date - the entryDate to look up (DATE-only column; time component ignored)
 * @returns {Promise<object|null>} ExchangeRate row or null
 */
export async function getEffectiveRateForDate(date) {
  return prisma.exchangeRate.findFirst({
    where: { date },
    orderBy: { createdAt: 'desc' }, // D-01: last loaded of the day wins
  });
}

/**
 * List ExchangeRate rows ordered date DESC, createdAt DESC. All filter args optional.
 *
 * @param {object} args
 * @param {string} [args.rateType] - one of BCV | PARALELO | OTRO
 * @param {Date}   [args.from]     - inclusive lower bound on `date`
 * @param {Date}   [args.to]       - inclusive upper bound on `date`
 * @returns {Promise<object[]>}
 */
export async function listRates({ rateType, from, to } = {}) {
  const dateFilter = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;

  return prisma.exchangeRate.findMany({
    where: {
      ...(rateType && { rateType }),
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * Insert a new ExchangeRate row. FIN-RATE-02: no updateRate or deleteRate exists —
 * corrections happen by inserting a new dated row.
 *
 * @param {object} data - { date, rateBsPerUsd, rateType, notes }
 * @param {string} userId - createdById (req.user.id)
 * @returns {Promise<object>} inserted ExchangeRate row
 */
export async function createRate(data, userId) {
  const rate = await prisma.exchangeRate.create({
    data: { ...data, createdById: userId },
  });
  logger.info(
    `[exchange-rate] CREATE id=${rate.id} date=${rate.date.toISOString().slice(0, 10)} rateType=${rate.rateType} rateBsPerUsd=${rate.rateBsPerUsd}`,
  );
  return rate;
}

// INTENTIONAL ABSENCE — FIN-RATE-02 immutability enforced via surface area:
//   - NO updateRate export
//   - NO deleteRate export
