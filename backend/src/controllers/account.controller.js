import * as accountService from '../services/account.service.js';
import logger from '../lib/logger.js';

class AccountController {
  async create(req, res) {
    try {
      const { name, currency, openingBalance, openingDate, sortOrder } = req.body ?? {};
      if (!name) return res.status(400).json({ success: false, error: 'name requerido' });
      if (!['BsF', 'USD'].includes(currency)) {
        return res.status(400).json({ success: false, error: 'currency debe ser BsF o USD' });
      }
      const account = await accountService.createAccount({
        name, currency, openingBalance, openingDate,
        createdById: req.user.id, sortOrder,
      });
      res.status(201).json({ success: true, data: account });
    } catch (err) {
      logger.error('[account.controller] create', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async list(req, res) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const accounts = await accountService.listAccounts({ includeInactive });
      const withBalances = await Promise.all(accounts.map(async (a) => ({
        ...a,
        currentBalance: await accountService.getCurrentBalance(a.id),
      })));
      res.json({ success: true, data: withBalances });
    } catch (err) {
      logger.error('[account.controller] list', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getOne(req, res) {
    try {
      const account = await accountService.getAccount(req.params.id);
      const currentBalance = await accountService.getCurrentBalance(account.id);
      res.json({ success: true, data: { ...account, currentBalance } });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async update(req, res) {
    try {
      const patch = req.body ?? {};
      const account = await accountService.updateAccount(req.params.id, patch);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deactivate(req, res) {
    try {
      const account = await accountService.deactivateAccount(req.params.id);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async reactivate(req, res) {
    try {
      const account = await accountService.reactivateAccount(req.params.id);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export default new AccountController();
