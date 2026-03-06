/**
 * Script para generar sorteos Terminal Pantera manualmente
 * y ejecutar la sincronizacion SRQ (planning mapping)
 *
 * Uso: node --experimental-modules src/scripts/generate-terminal-draws.js
 */
import { prisma } from '../lib/prisma.js';

const TERMINAL_GAME_ID = '741ef8e9-129b-446b-abad-d00f68323f1c';
const TEMPLATE_ID = '49345386-2aa4-459d-9f29-22a9ddcb5e0e';
const DRAW_TIMES = [
  '08:00:00', '09:00:00', '10:00:00', '11:00:00',
  '12:00:00', '13:00:00', '14:00:00', '15:00:00',
  '16:00:00', '17:00:00', '18:00:00', '19:00:00',
];

async function generateDrawsForDate(drawDate, label) {
  let created = 0;
  let skipped = 0;

  for (const time of DRAW_TIMES) {
    const existing = await prisma.draw.findFirst({
      where: { gameId: TERMINAL_GAME_ID, drawDate, drawTime: time },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.draw.create({
      data: {
        gameId: TERMINAL_GAME_ID,
        templateId: TEMPLATE_ID,
        drawDate,
        drawTime: time,
        status: 'SCHEDULED',
      },
    });
    created++;
  }
  console.log(`${label}: ${created} creados, ${skipped} ya existian`);
  return created;
}

async function main() {
  try {
    // Today = 2026-03-06 in Venezuela (UTC-4 => stored as 04:00 UTC)
    const today = new Date('2026-03-06T04:00:00.000Z');
    const tomorrow = new Date('2026-03-07T04:00:00.000Z');

    console.log('=== Generando sorteos TERMINAL PANTERA ===\n');

    await generateDrawsForDate(today, 'HOY (2026-03-06)');
    await generateDrawsForDate(tomorrow, 'MANANA (2026-03-07)');

    // Verify
    const count = await prisma.draw.count({
      where: { gameId: TERMINAL_GAME_ID, drawDate: { gte: today } },
    });
    console.log(`\nTotal sorteos Terminal desde hoy: ${count}`);

    // Now run SRQ planning sync for Terminal
    console.log('\n=== Sincronizando planificacion SRQ ===\n');
    const apiIntegrationService = (await import('../services/api-integration.service.js')).default;

    try {
      const resultToday = await apiIntegrationService.syncSRQPlanning(new Date('2026-03-06'));
      console.log(`HOY: ${resultToday.mapped} mapeados, ${resultToday.skipped} saltados`);
    } catch (e) {
      console.log(`HOY sync error: ${e.message}`);
    }

    try {
      const resultTomorrow = await apiIntegrationService.syncSRQPlanning(new Date('2026-03-07'));
      console.log(`MANANA: ${resultTomorrow.mapped} mapeados, ${resultTomorrow.skipped} saltados`);
    } catch (e) {
      console.log(`MANANA sync error: ${e.message}`);
    }

    // Show terminal draws with their api mappings
    const draws = await prisma.draw.findMany({
      where: { gameId: TERMINAL_GAME_ID, drawDate: today },
      include: { apiMappings: true },
      orderBy: { drawTime: 'asc' },
    });

    console.log('\n=== Estado sorteos Terminal HOY ===\n');
    for (const d of draws) {
      const mapped = d.apiMappings.length > 0 ? `SRQ: ${d.apiMappings[0].externalDrawId}` : 'sin mapeo SRQ';
      console.log(`  ${d.drawTime} | ${d.status} | ${mapped}`);
    }

    console.log('\nListo! Los sorteos Terminal se ejecutaran en cascada cuando el Triple se ejecute.');
    console.log('La venta se importara via sync-api-tickets cada 5 min si tiene mapeo SRQ.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
