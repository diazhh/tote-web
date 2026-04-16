import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Backfill apiSystemId on existing WEBHOOK_PUSH tickets.
 * Idempotent: only touches tickets where apiSystemId IS NULL.
 *
 * Resolution order:
 *   1. providerData.providerSlug -> ApiSystem.slug -> id
 *   2. fallback: WebhookLog with matching ticketId -> apiSystemId
 *      NOTE: The current schema does not define `ticketId` on WebhookLog;
 *      the fallback is wrapped in a try/catch so the script remains safe
 *      if Prisma rejects the query. Unresolved tickets are logged as
 *      warnings and counted as `skipped` — they can be addressed manually.
 */
export async function backfill({ batchSize = 500 } = {}) {
  const systems = await prisma.apiSystem.findMany({ select: { id: true, slug: true } });
  const slugToId = new Map(systems.map((s) => [s.slug, s.id]));

  let updated = 0;
  let skipped = 0;
  let processed = 0;

  while (true) {
    const batch = await prisma.ticket.findMany({
      where: { source: 'WEBHOOK_PUSH', apiSystemId: null },
      take: batchSize,
      select: { id: true, providerData: true },
    });
    if (batch.length === 0) break;

    for (const t of batch) {
      processed++;
      let apiSystemId = null;

      const slug = t.providerData?.providerSlug;
      if (slug && slugToId.has(slug)) {
        apiSystemId = slugToId.get(slug);
      } else {
        try {
          const log = await prisma.webhookLog.findFirst({
            where: { ticketId: t.id },
            select: { apiSystemId: true },
          });
          if (log?.apiSystemId) apiSystemId = log.apiSystemId;
        } catch (err) {
          // WebhookLog may not expose `ticketId` in the live schema; swallow and skip.
          logger.warn(`WebhookLog fallback lookup failed for ticket ${t.id}: ${err.message}`);
        }
      }

      if (apiSystemId) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: { apiSystemId },
        });
        updated++;
      } else {
        skipped++;
        logger.warn(`Could not resolve apiSystemId for ticket ${t.id}`);
      }
    }

    if (batch.length < batchSize) break;
  }

  logger.info(`Backfill finished: processed=${processed} updated=${updated} skipped=${skipped}`);
  return { processed, updated, skipped };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  backfill()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      logger.error('Backfill failed:', err);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
