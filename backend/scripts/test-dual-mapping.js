import { PrismaClient } from '@prisma/client';
import logger from '../src/lib/logger.js';
import apiIntegrationService from '../src/services/api-integration.service.js';

const prisma = new PrismaClient();

async function testDualMapping() {
  try {
    const date = new Date('2026-02-03');
    const dateStr = date.toISOString().split('T')[0];
    
    logger.info(`\n🧪 PROBANDO SISTEMA DE DOBLE MAPEO PARA ${dateStr}\n`);
    
    // 1. Sincronizar planificación (debe crear mappings normales Y de tripleta)
    logger.info('📋 PASO 1: Sincronizando planificación de SRQ...');
    const syncResult = await apiIntegrationService.syncSRQPlanning(date);
    logger.info(`Resultado: ${syncResult.mapped} mapeados, ${syncResult.skipped} saltados\n`);
    
    // 2. Verificar mappings creados
    logger.info('🔍 PASO 2: Verificando mappings creados...');
    
    const game = await prisma.game.findFirst({
      where: { name: 'LOTOANIMALITO' }
    });
    
    if (!game) {
      throw new Error('Juego LOTOANIMALITO no encontrado');
    }
    
    // Obtener sorteos del día
    const { getVenezuelaDateAsUTC } = await import('../src/lib/dateUtils.js');
    const drawDate = getVenezuelaDateAsUTC(date);
    
    const draws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        drawDate: drawDate
      },
      orderBy: [{ drawTime: 'asc' }],
      include: {
        apiMappings: {
          include: {
            apiConfig: {
              select: {
                type: true,
                name: true,
                tripletaUrl: true
              }
            }
          }
        }
      }
    });
    
    logger.info(`\n📊 Sorteos encontrados: ${draws.length}\n`);
    
    for (const draw of draws) {
      const normalMapping = draw.apiMappings.find(m => m.apiConfig.type === 'PLANNING');
      const tripletaMapping = draw.apiMappings.find(m => m.apiConfig.type === 'SALES' && m.apiConfig.tripletaUrl);
      
      logger.info(`⏰ Sorteo ${draw.drawTime}:`);
      logger.info(`   Normal:   ${normalMapping ? `✅ SRQ ${normalMapping.externalDrawId}` : '❌ Sin mapping'}`);
      logger.info(`   Tripleta: ${tripletaMapping ? `✅ SRQ ${tripletaMapping.externalDrawId}` : '❌ Sin mapping'}`);
    }
    
    // 3. Probar importación de tickets para un sorteo
    logger.info('\n📦 PASO 3: Probando importación de tickets...');
    
    const testDraw = draws.find(d => d.drawTime === '08:00:00');
    if (testDraw) {
      logger.info(`\nImportando tickets para sorteo de ${testDraw.drawTime}...`);
      
      const importResult = await apiIntegrationService.importSRQTickets(testDraw.id, false);
      
      logger.info(`\n✅ Resultado de importación:`);
      logger.info(`   Tickets normales: ${importResult.imported} importados, ${importResult.skipped} saltados`);
      logger.info(`   Tickets tripleta: ${importResult.tripletaImported || 0} importados, ${importResult.tripletaSkipped || 0} saltados`);
      
      // Verificar tickets guardados
      const tickets = await prisma.ticket.findMany({
        where: {
          drawId: testDraw.id,
          source: 'EXTERNAL_API'
        },
        include: {
          details: true
        }
      });
      
      const normalTickets = tickets.filter(t => !t.providerData?.type || t.providerData?.type !== 'TRIPLETA');
      const tripletaTickets = tickets.filter(t => t.providerData?.type === 'TRIPLETA');
      
      logger.info(`\n📊 Tickets en DB:`);
      logger.info(`   Normales:  ${normalTickets.length} tickets`);
      logger.info(`   Tripletas: ${tripletaTickets.length} tickets`);
      
      if (tripletaTickets.length > 0) {
        logger.info(`\n🎯 Ejemplo de ticket de tripleta:`);
        const example = tripletaTickets[0];
        logger.info(`   ventaID: ${example.externalTicketId}`);
        logger.info(`   ticketID: ${example.providerData.ticketID}`);
        logger.info(`   números: ${example.providerData.numerosTexto}`);
        logger.info(`   monto: ${example.totalAmount}`);
        logger.info(`   detalles: ${example.details.length} números`);
      }
    }
    
    logger.info('\n✅ PRUEBA COMPLETADA\n');
    
  } catch (error) {
    logger.error('❌ Error en prueba:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testDualMapping();
