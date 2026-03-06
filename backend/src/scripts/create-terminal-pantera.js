import { prisma } from '../lib/prisma.js';

const TRIPLE_PANTERA_ID = '69efc4d7-52cb-41a6-951d-be299590f393';
const SRQ_API_SYSTEM_ID = '022b1d7b-9e2f-4eaa-ab22-669976090fc2';
const TERMINAL_TOKEN = 'ad4d4523968aeb7a1c096baf5d2594594492d6ecdf4a0a70cb4d4ef46ad82ce7';

async function main() {
  console.log('=== Creando TERMINAL PANTERA ===');

  // 1. Crear Game (upsert por slug)
  const game = await prisma.game.upsert({
    where: { slug: 'terminal-pantera' },
    update: {
      name: 'TERMINAL PANTERA',
      type: 'TERMINAL',
      totalNumbers: 100,
      linkedGameId: TRIPLE_PANTERA_ID,
      isActive: true,
    },
    create: {
      name: 'TERMINAL PANTERA',
      slug: 'terminal-pantera',
      type: 'TERMINAL',
      totalNumbers: 100,
      linkedGameId: TRIPLE_PANTERA_ID,
      isActive: true,
      description: 'Ultimos 2 digitos del Triple Pantera. Multiplicador 50x.',
    },
  });
  console.log(`Game: ${game.id} (${game.name})`);

  // 2. Crear 100 GameItems (00-99) con multiplier 50x
  let itemsCreated = 0;
  for (let i = 0; i < 100; i++) {
    const number = String(i).padStart(2, '0');
    await prisma.gameItem.upsert({
      where: { gameId_number: { gameId: game.id, number } },
      update: { multiplier: 50.0 },
      create: {
        gameId: game.id,
        number,
        name: number,
        multiplier: 50.0,
        displayOrder: i,
      },
    });
    itemsCreated++;
  }
  console.log(`GameItems: ${itemsCreated} creados/actualizados (00-99, 50x)`);

  // 3. Crear DrawTemplate (mismos horarios que Triple)
  const drawTimes = [
    '08:00:00', '09:00:00', '10:00:00', '11:00:00',
    '12:00:00', '13:00:00', '14:00:00', '15:00:00',
    '16:00:00', '17:00:00', '18:00:00', '19:00:00',
  ];
  const daysOfWeek = [1, 2, 3, 4, 5, 6, 7];

  // Buscar template existente para este juego
  const existingTemplate = await prisma.drawTemplate.findFirst({
    where: { gameId: game.id },
  });

  if (existingTemplate) {
    await prisma.drawTemplate.update({
      where: { id: existingTemplate.id },
      data: { drawTimes, daysOfWeek, isActive: true },
    });
    console.log(`DrawTemplate actualizado: ${existingTemplate.id}`);
  } else {
    const template = await prisma.drawTemplate.create({
      data: {
        gameId: game.id,
        name: 'TERMINAL PANTERA - Diario',
        drawTimes,
        daysOfWeek,
        isActive: true,
      },
    });
    console.log(`DrawTemplate creado: ${template.id}`);
  }

  // 4. Crear ApiConfiguration PLANNING + SALES con token Terminal
  const API_CONFIGS = [
    { type: 'PLANNING', name: 'SRQ Planificación TERMINAL PANTERA', baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/loteries?date=' },
    { type: 'SALES', name: 'SRQ Ventas TERMINAL PANTERA', baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/tickets/' },
  ];

  for (const cfg of API_CONFIGS) {
    const existing = await prisma.apiConfiguration.findFirst({
      where: { gameId: game.id, type: cfg.type },
    });

    if (existing) {
      await prisma.apiConfiguration.update({
        where: { id: existing.id },
        data: { token: TERMINAL_TOKEN, isActive: true },
      });
      console.log(`ApiConfiguration ${cfg.type} actualizada`);
    } else {
      await prisma.apiConfiguration.create({
        data: {
          gameId: game.id,
          apiSystemId: SRQ_API_SYSTEM_ID,
          name: cfg.name,
          type: cfg.type,
          baseUrl: cfg.baseUrl,
          token: TERMINAL_TOKEN,
          isActive: true,
        },
      });
      console.log(`ApiConfiguration ${cfg.type} creada`);
    }
  }

  console.log('\n=== TERMINAL PANTERA creado exitosamente ===');
  console.log(`  Game ID: ${game.id}`);
  console.log(`  Linked to: Triple Pantera (${TRIPLE_PANTERA_ID})`);
  console.log(`  Items: 100 (00-99, 50x)`);
  console.log(`  Horarios: ${drawTimes.length} sorteos diarios`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
