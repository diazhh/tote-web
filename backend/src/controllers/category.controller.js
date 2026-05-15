/**
 * Phase 13 — CategoryController (FIN-LEDGER-06, D-02, D-07).
 *
 * CRITICAL DESIGN NOTES:
 *   1. D-07 + P-4: AuditLog writes always include userId + ipAddress + userAgent.
 *
 *   2. FIN-LEDGER-06: NO hard-delete method. Deactivation flips `isActive=false`.
 *
 *   3. Prisma P2002 on (appliesTo, name) → 409 Conflict (D-02 uniqueness).
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import * as categoryService from '../services/category.service.js';

const VALID_APPLIES_TO = new Set(['INCOME', 'EXPENSE', 'PAYMENT']);

class CategoryController {
  /**
   * POST /api/contabilidad/categorias
   * Body: { name, appliesTo }
   */
  async create(req, res) {
    try {
      const { name, appliesTo } = req.body ?? {};
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ success: false, error: 'name es requerido' });
      }
      if (!VALID_APPLIES_TO.has(appliesTo)) {
        return res
          .status(400)
          .json({ success: false, error: 'appliesTo debe ser uno de INCOME, EXPENSE, PAYMENT' });
      }

      let cat;
      try {
        cat = await categoryService.createCategory({ name: name.trim(), appliesTo }, req.user.id);
      } catch (err) {
        // Prisma P2002 on @@unique([appliesTo, name])
        if (err?.code === 'P2002') {
          return res
            .status(409)
            .json({ success: false, error: 'Categoría ya existe para este tipo' });
        }
        throw err;
      }

      await this._writeAudit('CREATE', cat.id, req, { name: cat.name, appliesTo: cat.appliesTo });

      res.status(201).json({ success: true, data: cat });
    } catch (err) {
      logger.error('Error en CategoryController.create:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/contabilidad/categorias
   * Query: appliesTo?, includeInactive?
   */
  async list(req, res) {
    try {
      const { appliesTo, includeInactive } = req.query ?? {};
      const cats = await categoryService.listCategories({
        appliesTo,
        includeInactive: includeInactive === 'true',
      });
      res.json({ success: true, data: cats });
    } catch (err) {
      logger.error('Error en CategoryController.list:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * PATCH /api/contabilidad/categorias/:id
   * Body: { name } — rename only (appliesTo intentionally immutable).
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name } = req.body ?? {};
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ success: false, error: 'name es requerido' });
      }

      const before = await prisma.category.findUnique({ where: { id } });
      if (!before) {
        return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
      }

      const after = await categoryService.renameCategory(id, name.trim());

      await this._writeAudit('UPDATE', id, req, {
        before: { name: before.name },
        after: { name: after.name },
      });

      res.json({ success: true, data: after });
    } catch (err) {
      logger.error('Error en CategoryController.update:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * PATCH /api/contabilidad/categorias/:id/deactivate
   */
  async deactivate(req, res) {
    try {
      const { id } = req.params;
      const cat = await categoryService.deactivateCategory(id);
      await this._writeAudit('DEACTIVATE', id, req, { isActive: false });
      res.json({ success: true, data: cat });
    } catch (err) {
      logger.error('Error en CategoryController.deactivate:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * PATCH /api/contabilidad/categorias/:id/reactivate
   */
  async reactivate(req, res) {
    try {
      const { id } = req.params;
      const cat = await categoryService.reactivateCategory(id);
      await this._writeAudit('REACTIVATE', id, req, { isActive: true });
      res.json({ success: true, data: cat });
    } catch (err) {
      logger.error('Error en CategoryController.reactivate:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ---- private helpers (NOT exposed in route registration) ----

  /**
   * D-07 + P-4: every AuditLog write includes ipAddress + userAgent.
   */
  async _writeAudit(action, entityId, req, changes) {
    await prisma.auditLog.create({
      data: {
        action,
        entity: 'Category',
        entityId,
        userId: req.user?.id ?? null,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        changes,
      },
    });
  }

  // INTENTIONAL ABSENCE — FIN-LEDGER-06 enforced via surface area:
  //   - NO delete method (deactivate / reactivate only)
}

export default new CategoryController();
