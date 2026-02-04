import { PrismaClient } from '@prisma/client';
import apiIntegrationService from '../src/services/api-integration.service.js';
import logger from '../src/lib/logger.js';

const prisma = new PrismaClient();

async function syncYesterdayAndToday() {
  try {
    const yesterday = new Date('2026-02-02');
    const today = new Date('2026-02-03');
    
    console.log('\n🔄 SINCRONIZANDO SORTEOS Y TICKETS\n');
    
    // 1. Sincronizar planificación
    for (const date of [yesterday, today]) {
      const dateStr = date.toISOString().split('T')[0];
      console.log(`\n📋 Sincronizando planificación para ${dateStr}...`);
      
      const result = await apiIntegrationService.syncSRQPlanning(date);
      console.log(`   ✅ ${result.mapped} mapeados, ${result.skipped} saltados, ${result.winners} ganadores`);
    }
    
    // 2. Importar tickets para todos los sorteos
    console.log('\n\n🎫 IMPORTANDO TICKETS\n');
    
    const game = await prisma.game.findFirst({
      where: { name: 'LOTOANIMALITO' }
    });
    
    const { getVenezuelaDateAsUTC } = await import('../src/lib/dateUtils.js');
    
    for (const date of [yesterday, today]) {
      const dateStr = date.toISOString().split('T')[0];
      const drawDate = getVenezuelaDateAsUTC(date);
      
      console.log(`\n📅 ${dateStr}:`);
      
      const draws = await prisma.draw.findMany({
        where: {
          gameId: game.id,
          drawDate: drawDate
        },
        orderBy: [{ drawTime: 'asc' }]
      });
      
      let totalNormal = 0;
      let totalTripleta = 0;
      
      for (const draw of draws) {
        try {
          const result = await apiIntegrationService.importSRQTickets(draw.id, true);
          
          totalNormal += result.imported || 0;
          totalTripleta += result.tripletaImported || 0;
          
          console.log(`   ${draw.drawTime}: ${result.imported || 0} normales, ${result.tripletaImported || 0} tripletas`);
        } catch (error) {
          console.log(`   ${draw.drawTime}: ❌ Error - ${error.message}`);
        }
      }
      
      console.log(`   📊 Total: ${totalNormal} tickets normales, ${totalTripleta} tickets tripleta`);
    }
    
    // 3. Verificación final
    console.log('\n\n📊 VERIFICACIÓN FINAL\n');
    
    for (const date of [yesterday, today]) {
      const dateStr = date.toISOString().split('T')[0];
      const drawDate = getVenezuelaDateAsUTC(date);
      
      const draws = await prisma.draw.findMany({
        where: {
          gameId: game.id,
          drawDate: drawDate
        },
        include: {
          apiMappings: {
            include: {
              apiConfig: {
                select: { type: true, tripletaUrl: true }
              }
            }
          },
          tickets: {
            where: { source: 'EXTERNAL_API' }
          }
        }
      });
      
      const drawsWithNormalMapping = draws.filter(d => 
        d.apiMappings.some(m => m.apiConfig.type === 'PLANNING')
      ).length;
      
      const drawsWithTripletaMapping = draws.filter(d => 
        d.apiMappings.some(m => m.apiConfig.type === 'SALES' && m.apiConfig.tripletaUrl)
      ).length;
      
      const totalNormalTickets = draws.reduce((sum, d) => 
        sum + d.tickets.filter(t => !t.providerData?.type || t.providerData?.type !== 'TRIPLETA').length, 0
      );
      
      const totalTripletaTickets = draws.reduce((sum, d) => 
        sum + d.tickets.filter(t => t.providerData?.type === 'TRIPLETA').length, 0
      );
      
      console.log(`${dateStr}:`);
      console.log(`   Sorteos: ${draws.length}`);
      console.log(`   Mappings normales: ${drawsWithNormalMapping}`);
      console.log(`   Mappings tripleta: ${drawsWithTripletaMapping}`);
      console.log(`   Tickets normales: ${totalNormalTickets}`);
      console.log(`   Tickets tripleta: ${totalTripletaTickets}`);
    }
    
    console.log('\n✅ SINCRONIZACIÓN COMPLETADA\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

syncYesterdayAndToday();
