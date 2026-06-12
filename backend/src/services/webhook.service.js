import path from 'path';
import { fileURLToPath } from 'url';
import { access } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { checkTicketQuotas, partitionByQuota } from './quota.service.js';

/**
 * Slugs de proveedores que usan el flujo de aceptación parcial:
 * el ticket se crea con los detalles que tienen cupo y se devuelve
 * `items[]` + `totalAmount` indicando exactamente qué se vendió.
 * Detalles sin cupo se descartan silenciosamente (no se exponen).
 */
// LEGACY (fallback): el modo de aceptación parcial ahora vive en la columna
// ApiSystem.partialMode. Estos Sets se conservan como red de seguridad para
// proveedores aún sin backfill — resolvePartialMode() usa la columna primero y
// cae a estos Sets solo si la columna es NONE/ausente.
const PARTIAL_ACCEPTANCE_SLUGS = new Set(['premier', 'premier2', 'virtuales2', 'paganarplay', 'winbigvzla']);
const SPLIT_PARTIAL_SLUGS = new Set(['premier', 'premier2', 'winbigvzla']);

/**
 * Resuelve el modo de aceptación parcial de un proveedor.
 * Precedencia: columna ApiSystem.partialMode → Sets legacy → 'NONE'.
 * @param {object} apiSystem
 * @returns {'NONE'|'DROP'|'SPLIT'}
 */
function resolvePartialMode(apiSystem) {
  const col = apiSystem.partialMode;
  if (col === 'DROP' || col === 'SPLIT') return col;
  // Fallback legacy para proveedores sin backfill de la columna.
  if (SPLIT_PARTIAL_SLUGS.has(apiSystem.slug)) return 'SPLIT';
  if (PARTIAL_ACCEPTANCE_SLUGS.has(apiSystem.slug)) return 'DROP';
  return 'NONE';
}

/**
 * Carga el adapter de un proveedor.
 * Precedencia: adapter custom `{slug}.adapter.js` → conector genérico
 * (si useGenericAdapter) → discovery (sin adapter).
 *
 * @param {string} slug
 * @param {object} apiSystem
 * @param {string} adaptersDir - ruta absoluta de la carpeta de adapters
 * @returns {Promise<{module?: object, source?: string, discovery?: boolean, error?: string}>}
 */
async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadAdapter(slug, apiSystem, adaptersDir) {
  // Sandbox: el path del adapter custom nunca puede salir de adaptersDir.
  const customPath = path.resolve(adaptersDir, `${slug}.adapter.js`);
  if (!customPath.startsWith(adaptersDir + path.sep)) {
    return { error: 'Adapter path escape attempted' };
  }

  // 1. Adapter custom — siempre gana (preserva casos especiales como premier).
  // Chequear existencia con fs.access antes de importar: determinista en Node y
  // bajo el VM de Jest (donde import() de un módulo ausente no da ERR_MODULE_NOT_FOUND).
  if (await fileExists(customPath)) {
    try {
      const module = await import(customPath);
      return { module, source: 'custom' };
    } catch (err) {
      return { error: err.message ?? String(err) };
    }
  }

  // 2. Conector genérico — opt-in por proveedor (useGenericAdapter).
  if (apiSystem.useGenericAdapter) {
    try {
      const module = await import(path.resolve(adaptersDir, 'generic.adapter.js'));
      return { module, source: 'generic' };
    } catch (err) {
      return { error: `generic adapter load failed: ${err.message ?? String(err)}` };
    }
  }

  // 3. Sin adapter → discovery (solo se loguea el payload).
  return { discovery: true };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Verify the draw is still open for new tickets. Called inside the dispatch
 * transaction so it serializes with the close-draw worker's atomic update.
 *
 * @param {string} drawId
 * @param {object} tx - prisma or transactional client
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function checkDrawIsOpen(drawId, tx) {
  const draw = await tx.draw.findUnique({
    where: { id: drawId },
    select: { status: true },
  });
  if (!draw) return { ok: false, reason: `Draw ${drawId} not found` };
  if (draw.status !== 'SCHEDULED') {
    return { ok: false, reason: `Draw is ${draw.status} — closed for new bets` };
  }
  return { ok: true };
}

/**
 * Create an idempotent WEBHOOK_PUSH ticket for a normalized payload.
 * Returns the existing ticket if a duplicate is detected.
 *
 * @param {object} normalized  - Adapter output conforming to the adapter contract
 * @param {string} logId       - WebhookLog.id to update on DUPLICATE
 * @returns {object}           - Created or existing Ticket record
 */
async function createWebhookTicket(normalized, logId, apiSystemId, tx = prisma) {
  const existing = await tx.ticket.findFirst({
    where: {
      externalTicketId: normalized.externalTicketId,
      source: 'WEBHOOK_PUSH',
      apiSystemId,
    },
  });

  if (existing) {
    await tx.webhookLog.update({
      where: { id: logId },
      data: { status: 'DUPLICATE' },
    });
    return existing;
  }

  const ticket = await tx.ticket.create({
    data: {
      drawId: normalized.drawId,
      source: 'WEBHOOK_PUSH',
      externalTicketId: normalized.externalTicketId,
      totalAmount: normalized.totalAmount,
      totalPrize: 0,
      status: 'ACTIVE',
      apiSystemId,
      providerData: normalized.providerData ?? null,
      details: {
        create: normalized.details.map((d) => ({
          // F-X: drawId siempre presente. Adapters multi-draw pasan d.drawId
          // explícito; los single-draw caen al drawId del ticket. DrawFinancial
          // PRIZES filtra por td.drawId — NULL = invisible para reportes.
          drawId: d.drawId ?? normalized.drawId,
          gameItemId: d.gameItemId,
          amount: d.amount,
          multiplier: d.multiplier,
          prize: 0,
          status: 'ACTIVE',
        })),
      },
    },
  });

  return ticket;
}

/**
 * Annul a WEBHOOK_PUSH ticket while its draw is still open for betting.
 * Sets ticket status to CANCELLED (keeps record in DB for audit).
 * The provider sends the same ticketId without plays to request annulment.
 *
 * Annulment is allowed only when the ticket's draw is in `SCHEDULED` state.
 * Draws transition to `CLOSED` 5 minutes before draw time; once closed,
 * drawn or cancelled, annulment is rejected.
 *
 * @param {string} externalTicketId - The provider's ticket ID
 * @param {string} logId            - WebhookLog.id for this request
 * @param {string} slug             - Provider slug for logging
 * @returns {object}                - Result object with status and logId
 */
async function annulWebhookTicket(externalTicketId, logId, slug) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      externalTicketId,
      source: 'WEBHOOK_PUSH',
    },
    include: { details: true, draw: { select: { status: true } } },
  });

  if (!ticket) {
    await prisma.webhookLog.update({
      where: { id: logId },
      data: { status: 'FAILED', errorMessage: `Annulment failed: ticket "${externalTicketId}" not found` },
    });
    logger.warn(`[webhook] Annulment failed — ticket "${externalTicketId}" not found (logId=${logId})`);
    return { status: 'rejected', logId, reason: `Ticket "${externalTicketId}" not found` };
  }

  const drawStatus = ticket.draw?.status;
  if (drawStatus !== 'SCHEDULED') {
    await prisma.webhookLog.update({
      where: { id: logId },
      data: { status: 'FAILED', errorMessage: `Annulment failed: draw is ${drawStatus} (must be SCHEDULED)` },
    });
    logger.warn(`[webhook] Annulment denied — ticket "${externalTicketId}" draw is ${drawStatus}, must be SCHEDULED (logId=${logId})`);
    return { status: 'rejected', logId, reason: `Draw is ${drawStatus} — annulment only allowed while SCHEDULED` };
  }

  // Mark ticket and details as CANCELLED (keep in DB for audit)
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'CANCELLED' },
  });
  await prisma.ticketDetail.updateMany({
    where: { ticketId: ticket.id },
    data: { status: 'CANCELLED' },
  });

  await prisma.webhookLog.update({
    where: { id: logId },
    data: { status: 'PROCESSED', errorMessage: `Annulled ticket "${externalTicketId}" (ticketNumber=${ticket.ticketNumber})` },
  });

  logger.info(`[webhook] Ticket annulled: "${externalTicketId}" (ticketNumber=${ticket.ticketNumber}) by "${slug}" (logId=${logId})`);
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

  // Step 2: resolve the provider adapter.
  // Precedencia: custom `{slug}.adapter.js` → conector genérico (opt-in) →
  // discovery. El sandbox de path vive dentro de loadAdapter.
  const adaptersDir = path.resolve(__dirname, '../webhooks/adapters');
  const resolved = await loadAdapter(slug, apiSystem, adaptersDir);

  if (resolved.discovery) {
    logger.info(`[webhook] Discovery mode — no adapter for provider "${slug}" (logId=${log.id})`);
    return { status: 'discovery', logId: log.id };
  }
  if (resolved.error) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: resolved.error },
    });
    logger.error(`[webhook] Failed to load adapter for "${slug}": ${resolved.error}`);
    return { status: 'failed', logId: log.id, error: resolved.error };
  }
  const adapterModule = resolved.module;
  if (resolved.source === 'generic') {
    logger.info(`[webhook] Using generic adapter for provider "${slug}" (logId=${log.id})`);
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

    // Wrap quota check + ticket creation in one transaction so the
    // SELECT ... FOR UPDATE lock inside checkTicketQuotas stays held
    // until the ticket insert commits.
    const partialMode = resolvePartialMode(apiSystem); // 'NONE' | 'DROP' | 'SPLIT'
    const partialAcceptance = partialMode === 'DROP' || partialMode === 'SPLIT';
    const txResult = await prisma.$transaction(async (tx) => {
      const drawCheck = await checkDrawIsOpen(normalized.drawId, tx);
      if (!drawCheck.ok) {
        return { rejected: true, reason: drawCheck.reason };
      }

      if (partialAcceptance) {
        const { accepted, rejected, capped } = await partitionByQuota(normalized.details, tx, {
          split: partialMode === 'SPLIT',
        });
        if (accepted.length === 0) {
          return {
            rejected: true,
            reason: 'Ninguna jugada disponible (todas sin cupo o bloqueadas)',
          };
        }
        // Reconstruir normalized con solo los accepted + recalc totalAmount.
        // Los accepted ya traen el amount topeado al diferencial (modo split),
        // así que el ticket y el echo al proveedor reflejan lo realmente vendido.
        // Guardar rejected + capped en providerData para auditoría interna (no se expone).
        const partialNormalized = {
          ...normalized,
          details: accepted,
          totalAmount: accepted.reduce((s, d) => s + Number(d.amount), 0),
          providerData: {
            ...(normalized.providerData ?? {}),
            _partialAcceptance: {
              acceptedCount: accepted.length,
              rejectedCount: rejected.length,
              cappedCount: (capped ?? []).length,
              rejected: rejected.map((r) => ({
                drawSlotId: r.play.drawSlotId,
                number: r.play.number,
                amount: r.play.amount,
                reason: r.reason,
              })),
              capped: (capped ?? []).map((c) => ({
                drawSlotId: c.play.drawSlotId,
                number: c.play.number,
                requested: c.requested,
                accepted: c.accepted,
                dropped: c.dropped,
                reason: c.reason,
              })),
            },
          },
        };
        const ticket = await createWebhookTicket(partialNormalized, log.id, apiSystem.id, tx);
        return { rejected: false, ticket, acceptedDetails: accepted, totalAmount: partialNormalized.totalAmount };
      }

      const quotaCheck = await checkTicketQuotas(normalized.details, tx);
      if (!quotaCheck.ok) {
        return { rejected: true, reason: quotaCheck.reason };
      }
      const ticket = await createWebhookTicket(normalized, log.id, apiSystem.id, tx);
      return { rejected: false, ticket };
    });

    if (txResult.rejected) {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: txResult.reason },
      });
      logger.warn(`[webhook] Rejected by quota — slug="${slug}" logId=${log.id} reason=${txResult.reason}`);
      return { status: 'rejected', logId: log.id, reason: txResult.reason };
    }

    const ticket = txResult.ticket;

    // Check if the log was updated to DUPLICATE by createWebhookTicket
    const currentLog = await prisma.webhookLog.findUnique({ where: { id: log.id } });
    if (currentLog?.status === 'DUPLICATE') {
      return { status: 'duplicate', logId: log.id, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
    }

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'PROCESSED' },
    });

    const result = { status: 'processed', logId: log.id, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };

    // Aceptación parcial: agregar items[] + totalAmount para que el controller
    // pueda devolver el desglose al proveedor.
    if (partialAcceptance && txResult.acceptedDetails) {
      result.totalAmount = txResult.totalAmount;
      result.items = txResult.acceptedDetails.map((d) => ({
        drawSlotId: d.drawSlotId,
        number: d.number,
        amount: d.amount,
      }));
    }

    return result;
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
