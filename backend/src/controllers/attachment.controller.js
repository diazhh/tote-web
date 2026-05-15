import * as attachmentService from '../services/attachment.service.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Phase 13 — receipt attachment controller (PATTERNS.md section 9).
 *
 * Every mutation writes an AuditLog row with the FULL diagnostic triple
 * userId + ipAddress (req.ip — trust proxy is set at index.js:24, P-8) +
 * userAgent (req.get('user-agent')). D-07 + P-4 compliance.
 *
 * download() is read-only — no AuditLog write (matches D-07's enumeration
 * of UPLOAD / DELETE only on AccountingEntryAttachment).
 */
class AttachmentController {
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió archivo' });
      }

      // Load the entry so we can derive YYYY/MM from entryDate (D-04).
      // findUniqueOrThrow → P2025 if id invalid; caught below as a generic 500
      // (the route param ought to come from the admin's own UI flow — invalid
      // ids should not reach here in normal use).
      const entry = await prisma.accountingEntry.findUniqueOrThrow({
        where: { id: req.params.id },
        select: { entryDate: true },
      });

      const att = await attachmentService.validateAndStore({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        entryDate: entry.entryDate,
        uploadedById: req.user.id,
        entryId: req.params.id,
      });

      // D-07 AuditLog — full diagnostic triple (userId + ipAddress + userAgent).
      await prisma.auditLog.create({
        data: {
          action: 'UPLOAD',
          entity: 'AccountingEntryAttachment',
          entityId: att.id,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          changes: {
            entryId: att.entryId,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
          },
        },
      });

      res.status(201).json({ success: true, data: att });
    } catch (err) {
      // 413 (oversize) / 422 (bad MIME) bubble up from the service with statusCode set.
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      logger.error('Error en upload:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async download(req, res) {
    try {
      const { att, stream } = await attachmentService.getAttachmentStream(req.params.attId);
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(att.originalName)}"`,
      );
      stream.on('error', (streamErr) => {
        logger.error('Error en stream de adjunto:', streamErr);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: streamErr.message });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch (err) {
      logger.error('Error en download:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  async remove(req, res) {
    try {
      await attachmentService.deleteAttachment(req.params.attId);
      // D-07 AuditLog — full diagnostic triple.
      await prisma.auditLog.create({
        data: {
          action: 'DELETE',
          entity: 'AccountingEntryAttachment',
          entityId: req.params.attId,
          userId: req.user?.id ?? null,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          changes: { entryId: req.params.id },
        },
      });
      res.json({ success: true });
    } catch (err) {
      logger.error('Error en remove:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new AttachmentController();
