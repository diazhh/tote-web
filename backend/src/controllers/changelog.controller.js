import changelogService from '../services/changelog.service.js';
import logger from '../lib/logger.js';

class ChangelogController {
  /** GET /api/changelog */
  async list(req, res) {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const includeDrafts = isAdmin && req.query.includeDrafts === 'true';
      const result = await changelogService.list({
        page: parseInt(req.query.page) || 1,
        pageSize: Math.min(parseInt(req.query.pageSize) || 25, 100),
        includeDrafts,
        category: req.query.category || null,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('[changelog] list error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /** GET /api/changelog/unread-count?since=<ISO> */
  async unreadCount(req, res) {
    try {
      const count = await changelogService.unreadCount(req.query.since || null);
      res.json({ success: true, data: { count } });
    } catch (err) {
      logger.error('[changelog] unreadCount error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /** POST /api/changelog */
  async create(req, res) {
    try {
      const entry = await changelogService.create({
        ...req.body,
        createdById: req.user?.id || null,
      });
      res.status(201).json({ success: true, data: entry });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ success: false, error: err.message });
      logger.error('[changelog] create error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /** PATCH /api/changelog/:id */
  async update(req, res) {
    try {
      const entry = await changelogService.update(req.params.id, req.body);
      res.json({ success: true, data: entry });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ success: false, error: err.message });
      logger.error('[changelog] update error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /** DELETE /api/changelog/:id */
  async remove(req, res) {
    try {
      await changelogService.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ success: false, error: err.message });
      logger.error('[changelog] remove error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new ChangelogController();
