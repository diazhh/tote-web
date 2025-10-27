/**
 * Script de migración de datos desde MySQL legacy a PostgreSQL
 * 
 * Este script migra:
 * - Juegos (games)
 * - Items de juegos (game_items)
 * - Sorteos históricos (game_draws + distribution_logs)
 */

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Configuración de MySQL legacy
const mysqlConfig = {
  host: process.env.LEGACY_DB_HOST || 'localhost',
  port: parseInt(process.env.LEGACY_DB_PORT || '3306'),
  user: process.env.LEGACY_DB_USER || 'root',
  password: process.env.LEGACY_DB_PASSWORD || '',
  database: process.env.LEGACY_DB_NAME || 'bot',
};

// Mapeo de juegos legacy a tipos nuevos
const GAME_TYPE_MAP = {
  1: 'ANIMALITOS',  // LOTOANIMALITO
  2: 'ROULETTE',    // LOTTOPANTERA (50 items = ruleta extendida)
  3: 'TRIPLE',      // TRIPLE PANTERA
};

async function main() {
  console.log('🚀 Iniciando migración de datos legacy...\n');

  // Conectar a MySQL
  const connection = await mysql.createConnection(mysqlConfig);
  console.log('✅ Conectado a MySQL legacy\n');

  try {
    // 1. Migrar Juegos
    await migrateGames(connection);

    // 2. Migrar Items de Juegos
    await migrateGameItems(connection);

    // 3. Migrar Sorteos (game_draws) como plantillas
    await migrateDrawTemplates(connection);

    // 4. Migrar Histórico de Distribuciones como Draws reales
    await migrateHistoricalDraws(connection);

    console.log('\n✅ Migración completada exitosamente!');
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await connection.end();
    await prisma.$disconnect();
  }
}

async function migrateGames(connection) {
  console.log('📦 Migrando juegos...');

  const [rows] = await connection.query('SELECT * FROM games ORDER BY id');
  const games = rows;

  for (const legacyGame of games) {
    const gameType = GAME_TYPE_MAP[legacyGame.id] || 'ANIMALITOS';
    
    // Determinar totalNumbers basado en el tipo
    let totalNumbers = 38; // Default para animalitos
    if (gameType === 'TRIPLE') totalNumbers = 1000;
    if (gameType === 'ROULETTE') totalNumbers = 50;

    const slug = legacyGame.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    await prisma.game.upsert({
      where: { slug },
      update: {
        name: legacyGame.name,
        type: gameType,
        totalNumbers,
        isActive: true,
        config: {
          legacyId: legacyGame.id,
          percentageToDistribute: parseFloat(legacyGame.percentage_to_distribute),
          closeMinutesBefore: legacyGame.close_minutes_before,
          webhookUrl: legacyGame.webhook_url,
        },
      },
      create: {
        name: legacyGame.name,
        type: gameType,
        slug,
        totalNumbers,
        isActive: true,
        config: {
          legacyId: legacyGame.id,
          percentageToDistribute: parseFloat(legacyGame.percentage_to_distribute),
          closeMinutesBefore: legacyGame.close_minutes_before,
          webhookUrl: legacyGame.webhook_url,
        },
      },
    });

    console.log(`  ✓ ${legacyGame.name} (${gameType})`);
  }

  console.log(`✅ ${games.length} juegos migrados\n`);
}

async function migrateGameItems(connection) {
  console.log('🎯 Migrando items de juegos...');

  const [rows] = await connection.query('SELECT * FROM game_items ORDER BY game_id, number');
  const items = rows;

  // Obtener mapeo de IDs legacy a nuevos
  const games = await prisma.game.findMany();
  const gameIdMap = new Map();
  
  for (const game of games) {
    const legacyId = game.config?.legacyId;
    if (legacyId) {
      gameIdMap.set(legacyId, game.id);
    }
  }

  let migratedCount = 0;
  for (const item of items) {
    const newGameId = gameIdMap.get(item.game_id);
    if (!newGameId) {
      console.warn(`  ⚠️  Game ID ${item.game_id} no encontrado, saltando item ${item.number}`);
      continue;
    }

    await prisma.gameItem.upsert({
      where: {
        gameId_number: {
          gameId: newGameId,
          number: item.number,
        },
      },
      update: {
        name: item.name,
        multiplier: parseFloat(item.multiplier),
        lastWin: item.last_win,
        isActive: true,
      },
      create: {
        gameId: newGameId,
        number: item.number,
        name: item.name,
        displayOrder: migratedCount,
        multiplier: parseFloat(item.multiplier),
        lastWin: item.last_win,
        isActive: true,
      },
    });

    migratedCount++;
  }

  console.log(`✅ ${migratedCount} items migrados\n`);
}

async function migrateDrawTemplates(connection) {
  console.log('📅 Migrando plantillas de sorteos...');

  const [rows] = await connection.query('SELECT * FROM game_draws ORDER BY game_id, time');
  const draws = rows;

  // Obtener mapeo de IDs legacy a nuevos
  const games = await prisma.game.findMany();
  const gameIdMap = new Map();
  
  for (const game of games) {
    const legacyId = game.config?.legacyId;
    if (legacyId) {
      gameIdMap.set(legacyId, game.id);
    }
  }

  // Agrupar por juego
  const drawsByGame = new Map();
  for (const draw of draws) {
    if (!drawsByGame.has(draw.game_id)) {
      drawsByGame.set(draw.game_id, []);
    }
    drawsByGame.get(draw.game_id).push(draw);
  }

  let templatesCreated = 0;
  for (const [legacyGameId, gameDraws] of drawsByGame) {
    const newGameId = gameIdMap.get(legacyGameId);
    if (!newGameId) {
      console.warn(`  ⚠️  Game ID ${legacyGameId} no encontrado`);
      continue;
    }

    const game = games.find(g => g.id === newGameId);
    if (!game) continue;

    // Crear plantilla para días laborables (Lun-Vie)
    const drawTimes = gameDraws.map(d => d.time);
    
    // Verificar si ya existe la plantilla
    const existingWeekday = await prisma.drawTemplate.findFirst({
      where: {
        gameId: newGameId,
        name: 'Plantilla Lunes-Viernes',
      },
    });

    if (!existingWeekday) {
      await prisma.drawTemplate.create({
        data: {
          gameId: newGameId,
          name: 'Plantilla Lunes-Viernes',
          description: `Sorteos de ${game.name} de Lunes a Viernes`,
          daysOfWeek: [1, 2, 3, 4, 5],
          drawTimes,
          isActive: true,
        },
      });
      templatesCreated++;
    }

    // Crear plantilla para fin de semana (Sáb-Dom)
    const existingWeekend = await prisma.drawTemplate.findFirst({
      where: {
        gameId: newGameId,
        name: 'Plantilla Fin de Semana',
      },
    });

    if (!existingWeekend) {
      await prisma.drawTemplate.create({
        data: {
          gameId: newGameId,
          name: 'Plantilla Fin de Semana',
          description: `Sorteos de ${game.name} Sábado y Domingo`,
          daysOfWeek: [6, 7],
          drawTimes,
          isActive: true,
        },
      });
      templatesCreated++;
    }

    console.log(`  ✓ ${game.name}: ${drawTimes.length} horarios configurados`);
  }

  console.log(`✅ ${templatesCreated} plantillas creadas\n`);
}

async function migrateHistoricalDraws(connection) {
  console.log('📊 Migrando datos históricos de sorteos...');

  // Obtener mapeo de IDs legacy a nuevos
  const games = await prisma.game.findMany();
  const gameIdMap = new Map();
  const gameDrawsMap = new Map(); // Mapeo de game_draw.id a draw template
  
  for (const game of games) {
    const legacyId = game.config?.legacyId;
    if (legacyId) {
      gameIdMap.set(legacyId, game.id);
    }
  }

  // Obtener todos los game_draws para mapear horarios
  const [drawsRows] = await connection.query('SELECT * FROM game_draws');
  for (const draw of drawsRows) {
    gameDrawsMap.set(draw.id, {
      gameId: draw.game_id,
      name: draw.name,
      time: draw.time,
    });
  }

  // Obtener logs de distribución (sorteos ejecutados)
  console.log('  Consultando distribution_logs...');
  const [logsRows] = await connection.query(`
    SELECT 
      dl.*,
      g.name as game_name,
      gcc.channel_type
    FROM distribution_logs dl
    LEFT JOIN games g ON dl.game_id = g.id
    LEFT JOIN game_channel_configurations gcc ON dl.channel_configuration_id = gcc.id
    ORDER BY dl.created_at ASC
  `);

  console.log(`  Encontrados ${logsRows.length} registros históricos`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const log of logsRows) {
    const newGameId = gameIdMap.get(log.game_id);
    if (!newGameId) {
      skippedCount++;
      continue;
    }

    // Parsear la fecha/hora del sorteo
    const scheduledAt = new Date(log.created_at);
    
    // Verificar si ya existe este sorteo
    const existing = await prisma.draw.findFirst({
      where: {
        gameId: newGameId,
        scheduledAt: scheduledAt,
      },
    });

    if (existing) {
      continue; // Ya existe, saltar
    }

    // Crear el sorteo histórico
    try {
      await prisma.draw.create({
        data: {
          gameId: newGameId,
          scheduledAt: scheduledAt,
          status: 'PUBLISHED', // Los históricos ya fueron publicados
          drawnAt: scheduledAt,
          publishedAt: scheduledAt,
          notes: `Migrado desde legacy - ${log.game_name || 'N/A'} - Canal: ${log.channel_type || 'N/A'}`,
        },
      });

      migratedCount++;

      if (migratedCount % 100 === 0) {
        console.log(`  Progreso: ${migratedCount} sorteos migrados...`);
      }
    } catch (error) {
      console.warn(`  ⚠️  Error migrando sorteo ${log.id}:`, error.message);
      skippedCount++;
    }
  }

  console.log(`✅ ${migratedCount} sorteos históricos migrados`);
  if (skippedCount > 0) {
    console.log(`⚠️  ${skippedCount} sorteos omitidos`);
  }
  console.log('');
}

// Ejecutar migración
main()
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
