#!/usr/bin/env node

import { config } from 'dotenv';
config();

import apiIntegrationService from '../src/services/api-integration.service.js';
import logger from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';

async function syncSpecificDate(dateStr) {
  try {
    logger.info(`🔧 Sincronizando planificación para ${dateStr}...`);
    const date = new Date(dateStr);
    const result = await apiIntegrationService.syncSRQPlanning(date);
    logger.info(`✅ Completado: ${result.mapped} mapeados, ${result.skipped} saltados`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

const dateStr = process.argv[2] || '2026-01-27';
syncSpecificDate(dateStr);
