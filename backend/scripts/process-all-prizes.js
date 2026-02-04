#!/usr/bin/env node

import { config } from 'dotenv';
config();

import { processTicketPrizesJob } from '../src/jobs/processTicketPrizes.job.js';
import logger from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';

async function processAllPrizes() {
  try {
    logger.info('🏆 Procesando premios de todos los sorteos ejecutados...');
    const result = await processTicketPrizesJob();
    logger.info('✅ Procesamiento completado:', result);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

processAllPrizes();
