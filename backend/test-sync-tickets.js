#!/usr/bin/env node
/**
 * Script para probar manualmente el job de sincronización de tickets
 */

import syncApiTicketsJob from './src/jobs/sync-api-tickets.job.js';
import { prisma } from './src/lib/prisma.js';

async function main() {
  console.log('🧪 Probando sincronización de tickets...\n');
  
  try {
    await syncApiTicketsJob.execute();
    console.log('\n✅ Prueba completada');
  } catch (error) {
    console.error('\n❌ Error en la prueba:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
