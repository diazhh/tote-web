import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create an idempotent WEBHOOK_PUSH ticket for a normalized payload.
 * Returns the existing ticket if a duplicate is detected.
 *
 * @param {object} normalized  - Adapter output conforming to the adapter contract
 * @param {string} logId       - WebhookLog.id to update on DUPLICATE
 * @returns {object}           - Created or existing Ticket record
 */
async function createWebhookTicket(normalized, logId) {
  const existing = await prisma.ticket.findFirst({
    where: {
      drawId: normalized.drawId,
      externalTicketId: normalized.externalTicketId,
      source: 'WEBHOOK_PUSH',
    },
  });

  if (existing) {
    await prisma.webhookLog.update({
      where: { id: logId },
      data: { status: 'DUPLICATE' },
    });
    return existing;
  }

  const ticket = await prisma.ticket.create({
    data: {
      drawId: normalized.drawId,
      source: 'WEBHOOK_PUSH',
      externalTicketId: normalized.externalTicketId,
      totalAmount: normalized.totalAmount,
      totalPrize: 0,
      status: 'ACTIVE',
      providerData: normalized.providerData ?? null,
      details: {
        create: normalized.details.map((d) => ({
          gameItemId: d.gameItemId,
          amount: d.amount,
          multiplier: d.multiplier,
          prize: 0,
          status: 'ACTIVE',
          ...(d.drawId ? { drawId: d.drawId } : {}),
        })),
      },
    },
  });

  return ticket;
}

/**
 * Annul (delete) a WEBHOOK_PUSH ticket if it was created within the allowed window.
 * The provider sends the same ticketId without plays to request annulment.
 *
 * @param {string} externalTicketId - The provider's ticket ID
 * @param {string} logId            - WebhookLog.id for this request
 * @param {string} slug             - Provider slug for logging
 * @returns {object}                - Result object with status and logId
 */
const ANNUL_WINDOW_SECONDS = 190;

async function annulWebhookTicket(externalTicketId, logId, slug) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      externalTicketId,
      source: 'WEBHOOK_PUSH',
    },
    include: { details: true },
  });

  if (!ticket) {
    await prisma.webhookLog.update({
      where: { id: logId },
      data: { status: 'FAILED', errorMessage: `Annulment failed: ticket "${externalTicketId}" not found` },
    });
    logger.warn(`[webhook] Annulment failed — ticket "${externalTicketId}" not found (logId=${logId})`);
    return { status: 'rejected', logId, reason: `Ticket "${externalTicketId}" not found` };
  }

  const ageSeconds = (Date.now() - new Date(ticket.createdAt).getTime()) / 1000;
  if (ageSeconds > ANNUL_WINDOW_SECONDS) {
    await prisma.webhookLog.update({
      where: { id: logId },
      data: { status: 'FAILED', errorMessage: `Annulment failed: ticket "${externalTicketId}" is ${Math.round(ageSeconds)}s old (limit: ${ANNUL_WINDOW_SECONDS}s)` },
    });
    logger.warn(`[webhook] Annulment denied — ticket "${externalTicketId}" is ${Math.round(ageSeconds)}s old, limit is ${ANNUL_WINDOW_SECONDS}s (logId=${logId})`);
    return { status: 'rejected', logId, reason: `Ticket too old for annulment (${Math.round(ageSeconds)}s > ${ANNUL_WINDOW_SECONDS}s limit)` };
  }

  // Delete ticket and its details (cascade)
  await prisma.ticket.delete({ where: { id: ticket.id } });

  await prisma.webhookLog.update({
    where: { id: logId },
    data: { status: 'PROCESSED', errorMessage: `Annulled ticket "${externalTicketId}" (ticketNumber=${ticket.ticketNumber})` },
  });

  logger.info(`[webhook] Ticket annulled: "${externalTicketId}" (ticketNumber=${ticket.ticketNumber}, age=${Math.round(ageSeconds)}s) by "${slug}" (logId=${logId})`);
  return { status: 'annulled', logId, ticketNumber: ticket.ticketNumber };
}

/**
 * Core webhook dispatch function.
 *
 * Steps (always in this order):
 *   1. Write WebhookLog with status DISCOVERED (log-first).
 *   2. Attempt dynamic import of provider adapter.
 *   3. If no adapter → return discovery result (log stays DISCOVERED).
 *   4. If adapter found → normalize payload → create ticket → update log.
 *
 * @param {object}         apiSystem - ApiSystem record (from req.apiSystem)
 * @param {Buffer|string}  rawBody   - Raw request body
 * @param {object}         headers   - Request headers
 * @returns {object}                 - Result object with status and logId
 */
export async function dispatchWebhook(apiSystem, rawBody, headers) {
  const slug = apiSystem.slug;
  const rawPayload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');

  // Step 1: log-first — always write a DISCOVERED entry before any processing
  const log = await prisma.webhookLog.create({
    data: {
      apiSystemId: apiSystem.id,
      rawPayload,
      headers: headers ?? null,
      status: 'DISCOVERED',
    },
  });

  // Step 2: attempt to load the provider adapter
  const adapterPath = path.resolve(__dirname, '../webhooks/adapters/' + slug + '.adapter.js');

  let adapterModule;
  try {
    adapterModule = await import(adapterPath);
  } catch (importErr) {
    if (importErr.code === 'ERR_MODULE_NOT_FOUND') {
      logger.info(`[webhook] Discovery mode — no adapter for provider "${slug}" (logId=${log.id})`);
      return { status: 'discovery', logId: log.id };
    }

    // Unexpected import error
    const errorMessage = importErr.message ?? String(importErr);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage },
    });
    logger.error(`[webhook] Failed to load adapter for "${slug}":`, importErr);
    return { status: 'failed', logId: log.id, error: errorMessage };
  }

  // Step 3: normalize and create ticket
  try {
    const normalized = await adapterModule.normalize(JSON.parse(rawPayload));

    // D-04: Check adapter rejection before ticket creation
    if (normalized && normalized.rejected) {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: normalized.reason || 'Rejected by adapter' },
      });
      logger.warn(`[webhook] Payload rejected by adapter "${slug}" (logId=${log.id}): ${normalized.reason}`);
      return { status: 'rejected', logId: log.id, reason: normalized.reason };
    }

    // Handle annulment request
    if (normalized && normalized.annul) {
      const annulResult = await annulWebhookTicket(normalized.externalTicketId, log.id, slug);
      return annulResult;
    }

    const ticket = await createWebhookTicket(normalized, log.id);

    // Check if the log was updated to DUPLICATE by createWebhookTicket
    const currentLog = await prisma.webhookLog.findUnique({ where: { id: log.id } });
    if (currentLog?.status === 'DUPLICATE') {
      return { status: 'duplicate', logId: log.id, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
    }

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'PROCESSED' },
    });

    return { status: 'processed', logId: log.id, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
  } catch (err) {
    const errorMessage = err.message ?? String(err);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage },
    });
    logger.error(`[webhook] Processing error for "${slug}" (logId=${log.id}):`, err);
    // DO NOT rethrow — controller always returns 200
    return { status: 'failed', logId: log.id, error: errorMessage };
  }
}
