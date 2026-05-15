/**
 * Phase 13 — ExchangeRateController (FIN-RATE-01..05, D-07).
 *
 * CRITICAL DESIGN NOTES:
 *   1. D-07 + P-4: every AuditLog write includes the FULL diagnostic triple —
 *      userId, ipAddress (req.ip), userAgent (req.get('user-agent')). The existing
 *      pattern at admin-jobs.controller.js:126-134 omits ipAddress/userAgent; this
 *      controller corrects that omission for all Phase 13 writes. `app.set('trust
 *      proxy', 1)` at index.js:24 makes req.ip reliable behind nginx (P-8 mitigated).
 *
 *   2. FIN-RATE-02 immutability: NO `update`, NO `delete` methods. Corrections =
 *      new dated row (createRate). Class surface area is the gate.
 *
 *   3. Class shape mirrors backend/src/controllers/provider.controller.js — single
 *      instance exported via `export default new ExchangeRateController()`.
 *      Route registration (Plan 13-03) uses `.bind(controller)`.
 *
 *   4. JSON response envelope (mirror provider.controller.js):
 *        2xx: { success: true, data }
 *        4xx/5xx: { success: false, error }
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import * as rateService from '../services/exchange-rate.service.js';

const VALID_RATE_TYPES = new Set(['BCV', 'PARALELO', 'OTRO']);

class ExchangeRateController {
  /**
   * POST /api/contabilidad/tasas
   * Body: { date, rateBsPerUsd, rateType, notes? }
   */
  async create(req, res) {
    try {
      const { date, rateBsPerUsd, rateType, notes } = req.body ?? {};

      // Hand-rolled payload validation (planner pre-decision O4 — no zod)
      if (!date) {
        return res.status(400).json({ success: false, error: 'date es requerido' });
      }
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, error: 'date inválido' });
      }
      if (rateBsPerUsd === undefined || rateBsPerUsd === null || rateBsPerUsd === '') {
        return res.status(400).json({ success: false, error: 'rateBsPerUsd es requerido' });
      }
      const numeric = Number(rateBsPerUsd);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return res
          .status(400)
          .json({ success: false, error: 'rateBsPerUsd debe ser un número positivo' });
      }
      if (!VALID_RATE_TYPES.has(rateType)) {
        return res
          .status(400)
          .json({ success: false, error: 'rateType debe ser uno de BCV, PARALELO, OTRO' });
      }

      const rate = await rateService.createRate(
        { date: parsedDate, rateBsPerUsd, rateType, notes: notes ?? null },
        req.user.id,
      );

      // D-07 AuditLog — full diagnostic triple (P-4: ipAddress + userAgent included)
      await prisma.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ExchangeRate',
          entityId: rate.id,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          changes: { date, rateBsPerUsd, rateType, notes: notes ?? null },
        },
      });

      res.status(201).json({ success: true, data: rate });
    } catch (err) {
      logger.error('Error en ExchangeRateController.create:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/contabilidad/tasas
   * Query: rateType?, from?, to?
   */
  async list(req, res) {
    try {
      const { rateType, from, to } = req.query ?? {};
      const rates = await rateService.listRates({
        rateType,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
      res.json({ success: true, data: rates });
    } catch (err) {
      logger.error('Error en ExchangeRateController.list:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // INTENTIONAL ABSENCE — FIN-RATE-02 enforced via surface area:
  //   - NO update method
  //   - NO delete method
}

export default new ExchangeRateController();
