/**
 * v2 contabilidad — Account service (spec 2026-05-16).
 *
 * Diseño:
 *   - openingBalance / openingDate IMMUTABLE post-create (mismo patrón FIN-LEDGER-09).
 *   - currency IMMUTABLE post-create.
 *   - getCurrentBalance: openingBalance + Σ entries.signed + Σ transfers.signed
 *     a partir de openingDate. Cálculo on-the-fly (no snapshot).
 *   - deactivate rechaza si saldo != 0.
 */

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

const IMMUTABLE = new Set(['openingBalance', 'openingDate', 'currency']);

export async function createAccount({ name, currency, openingBalance, openingDate, createdById, sortOrder }) {
  if (!name || typeof name !== 'string') throw new Error('name requerido');
  if (!['BsF', 'USD'].includes(currency)) throw new Error('currency debe ser BsF o USD');
  if (openingBalance === undefined || openingBalance === null) throw new Error('openingBalance requerido');
  if (!(openingDate instanceof Date) && typeof openingDate !== 'string') throw new Error('openingDate requerido');

  const account = await prisma.account.create({
    data: {
      name,
      currency,
      openingBalance: new Decimal(openingBalance).toFixed(8),
      openingDate: new Date(openingDate),
      createdById,
      sortOrder: sortOrder ?? 0,
    },
  });
  logger.info(`[account] CREATE id=${account.id} name=${name} currency=${currency}`);
  return account;
}

export async function listAccounts({ includeInactive = false } = {}) {
  return prisma.account.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getAccount(id) {
  return prisma.account.findUniqueOrThrow({ where: { id } });
}

export async function updateAccount(id, patch) {
  const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => !IMMUTABLE.has(k)));
  return prisma.account.update({ where: { id }, data: safe });
}

/**
 * Saldo actual = openingBalance
 *   + Σ entries con entryDate >= openingDate, signed by type (INCOME +, EXPENSE/PAYMENT -)
 *   + Σ transfers entrantes (amountTo) − Σ transfers salientes (amountFrom)
 *
 * Excluye asientos reversados (los dos lados se cancelan al sumar reversedById = null).
 */
export async function getCurrentBalance(accountId) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

  const entries = await prisma.accountingEntry.findMany({
    where: {
      accountId,
      entryDate: { gte: account.openingDate },
      reversedById: null,
      reversesId: null,
    },
    select: { type: true, amountBsF: true },
  });

  const transfersOut = await prisma.transfer.findMany({
    where: {
      fromAccountId: accountId,
      transferDate: { gte: account.openingDate },
      reversedById: null,
      reversesId: null,
    },
    select: { amountFrom: true },
  });

  const transfersIn = await prisma.transfer.findMany({
    where: {
      toAccountId: accountId,
      transferDate: { gte: account.openingDate },
      reversedById: null,
      reversesId: null,
    },
    select: { amountTo: true },
  });

  let balance = new Decimal(account.openingBalance.toString());
  for (const e of entries) {
    const sign = e.type === 'INCOME' ? 1 : -1;
    balance = balance.plus(new Decimal(e.amountBsF.toString()).times(sign));
  }
  for (const t of transfersOut) {
    balance = balance.minus(new Decimal(t.amountFrom.toString()));
  }
  for (const t of transfersIn) {
    balance = balance.plus(new Decimal(t.amountTo.toString()));
  }
  return balance.toFixed(8);
}

export async function deactivateAccount(id) {
  const balance = await getCurrentBalance(id);
  if (!new Decimal(balance).isZero()) {
    throw new Error(`No se puede desactivar la cuenta — saldo actual: ${balance}`);
  }
  return prisma.account.update({ where: { id }, data: { isActive: false } });
}

export async function reactivateAccount(id) {
  return prisma.account.update({ where: { id }, data: { isActive: true } });
}
