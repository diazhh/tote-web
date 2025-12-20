/**
 * Script para migrar mapeos de IDs externos de API (SRQ)
 * Migra la tabla api_draw_mappings de MySQL a ApiDrawMapping en PostgreSQL
 */

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createCaracasDate } from '../lib/dateUtils.js';

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

async function main() {
  console.log('🚀 Iniciando migración de mapeos de API...\n');

  const connection = await mysql.createConnection(mysqlConfig);
  console.log('✅ Conectado a MySQL legacy\n');

  try {
    // Obtener mapeo de IDs de juegos legacy a nuevos
    const games = await prisma.game.findMany();
    const gameIdMap = new Map();
    for (const game of games) {
      const legacyId = game.config?.legacyId;
      if (legacyId) {
        gameIdMap.set(legacyId, game.id);
      }
    }

    // Obtener mapeo de IDs de api_configurations legacy a nuevos
    const [apiConfigsRows] = await connection.query('SELECT * FROM api_configurations');
    const apiConfigs = await prisma.apiConfiguration.findMany();
    
    const apiConfigIdMap = new Map();
    for (const legacyConfig of apiConfigsRows) {
      // Buscar la configuración correspondiente en PostgreSQL
      const newGameId = gameIdMap.get(legacyConfig.game_id);
      if (newGameId) {
        const newConfig = apiConfigs.find(c => 
          c.gameId === newGameId && 
          c.type === (legacyConfig.type === 'planificacion' ? 'PLANNING' : 'SALES')
        );
        if (newConfig) {
          apiConfigIdMap.set(legacyConfig.id, newConfig.id);
        }
      }
    }

    // Obtener mapeo de planned_draws a Draw
    console.log('  Construyendo mapeo de sorteos...');
    const [plannedDrawsRows] = await connection.query(`
      SELECT pd.id, pd.game_id, pd.date, gd.time
      FROM planned_draws pd
      JOIN game_draws gd ON pd.game_draw_id = gd.id
      ORDER BY pd.id
    `);

    const plannedDrawMap = new Map();
    for (const pd of plannedDrawsRows) {
      const newGameId = gameIdMap.get(pd.game_id);
      if (newGameId) {
        const date = new Date(pd.date);
        const timeStr = pd.time || '12:00:00';
        const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
        
        // Crear fecha en zona horaria de Caracas y convertir a UTC (igual que en migrate-legacy.js)
        const scheduledAt = createCaracasDate(
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate(),
          hours,
          minutes,
          seconds
        );

        const key = `${newGameId}_${scheduledAt.toISOString()}`;
        plannedDrawMap.set(pd.id, key);
      }
    }

    // Obtener sorteos de PostgreSQL para hacer el mapeo
    console.log('  Cargando sorteos de PostgreSQL...');
    const draws = await prisma.draw.findMany({
      select: {
        id: true,
        gameId: true,
        scheduledAt: true
      }
    });

    const drawMap = new Map();
    for (const draw of draws) {
      const key = `${draw.gameId}_${draw.scheduledAt.toISOString()}`;
      drawMap.set(key, draw.id);
    }

    // Migrar api_draw_mappings
    console.log('  Consultando api_draw_mappings...');
    const [mappingsRows] = await connection.query(`
      SELECT * FROM api_draw_mappings
      ORDER BY id
    `);

    console.log(`  Encontrados ${mappingsRows.length} mapeos\n`);

    let migratedCount = 0;
    let noApiConfigCount = 0;
    let noDrawCount = 0;
    let duplicateCount = 0;

    console.log(`  Total apiConfigs mapeados: ${apiConfigIdMap.size}`);
    console.log(`  Total plannedDraws mapeados: ${plannedDrawMap.size}`);
    console.log(`  Total draws en PostgreSQL: ${drawMap.size}\n`);

    for (const mapping of mappingsRows) {
      const newApiConfigId = apiConfigIdMap.get(mapping.api_id);
      const plannedDrawKey = plannedDrawMap.get(mapping.planned_draw_id);
      const newDrawId = plannedDrawKey ? drawMap.get(plannedDrawKey) : null;

      if (!newApiConfigId) {
        noApiConfigCount++;
        if (noApiConfigCount <= 3) {
          console.log(`  Debug: No ApiConfig para api_id=${mapping.api_id}`);
        }
        continue;
      }
      
      if (!newDrawId) {
        noDrawCount++;
        if (noDrawCount <= 3) {
          console.log(`  Debug: No Draw para planned_draw_id=${mapping.planned_draw_id}, key=${plannedDrawKey}`);
        }
        continue;
      }

      // Verificar si ya existe
      const existing = await prisma.apiDrawMapping.findFirst({
        where: {
          apiConfigId: newApiConfigId,
          drawId: newDrawId
        }
      });

      if (existing) {
        duplicateCount++;
        continue;
      }

      // Crear el mapeo
      try {
        await prisma.apiDrawMapping.create({
          data: {
            apiConfigId: newApiConfigId,
            drawId: newDrawId,
            externalDrawId: mapping.external_draw_id
          }
        });

        migratedCount++;

        if (migratedCount % 100 === 0) {
          console.log(`  Progreso: ${migratedCount} mapeos migrados...`);
        }
      } catch (error) {
        console.warn(`  ⚠️  Error migrando mapeo ${mapping.id}:`, error.message);
      }
    }

    console.log(`\n✅ ${migratedCount} mapeos migrados`);
    console.log(`⚠️  Sin ApiConfig: ${noApiConfigCount}`);
    console.log(`⚠️  Sin Draw: ${noDrawCount}`);
    console.log(`⚠️  Duplicados: ${duplicateCount}`);
    console.log(`⚠️  Total omitidos: ${noApiConfigCount + noDrawCount + duplicateCount}`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
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
