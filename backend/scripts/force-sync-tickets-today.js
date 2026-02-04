#!/usr/bin/env node

import { config } from 'dotenv';
config();

import syncApiTicketsJob from '../src/jobs/sync-api-tickets.job.js';
import logger from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';

async function forceSyncTicketsToday() {
  try {
    logger.info('🔧 Forzando sincronización de tickets de HOY desde SRQ...');
    const results = await syncApiTicketsJob.executeForToday();
    
    logger.info('\n📊 RESUMEN DE SINCRONIZACIÓN:');
    logger.info('='.repeat(60));
    
    let totalImported = 0;
    let totalSkipped = 0;
    let totalDeleted = 0;
    
    for (const result of results) {
      if (result.error) {
        logger.error(`❌ ${result.game} ${result.drawTime}: ${result.error}`);
      } else {
        logger.info(`✅ ${result.game} ${result.drawTime}: ${result.imported} importados, ${result.skipped} saltados, ${result.deleted} eliminados`);
        totalImported += result.imported || 0;
        totalSkipped += result.skipped || 0;
        totalDeleted += result.deleted || 0;
        
        if (result.tripleta && !result.tripleta.skipped) {
          logger.info(`   🎯 Tripletas: ${result.tripleta.processed || 0} procesadas`);
        }
      }
    }
    
    logger.info('='.repeat(60));
    logger.info(`TOTAL: ${totalImported} tickets importados, ${totalSkipped} saltados, ${totalDeleted} eliminados`);
    logger.info('='.repeat(60));
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error sincronizando tickets:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

forceSyncTicketsToday();
