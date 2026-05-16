/**
 * Phase 12 — Provider Commission Engine admin controller.
 *
 * Endpoints (all mounted under /api/commissions in backend/src/index.js,
 * all gated by authenticate + authorize('ADMIN') at the router level):
 *
 *   GET    /configs/:apiSystemId           → listConfigs
 *   POST   /configs                        → createConfig            (F-5 append-only — no PUT/DELETE)
 *   GET    /ledger                         → getLedger
 *   GET    /settlements                    → getSettlements
 *   GET    /settlements/:id                → getSettlementDetail
 *   PATCH  /settlements/:id/confirm        → confirmSettlement       (D-03 backend immutability)
 *   PATCH  /settlements/:id/adjust         → adjustSettlement        (D-02 path 1 — originalAmount snapshot)
 *   GET    /settlements/:id/excel          → exportSettlementExcel
 *   GET    /settlements/:id/pdf            → exportSettlementPdf
 *
 * Design invariants:
 *   - F-5: append-only. NO mutation method on /configs. POST /configs only — create new rows.
 *   - D-02 path 1: adjustSettlement snapshots existing amount into originalAmount BEFORE update.
 *   - D-03: confirmSettlement rejects with 400 unless current status === 'DRAFT'.
 *           adjustSettlement rejects with 400 unless current status ∈ { CONFIRMED, ADJUSTED }.
 *   - A4: AuditLog rows on both transitions. Writes BLOCK synchronously — no .catch swallow —
 *         because financial trust requires the audit row to exist by the time the response is sent.
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import * as commissionService from '../services/commission.service.js';

const VALID_FORMULA_TYPES = ['SALES_PCT', 'UTILITY_PCT', 'SALES_AND_UTILITY_PCT', 'TIERED'];

/** Coerce body input to a finite number ∈ [0, 100] or return null. */
function asRate(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** Coerce body input to a finite non-negative number string for Decimal columns. */
function asDecimalString(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(value);
}

class CommissionController {
  // ──────────────────────────────────────────────────────────────────────
  // GET /api/commissions/configs/:apiSystemId
  // ──────────────────────────────────────────────────────────────────────
  async listConfigs(req, res) {
    try {
      const { apiSystemId } = req.params;
      const configs = await prisma.providerCommissionConfig.findMany({
        where: { apiSystemId },
        include: {
          tiers: { orderBy: { minSales: 'asc' } },
          game: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ gameId: 'asc' }, { effectiveFrom: 'desc' }],
      });
      res.json({ success: true, data: configs });
    } catch (err) {
      logger.error('Error en listConfigs:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST /api/commissions/configs   (F-5 append-only)
  // Body: { apiSystemId, formulaType, salesRate?, utilityRate?, effectiveFrom, notes?, tiers? }
  // ──────────────────────────────────────────────────────────────────────
  async createConfig(req, res) {
    try {
      const { apiSystemId, gameId, formulaType, salesRate, utilityRate, effectiveFrom, notes, tiers } = req.body || {};

      if (!apiSystemId || typeof apiSystemId !== 'string') {
        return res.status(400).json({ success: false, error: 'apiSystemId is required' });
      }
      if (!effectiveFrom) {
        return res.status(400).json({ success: false, error: 'effectiveFrom is required' });
      }
      // gameId is optional. If provided, validate format AND verify the game exists.
      if (gameId !== undefined && gameId !== null && gameId !== '') {
        if (typeof gameId !== 'string') {
          return res.status(400).json({ success: false, error: 'gameId must be a string UUID' });
        }
        const exists = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
        if (!exists) {
          return res.status(400).json({ success: false, error: 'gameId no corresponde a un juego existente' });
        }
      }
      if (!VALID_FORMULA_TYPES.includes(formulaType)) {
        return res.status(400).json({
          success: false,
          error: `formulaType must be one of: ${VALID_FORMULA_TYPES.join(', ')}`,
        });
      }

      // Per-formula required fields (M-1 in 12-03 must_haves)
      if (formulaType === 'SALES_PCT') {
        const rate = asRate(salesRate);
        if (rate === null) {
          return res.status(400).json({ success: false, error: 'salesRate required for SALES_PCT (number in [0, 100])' });
        }
      }
      if (formulaType === 'UTILITY_PCT') {
        const rate = asRate(utilityRate);
        if (rate === null) {
          return res.status(400).json({ success: false, error: 'utilityRate required for UTILITY_PCT (number in [0, 100])' });
        }
      }
      if (formulaType === 'SALES_AND_UTILITY_PCT') {
        const sr = asRate(salesRate);
        const ur = asRate(utilityRate);
        if (sr === null || ur === null) {
          return res.status(400).json({
            success: false,
            error: 'Both salesRate and utilityRate required for SALES_AND_UTILITY_PCT (numbers in [0, 100])',
          });
        }
      }
      if (formulaType === 'TIERED') {
        if (!Array.isArray(tiers) || tiers.length === 0) {
          return res.status(400).json({ success: false, error: 'tiers array required for TIERED (non-empty)' });
        }
        for (const t of tiers) {
          if (!t || typeof t !== 'object') {
            return res.status(400).json({ success: false, error: 'each tier must be an object' });
          }
          const minS = Number(t.minSales);
          if (!Number.isFinite(minS) || minS < 0) {
            return res.status(400).json({ success: false, error: 'tier.minSales must be a number ≥ 0' });
          }
          if (t.maxSales !== null && t.maxSales !== undefined) {
            const maxS = Number(t.maxSales);
            if (!Number.isFinite(maxS) || maxS <= minS) {
              return res.status(400).json({ success: false, error: 'tier.maxSales must be null or a number > minSales' });
            }
          }
          const rate = asRate(t.rate);
          if (rate === null) {
            return res.status(400).json({ success: false, error: 'tier.rate must be a number in [0, 100]' });
          }
        }
      }

      // Build data — only include numeric rates if provided
      const data = {
        apiSystemId,
        gameId: gameId && gameId !== '' ? gameId : null,
        formulaType,
        effectiveFrom: new Date(effectiveFrom),
        notes: notes ?? null,
        createdById: req.user?.id ?? null,
      };
      if (salesRate !== undefined && salesRate !== null) data.salesRate = String(salesRate);
      if (utilityRate !== undefined && utilityRate !== null) data.utilityRate = String(utilityRate);
      if (formulaType === 'TIERED' && Array.isArray(tiers)) {
        data.tiers = {
          create: tiers.map((t) => ({
            minSales: String(t.minSales),
            maxSales: t.maxSales === null || t.maxSales === undefined ? null : String(t.maxSales),
            rate: String(t.rate),
          })),
        };
      }

      const created = await prisma.providerCommissionConfig.create({
        data,
        include: {
          tiers: { orderBy: { minSales: 'asc' } },
          game: { select: { id: true, name: true, slug: true } },
        },
      });

      logger.info(`[commission] config created apiSystemId=${apiSystemId} gameId=${data.gameId ?? 'ALL'} formulaType=${formulaType} id=${created.id}`);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      logger.error('Error en createConfig:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/commissions/ledger?apiSystemId=&from=&to=
  // ──────────────────────────────────────────────────────────────────────
  async getLedger(req, res) {
    try {
      const { apiSystemId, from, to } = req.query || {};
      const where = {};
      if (apiSystemId) where.apiSystemId = apiSystemId;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }
      const rows = await prisma.providerCommissionLedger.findMany({
        where,
        include: {
          apiSystem: { select: { id: true, name: true, slug: true } },
          draw: { select: { id: true, drawDate: true, drawTime: true, drawnAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('Error en getLedger:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/commissions/settlements?isoYear=&isoWeek=&apiSystemId=&status=
  // ──────────────────────────────────────────────────────────────────────
  async getSettlements(req, res) {
    try {
      const { isoYear, isoWeek, apiSystemId, status } = req.query || {};
      const where = {};
      if (isoYear) where.isoYear = Number(isoYear);
      if (isoWeek) where.isoWeek = Number(isoWeek);
      if (apiSystemId) where.apiSystemId = apiSystemId;
      if (status) where.status = status;
      const rows = await prisma.providerWeeklySettlement.findMany({
        where,
        include: { apiSystem: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }],
        take: 200,
      });
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('Error en getSettlements:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/commissions/settlements/:id
  // ──────────────────────────────────────────────────────────────────────
  async getSettlementDetail(req, res) {
    try {
      const { id } = req.params;
      try {
        const result = await commissionService.getSettlementWithLedger(id);
        res.json({ success: true, data: result });
      } catch (innerErr) {
        // Service throws on not-found — surface as 404 to keep route semantics consistent.
        if (/no encontrado/i.test(innerErr.message)) {
          return res.status(404).json({ success: false, error: 'Settlement not found' });
        }
        throw innerErr;
      }
    } catch (err) {
      logger.error('Error en getSettlementDetail:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PATCH /api/commissions/settlements/:id/confirm
  // D-03: only DRAFT → CONFIRMED. Backend rejects any other transition with 400.
  // ──────────────────────────────────────────────────────────────────────
  async confirmSettlement(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.providerWeeklySettlement.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Settlement not found' });
      }
      if (existing.status !== 'DRAFT') {
        return res.status(400).json({ success: false, error: 'Settlement is not in DRAFT status' });
      }
      const updated = await prisma.providerWeeklySettlement.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedById: req.user?.id ?? null,
        },
      });
      // A4 — AuditLog write BLOCKS (no .catch swallow). Financial trust per D-03.
      await prisma.auditLog.create({
        data: {
          action: 'SETTLEMENT_CONFIRMED',
          entity: 'ProviderWeeklySettlement',
          entityId: id,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          changes: {
            previousStatus: 'DRAFT',
            newStatus: 'CONFIRMED',
            amount: existing.amount?.toString() ?? null,
          },
        },
      });
      logger.info(`[commission] settlement confirmed id=${id} by=${req.user?.id ?? 'unknown'}`);
      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error('Error en confirmSettlement:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PATCH /api/commissions/settlements/:id/adjust
  // Body: { amount, adjustmentReason }
  // D-02 path 1: snapshot existing.amount into originalAmount BEFORE update.
  // ──────────────────────────────────────────────────────────────────────
  async adjustSettlement(req, res) {
    try {
      const { id } = req.params;
      const { amount, adjustmentReason } = req.body || {};

      const amountStr = asDecimalString(amount);
      if (amountStr === null) {
        return res.status(400).json({ success: false, error: 'amount required (non-negative number)' });
      }
      if (!adjustmentReason || typeof adjustmentReason !== 'string' || adjustmentReason.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'adjustmentReason required (non-empty string)' });
      }

      const existing = await prisma.providerWeeklySettlement.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Settlement not found' });
      }
      if (existing.status !== 'CONFIRMED' && existing.status !== 'ADJUSTED') {
        return res.status(400).json({
          success: false,
          error: 'Adjustment requires CONFIRMED or ADJUSTED status',
        });
      }

      const previousAmount = existing.amount?.toString() ?? null;

      const updated = await prisma.providerWeeklySettlement.update({
        where: { id },
        data: {
          amount: amountStr,
          originalAmount: existing.amount,
          adjustmentReason: adjustmentReason.trim(),
          status: 'ADJUSTED',
        },
      });

      // A4 — AuditLog write BLOCKS (no .catch swallow).
      await prisma.auditLog.create({
        data: {
          action: 'SETTLEMENT_ADJUSTED',
          entity: 'ProviderWeeklySettlement',
          entityId: id,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          changes: {
            previousStatus: existing.status,
            newStatus: 'ADJUSTED',
            previousAmount,
            newAmount: amountStr,
            reason: adjustmentReason.trim(),
          },
        },
      });
      logger.info(`[commission] settlement adjusted id=${id} by=${req.user?.id ?? 'unknown'} amount=${amountStr}`);
      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error('Error en adjustSettlement:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/commissions/settlements/:id/excel
  // ──────────────────────────────────────────────────────────────────────
  async exportSettlementExcel(req, res) {
    try {
      const { id } = req.params;
      const buffer = await commissionService.buildSettlementExcel(id);
      // For filename tag we re-fetch settlement; cheap and avoids exposing UUID-only file names.
      let tag = id;
      try {
        const { settlement } = await commissionService.getSettlementWithLedger(id);
        tag = `${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}-${settlement.apiSystem.slug}`;
      } catch (_) { /* fall back to id-only filename */ }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${tag}.xlsx"`);
      res.send(buffer);
    } catch (err) {
      logger.error('Error en exportSettlementExcel:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET /api/commissions/settlements/:id/pdf
  // PDFKit streaming — mirrors monitor.controller.js:130-220 drawTable helper.
  // ──────────────────────────────────────────────────────────────────────
  async exportSettlementPdf(req, res) {
    try {
      const { id } = req.params;
      const { settlement, ledgerRows, totals } = await commissionService.getSettlementPdfData(id);
      const tag = `${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`;
      const fileTag = `${tag}-${settlement.apiSystem.slug}`;

      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 70, left: 50, right: 50 },
        bufferPages: true,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${fileTag}.pdf"`);
      doc.pipe(res);

      const fmt = (n) =>
        new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(Number(n) || 0);

      // drawTable helper — lifted inline from monitor.controller.js:141-157
      function drawTable(doc, headers, colWidths, rows, startX = 50) {
        if (doc.y > 680) { doc.addPage(); }
        let x = startX, y = doc.y;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => { doc.text(h, x, y, { width: colWidths[i], align: 'left' }); x += colWidths[i]; });
        y += 14;
        doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
        y += 4;
        doc.fontSize(8).font('Helvetica');
        for (const row of rows) {
          if (y > 720) { doc.addPage(); y = 50; }
          x = startX;
          row.forEach((cell, i) => { doc.text(String(cell), x, y, { width: colWidths[i], align: 'left' }); x += colWidths[i]; });
          y += 12;
        }
        doc.y = y + 10;
      }

      // Title block
      doc.fontSize(18).font('Helvetica-Bold').text('LIQUIDACIÓN DE COMISIÓN', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).font('Helvetica').text(`${settlement.apiSystem.name} — ${tag}`, { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(8).fillColor('#888').text(`Generado: ${new Date().toLocaleString('es-VE')}`, { align: 'center' });
      doc.fillColor('black').moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Totals block
      doc.fontSize(12).font('Helvetica-Bold').text('RESUMEN');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      const col1 = 60, col2 = 280;
      let y = doc.y;
      doc.text('Ventas Totales:', col1, y);   doc.text(fmt(totals.sales), col2, y);    y += 16;
      doc.text('Premios Pagados:', col1, y);  doc.text(fmt(totals.prizes), col2, y);   y += 16;
      doc.text('Comisión Total:', col1, y);   doc.text(fmt(totals.commission), col2, y); y += 16;
      doc.text('Sorteos:', col1, y);          doc.text(String(ledgerRows.length), col2, y);
      doc.y = y + 20;
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Per-draw table
      doc.fontSize(12).font('Helvetica-Bold').text('DETALLE POR SORTEO'); doc.moveDown(0.3);
      drawTable(doc,
        ['Sorteo', 'Fecha', 'Ventas', 'Premios', 'Comisión'],
        [80, 140, 90, 90, 90],
        ledgerRows.map((r) => {
          const sales = Number(r.salesBase?.toString() ?? 0);
          const utility = Number(r.utilityBase?.toString() ?? 0);
          const prizes = (sales - utility).toFixed(2);
          return [
            r.drawId.slice(0, 8),
            r.draw?.drawnAt ? new Date(r.draw.drawnAt).toLocaleString('es-VE') : '—',
            fmt(sales),
            fmt(Number(prizes)),
            fmt(Number(r.amount?.toString() ?? 0)),
          ];
        }),
      );

      doc.end();
    } catch (err) {
      logger.error('Error en exportSettlementPdf:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }
}

export default new CommissionController();
