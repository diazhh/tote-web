import { PrismaClient } from '@prisma/client';
import srqTripletaService from '../src/services/srq-tripleta.service.js';
import monitorService from '../src/services/monitor.service.js';

const prisma = new PrismaClient();

async function testCompleteTripletaFlow() {
  try {
    console.log('\n🧪 PRUEBA COMPLETA DEL FLUJO DE TRIPLETAS EXTERNAS\n');
    
    const game = await prisma.game.findFirst({ where: { name: 'LOTOANIMALITO' } });
    const date = new Date('2026-02-03T00:00:00.000Z');
    
    // 1. Resetear tripletas del sorteo 08:00 a ACTIVE
    console.log('📋 PASO 1: Resetear tripletas a ACTIVE\n');
    
    const draw0800 = await prisma.draw.findFirst({
      where: { gameId: game.id, drawDate: date, drawTime: '08:00:00' },
      include: { winnerItem: true }
    });
    
    await prisma.ticket.updateMany({
      where: {
        drawId: draw0800.id,
        source: 'EXTERNAL_API',
        providerData: { path: ['type'], equals: 'TRIPLETA' }
      },
      data: { status: 'ACTIVE', totalPrize: 0 }
    });
    
    await prisma.ticketDetail.updateMany({
      where: {
        ticket: {
          drawId: draw0800.id,
          source: 'EXTERNAL_API',
          providerData: { path: ['type'], equals: 'TRIPLETA' }
        }
      },
      data: { status: 'ACTIVE', prize: 0 }
    });
    
    console.log('✅ Tripletas reseteadas a ACTIVE\n');
    
    // 2. Verificar monitor ANTES de ejecutar sorteo
    console.log('📊 PASO 2: Verificar monitor ANTES de verificación\n');
    
    const statsBefore = await monitorService.getItemStats(draw0800.id);
    const itemsWithTripletas = statsBefore.items.filter(i => i.tripletaCount > 0);
    
    console.log(`Items con riesgo de tripleta: ${itemsWithTripletas.length}`);
    if (itemsWithTripletas.length > 0) {
      console.log('\nTop 5 items con más riesgo:');
      itemsWithTripletas
        .sort((a, b) => b.tripletaPrize - a.tripletaPrize)
        .slice(0, 5)
        .forEach(item => {
          console.log(`  ${item.number}: ${item.tripletaCount} tripletas, $${item.tripletaPrize.toFixed(2)}`);
        });
    }
    console.log();
    
    // 3. Ejecutar verificación de tripletas
    console.log('🔄 PASO 3: Ejecutar verificación de tripletas\n');
    
    const result = await srqTripletaService.checkExternalTripletasForDraw(draw0800.id);
    
    console.log('Resultado:');
    console.log(`  Verificadas: ${result.checked}`);
    console.log(`  Ganadoras: ${result.winners}`);
    console.log(`  Expiradas: ${result.expired}\n`);
    
    // 4. Verificar estados en DB
    console.log('📊 PASO 4: Verificar estados en DB\n');
    
    const statusCounts = await prisma.ticket.groupBy({
      by: ['status'],
      where: {
        drawId: draw0800.id,
        source: 'EXTERNAL_API',
        providerData: { path: ['type'], equals: 'TRIPLETA' }
      },
      _count: true
    });
    
    console.log('Estados de tripletas:');
    for (const group of statusCounts) {
      console.log(`  ${group.status}: ${group._count}`);
    }
    console.log();
    
    // 5. Verificar monitor DESPUÉS de verificación
    console.log('📊 PASO 5: Verificar monitor DESPUÉS de verificación\n');
    
    const statsAfter = await monitorService.getItemStats(draw0800.id);
    const itemsWithTripletasAfter = statsAfter.items.filter(i => i.tripletaCount > 0);
    
    console.log(`Items con riesgo de tripleta: ${itemsWithTripletasAfter.length}`);
    if (itemsWithTripletasAfter.length > 0) {
      console.log('\nTop 5 items con más riesgo:');
      itemsWithTripletasAfter
        .sort((a, b) => b.tripletaPrize - a.tripletaPrize)
        .slice(0, 5)
        .forEach(item => {
          console.log(`  ${item.number}: ${item.tripletaCount} tripletas, $${item.tripletaPrize.toFixed(2)}`);
        });
    }
    console.log();
    
    // 6. Mostrar tripleta ganadora
    if (result.winners > 0) {
      const ganadora = await prisma.ticket.findFirst({
        where: {
          drawId: draw0800.id,
          source: 'EXTERNAL_API',
          status: 'WON',
          providerData: { path: ['type'], equals: 'TRIPLETA' }
        },
        include: {
          details: {
            include: { gameItem: true }
          }
        }
      });
      
      if (ganadora) {
        console.log('🏆 TRIPLETA GANADORA:');
        const numeros = ganadora.details.map(d => d.gameItem.number).join(', ');
        console.log(`  ventaID: ${ganadora.externalTicketId}`);
        console.log(`  Números: [${numeros}]`);
        console.log(`  Monto apostado: $${ganadora.totalAmount}`);
        console.log(`  Premio: $${ganadora.totalPrize}\n`);
        
        // Verificar que los 3 números salieron
        console.log('  Verificando que los 3 números salieron:');
        
        const itemIds = ganadora.details.map(d => d.gameItemId);
        const draws = await prisma.draw.findMany({
          where: {
            gameId: game.id,
            drawDate: date,
            status: 'DRAWN',
            winnerItemId: { not: null }
          },
          include: { winnerItem: true },
          orderBy: { drawTime: 'asc' }
        });
        
        for (const itemId of itemIds) {
          const winningDraw = draws.find(d => d.winnerItemId === itemId);
          const item = ganadora.details.find(d => d.gameItemId === itemId).gameItem;
          if (winningDraw) {
            console.log(`    ✅ ${item.number} ganó en sorteo ${winningDraw.drawTime}`);
          } else {
            console.log(`    ❌ ${item.number} NO ha ganado`);
          }
        }
        console.log();
      }
    }
    
    console.log('✅ PRUEBA COMPLETADA\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testCompleteTripletaFlow();
