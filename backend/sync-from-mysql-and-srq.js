#!/usr/bin/env node
/**
 * Script para sincronización COMPLETA desde MySQL remoto y SRQ
 * 
 * PROCESO:
 * 1. LIMPIA datos locales (PostgreSQL):
 *    - Borra todos los sorteos (Draw)
 *    - Borra todas las ventas (Ticket)
 *    - Borra todos los mappings (ApiDrawMapping)
 * 
 * 2. IMPORTA desde MySQL remoto:
 *    - Sorteos (planned_draws) con sus ganadores
 *    - IDs externos de SRQ (api_draw_mappings)
 *    - Crea Draw + ApiDrawMapping en PostgreSQL
 * 
 * 3. SINCRONIZA ventas desde SRQ:
 *    - Usa external_draw_id para consultar API de SRQ
 *    - Importa todos los tickets
 *    - Crea Ticket + TicketDetail en PostgreSQL
 * 
 * Uso:
 *   node sync-from-mysql-and-srq.js [fechaInicio] [fechaFin]
 *   
 * Ejemplos:
 *   node sync-from-mysql-and-srq.js 2025-01-01 2025-12-22
 *   node sync-from-mysql-and-srq.js                          (últimos 30 días)
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import logger from './src/lib/logger.js';
import apiIntegrationService from './src/services/api-integration.service.js';
import { createCaracasDate } from './src/lib/dateUtils.js';

const prisma = new PrismaClient();

// Configuración MySQL remoto
const MYSQL_CONFIG = {
  host: process.env.LEGACY_DB_HOST || '144.126.150.120',
  port: parseInt(process.env.LEGACY_DB_PORT || '3706'),
  user: process.env.LEGACY_DB_USER || 'diazhh',
  password: process.env.LEGACY_DB_PASSWORD || 'Telecom2025*',
  database: process.env.LEGACY_DB_NAME || 'bot',
  timezone: 'Z',
  dateStrings: true
};

// Mapeo de juegos MySQL -> PostgreSQL
const GAME_SLUG_MAP = {
  1: 'lotoanimalito',
  2: 'lottopantera',
  3: 'triple-pantera'
};

/**
 * Paso 1: Limpiar datos locales
 */
async function cleanLocalData() {
  console.log('\n🗑️  PASO 1: LIMPIANDO DATOS LOCALES\n');
  
  try {
    // Eliminar en orden correcto por las relaciones
    console.log('   Eliminando tickets...');
    const tickets = await prisma.ticket.deleteMany({});
    console.log(`   ✅ ${tickets.count} tickets eliminados`);
    
    console.log('   Eliminando mappings de API...');
    const mappings = await prisma.apiDrawMapping.deleteMany({});
    console.log(`   ✅ ${mappings.count} mappings eliminados`);
    
    console.log('   Eliminando sorteos...');
    const draws = await prisma.draw.deleteMany({});
    console.log(`   ✅ ${draws.count} sorteos eliminados`);
    
    console.log('\n✨ Datos locales limpiados\n');
  } catch (error) {
    console.error('❌ Error limpiando datos locales:', error.message);
    throw error;
  }
}

/**
 * Paso 2: Importar sorteos desde MySQL
 */
async function importDrawsFromMySQL(mysqlConn, startDate, endDate) {
  console.log('📥 PASO 2: IMPORTANDO SORTEOS DESDE MYSQL\n');
  
  try {
    // Obtener mapeo de juegos local
    const games = await prisma.game.findMany();
    const gameMap = new Map();
    games.forEach(game => {
      const mysqlId = Object.keys(GAME_SLUG_MAP).find(
        key => GAME_SLUG_MAP[key] === game.slug
      );
      if (mysqlId) {
        gameMap.set(parseInt(mysqlId), game.id);
      }
    });

    console.log(`   Juegos mapeados: ${gameMap.size}`);

    // Obtener mapeo de game_items (números) MySQL -> PostgreSQL
    console.log('   Construyendo mapeo de números...');
    const [mysqlItems] = await mysqlConn.query(`
      SELECT id, game_id, number FROM game_items
    `);
    
    const itemMap = new Map();
    for (const mysqlItem of mysqlItems) {
      const pgGameId = gameMap.get(mysqlItem.game_id);
      if (pgGameId) {
        const pgItem = await prisma.gameItem.findFirst({
          where: {
            gameId: pgGameId,
            number: mysqlItem.number
          }
        });
        if (pgItem) {
          itemMap.set(mysqlItem.id, pgItem.id);
        }
      }
    }

    console.log(`   Items mapeados: ${itemMap.size}`);

    // Construir filtro de fechas
    const dateFilter = startDate && endDate 
      ? `AND pd.date BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    // Obtener sorteos de MySQL con sus mappings
    console.log('   Consultando MySQL...');
    const [mysqlDraws] = await mysqlConn.query(`
      SELECT 
        pd.id,
        pd.game_id,
        pd.game_draw_id,
        pd.date as draw_date,
        pd.status,
        pd.winner_item_id,
        pd.override_winner_item_id,
        pd.created_at,
        gd.time as draw_time,
        adm.external_draw_id,
        adm.api_id
      FROM planned_draws pd
      JOIN game_draws gd ON pd.game_draw_id = gd.id
      LEFT JOIN api_draw_mappings adm ON pd.id = adm.planned_draw_id
      WHERE 1=1 ${dateFilter}
      ORDER BY pd.date ASC, gd.time ASC
    `);

    console.log(`   📊 ${mysqlDraws.length} sorteos encontrados en MySQL\n`);

    const stats = {
      total: mysqlDraws.length,
      created: 0,
      withWinner: 0,
      withMapping: 0,
      skipped: 0,
      errors: 0
    };

    // Procesar en lotes
    const BATCH_SIZE = 100;
    for (let i = 0; i < mysqlDraws.length; i += BATCH_SIZE) {
      const batch = mysqlDraws.slice(i, i + BATCH_SIZE);
      
      console.log(`   Procesando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mysqlDraws.length / BATCH_SIZE)}...`);

      for (const mysqlDraw of batch) {
        try {
          const gameId = gameMap.get(mysqlDraw.game_id);
          if (!gameId) {
            stats.skipped++;
            continue;
          }

          // Convertir fecha y hora a UTC (hora de Caracas)
          const [year, month, day] = mysqlDraw.draw_date.split('-').map(Number);
          const [hours, minutes, seconds = 0] = (mysqlDraw.draw_time || '00:00:00').split(':').map(Number);
          const scheduledAt = createCaracasDate(year, month, day, hours, minutes, seconds);
          
          // Buscar ganador si existe
          let winnerItemId = null;
          const winnerMysqlId = mysqlDraw.override_winner_item_id || mysqlDraw.winner_item_id;
          if (winnerMysqlId) {
            winnerItemId = itemMap.get(winnerMysqlId);
            if (winnerItemId) {
              stats.withWinner++;
            }
          }

          // Determinar status
          let status = 'SCHEDULED';
          let drawnAt = null;
          if (mysqlDraw.status === 'totalizado' || winnerItemId) {
            status = 'DRAWN';
            drawnAt = new Date();
          } else if (mysqlDraw.status === 'cerrado') {
            status = 'CLOSED';
          }

          // Crear sorteo en PostgreSQL
          const draw = await prisma.draw.create({
            data: {
              gameId,
              drawDate: new Date(mysqlDraw.draw_date),
              drawTime: mysqlDraw.draw_time,
              scheduledAt,
              status,
              winnerItemId,
              drawnAt,
              createdAt: new Date(mysqlDraw.created_at)
            }
          });

          stats.created++;

          // Crear mapping si existe external_draw_id
          if (mysqlDraw.external_draw_id) {
            // Obtener la configuración de API correspondiente
            const apiConfig = await prisma.apiConfiguration.findFirst({
              where: {
                gameId,
                type: 'PLANNING',
                isActive: true
              }
            });

            if (apiConfig) {
              await prisma.apiDrawMapping.create({
                data: {
                  apiConfigId: apiConfig.id,
                  drawId: draw.id,
                  externalDrawId: mysqlDraw.external_draw_id.toString()
                }
              });
              stats.withMapping++;
            }
          }

        } catch (error) {
          logger.error(`Error procesando sorteo MySQL ${mysqlDraw.id}:`, error.message);
          stats.errors++;
        }
      }
    }

    console.log('\n   📊 Resumen de importación:');
    console.log(`      Total: ${stats.total}`);
    console.log(`      Creados: ${stats.created}`);
    console.log(`      Con ganador: ${stats.withWinner}`);
    console.log(`      Con mapping SRQ: ${stats.withMapping}`);
    console.log(`      Saltados: ${stats.skipped}`);
    console.log(`      Errores: ${stats.errors}`);
    console.log('\n✨ Sorteos importados desde MySQL\n');

    return stats;
  } catch (error) {
    console.error('❌ Error importando sorteos desde MySQL:', error.message);
    throw error;
  }
}

/**
 * Paso 3: Sincronizar tickets desde SRQ
 */
async function syncTicketsFromSRQ(startDate, endDate) {
  console.log('🎫 PASO 3: SINCRONIZANDO TICKETS DESDE SRQ\n');
  
  try {
    // Construir filtro de fechas
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.drawDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Obtener sorteos que tienen mapping
    const draws = await prisma.draw.findMany({
      where: {
        ...whereClause,
        apiMappings: {
          some: {}
        }
      },
      include: {
        apiMappings: true,
        game: true
      },
      orderBy: { scheduledAt: 'asc' }
    });

    console.log(`   Sorteos con mapping: ${draws.length}\n`);

    if (draws.length === 0) {
      console.log('   ⚠️  No hay sorteos con mapping de SRQ');
      return { total: 0, imported: 0, errors: 0 };
    }

    const stats = {
      total: draws.length,
      imported: 0,
      errors: 0,
      totalTickets: 0
    };

    for (let i = 0; i < draws.length; i++) {
      const draw = draws[i];
      const progress = `[${i + 1}/${draws.length}]`;
      
      const hora = draw.scheduledAt.toLocaleTimeString('es-VE', { 
        timeZone: 'America/Caracas', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      console.log(`   ${progress} ${draw.game.name} ${hora} (${draw.drawDate.toISOString().split('T')[0]})`);

      try {
        // Importar tickets para este sorteo
        const result = await apiIntegrationService.importSRQTickets(draw.id, true);
        
        if (result.imported > 0) {
          console.log(`      ✅ ${result.imported} tickets importados`);
          stats.imported++;
          stats.totalTickets += result.imported;
        } else {
          console.log(`      ℹ️  Sin tickets`);
        }
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
        stats.errors++;
      }

      // Pausa cada 10 sorteos
      if ((i + 1) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n   📊 Resumen de tickets:');
    console.log(`      Sorteos procesados: ${stats.total}`);
    console.log(`      Exitosos: ${stats.imported}`);
    console.log(`      Errores: ${stats.errors}`);
    console.log(`      Total tickets: ${stats.totalTickets}`);
    console.log('\n✨ Tickets sincronizados desde SRQ\n');

    return stats;
  } catch (error) {
    console.error('❌ Error sincronizando tickets desde SRQ:', error.message);
    throw error;
  }
}

/**
 * Main
 */
async function main() {
  console.log('🚀 SINCRONIZACIÓN COMPLETA: MySQL → PostgreSQL + SRQ\n');
  
  let mysqlConn;
  
  try {
    let startDate, endDate;

    // Parsear argumentos de línea de comandos
    if (process.argv.length >= 4) {
      startDate = process.argv[2];
      endDate = process.argv[3];
      
      // Validar formato de fechas
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        console.error('❌ Formato de fechas inválido. Use: YYYY-MM-DD');
        process.exit(1);
      }
    } else {
      // Por defecto: últimos 30 días
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    }

    console.log(`📅 Rango de fechas: ${startDate} a ${endDate}\n`);

    // Conectar a MySQL
    console.log('🔌 Conectando a MySQL remoto...');
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado a MySQL\n');

    // PASO 1: Limpiar datos locales
    await cleanLocalData();

    // PASO 2: Importar sorteos desde MySQL
    const drawStats = await importDrawsFromMySQL(mysqlConn, startDate, endDate);

    // PASO 3: Sincronizar tickets desde SRQ
    const ticketStats = await syncTicketsFromSRQ(startDate, endDate);

    // Resumen final
    console.log('='.repeat(60));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(60));
    console.log(`\n📅 Rango: ${startDate} a ${endDate}`);
    console.log(`\n📥 Sorteos importados:`);
    console.log(`   Total: ${drawStats.created}`);
    console.log(`   Con ganador: ${drawStats.withWinner}`);
    console.log(`   Con mapping SRQ: ${drawStats.withMapping}`);
    console.log(`\n🎫 Tickets importados:`);
    console.log(`   Sorteos procesados: ${ticketStats.total}`);
    console.log(`   Total tickets: ${ticketStats.totalTickets}`);
    console.log('\n✨ Sincronización completa finalizada\n');

  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  } finally {
    if (mysqlConn) {
      await mysqlConn.end();
    }
    await prisma.$disconnect();
  }
}

main();
