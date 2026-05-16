/**
 * Phase 13 — AccountingEntryController (FIN-LEDGER-01..09, D-03, D-06, D-07).
 *
 * CRITICAL DESIGN NOTES:
 *   1. D-07 + P-4: every AuditLog write includes the FULL diagnostic triple —
 *      userId, ipAddress, userAgent. Corrects the admin-jobs.controller.js omission.
 *
 *   2. F-6 explicit: create() catches NoRateForDateError and returns HTTP 400 with
 *      the error message — the frontend can then prompt the user to record a rate.
 *
 *   3. FIN-LEDGER-09 defense-in-depth: update() pre-strips body keys other than
 *      description/categoryId/settlementId BEFORE calling the service. The service
 *      ALSO strips IMMUTABLE keys (authoritative gate), but the controller's strip
 *      surfaces clearer 400s and makes the API contract obvious.
 *
 *   4. getOne() embeds auditHistory in the response payload — controller queries
 *      prisma.auditLog directly (service layer stays pure of req-handling).
 *
 *   5. No hard-delete method — D-06 reversal pattern is the correction mechanism.
 *
 *   6. Hand-rolled payload validation (planner pre-decision O4 — no zod).
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import * as entryService from '../services/accounting-entry.service.js';
import { NoRateForDateError } from '../services/accounting-entry.service.js';

const VALID_TYPES = new Set(['INCOME', 'EXPENSE', 'PAYMENT']);
const VALID_CURRENCIES = new Set(['BsF', 'USD']);
// FIN-LEDGER-09: only these body keys survive controller-side strip on update
const EDITABLE_PATCH_KEYS = new Set(['description', 'categoryId', 'settlementId']);

class AccountingEntryController {
  /**
   * POST /api/contabilidad/asientos
   * Body: { type, entryDate, categoryId, description, currency, amount, settlementId? }
   * Server-computed (rejected if in body): amountBsF, originalAmount, exchangeRateId
   */
  async create(req, res) {
    try {
      const body = req.body ?? {};

      // FIN-LEDGER-09: reject computed fields if client tried to set them
      for (const forbidden of ['amountBsF', 'originalAmount', 'exchangeRateId']) {
        if (forbidden in body) {
          return res.status(400).json({
            success: false,
            error: `${forbidden} es computed server-side, no debe enviarse en el body`,
          });
        }
      }

      const { type, entryDate, categoryId, description, currency, amount, settlementId } = body;

      // Hand-rolled validation
      if (!VALID_TYPES.has(type)) {
        return res
          .status(400)
          .json({ success: false, error: 'type debe ser uno de INCOME, EXPENSE, PAYMENT' });
      }
      if (!entryDate) {
        return res.status(400).json({ success: false, error: 'entryDate es requerido' });
      }
      const parsedDate = new Date(entryDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, error: 'entryDate inválido' });
      }
      if (!categoryId || typeof categoryId !== 'string') {
        return res.status(400).json({ success: false, error: 'categoryId es requerido' });
      }
      if (!description || typeof description !== 'string' || description.trim() === '') {
        return res.status(400).json({ success: false, error: 'description es requerido' });
      }
      if (!VALID_CURRENCIES.has(currency)) {
        return res
          .status(400)
          .json({ success: false, error: 'currency debe ser uno de BsF, USD' });
      }
      if (amount === undefined || amount === null || amount === '') {
        return res.status(400).json({ success: false, error: 'amount es requerido' });
      }
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res
          .status(400)
          .json({ success: false, error: 'amount debe ser un número positivo' });
      }

      const { accountId } = body;
      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({ success: false, error: 'accountId es requerido' });
      }

      let entry;
      try {
        entry = await entryService.createEntry({
          type,
          entryDate: parsedDate,
          categoryId,
          description: description.trim(),
          currency,
          amount,
          settlementId: settlementId ?? undefined,
          accountId,
          createdById: req.user.id,
        });
      } catch (err) {
        if (err instanceof NoRateForDateError) {
          // F-6: explicit 400 with the actionable message
          return res.status(400).json({ success: false, error: err.message });
        }
        throw err;
      }

      await this._writeAudit('CREATE', entry.id, req, {
        type,
        entryDate,
        categoryId,
        description: description.trim(),
        currency,
        amount,
        settlementId: settlementId ?? null,
      });

      res.status(201).json({ success: true, data: entry });
    } catch (err) {
      logger.error('Error en AccountingEntryController.create:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/contabilidad/asientos
   * Query: type?, categoryId?, settlementId?, providerId?, from?, to?, includeReversed?
   */
  async list(req, res) {
    try {
      const { type, categoryId, settlementId, providerId, from, to, includeReversed } =
        req.query ?? {};
      const entries = await entryService.listEntries({
        type,
        categoryId,
        settlementId,
        providerId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        includeReversed: includeReversed === 'true',
      });
      res.json({ success: true, data: entries });
    } catch (err) {
      logger.error('Error en AccountingEntryController.list:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/contabilidad/asientos/:id
   * Returns entry + embedded auditHistory.
   */
  async getOne(req, res) {
    try {
      const { id } = req.params;
      const entry = await entryService.getEntry(id);
      const auditHistory = await prisma.auditLog.findMany({
        where: { entity: 'AccountingEntry', entityId: id },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ success: true, data: { ...entry, auditHistory } });
    } catch (err) {
      if (err?.code === 'P2025') {
        return res.status(404).json({ success: false, error: 'Asiento no encontrado' });
      }
      logger.error('Error en AccountingEntryController.getOne:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * PATCH /api/contabilidad/asientos/:id
   * Body: { description?, categoryId?, settlementId? } — IMMUTABLE keys are pre-stripped here
   * for clearer 400s (service ALSO strips defense-in-depth).
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const body = req.body ?? {};

      if ('accountId' in body) {
        return res.status(400).json({ success: false, error: 'accountId es inmutable post-creación' });
      }

      // FIN-LEDGER-09 controller-side pre-strip
      const safe = Object.fromEntries(
        Object.entries(body).filter(([k]) => EDITABLE_PATCH_KEYS.has(k)),
      );

      if (Object.keys(safe).length === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'No hay campos editables en el body' });
      }

      const before = await prisma.accountingEntry.findUnique({ where: { id } });
      if (!before) {
        return res.status(404).json({ success: false, error: 'Asiento no encontrado' });
      }

      const after = await entryService.updateEntry(id, safe);

      // Diff capped to EDITABLE fields per FIN-LEDGER-09
      await this._writeAudit('UPDATE', id, req, {
        before: {
          description: before.description,
          categoryId: before.categoryId,
          settlementId: before.settlementId,
        },
        after: {
          description: after.description,
          categoryId: after.categoryId,
          settlementId: after.settlementId,
        },
      });

      res.json({ success: true, data: after });
    } catch (err) {
      logger.error('Error en AccountingEntryController.update:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/contabilidad/asientos/:id/reverse
   * Body: { reversalReason }
   */
  async reverse(req, res) {
    try {
      const { id } = req.params;
      const { reversalReason } = req.body ?? {};
      if (!reversalReason || typeof reversalReason !== 'string' || reversalReason.trim() === '') {
        return res.status(400).json({ success: false, error: 'reversalReason es requerido' });
      }

      const reversal = await entryService.reverseEntry(id, reversalReason.trim(), req.user.id);

      await this._writeAudit('REVERSE', id, req, {
        reversedById: reversal.id,
        reversalReason: reversalReason.trim(),
      });

      res.status(201).json({ success: true, data: reversal });
    } catch (err) {
      logger.error('Error en AccountingEntryController.reverse:', err);
      // Reversal guard messages bubble up as 400-class business errors
      if (
        err?.message === 'Entry ya reversado' ||
        err?.message === 'No se puede reversar un asiento de reversal'
      ) {
        return res.status(400).json({ success: false, error: err.message });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ---- private helpers ----

  /**
   * D-07 + P-4: every AuditLog write includes ipAddress + userAgent.
   */
  async _writeAudit(action, entityId, req, changes) {
    await prisma.auditLog.create({
      data: {
        action,
        entity: 'AccountingEntry',
        entityId,
        userId: req.user?.id ?? null,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        changes,
      },
    });
  }

  // INTENTIONAL ABSENCE — append-only ledger (D-06 reversal pattern):
  //   - NO delete method
}

export default new AccountingEntryController();
