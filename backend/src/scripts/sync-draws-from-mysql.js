/**
 * Script de sincronización de sorteos desde MySQL a PostgreSQL
 * 
 * Este script:
 * 1. Corrige las plantillas de sorteos (DrawTemplate) para que coincidan con MySQL
 * 2. Limpia sorteos históricos incorrectos en PostgreSQL
 * 3. Migra sorteos históricos con ganadores desde MySQL
 * 4. Asegura que las zonas horarias sean correctas
 */

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Configuración de MySQL
const mysqlConfig = {
  host: process.env.LEGACY_DB_HOST || 'localhost',
  port: parseInt(process.env.LEGACY_DB_PORT || '3306'),
  user: process.env.LEGACY_DB_USER || 'root',
  password: process.env.LEGACY_DB_PASSWORD || '',
  database: process.env.LEGACY_DB_NAME || 'bot',
  timezone: '+00:00' // UTC
};

// Mapeo de juegos MySQL -> PostgreSQL
const GAME_MAPPING = {
  1: 'LOTOANIMALITO',
  2: 'LOTTOPANTERA',
  3: 'TRIPLE PANTERA'
};

// Horarios correctos base (sin el test de 20:47)
const CORRECT_DRAW_TIMES = [
  '08:00:00',
  '09:00:00',
  '10:00:00',
  '11:00:00',
  '12:00:00',
  '13:00:00',
  '14:00:00',
  '15:00:00',
  '16:00:00',
  '17:00:00',
  '18:00:00',
  '19:00:00'
];

async function main() {
  console.log('🔄 Iniciando sincronización de sorteos...\n');

  // Conectar a MySQL
  const mysqlConn = await mysql.createConnection(mysqlConfig);
  console.log('✅ Conectado a MySQL');

  try {
    // Paso 1: Corregir DrawTemplates
    await fixDrawTemplates();

    // Paso 2: Obtener mapeo de juegos
    const gameMapping = await getGameMapping();

    // Paso 3: Obtener mapeo de items
    const itemMapping = await getItemMapping(mysqlConn, gameMapping);

    // Paso 4: Limpiar sorteos futuros/incorrectos
    await cleanIncorrectDraws();

    // Paso 5: Migrar sorteos históricos
    await migrateHistoricalDraws(mysqlConn, gameMapping, itemMapping);

    console.log('\n✅ Sincronización completada exitosamente');
  } catch (error) {
    console.error('❌ Error durante la sincronización:', error);
    throw error;
  } finally {
    await mysqlConn.end();
    await prisma.$disconnect();
  }
}

/**
 * Corrige las plantillas de sorteos para que coincidan con MySQL
 */
async function fixDrawTemplates() {
  console.log('\n📝 Corrigiendo DrawTemplates...');

  const templates = await prisma.drawTemplate.findMany({
    include: { game: true }
  });

  for (const template of templates) {
    // Verificar si tiene el horario incorrecto 20:47:00
    if (template.drawTimes.includes('20:47:00')) {
      console.log(`  ⚠️  ${template.game.name} - ${template.name}: Removiendo horario 20:47:00`);
      
      await prisma.drawTemplate.update({
        where: { id: template.id },
        data: {
          drawTimes: CORRECT_DRAW_TIMES
        }
      });
      
      console.log(`  ✅ Plantilla actualizada`);
    }
  }
}

/**
 * Obtiene el mapeo de IDs de juegos MySQL -> PostgreSQL
 */
async function getGameMapping() {
  console.log('\n🎮 Obteniendo mapeo de juegos...');
  
  const games = await prisma.game.findMany({
    select: { id: true, name: true }
  });

  const mapping = {};
  for (const [mysqlId, gameName] of Object.entries(GAME_MAPPING)) {
    const game = games.find(g => g.name === gameName);
    if (game) {
      mapping[mysqlId] = game.id;
      console.log(`  ${gameName}: MySQL ID ${mysqlId} -> PostgreSQL ID ${game.id}`);
    } else {
      console.warn(`  ⚠️  No se encontró el juego ${gameName} en PostgreSQL`);
    }
  }

  return mapping;
}

/**
 * Obtiene el mapeo de items (números/animales) MySQL -> PostgreSQL
 */
async function getItemMapping(mysqlConn, gameMapping) {
  console.log('\n🔢 Obteniendo mapeo de items...');

  const [mysqlItems] = await mysqlConn.query(`
    SELECT id, game_id, name, number 
    FROM game_items 
    ORDER BY game_id, id
  `);

  const pgItems = await prisma.gameItem.findMany({
    select: { id: true, gameId: true, name: true, number: true }
  });

  const mapping = {};
  let mapped = 0;
  let notFound = 0;

  for (const mysqlItem of mysqlItems) {
    const pgGameId = gameMapping[mysqlItem.game_id];
    if (!pgGameId) continue;

    // Buscar por número primero (más confiable)
    let pgItem = pgItems.find(
      item => item.gameId === pgGameId && item.number === mysqlItem.number
    );

    // Si no se encuentra por número, buscar por nombre
    if (!pgItem) {
      pgItem = pgItems.find(
        item => item.gameId === pgGameId && item.name === mysqlItem.name
      );
    }

    if (pgItem) {
      mapping[mysqlItem.id] = pgItem.id;
      mapped++;
    } else {
      console.warn(`  ⚠️  No se encontró item: ${mysqlItem.name} (${mysqlItem.number}) del juego ${mysqlItem.game_id}`);
      notFound++;
    }
  }

  console.log(`  ✅ Items mapeados: ${mapped}`);
  if (notFound > 0) {
    console.log(`  ⚠️  Items no encontrados: ${notFound}`);
  }

  return mapping;
}

/**
 * Limpia sorteos incorrectos o de prueba
 */
async function cleanIncorrectDraws() {
  console.log('\n🧹 Limpiando sorteos incorrectos...');

  // Eliminar sorteos con horario 20:47 (sorteo de prueba)
  const deleted = await prisma.draw.deleteMany({
    where: {
      scheduledAt: {
        gte: new Date('2025-01-01'),
      },
      OR: [
        {
          scheduledAt: {
            // Buscar sorteos a las 20:47 UTC (que serían 16:47 local -04:00)
            gte: new Date('2025-10-02T00:47:00.000Z'),
            lt: new Date('2025-10-02T00:48:00.000Z')
          }
        }
      ]
    }
  });

  console.log(`  ✅ Sorteos eliminados: ${deleted.count}`);
}

/**
 * Migra sorteos históricos con ganadores desde MySQL
 */
async function migrateHistoricalDraws(mysqlConn, gameMapping, itemMapping) {
  console.log('\n📦 Migrando sorteos históricos...');

  // Obtener TODOS los sorteos totalizados de MySQL (históricos completos)
  const [historicalDraws] = await mysqlConn.query(`
    SELECT 
      pd.id,
      pd.game_id,
      pd.game_draw_id,
      DATE_FORMAT(pd.date, '%Y-%m-%d') as date_str,
      pd.status,
      pd.winner_item_id,
      pd.override_winner_item_id,
      gd.time as draw_time,
      gd.name as draw_name
    FROM planned_draws pd
    JOIN game_draws gd ON pd.game_draw_id = gd.id
    WHERE pd.status = 'totalizado'
      AND pd.winner_item_id IS NOT NULL
    ORDER BY pd.date ASC, gd.time ASC
  `);

  console.log(`  📊 Sorteos históricos encontrados: ${historicalDraws.length}`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const draw of historicalDraws) {
    try {
      const pgGameId = gameMapping[draw.game_id];
      if (!pgGameId) {
        skipped++;
        continue;
      }

      // Determinar el item ganador (override tiene prioridad)
      const winnerItemId = draw.override_winner_item_id || draw.winner_item_id;
      const pgWinnerItemId = itemMapping[winnerItemId];

      if (!pgWinnerItemId) {
        console.warn(`  ⚠️  Item ganador no encontrado: ${winnerItemId} para sorteo ${draw.id}`);
        skipped++;
        continue;
      }

      // Construir la fecha/hora del sorteo
      // date_str viene como "YYYY-MM-DD" directamente de MySQL
      const [hours, minutes, seconds] = draw.draw_time.split(':');
      
      // Crear timestamp manteniendo la hora exacta de MySQL
      // MySQL guarda la hora local (ej: 17:00), PostgreSQL la guardará igual
      const timeStr = `${draw.date_str}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${(seconds || '00').padStart(2, '0')}.000Z`;
      const scheduledAt = new Date(timeStr);

      // Verificar si ya existe este sorteo
      const existing = await prisma.draw.findFirst({
        where: {
          gameId: pgGameId,
          scheduledAt: scheduledAt,
          status: 'DRAWN'
        }
      });

      if (existing) {
        // Actualizar si no tiene ganador
        if (!existing.winnerItemId) {
          await prisma.draw.update({
            where: { id: existing.id },
            data: {
              winnerItemId: pgWinnerItemId,
              status: 'DRAWN',
              drawnAt: scheduledAt
            }
          });
          migrated++;
        } else {
          skipped++;
        }
      } else {
        // Crear nuevo sorteo histórico
        await prisma.draw.create({
          data: {
            gameId: pgGameId,
            scheduledAt: scheduledAt,
            status: 'DRAWN',
            winnerItemId: pgWinnerItemId,
            drawnAt: scheduledAt,
            closedAt: new Date(scheduledAt.getTime() - 5 * 60 * 1000), // 5 min antes
            notes: `Migrado desde MySQL (ID: ${draw.id})`
          }
        });
        migrated++;
      }

      if (migrated % 50 === 0) {
        console.log(`  📈 Progreso: ${migrated} migrados, ${skipped} omitidos`);
      }

    } catch (error) {
      console.error(`  ❌ Error migrando sorteo ${draw.id}:`, error.message);
      errors++;
    }
  }

  console.log(`\n  ✅ Migración completada:`);
  console.log(`     - Migrados: ${migrated}`);
  console.log(`     - Omitidos: ${skipped}`);
  console.log(`     - Errores: ${errors}`);
}

// Ejecutar
main()
  .catch(console.error)
  .finally(() => process.exit());
