#!/usr/bin/env node

/**
 * Script para sincronizar tickets de sorteos de hoy que ya pasaron
 * 
 * Uso:
 *   node scripts/sync-today-draws.js
 * 
 * Este script:
 * 1. Obtiene todos los sorteos de hoy que tienen mapping de SRQ
 * 2. Para cada sorteo, sincroniza:
 *    - Tickets normales
 *    - Tickets de tripleta (si el juego tiene tripleta habilitada)
 * 3. Muestra un resumen de lo sincronizado
 */

import { prisma } from '../src/lib/prisma.js';
import logger from '../src/lib/logger.js';
import apiIntegrationService from '../src/services/api-integration.service.js';
import { getVenezuelaDateAsUTC } from '../src/lib/dateUtils.js';

async function syncTodayDraws() {
  try {
    console.log('='.repeat(60));
    console.log('🔄 SINCRONIZACIÓN DE SORTEOS DE HOY');
    console.log('='.repeat(60));
    console.log('');

    // Obtener fecha de hoy en Venezuela
    const todayVenezuela = getVenezuelaDateAsUTC();
    const dateStr = todayVenezuela.toISOString().split('T')[0];
    
    console.log(`📅 Fecha: ${dateStr} (Venezuela)`);
    console.log('');

    // Obtener todos los sorteos de hoy que tienen mapping de SRQ
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: todayVenezuela,
        apiMappings: {
          some: {}
        }
      },
      include: {
        game: true,
        apiMappings: {
          include: {
            apiConfig: true
          }
        }
      },
      orderBy: [
        { drawTime: 'asc' }
      ]
    });

    if (draws.length === 0) {
      console.log('⚠️ No se encontraron sorteos con mapping de SRQ para hoy');
      return;
    }

    console.log(`📊 Sorteos encontrados: ${draws.length}`);
    console.log('');

    const results = {
      total: draws.length,
      synced: 0,
      failed: 0,
      skipped: 0,
      totalTickets: 0,
      totalTripletas: 0,
      details: []
    };

    // Sincronizar cada sorteo
    for (const draw of draws) {
      const [hours, minutes] = draw.drawTime.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
      const displayHour = hour % 12 || 12;
      const timeStr = `${displayHour}:${minutes} ${ampm}`;

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🎯 ${draw.game.name} - ${timeStr} (${draw.status})`);
      console.log(`   ID: ${draw.id}`);

      try {
        // Sincronizar tickets normales y tripletas
        const result = await apiIntegrationService.importSRQTickets(draw.id, true);
        
        const ticketsImported = result.imported || 0;
        const tripletasImported = result.tripleta?.processed || 0;
        
        console.log(`   ✅ Tickets normales: ${ticketsImported}`);
        
        if (result.tripleta && !result.tripleta.skipped) {
          console.log(`   ✅ Tripletas: ${tripletasImported}`);
        } else if (result.tripleta?.skipped) {
          console.log(`   ⊘ Tripletas: No configuradas`);
        }
        
        results.synced++;
        results.totalTickets += ticketsImported;
        results.totalTripletas += tripletasImported;
        
        results.details.push({
          game: draw.game.name,
          time: timeStr,
          status: draw.status,
          tickets: ticketsImported,
          tripletas: tripletasImported,
          success: true
        });

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.failed++;
        
        results.details.push({
          game: draw.game.name,
          time: timeStr,
          status: draw.status,
          error: error.message,
          success: false
        });
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE SINCRONIZACIÓN');
    console.log('='.repeat(60));
    console.log(`Total sorteos:      ${results.total}`);
    console.log(`✅ Sincronizados:   ${results.synced}`);
    console.log(`❌ Fallidos:        ${results.failed}`);
    console.log(`📦 Tickets totales: ${results.totalTickets}`);
    console.log(`🎯 Tripletas:       ${results.totalTripletas}`);
    console.log('='.repeat(60));
    console.log('');

    // Mostrar detalles por juego
    if (results.synced > 0) {
      console.log('📋 DETALLES POR SORTEO:');
      console.log('');
      
      const successDraws = results.details.filter(d => d.success);
      successDraws.forEach(detail => {
        console.log(`  ${detail.game} ${detail.time}:`);
        console.log(`    Tickets: ${detail.tickets}, Tripletas: ${detail.tripletas}`);
      });
    }

    if (results.failed > 0) {
      console.log('\n❌ ERRORES:');
      console.log('');
      
      const failedDraws = results.details.filter(d => !d.success);
      failedDraws.forEach(detail => {
        console.log(`  ${detail.game} ${detail.time}:`);
        console.log(`    ${detail.error}`);
      });
    }

    console.log('');
    console.log('✅ Script completado');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
syncTodayDraws();
