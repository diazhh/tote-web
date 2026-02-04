#!/usr/bin/env node

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/prisma.js';
import apiIntegrationService from '../src/services/api-integration.service.js';
import logger from '../src/lib/logger.js';

async function syncTicketsByDate(dateStr) {
  try {
    logger.info(`🎫 Sincronizando tickets para ${dateStr}...`);
    
    const date = new Date(dateStr);
    const { getVenezuelaDateAsUTC } = await import('../src/lib/dateUtils.js');
    const drawDate = getVenezuelaDateAsUTC(date);
    
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: drawDate,
        apiMappings: {
          some: {}
        }
      },
      include: {
        game: true,
        apiMappings: true
      },
      orderBy: [
        { drawDate: 'asc' },
        { drawTime: 'asc' }
      ]
    });

    logger.info(`📊 ${draws.length} sorteos encontrados para ${dateStr}`);

    let totalImported = 0;
    let totalSkipped = 0;

    for (const draw of draws) {
      try {
        logger.info(`  🎯 ${draw.game.name} ${draw.drawTime}`);
        const result = await apiIntegrationService.importSRQTickets(draw.id, true);
        totalImported += result.imported || 0;
        totalSkipped += result.skipped || 0;
        
        if (result.tripleta && !result.tripleta.skipped) {
          logger.info(`     🎯 Tripletas: ${result.tripleta.processed || 0} procesadas`);
        }
      } catch (error) {
        logger.error(`  ✗ Error en ${draw.game.name} ${draw.drawTime}:`, error.message);
      }
    }

    logger.info(`\n✅ TOTAL: ${totalImported} tickets importados, ${totalSkipped} saltados`);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

const dateStr = process.argv[2] || '2026-01-27';
syncTicketsByDate(dateStr);
