import { prisma } from '../lib/prisma.js';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { format } from 'date-fns';

/**
 * Phase 13 — receipt attachment service (PATTERNS.md section 5).
 *
 * Trust boundary: the buffer arriving from multer.memoryStorage is untrusted.
 * The multer-provided client mimetype is untrusted and MUST NOT be persisted
 * (F-14). The true MIME is detected via `file-type` byte inspection
 * BEFORE the buffer touches disk — see validateAndStore().
 *
 * Filename on disk is `${crypto.randomUUID()}.${detected.ext}` — the operator's
 * originalName is preserved only in the DB column for UI display (T-13-05).
 *
 * Disk path is bucketed by ENTRY DATE (NOT upload date — D-04 + P-5) so
 * fiscal-month archives stay consistent even when a receipt is uploaded weeks
 * after the entry was created.
 */

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'receipts');
const MAX_BYTES = 5 * 1024 * 1024; // defensive — multer enforces too (P-3)

/**
 * Byte-validate, persist to disk, then create the AccountingEntryAttachment row.
 * On any validation failure throws an Error with `.statusCode` set
 * (413 for size, 422 for MIME) so the controller can map it cleanly.
 *
 * @param {Object}  args
 * @param {Buffer}  args.buffer        — raw bytes from multer.memoryStorage
 * @param {string}  args.originalName  — operator-supplied filename (preserved in DB column only)
 * @param {Date}    args.entryDate     — entry.entryDate (Prisma @db.Date → Date at JS layer); drives YYYY/MM bucket
 * @param {string}  args.uploadedById  — req.user.id
 * @param {string}  args.entryId       — accountingEntry.id
 * @returns {Promise<import('@prisma/client').AccountingEntryAttachment>}
 */
export async function validateAndStore({ buffer, originalName, entryDate, uploadedById, entryId }) {
  // Defensive size check — multer is the primary 5MB gate, this catches any
  // upstream caller that bypasses multer (e.g. internal service invocation).
  if (buffer.length > MAX_BYTES) {
    const err = new Error('Archivo excede 5MB');
    err.statusCode = 413;
    throw err;
  }

  // F-14 byte-level MIME check — happens BEFORE fs.writeFile so a rejected
  // file never lands on disk (anti-pattern: routing receipt downloads through
  // express.static is closed by P-1 guard; orphan files-on-disk is closed by
  // doing this check before the write).
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    const err = new Error(`Tipo de archivo no permitido: ${detected?.mime ?? 'desconocido'}`);
    err.statusCode = 422;
    throw err;
  }

  // Path: backend/storage/receipts/YYYY/MM/{uuid}.{ext}
  // entryDate is the bucket key (NOT today's date). For Prisma @db.Date columns
  // the JS value is a Date pinned at 00:00 UTC, so date-fns format yields
  // the same YYYY/MM that the date string would render — no TZ surprise (P-5).
  const yyyymm = format(entryDate, 'yyyy/MM');
  const uuid = randomUUID();
  const filename = `${uuid}.${detected.ext}`;
  const dir = path.join(STORAGE_ROOT, yyyymm);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);

  return prisma.accountingEntryAttachment.create({
    data: {
      entryId,
      filename,
      originalName,
      mimeType: detected.mime, // VALIDATED — byte-detected, never the client-supplied header
      sizeBytes: buffer.length,
      uploadedById,
    },
  });
}

/**
 * Look up the attachment by id and return both the row and an open
 * readStream pointing at the on-disk file. Controller is responsible for
 * setting Content-Type / Content-Disposition and piping the stream.
 *
 * @param {string} attachmentId
 * @returns {Promise<{att: import('@prisma/client').AccountingEntryAttachment, stream: import('fs').ReadStream}>}
 */
export async function getAttachmentStream(attachmentId) {
  const att = await prisma.accountingEntryAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { entry: { select: { entryDate: true } } },
  });
  const yyyymm = format(att.entry.entryDate, 'yyyy/MM');
  const full = path.join(STORAGE_ROOT, yyyymm, att.filename);
  return { att, stream: createReadStream(full) };
}

/**
 * Delete the on-disk file (best-effort — disk drift is recoverable) then
 * delete the DB row. Order matters: if the DB delete fails, we keep the file
 * AND the row in sync; if the file unlink fails, the row is still removed
 * and the operator gets a clean delete from their POV.
 *
 * @param {string} attachmentId
 */
export async function deleteAttachment(attachmentId) {
  const att = await prisma.accountingEntryAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { entry: { select: { entryDate: true } } },
  });
  const yyyymm = format(att.entry.entryDate, 'yyyy/MM');
  const full = path.join(STORAGE_ROOT, yyyymm, att.filename);
  await fs.unlink(full).catch(() => {}); // best-effort disk cleanup
  return prisma.accountingEntryAttachment.delete({ where: { id: attachmentId } });
}
