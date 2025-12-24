#!/usr/bin/env node

/**
 * Script para ejecutar simulación de jugadas
 * 
 * Uso:
 *   node src/scripts/run-bet-simulation.js
 *   node src/scripts/run-bet-simulation.js --no-tripletas
 *   node src/scripts/run-bet-simulation.js --delay=50
 * 
 * O con yarn:
 *   yarn simulate:bets
 */

import { betSimulatorService } from '../services/bet-simulator.service.js';
import { prisma } from '../lib/prisma.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         SIMULADOR DE JUGADAS - TOTE WEB                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Parsear argumentos
  const args = process.argv.slice(2);
  const options = {
    includeTripletas: !args.includes('--no-tripletas'),
    delayMs: 100
  };

  // Parsear delay personalizado
  const delayArg = args.find(a => a.startsWith('--delay='));
  if (delayArg) {
    options.delayMs = parseInt(delayArg.split('=')[1]) || 100;
  }

  console.log('Opciones:');
  console.log(`  - Incluir tripletas: ${options.includeTripletas ? 'Sí' : 'No'}`);
  console.log(`  - Delay entre jugadas: ${options.delayMs}ms`);
  console.log('');

  try {
    const result = await betSimulatorService.runSimulation(options);

    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESULTADO FINAL                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    if (result.success) {
      console.log('');
      console.log('✅ Simulación completada exitosamente');
      console.log('');
      console.log('📊 Estadísticas:');
      console.log(`   - Tickets creados: ${result.stats.tickets}`);
      console.log(`   - Detalles de tickets: ${result.stats.ticketDetails}`);
      console.log(`   - Tripletas creadas: ${result.stats.tripletas}`);
      console.log(`   - Monto total apostado: $${result.stats.totalAmount.toFixed(2)}`);
      console.log(`   - Errores: ${result.stats.errors}`);
      console.log('');
      console.log('👤 Usuario de prueba:');
      console.log(`   - Username: ${result.user.username}`);
      console.log(`   - ID: ${result.user.id}`);
      console.log(`   - Saldo inicial: $${result.user.initialBalance.toFixed(2)}`);
      console.log(`   - Saldo final: $${result.user.finalBalance.toFixed(2)}`);
    } else {
      console.log('');
      console.log('⚠️  ' + result.message);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error en la simulación:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
