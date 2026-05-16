import multer from 'multer';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB hard ceiling

/**
 * Receipt upload — multer.memoryStorage so the controller can byte-validate
 * via file-type's `fileTypeFromBuffer` BEFORE persisting to disk (F-14).
 *
 * Do NOT switch to multer.diskStorage: that would write the malicious-rename
 * file (e.g. `evil.html` renamed `evil.pdf`) to disk BEFORE the controller
 * gets a chance to reject it on byte-level MIME mismatch.
 *
 * fileFilter is INTENTIONALLY OMITTED.
 *   F-14 explicit footgun: multer's fileFilter inspects `req.file.mimetype`,
 *   which is the client-supplied (and therefore untrusted) Content-Type
 *   header from the multipart part. Any client can claim `application/pdf`
 *   for an arbitrary `.html` payload. Byte-level inspection in the controller
 *   (attachment.service.js#validateAndStore) is the trust boundary.
 *
 * limits.fileSize triggers a MulterError with code === 'LIMIT_FILE_SIZE' which
 * the router-level error handler in contabilidad.routes.js maps to a friendly
 * 413 JSON response (P-3).
 *
 * limits.files = 1 — CONTEXT D-04: v1 supports one receipt per request;
 * multi-file drag-drop is deferred to backlog.
 */
export const uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: 1,
  },
});

export const uploadTransferReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});
