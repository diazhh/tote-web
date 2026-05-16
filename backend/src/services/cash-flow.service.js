/**
 * v2 contabilidad — cash-flow report engine (spec 2026-05-16).
 *
 * Cálculo dinámico (sin snapshots). Devuelve por moneda:
 *   openingBalance (al inicio del período)
 *   entradas (INCOME en el período)
 *   salidas (EXPENSE + PAYMENT en el período)
 *   neto = entradas − salidas
 *   closingBalance = openingBalance + neto
 *
 * Transferencias:
 *   - Consolidado (sin accountId): NO afectan neto (suma cero entre cuentas).
 *   - Por accountId: afectan saldos (entrante: +amountTo, saliente: −amountFrom).
 *
 * Breakdown por categoría: lista de { categoryId, name, total } para INCOME y EXPENSE/PAYMENT.
 *
 * Reversados: excluidos por defecto (reversedById=null AND reversesId=null).
 */

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

function emptyBucket() {
  return new Decimal(0);
}

function bucketFor(map, currency) {
  if (!map[currency]) {
    map[currency] = {
      openingBalance: emptyBucket(),
      entradas: emptyBucket(),
      salidas: emptyBucket(),
      transfersIn: emptyBucket(),
      transfersOut: emptyBucket(),
      categoriesIn: {},   // { categoryId: { name, total: Decimal } }
      categoriesOut: {},
    };
  }
  return map[currency];
}

function finalize(bucket) {
  const entradas = bucket.entradas;
  const salidas = bucket.salidas;
  const transfersIn = bucket.transfersIn;
  const transfersOut = bucket.transfersOut;
  const neto = entradas.minus(salidas);
  const closing = bucket.openingBalance
    .plus(neto)
    .plus(transfersIn)
    .minus(transfersOut);

  const cleanCats = (cats) =>
    Object.entries(cats).map(([categoryId, { name, total }]) => ({
      categoryId,
      name,
      total: total.toFixed(8),
    }));

  return {
    openingBalance: bucket.openingBalance.toFixed(8),
    entradas: entradas.toFixed(8),
    salidas: salidas.toFixed(8),
    transfersIn: transfersIn.toFixed(8),
    transfersOut: transfersOut.toFixed(8),
    neto: neto.toFixed(8),
    closingBalance: closing.toFixed(8),
    categoriesIn: cleanCats(bucket.categoriesIn),
    categoriesOut: cleanCats(bucket.categoriesOut),
  };
}

export async function getReport({ from, to, accountId } = {}) {
  if (!(from instanceof Date) || !(to instanceof Date)) throw new Error('from y to requeridos como Date');

  const accountFilter = accountId ? { id: accountId } : { isActive: true };
  const accounts = await prisma.account.findMany({ where: accountFilter });

  const byCurrency = {};

  // 1. Opening balances (de cada cuenta seleccionada)
  for (const acct of accounts) {
    const b = bucketFor(byCurrency, acct.currency);
    b.openingBalance = b.openingBalance.plus(new Decimal(acct.openingBalance.toString()));

    // Movimientos previos al período (efectivamente parte del opening del período)
    const priorEntries = await prisma.accountingEntry.findMany({
      where: {
        accountId: acct.id,
        entryDate: { gte: acct.openingDate, lt: from },
        reversedById: null,
        reversesId: null,
      },
      select: { type: true, amountBsF: true, originalAmount: true, exchangeRate: true },
    });
    for (const e of priorEntries) {
      const amt = pickAmount(e, acct.currency);
      const sign = e.type === 'INCOME' ? 1 : -1;
      b.openingBalance = b.openingBalance.plus(amt.times(sign));
    }

    const priorTransfersOut = await prisma.transfer.findMany({
      where: {
        fromAccountId: acct.id,
        transferDate: { lt: from },
        reversedById: null,
        reversesId: null,
      },
      select: { amountFrom: true },
    });
    const priorTransfersIn = await prisma.transfer.findMany({
      where: {
        toAccountId: acct.id,
        transferDate: { lt: from },
        reversedById: null,
        reversesId: null,
      },
      select: { amountTo: true },
    });
    for (const t of priorTransfersOut) {
      b.openingBalance = b.openingBalance.minus(new Decimal(t.amountFrom.toString()));
    }
    for (const t of priorTransfersIn) {
      b.openingBalance = b.openingBalance.plus(new Decimal(t.amountTo.toString()));
    }
  }

  // 2. Movimientos del período
  const periodAccountIds = accounts.map((a) => a.id);
  const periodEntries = await prisma.accountingEntry.findMany({
    where: {
      accountId: { in: periodAccountIds },
      entryDate: { gte: from, lte: to },
      reversedById: null,
      reversesId: null,
    },
    include: { account: true, category: true, exchangeRate: true },
  });

  for (const e of periodEntries) {
    const b = bucketFor(byCurrency, e.account.currency);
    const amt = pickAmount(e, e.account.currency);
    const sign = e.type === 'INCOME' ? 'in' : 'out';

    if (sign === 'in') {
      b.entradas = b.entradas.plus(amt);
      addToCategory(b.categoriesIn, e.category, amt);
    } else {
      b.salidas = b.salidas.plus(amt);
      addToCategory(b.categoriesOut, e.category, amt);
    }
  }

  // 3. Transferencias del período (sólo si accountId — consolidado las ignora para neto)
  const periodTransfers = await prisma.transfer.findMany({
    where: {
      transferDate: { gte: from, lte: to },
      OR: accountId
        ? [{ fromAccountId: accountId }, { toAccountId: accountId }]
        : undefined,
      reversedById: null,
      reversesId: null,
    },
    include: { fromAccount: true, toAccount: true },
  });

  if (accountId) {
    for (const t of periodTransfers) {
      if (t.fromAccountId === accountId) {
        const b = bucketFor(byCurrency, t.fromAccount.currency);
        b.transfersOut = b.transfersOut.plus(new Decimal(t.amountFrom.toString()));
      }
      if (t.toAccountId === accountId) {
        const b = bucketFor(byCurrency, t.toAccount.currency);
        b.transfersIn = b.transfersIn.plus(new Decimal(t.amountTo.toString()));
      }
    }
  }

  // 4. Finalize
  const result = {};
  for (const [currency, bucket] of Object.entries(byCurrency)) {
    result[currency] = finalize(bucket);
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    accountId: accountId ?? null,
    byCurrency: result,
    transfers: periodTransfers.map((t) => ({
      id: t.id,
      transferDate: t.transferDate,
      fromAccount: { id: t.fromAccount.id, name: t.fromAccount.name, currency: t.fromAccount.currency },
      toAccount: { id: t.toAccount.id, name: t.toAccount.name, currency: t.toAccount.currency },
      amountFrom: t.amountFrom.toString(),
      amountTo: t.amountTo.toString(),
      description: t.description,
    })),
  };
}

// F-7: amountBsF está en BsF nativo; si la cuenta es USD, usamos originalAmount (que es lo
// registrado en USD nativo). Si la cuenta es BsF, devolvemos amountBsF.
function pickAmount(entry, accountCurrency) {
  if (accountCurrency === 'USD') {
    // entry.originalAmount está en USD nativo (registrado por el operador)
    const v = entry.originalAmount;
    return v ? new Decimal(v.toString()) : new Decimal(0);
  }
  return new Decimal(entry.amountBsF.toString());
}

function addToCategory(map, category, amount) {
  const key = category.id;
  if (!map[key]) map[key] = { name: category.name, total: new Decimal(0) };
  map[key].total = map[key].total.plus(amount);
}

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export async function buildExcel(report) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flujo de caja');

  ws.addRow(['Período', `${report.from} → ${report.to}`]);
  ws.addRow(['Cuenta', report.accountId ?? 'Consolidado']);
  ws.addRow([]);

  for (const [currency, b] of Object.entries(report.byCurrency)) {
    ws.addRow([`Moneda: ${currency}`]).font = { bold: true };
    ws.addRow(['Saldo inicial', b.openingBalance]);
    ws.addRow(['Entradas', b.entradas]);
    ws.addRow(['Salidas', b.salidas]);
    if (Number(b.transfersIn) || Number(b.transfersOut)) {
      ws.addRow(['Transferencias entrantes', b.transfersIn]);
      ws.addRow(['Transferencias salientes', b.transfersOut]);
    }
    ws.addRow(['Neto', b.neto]);
    ws.addRow(['Saldo final', b.closingBalance]);
    ws.addRow([]);

    if (b.categoriesIn.length > 0) {
      ws.addRow(['Categorías — Entradas']).font = { bold: true };
      for (const c of b.categoriesIn) ws.addRow([c.name, c.total]);
      ws.addRow([]);
    }
    if (b.categoriesOut.length > 0) {
      ws.addRow(['Categorías — Salidas']).font = { bold: true };
      for (const c of b.categoriesOut) ws.addRow([c.name, c.total]);
      ws.addRow([]);
    }
  }

  return await wb.xlsx.writeBuffer();
}

export async function buildPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Reporte de flujo de caja', { align: 'center' });
    doc.fontSize(10).text(`Período: ${report.from} → ${report.to}`, { align: 'center' });
    doc.moveDown();

    for (const [currency, b] of Object.entries(report.byCurrency)) {
      doc.fontSize(12).text(`Moneda: ${currency}`, { underline: true });
      doc.fontSize(10);
      doc.text(`Saldo inicial: ${b.openingBalance}`);
      doc.text(`Entradas: ${b.entradas}`);
      doc.text(`Salidas: ${b.salidas}`);
      if (Number(b.transfersIn) || Number(b.transfersOut)) {
        doc.text(`Transferencias entrantes: ${b.transfersIn}`);
        doc.text(`Transferencias salientes: ${b.transfersOut}`);
      }
      doc.text(`Neto: ${b.neto}`);
      doc.text(`Saldo final: ${b.closingBalance}`);
      doc.moveDown();

      if (b.categoriesIn.length > 0) {
        doc.text('Categorías — Entradas:');
        for (const c of b.categoriesIn) doc.text(`  ${c.name}: ${c.total}`);
        doc.moveDown();
      }
      if (b.categoriesOut.length > 0) {
        doc.text('Categorías — Salidas:');
        for (const c of b.categoriesOut) doc.text(`  ${c.name}: ${c.total}`);
        doc.moveDown();
      }
    }

    doc.end();
  });
}
