/**
 * Script para sincronizar números ganadores desde planned_draws de MySQL
 * a los Draw de PostgreSQL
 */

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const mysqlConfig = {
  host: process.env.LEGACY_DB_HOST || '144.126.150.120',
  port: parseInt(process.env.LEGACY_DB_PORT || '3706'),
  user: process.env.LEGACY_DB_USER || 'diazhh',
  password: process.env.LEGACY_DB_PASSWORD || 'Telecom2025*',
  database: process.env.LEGACY_DB_NAME || 'bot',
};

async function main() {
  console.log('🔄 Sincronizando números ganadores desde MySQL...\n');

  const connection = await mysql.createConnection(mysqlConfig);
  console.log('✅ Conectado a MySQL\n');

  try {
    // Obtener mapeo de juegos
    const games = await prisma.game.findMany();
    const gameIdMap = new Map();
    
    for (const game of games) {
      const legacyId = game.config?.legacyId;
      if (legacyId) {
        gameIdMap.set(legacyId, game.id);
      }
    }

    // Obtener mapeo de game_draws (horarios) a sus tiempos
    const [gameDraws] = await connection.query('SELECT id, game_id, time FROM game_draws');
    const drawTimeMap = new Map();
    for (const gd of gameDraws) {
      drawTimeMap.set(gd.id, { gameId: gd.game_id, time: gd.time });
    }

    // Obtener planned_draws con winner_item_id
    console.log('📊 Obteniendo sorteos planificados con ganadores...');
    const [plannedDraws] = await connection.query(`
      SELECT 
        pd.id,
        pd.game_id,
        pd.game_draw_id,
        pd.date,
        pd.status,
        pd.winner_item_id,
        pd.override_winner_item_id,
        gd.time as draw_time,
        gi.number as winner_number,
        gi.name as winner_name
      FROM planned_draws pd
      LEFT JOIN game_draws gd ON pd.game_draw_id = gd.id
      LEFT JOIN game_items gi ON COALESCE(pd.override_winner_item_id, pd.winner_item_id) = gi.id
      WHERE pd.status = 'totalizado'
      ORDER BY pd.date DESC, gd.time DESC
    `);

    console.log(`  Encontrados ${plannedDraws.length} sorteos totalizados\n`);

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const pd of plannedDraws) {
      const newGameId = gameIdMap.get(pd.game_id);
      if (!newGameId) continue;

      // Construir fecha/hora del sorteo
      const drawDate = new Date(pd.date);
      const [hours, minutes, seconds] = (pd.draw_time || '00:00:00').split(':');
      drawDate.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds || 0));

      // Buscar el Draw correspondiente en PostgreSQL
      // Usar rango de 30 minutos para coincidir con sorteos que tienen segundos diferentes
      const draw = await prisma.draw.findFirst({
        where: {
          gameId: newGameId,
          scheduledAt: {
            gte: new Date(drawDate.getTime() - 30 * 60000), // -30 min
            lte: new Date(drawDate.getTime() + 30 * 60000), // +30 min
          },
          winnerItemId: null, // Solo actualizar los que no tienen ganador
        },
      });

      if (!draw) {
        notFoundCount++;
        continue;
      }

      // Obtener el winnerNumber para buscar el GameItem
      const winnerNumber = pd.winner_number;
      if (!winnerNumber) continue;

      // Buscar el GameItem correspondiente
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId: newGameId,
          number: winnerNumber,
        },
      });

      if (!gameItem) {
        console.warn(`  ⚠️  GameItem no encontrado: game=${newGameId}, number=${winnerNumber}`);
        continue;
      }

      // Actualizar el Draw con el winnerItemId
      await prisma.draw.update({
        where: { id: draw.id },
        data: {
          winnerItemId: gameItem.id,
          status: 'PUBLISHED',
        },
      });

      updatedCount++;

      if (updatedCount % 500 === 0) {
        console.log(`  Progreso: ${updatedCount} sorteos actualizados...`);
      }
    }

    console.log(`\n✅ ${updatedCount} sorteos actualizados con número ganador`);
    if (notFoundCount > 0) {
      console.log(`⚠️  ${notFoundCount} sorteos no encontrados en PostgreSQL`);
    }

  } finally {
    await connection.end();
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
