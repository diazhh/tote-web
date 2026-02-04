import { PrismaClient } from '@prisma/client';
import srqTripletaService from '../src/services/srq-tripleta.service.js';

const prisma = new PrismaClient();

async function testExternalTripletaVerification() {
  try {
    console.log('\n🧪 PROBANDO VERIFICACIÓN DE TRIPLETAS EXTERNAS\n');
    
    // Buscar un sorteo ejecutado reciente
    const executedDraw = await prisma.draw.findFirst({
      where: {
        status: { in: ['DRAWN', 'PUBLISHED'] },
        winnerItemId: { not: null }
      },
      orderBy: { drawDate: 'desc' },
      include: {
        game: true,
        winnerItem: true
      }
    });
    
    if (!executedDraw) {
      console.log('❌ No hay sorteos ejecutados para probar');
      return;
    }
    
    console.log(`📅 Sorteo: ${executedDraw.game.name} - ${executedDraw.drawDate.toISOString().split('T')[0]} ${executedDraw.drawTime}`);
    console.log(`🎯 Ganador: ${executedDraw.winnerItem.number} (${executedDraw.winnerItem.name})\n`);
    
    // Contar tripletas activas antes
    const tripletasAntes = await prisma.ticket.count({
      where: {
        drawId: executedDraw.id,
        source: 'EXTERNAL_API',
        status: 'ACTIVE',
        providerData: {
          path: ['type'],
          equals: 'TRIPLETA'
        }
      }
    });
    
    console.log(`📊 Tripletas activas antes: ${tripletasAntes}\n`);
    
    // Ejecutar verificación
    console.log('🔄 Ejecutando verificación...\n');
    const result = await srqTripletaService.checkExternalTripletasForDraw(executedDraw.id);
    
    console.log('✅ Resultado:');
    console.log(`   Verificadas: ${result.checked}`);
    console.log(`   Ganadoras: ${result.winners}`);
    console.log(`   Expiradas: ${result.expired}\n`);
    
    // Contar estados después
    const tripletasDespues = await prisma.ticket.groupBy({
      by: ['status'],
      where: {
        drawId: executedDraw.id,
        source: 'EXTERNAL_API',
        providerData: {
          path: ['type'],
          equals: 'TRIPLETA'
        }
      },
      _count: true
    });
    
    console.log('📊 Estados después de verificación:');
    for (const group of tripletasDespues) {
      console.log(`   ${group.status}: ${group._count}`);
    }
    
    // Mostrar ejemplos de ganadoras
    if (result.winners > 0) {
      const ganadoras = await prisma.ticket.findMany({
        where: {
          drawId: executedDraw.id,
          source: 'EXTERNAL_API',
          status: 'WON',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          }
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          }
        },
        take: 3
      });
      
      console.log('\n🏆 Ejemplos de tripletas ganadoras:');
      for (const ticket of ganadoras) {
        const numeros = ticket.details.map(d => d.gameItem.number).join(', ');
        console.log(`   ventaID ${ticket.externalTicketId}: [${numeros}] - Premio: $${ticket.totalPrize}`);
      }
    }
    
    // Mostrar ejemplos de expiradas
    if (result.expired > 0) {
      const expiradas = await prisma.ticket.findMany({
        where: {
          drawId: executedDraw.id,
          source: 'EXTERNAL_API',
          status: 'LOST',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          }
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          }
        },
        take: 3
      });
      
      console.log('\n❌ Ejemplos de tripletas expiradas:');
      for (const ticket of expiradas) {
        const numeros = ticket.details.map(d => d.gameItem.number).join(', ');
        console.log(`   ventaID ${ticket.externalTicketId}: [${numeros}]`);
      }
    }
    
    console.log('\n✅ PRUEBA COMPLETADA\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testExternalTripletaVerification();
