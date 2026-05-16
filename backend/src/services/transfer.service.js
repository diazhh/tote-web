/**
 * v2 contabilidad — Transfer service (spec 2026-05-16).
 *
 * Diseño:
 *   - Misma cuenta from/to → rechazo.
 *   - Si fromAccount.currency === toAccount.currency → amountTo = amountFrom, sin tasa.
 *   - Si difieren → exchangeRateId requerido. Conversión BsF→USD usa 1/rate; USD→BsF usa rate.
 *   - Reversal: mismo patrón que accounting-entry — $transaction interactivo,
 *     crea Transfer inverso (from↔to swap, mismos montos) y flippea reversedById.
 */

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getEffectiveRateForDate } from './exchange-rate.service.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export class NoRateForTransferError extends Error {
  constructor(date) {
    const d = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
    super(`No hay tasa de cambio para ${d} — ingresa una tasa primero.`);
    this.name = 'NoRateForTransferError';
  }
}

export async function createTransfer({
  transferDate,
  fromAccountId,
  toAccountId,
  amountFrom,
  description,
  createdById,
}) {
  if (!fromAccountId || !toAccountId) throw new Error('fromAccountId y toAccountId requeridos');
  if (fromAccountId === toAccountId) throw new Error('No se puede transferir a la misma cuenta');
  if (!description || description.trim() === '') throw new Error('description es requerido');

  const [fromAcct, toAcct] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: fromAccountId } }),
    prisma.account.findUniqueOrThrow({ where: { id: toAccountId } }),
  ]);
  if (!fromAcct.isActive || !toAcct.isActive) throw new Error('Cuenta inactiva');

  const amountFromDec = new Decimal(amountFrom);
  if (amountFromDec.lte(0)) throw new Error('amountFrom debe ser positivo');

  let amountTo;
  let exchangeRateId = null;

  if (fromAcct.currency === toAcct.currency) {
    amountTo = amountFromDec.toFixed(8);
  } else {
    const rate = await getEffectiveRateForDate(transferDate);
    if (!rate) throw new NoRateForTransferError(transferDate);
    exchangeRateId = rate.id;
    const rateDec = new Decimal(rate.rateBsPerUsd.toString());
    if (fromAcct.currency === 'USD' && toAcct.currency === 'BsF') {
      amountTo = amountFromDec.times(rateDec).toFixed(8);
    } else {
      // BsF → USD
      amountTo = amountFromDec.div(rateDec).toFixed(8);
    }
  }

  const transfer = await prisma.transfer.create({
    data: {
      transferDate,
      fromAccountId,
      toAccountId,
      amountFrom: amountFromDec.toFixed(8),
      amountTo,
      exchangeRateId,
      description,
      createdById,
    },
    include: { fromAccount: true, toAccount: true, exchangeRate: true },
  });
  logger.info(`[transfer] CREATE id=${transfer.id} ${fromAcct.name}→${toAcct.name} ${amountFromDec.toFixed(2)}`);
  return transfer;
}

export async function listTransfers({ from, to, accountId, includeReversed = false } = {}) {
  const dateFilter = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;

  const where = {
    ...(Object.keys(dateFilter).length > 0 && { transferDate: dateFilter }),
    ...(accountId && { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] }),
    ...(!includeReversed && { reversedById: null, reversesId: null }),
  };

  return prisma.transfer.findMany({
    where,
    orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
    include: { fromAccount: true, toAccount: true, exchangeRate: true, attachments: true },
  });
}

export async function getTransfer(id) {
  return prisma.transfer.findUniqueOrThrow({
    where: { id },
    include: {
      fromAccount: true,
      toAccount: true,
      exchangeRate: true,
      attachments: true,
      reverses: true,
      reversedBy: true,
    },
  });
}

export async function reverseTransfer(originalId, reversalReason, userId) {
  if (!reversalReason || reversalReason.trim() === '') throw new Error('reversalReason requerido');

  return prisma.$transaction(async (tx) => {
    const original = await tx.transfer.findUniqueOrThrow({ where: { id: originalId } });
    if (original.reversedById) throw new Error('Transfer ya reversado');
    if (original.reversesId) throw new Error('No se puede reversar un reversal');

    const newReversal = await tx.transfer.create({
      data: {
        transferDate: original.transferDate,
        fromAccountId: original.toAccountId,    // swap
        toAccountId: original.fromAccountId,    // swap
        amountFrom: original.amountTo,          // swap montos (cada uno en su moneda original)
        amountTo: original.amountFrom,
        exchangeRateId: original.exchangeRateId,
        description: `Reversal de #${original.sequentialNo ?? original.id.slice(0, 8)}`,
        reversesId: original.id,
        reversalReason,
        createdById: userId,
      },
    });

    await tx.transfer.update({
      where: { id: original.id },
      data: { reversedById: newReversal.id },
    });

    logger.info(`[transfer] REVERSE original=${original.id} reversal=${newReversal.id}`);
    return newReversal;
  });
}
