/**
 * Phase 13 — AccountingEntry service (FIN-LEDGER-01..09, D-03, D-06).
 *
 * CRITICAL DESIGN NOTES:
 *   1. F-4 precision: ALL monetary arithmetic goes through decimal.js with
 *      ROUND_HALF_UP rounding. The Decimal.set() call below configures the
 *      module-scope rounding mode — never relies on caller-side defaults.
 *
 *   2. F-6 backend block: USD entries REQUIRE an ExchangeRate for entryDate.
 *      When `getEffectiveRateForDate(entryDate)` returns null we throw
 *      NoRateForDateError — controllers map this to HTTP 400 with the message.
 *
 *   3. F-7 rate locking: at create time we set `exchangeRateId = rate.id` on
 *      USD entries. The rate row is immutable (FIN-RATE-02) so historical
 *      reads via `entry.amountBsF / entry.exchangeRate.rateBsPerUsd` stay
 *      stable forever — newer same-date rates do NOT retroactively change
 *      historical USD-equivalent values.
 *
 *   4. FIN-LEDGER-09 immutability: updateEntry strips the IMMUTABLE set
 *      from the patch BEFORE forwarding to prisma.update. The controller
 *      (Plan 13-03) ALSO pre-strips for defense-in-depth, but this service
 *      is the authoritative gate. Only description / categoryId / settlementId
 *      / reversalReason survive.
 *
 *   5. D-06 atomic reversal: reverseEntry runs inside prisma.$transaction
 *      with the INTERACTIVE callback form (async (tx) => {...}). The array
 *      form would require client-side id juggling since the second statement
 *      needs the freshly-created reversal's id to flip original.reversedById.
 *
 *   6. P-4 reversal guards: cannot reverse an already-reversed entry
 *      (reversedById set), cannot reverse a reversal (reversesId set).
 *
 *   7. P-6 settlement re-validate: when settlementId is provided we re-fetch
 *      the ProviderWeeklySettlement and confirm status IN ('CONFIRMED',
 *      'ADJUSTED') — the picker UI may be racy.
 *
 *   8. Hand-rolled validation (planner pre-decision O4): no zod. The controller
 *      validates payload shape; the service trusts well-shaped inputs but
 *      enforces business rules (F-6, P-6, immutability stripping).
 *
 *   9. AuditLog is the controller's responsibility, NOT this service's.
 *      Service layer stays pure (no req-handling, no AuditLog writes).
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import Decimal from 'decimal.js';
import { getEffectiveRateForDate } from './exchange-rate.service.js';

// F-4: module-scope rounding configuration. ROUND_HALF_UP is the banker's-error-free
// choice for accounting (matches Phase 11/12 convention).
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * F-6: thrown by createEntry when currency==='USD' and no ExchangeRate exists for
 * entryDate. Controllers map to HTTP 400. Mirror of Phase 11 PrizesNotProcessedError
 * shape (draw-financial.service.js:37-42).
 */
export class NoRateForDateError extends Error {
  constructor(date) {
    const dateStr = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
    super(
      `No exchange rate exists for ${dateStr} — admin must create one before logging a USD entry`,
    );
    this.name = 'NoRateForDateError';
  }
}

// FIN-LEDGER-09 — these fields are write-once at create time. updateEntry strips them.
const IMMUTABLE = new Set([
  'amountBsF',
  'originalAmount',
  'originalCurrency',
  'entryDate',
  'exchangeRateId',
  'type',
  'accountId', // v2 — no se puede mover un asiento entre cuentas
]);

/**
 * Create an AccountingEntry. Handles BsF-native (no rate, no originalAmount) and
 * USD (rate-locked, amountBsF computed via decimal.js).
 *
 * @param {object} args
 * @param {'INCOME'|'EXPENSE'|'PAYMENT'} args.type
 * @param {Date}   args.entryDate
 * @param {string} args.categoryId
 * @param {string} args.description
 * @param {'BsF'|'USD'} args.currency
 * @param {string|number} args.amount - operator-typed positive amount (Decimal-safe string preferred)
 * @param {string} [args.settlementId] - optional FK to ProviderWeeklySettlement (PAYMENT only typically)
 * @param {string} args.createdById - req.user.id
 * @throws {NoRateForDateError} when currency==='USD' and no rate exists for entryDate
 * @throws {Error} when settlementId provided but settlement is missing or not in CONFIRMED/ADJUSTED
 * @returns {Promise<object>} inserted AccountingEntry row
 */
export async function createEntry({
  type,
  entryDate,
  categoryId,
  description,
  currency,
  amount,
  settlementId,
  accountId, // v2
  createdById,
}) {
  // v2: accountId requerido + moneda debe coincidir con cuenta
  if (!accountId) {
    throw new Error('accountId es requerido');
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new Error(`Cuenta ${accountId} no existe`);
  }
  if (!account.isActive) {
    throw new Error(`Cuenta ${account.name} está inactiva`);
  }
  if (account.currency !== currency) {
    throw new Error(
      `Moneda del asiento (${currency}) no coincide con la moneda de la cuenta ${account.name} (${account.currency})`,
    );
  }

  let amountBsF;
  let originalAmount = null;
  let exchangeRateId = null;

  if (currency === 'USD') {
    // F-6: backend block — must exist before persisting
    const rate = await getEffectiveRateForDate(entryDate);
    if (!rate) throw new NoRateForDateError(entryDate);

    // F-7: lock exchangeRateId at creation time. Future same-date rates do NOT mutate this.
    exchangeRateId = rate.id;
    const originalDec = new Decimal(amount);
    originalAmount = originalDec.toFixed(8);
    // F-4: rateBsPerUsd is Prisma Decimal → .toString() round-trip is precision-safe
    amountBsF = originalDec.times(rate.rateBsPerUsd.toString()).toFixed(8);
  } else {
    // BsF-native: originalAmount + exchangeRateId stay NULL
    amountBsF = new Decimal(amount).toFixed(8);
  }

  // P-6: re-validate settlement eligibility (picker race guard)
  if (settlementId) {
    const settlement = await prisma.providerWeeklySettlement.findUnique({
      where: { id: settlementId },
    });
    if (!settlement || !['CONFIRMED', 'ADJUSTED'].includes(settlement.status)) {
      throw new Error('Settlement no es elegible para pago');
    }
  }

  const entry = await prisma.accountingEntry.create({
    data: {
      type,
      entryDate,
      categoryId,
      description,
      amountBsF,
      originalAmount,
      originalCurrency: currency,
      exchangeRateId,
      settlementId: settlementId ?? null,
      accountId, // v2
      createdById,
    },
  });

  logger.info(
    `[accounting-entry] CREATE id=${entry.id} type=${type} currency=${currency} amountBsF=${amountBsF}`,
  );
  return entry;
}

/**
 * Update an AccountingEntry. Strips IMMUTABLE fields before forwarding to prisma.update
 * (FIN-LEDGER-09). Only description / categoryId / settlementId / reversalReason survive
 * the strip. Attachments are managed separately in Plan 13-03.
 *
 * @param {string} id
 * @param {object} patch - arbitrary patch; IMMUTABLE keys are silently dropped
 * @returns {Promise<object>} updated row
 */
export async function updateEntry(id, patch) {
  // Silently drop IMMUTABLE keys — defense in depth. The controller pre-strips for 400s.
  const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => !IMMUTABLE.has(k)));
  const entry = await prisma.accountingEntry.update({
    where: { id },
    data: safe,
  });
  logger.info(`[accounting-entry] UPDATE id=${id} keys=${Object.keys(safe).join(',')}`);
  return entry;
}

/**
 * D-06 atomic reversal. Creates a negative-amount sibling row and flips the original's
 * reversedById in a single $transaction. Uses the interactive callback form because the
 * second statement needs newReversal.id.
 *
 * Guards:
 *   - original.reversedById set → 'Entry ya reversado' (already reversed)
 *   - original.reversesId set   → 'No se puede reversar un asiento de reversal' (P-4 edge)
 *
 * @param {string} originalId
 * @param {string} reversalReason - required by D-06 modal contract
 * @param {string} userId         - req.user.id (createdById on the new row)
 * @returns {Promise<object>} the new reversal entry
 */
export async function reverseEntry(originalId, reversalReason, userId) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.accountingEntry.findUniqueOrThrow({
      where: { id: originalId },
    });

    // D-06 / P-4 guards
    if (original.reversedById) {
      throw new Error('Entry ya reversado');
    }
    if (original.reversesId) {
      throw new Error('No se puede reversar un asiento de reversal');
    }

    // Negate monetary fields via decimal.js (F-4)
    const negatedBsF = new Decimal(original.amountBsF.toString()).neg().toFixed(8);
    const negatedOriginal = original.originalAmount
      ? new Decimal(original.originalAmount.toString()).neg().toFixed(8)
      : null;

    // Description preserves the human-readable sequentialNo when available; falls back to
    // an id slice if the schema ever evolves away from sequentialNo.
    const seqRef = original.sequentialNo ?? original.id.slice(0, 8);

    const newReversal = await tx.accountingEntry.create({
      data: {
        type: original.type,
        entryDate: original.entryDate,
        categoryId: original.categoryId,
        amountBsF: negatedBsF,
        originalAmount: negatedOriginal,
        originalCurrency: original.originalCurrency,
        exchangeRateId: original.exchangeRateId,
        description: `Reversal de #${seqRef}`,
        reversesId: original.id,
        reversalReason,
        createdById: userId,
      },
    });

    await tx.accountingEntry.update({
      where: { id: original.id },
      data: { reversedById: newReversal.id }, // one-time write to nullable column (no FIN-LEDGER-09 violation)
    });

    logger.info(
      `[accounting-entry] REVERSE original=${original.id} reversal=${newReversal.id} by=${userId}`,
    );
    return newReversal;
  });
}

/**
 * List entries with composable filters. Default excludes both halves of reversed pairs
 * (P-4) — set includeReversed=true to surface them.
 *
 * @param {object} args
 * @param {'INCOME'|'EXPENSE'|'PAYMENT'} [args.type]
 * @param {string}  [args.categoryId]
 * @param {string}  [args.settlementId]
 * @param {string}  [args.providerId]      - joins via settlement.apiSystemId
 * @param {Date}    [args.from]            - inclusive lower bound on entryDate
 * @param {Date}    [args.to]              - inclusive upper bound on entryDate
 * @param {boolean} [args.includeReversed=false]
 * @returns {Promise<object[]>}
 */
export async function listEntries({
  type,
  categoryId,
  settlementId,
  providerId,
  from,
  to,
  includeReversed = false,
} = {}) {
  const dateFilter = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;

  const where = {
    ...(type && { type }),
    ...(categoryId && { categoryId }),
    ...(settlementId && { settlementId }),
    ...(providerId && { settlement: { is: { apiSystemId: providerId } } }),
    ...(Object.keys(dateFilter).length > 0 && { entryDate: dateFilter }),
    // P-4: default hides both the original (has reversedById) and the reversal (has reversesId)
    ...(!includeReversed && { reversedById: null, reversesId: null }),
  };

  return prisma.accountingEntry.findMany({
    where,
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      category: true,
      exchangeRate: true,
      settlement: true,
      account: true, // v2
    },
  });
}

/**
 * Fetch a single entry with all relations needed by the detail page.
 * Audit history is intentionally NOT included here — controllers (Plan 13-03) embed
 * `auditHistory` by querying prisma.auditLog separately, keeping this service pure.
 *
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getEntry(id) {
  return prisma.accountingEntry.findUniqueOrThrow({
    where: { id },
    include: {
      category: true,
      exchangeRate: true,
      settlement: true,
      attachments: true,
      account: true, // v2
      reverses: true,
      reversedBy: true,
    },
  });
}

// INTENTIONAL ABSENCE — append-only ledger (D-06 reversal pattern):
//   - NO deleteEntry export
