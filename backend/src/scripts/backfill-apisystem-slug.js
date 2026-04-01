// backend/src/scripts/backfill-apisystem-slug.js
// One-time backfill: sets slug='srq' and mode='PULL' on the SRQ ApiSystem row.
// Run AFTER prisma db push with nullable slug (step 1) and BEFORE step 2 (slug @unique).
// SRQ UUID is identical in both local and production databases.
import { prisma } from '../lib/prisma.js';

const SRQ_UUID = '022b1d7b-9e2f-4eaa-ab22-669976090fc2';

async function backfill() {
  console.log('Starting ApiSystem slug backfill...');

  const existing = await prisma.apiSystem.findUnique({
    where: { id: SRQ_UUID },
    select: { id: true, name: true, slug: true, mode: true },
  });

  if (!existing) {
    console.error(`ERROR: ApiSystem row not found for UUID ${SRQ_UUID}`);
    process.exit(1);
  }

  console.log('Found row:', existing);

  if (existing.slug !== null) {
    console.log('Slug already set — skipping backfill (idempotent).');
    await prisma.$disconnect();
    return;
  }

  const updated = await prisma.apiSystem.update({
    where: { id: SRQ_UUID },
    data: {
      slug: 'srq',
      mode: 'PULL',
    },
    select: { id: true, name: true, slug: true, mode: true },
  });

  console.log('Backfill complete:', updated);
  await prisma.$disconnect();
}

backfill().catch(e => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
