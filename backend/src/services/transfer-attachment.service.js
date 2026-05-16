import { prisma } from '../lib/prisma.js';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { format } from 'date-fns';

/**
 * v2 contabilidad — comprobantes de transferencia.
 * Mismo patrón F-14 byte-validation que attachment.service.js para AccountingEntry.
 * Bucket de disco: storage/transfer-receipts/YYYY/MM/{uuid}.{ext}
 */

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'transfer-receipts');
const MAX_BYTES = 5 * 1024 * 1024;

export async function validateAndStore({ buffer, originalName, transferDate, uploadedById, transferId }) {
  if (buffer.length > MAX_BYTES) {
    const err = new Error('Archivo excede 5MB');
    err.statusCode = 413;
    throw err;
  }
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    const err = new Error(`Tipo de archivo no permitido: ${detected?.mime ?? 'desconocido'}`);
    err.statusCode = 422;
    throw err;
  }
  const yyyymm = format(transferDate, 'yyyy/MM');
  const uuid = randomUUID();
  const filename = `${uuid}.${detected.ext}`;
  const dir = path.join(STORAGE_ROOT, yyyymm);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return prisma.transferAttachment.create({
    data: { transferId, filename, originalName, mimeType: detected.mime, sizeBytes: buffer.length, uploadedById },
  });
}

export async function getAttachmentStream(attachmentId) {
  const att = await prisma.transferAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { transfer: { select: { transferDate: true } } },
  });
  const yyyymm = format(att.transfer.transferDate, 'yyyy/MM');
  const full = path.join(STORAGE_ROOT, yyyymm, att.filename);
  return { att, stream: createReadStream(full) };
}

export async function deleteAttachment(attachmentId) {
  const att = await prisma.transferAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { transfer: { select: { transferDate: true } } },
  });
  const yyyymm = format(att.transfer.transferDate, 'yyyy/MM');
  const full = path.join(STORAGE_ROOT, yyyymm, att.filename);
  await fs.unlink(full).catch(() => {});
  return prisma.transferAttachment.delete({ where: { id: attachmentId } });
}
