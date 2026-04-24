/**
 * Controller for DrawItemQuota admin operations.
 * Thin layer — delegates to quota.service.js.
 */
import { prisma } from '../lib/prisma.js';
import { getDrawQuotas, setQuota, removeQuota } from '../services/quota.service.js';
import logger from '../lib/logger.js';

const MUTABLE_DRAW_STATUSES = ['SCHEDULED', 'CLOSED'];

async function assertDrawAndItem(drawId, gameItemId, requireMutable) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { id: true, gameId: true, status: true },
  });
  if (!draw) return { error: { status: 404, message: 'Draw not found' } };

  if (requireMutable && !MUTABLE_DRAW_STATUSES.includes(draw.status)) {
    return { error: { status: 400, message: `Draw is ${draw.status} — quotas cannot be modified` } };
  }

  if (gameItemId) {
    const item = await prisma.gameItem.findUnique({
      where: { id: gameItemId },
      select: { id: true, gameId: true },
    });
    if (!item) return { error: { status: 404, message: 'GameItem not found' } };
    if (item.gameId !== draw.gameId) {
      return { error: { status: 400, message: 'GameItem does not belong to the draw\'s game' } };
    }
  }
  return { draw };
}

class QuotaController {
  /** GET /api/draws/:drawId/quotas */
  async list(req, res) {
    try {
      const { drawId } = req.params;
      const check = await assertDrawAndItem(drawId, null, false);
      if (check.error) return res.status(check.error.status).json({ success: false, error: check.error.message });
      const data = await getDrawQuotas(drawId);
      return res.json({ success: true, data });
    } catch (err) {
      logger.error('[quota.controller] list failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /** PUT /api/draws/:drawId/quotas/:gameItemId  body: { maxAmount } */
  async upsert(req, res) {
    try {
      const { drawId, gameItemId } = req.params;
      const { maxAmount } = req.body ?? {};
      const amount = Number(maxAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'maxAmount must be a positive number' });
      }
      const check = await assertDrawAndItem(drawId, gameItemId, true);
      if (check.error) return res.status(check.error.status).json({ success: false, error: check.error.message });

      const quota = await setQuota({ drawId, gameItemId, maxAmount: amount, userId: req.user?.id ?? null });
      return res.json({ success: true, data: quota });
    } catch (err) {
      logger.error('[quota.controller] upsert failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /** DELETE /api/draws/:drawId/quotas/:gameItemId */
  async remove(req, res) {
    try {
      const { drawId, gameItemId } = req.params;
      const check = await assertDrawAndItem(drawId, gameItemId, true);
      if (check.error) return res.status(check.error.status).json({ success: false, error: check.error.message });

      await removeQuota({ drawId, gameItemId });
      return res.status(204).send();
    } catch (err) {
      logger.error('[quota.controller] remove failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new QuotaController();
