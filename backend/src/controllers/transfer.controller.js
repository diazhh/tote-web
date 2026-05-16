import * as transferService from '../services/transfer.service.js';
import * as transferAttachmentService from '../services/transfer-attachment.service.js';
import { NoRateForTransferError } from '../services/transfer.service.js';
import logger from '../lib/logger.js';

class TransferController {
  async create(req, res) {
    try {
      const { transferDate, fromAccountId, toAccountId, amountFrom, description } = req.body ?? {};
      if (!transferDate) return res.status(400).json({ success: false, error: 'transferDate requerido' });
      const parsedDate = new Date(transferDate);
      if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ success: false, error: 'transferDate inválido' });
      const transfer = await transferService.createTransfer({
        transferDate: parsedDate,
        fromAccountId, toAccountId, amountFrom, description,
        createdById: req.user.id,
      });
      res.status(201).json({ success: true, data: transfer });
    } catch (err) {
      if (err instanceof NoRateForTransferError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      logger.error('[transfer.controller] create', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async list(req, res) {
    try {
      const { from, to, accountId, includeReversed } = req.query;
      const transfers = await transferService.listTransfers({
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        accountId,
        includeReversed: includeReversed === 'true',
      });
      res.json({ success: true, data: transfers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getOne(req, res) {
    try {
      const transfer = await transferService.getTransfer(req.params.id);
      res.json({ success: true, data: transfer });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async reverse(req, res) {
    try {
      const { reversalReason } = req.body ?? {};
      const reversal = await transferService.reverseTransfer(
        req.params.id, reversalReason, req.user.id,
      );
      res.status(201).json({ success: true, data: reversal });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async uploadAttachment(req, res) {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'Archivo requerido' });
      const transfer = await transferService.getTransfer(req.params.id);
      const att = await transferAttachmentService.validateAndStore({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        transferDate: transfer.transferDate,
        uploadedById: req.user.id,
        transferId: transfer.id,
      });
      res.status(201).json({ success: true, data: att });
    } catch (err) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }

  async downloadAttachment(req, res) {
    try {
      const { att, stream } = await transferAttachmentService.getAttachmentStream(req.params.attId);
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${att.originalName}"`);
      stream.pipe(res);
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  async deleteAttachment(req, res) {
    try {
      await transferAttachmentService.deleteAttachment(req.params.attId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export default new TransferController();
