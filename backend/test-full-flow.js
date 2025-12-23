#!/usr/bin/env node
/**
 * Script para probar el flujo completo de un sorteo:
 * 1. Importar ventas de SRQ (elimina + inserta)
 * 2. Cerrar sorteo
 * 3. Pre-seleccionar ganador
 * 4. Generar PDF
 * 5. Enviar notificación por Telegram
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import apiIntegrationService from './src/services/api-integration.service.js';
import prewinnerSelectionService from './src/services/prewinner-selection.service.js';
import logger from './src/lib/logger.js';

async function main() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('\n🔍 Buscando sorteos de 8am...\n');
    
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: today,
        drawTime: '08:00:00'
      },
      include: {
        game: true,
        apiMappings: true,
        tickets: true
      },
      orderBy: { drawTime: 'asc' }
    });
    
    if (draws.length === 0) {
      console.log('❌ No hay sorteos de 8am');
      return;
    }
    
    console.log(`📊 Sorteos encontrados: ${draws.length}\n`);
    
    for (const draw of draws) {
      console.log('='.repeat(70));
      console.log(`\n🎮 ${draw.game.name} - 08:00 AM`);
      console.log(`   ID: ${draw.id}`);
      console.log(`   Status actual: ${draw.status}`);
      console.log(`   Tickets actuales: ${draw.tickets.length}`);
      console.log(`   Mapping SRQ: ${draw.apiMappings.length > 0 ? '✅' : '❌'}`);
      
      if (draw.apiMappings.length === 0) {
        console.log('   ⚠️  Sin mapping de SRQ, saltando...\n');
        continue;
      }
      
      console.log(`   External ID: ${draw.apiMappings[0].externalDrawId}\n`);
      
      // PASO 1: Importar ventas de SRQ (elimina tickets anteriores + inserta nuevos)
      console.log('   📥 PASO 1: Importando ventas de SRQ...');
      try {
        const importResult = await apiIntegrationService.importSRQTickets(draw.id, true);
        console.log(`      ✅ Importados: ${importResult.imported} tickets`);
        console.log(`      🗑️  Eliminados: ${importResult.deleted} tickets anteriores`);
        console.log(`      ⏭️  Saltados: ${importResult.skipped} tickets\n`);
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}\n`);
        continue;
      }
      
      // Verificar tickets importados
      const ticketsAfterImport = await prisma.ticket.count({
        where: { drawId: draw.id }
      });
      
      const ticketDetails = await prisma.ticketDetail.count({
        where: { 
          ticket: { drawId: draw.id }
        }
      });
      
      console.log(`   📊 Verificación post-importación:`);
      console.log(`      Tickets: ${ticketsAfterImport}`);
      console.log(`      Jugadas: ${ticketDetails}\n`);
      
      // PASO 2: Pre-seleccionar ganador (solo si el sorteo no está cerrado)
      if (draw.status === 'SCHEDULED') {
        console.log('   🎯 PASO 2: Pre-seleccionando ganador...');
        try {
          const selectedItem = await prewinnerSelectionService.selectPrewinner(draw.id);
          
          if (selectedItem) {
            console.log(`      ✅ Pre-ganador: ${selectedItem.number} - ${selectedItem.name}`);
            console.log(`      📄 PDF generado`);
            console.log(`      📱 Notificación enviada por Telegram\n`);
          } else {
            console.log(`      ⚠️  No se pudo seleccionar pre-ganador\n`);
          }
        } catch (error) {
          console.log(`      ❌ Error: ${error.message}\n`);
        }
        
        // PASO 3: Cerrar sorteo
        console.log('   🔒 PASO 3: Cerrando sorteo...');
        try {
          await prisma.draw.update({
            where: { id: draw.id },
            data: {
              status: 'CLOSED',
              closedAt: new Date()
            }
          });
          console.log(`      ✅ Sorteo cerrado\n`);
        } catch (error) {
          console.log(`      ❌ Error: ${error.message}\n`);
        }
      } else {
        console.log(`   ℹ️  Sorteo ya está en estado: ${draw.status}\n`);
      }
      
      // Verificación final
      const finalDraw = await prisma.draw.findUnique({
        where: { id: draw.id },
        include: {
          preselectedItem: true,
          tickets: {
            include: {
              details: true
            }
          }
        }
      });
      
      const totalAmount = finalDraw.tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
      
      console.log('   ✅ ESTADO FINAL:');
      console.log(`      Status: ${finalDraw.status}`);
      console.log(`      Pre-ganador: ${finalDraw.preselectedItem ? `${finalDraw.preselectedItem.number} - ${finalDraw.preselectedItem.name}` : 'No'}`);
      console.log(`      Tickets: ${finalDraw.tickets.length}`);
      console.log(`      Jugadas: ${finalDraw.tickets.reduce((sum, t) => sum + t.details.length, 0)}`);
      console.log(`      Monto total: $${totalAmount.toFixed(2)}`);
      console.log(`      Cerrado: ${finalDraw.closedAt ? finalDraw.closedAt.toLocaleString('es-VE', { timeZone: 'America/Caracas' }) : 'No'}`);
      console.log('');
    }
    
    console.log('='.repeat(70));
    console.log('\n✅ Flujo completo ejecutado\n');
    
  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
