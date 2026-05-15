import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { uploadReceipt } from '../middlewares/upload.middleware.js';
import rateController from '../controllers/exchange-rate.controller.js';
import entryController from '../controllers/accounting-entry.controller.js';
import categoryController from '../controllers/category.controller.js';
import attachmentController from '../controllers/attachment.controller.js';

/**
 * Phase 13 — contabilidad routes (PATTERNS.md section 10).
 *
 * Mounted at /api/contabilidad. Single router covers four sub-resources:
 * /tasas (exchange rates, immutable per FIN-RATE-02 — POST + GET only),
 * /asientos (accounting entries + reversal), /asientos/:id/attachments
 * (auth-gated receipt upload/download/delete — receipts NEVER leak via the
 * /storage/* static mount because of the P-1 guard in index.js), and
 * /categorias (configurable per appliesTo, soft-delete only per FIN-LEDGER-06).
 *
 * Router-level admin guard at the top mirrors provider.routes.js:8.
 * Router-level error handler at the bottom maps multer LIMIT_FILE_SIZE
 * → 413 with a friendly Spanish message (P-3).
 */

const router = express.Router();

// All routes admin-only (mirror provider.routes.js:7-8)
router.use(authenticate, authorize('ADMIN'));

// ============================================================================
// Tasas (immutable — POST + GET only, NO PUT/DELETE per FIN-RATE-02)
// ============================================================================
router.post('/tasas', rateController.create.bind(rateController));
router.get('/tasas', rateController.list.bind(rateController));

// ============================================================================
// Asientos
// ============================================================================
router.post('/asientos', entryController.create.bind(entryController));
router.get('/asientos', entryController.list.bind(entryController));
router.get('/asientos/:id', entryController.getOne.bind(entryController));
router.patch('/asientos/:id', entryController.update.bind(entryController));
router.post('/asientos/:id/reverse', entryController.reverse.bind(entryController));

// ============================================================================
// Adjuntos (auth-gated — never via /storage/* static; P-1 closed in index.js)
// ============================================================================
router.post(
  '/asientos/:id/attachments',
  uploadReceipt.single('file'),
  attachmentController.upload.bind(attachmentController),
);
router.get(
  '/asientos/:id/attachments/:attId',
  attachmentController.download.bind(attachmentController),
);
router.delete(
  '/asientos/:id/attachments/:attId',
  attachmentController.remove.bind(attachmentController),
);

// ============================================================================
// Categorías (soft-delete only — FIN-LEDGER-06)
// ============================================================================
router.post('/categorias', categoryController.create.bind(categoryController));
router.get('/categorias', categoryController.list.bind(categoryController));
router.patch('/categorias/:id', categoryController.update.bind(categoryController));
router.patch(
  '/categorias/:id/deactivate',
  categoryController.deactivate.bind(categoryController),
);
router.patch(
  '/categorias/:id/reactivate',
  categoryController.reactivate.bind(categoryController),
);

// ============================================================================
// P-3 multer error handler (router-level — friendly 413/422 messages)
// ============================================================================
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Archivo excede 5MB' });
  }
  next(err);
});

export default router;
