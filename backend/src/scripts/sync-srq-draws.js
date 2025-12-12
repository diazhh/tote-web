/**
 * Script para sincronizar sorteos de SRQ manualmente
 * Uso: node src/scripts/sync-srq-draws.js [fecha]
 * Ejemplo: node src/scripts/sync-srq-draws.js 2025-12-11
 */

import dotenv from 'dotenv';
dotenv.config();

import { srqService } from '../services/srq.service.js';

async function main() {
  const dateArg = process.argv[2];
  const date = dateArg ? new Date(dateArg) : new Date();

  console.log('🔄 Sincronizando sorteos de SRQ...\n');

  try {
    const result = await srqService.syncDraws(date);

    console.log('\n=== Resumen ===');
    console.log(`Fecha: ${result.date}`);
    console.log(`Total sorteos: ${result.totalDraws}`);
    console.log('\nPor juego:');
    
    for (const game of result.games) {
      console.log(`  - ${game.game}: ${game.total} sorteos (${game.created} nuevos, ${game.updated} actualizados)`);
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️ Errores:');
      for (const err of result.errors) {
        console.log(`  - ${err.game}: ${err.error}`);
      }
    }

    console.log('\n✅ Sincronización completada');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
