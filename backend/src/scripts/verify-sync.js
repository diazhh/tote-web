#!/usr/bin/env node
/**
 * Script para verificar la sincronización de datos desde MySQL
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 VERIFICACIÓN DE SINCRONIZACIÓN\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Contar sorteos totales
    const totalDraws = await prisma.draw.count();
    console.log(`\n✓ Total de sorteos: ${totalDraws}`);
    
    // 2. Sorteos por estado
    const byStatus = await prisma.draw.groupBy({
      by: ['status'],
      _count: true
    });
    console.log('\n📋 Sorteos por estado:');
    byStatus.forEach(s => {
      console.log(`   ${s.status}: ${s._count}`);
    });
    
    // 3. Sorteos con ganador
    const withWinner = await prisma.draw.count({
      where: { winnerItemId: { not: null } }
    });
    console.log(`\n🏆 Sorteos con ganador: ${withWinner}`);
    
    // 4. Sorteos por juego
    const byGame = await prisma.draw.groupBy({
      by: ['gameId'],
      _count: true
    });
    
    const games = await prisma.game.findMany();
    console.log('\n🎮 Sorteos por juego:');
    for (const g of byGame) {
      const game = games.find(gm => gm.id === g.gameId);
      console.log(`   ${game?.name || 'Unknown'}: ${g._count}`);
    }
    
    // 5. Rango de fechas
    const oldest = await prisma.draw.findFirst({
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true }
    });
    const newest = await prisma.draw.findFirst({
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true }
    });
    
    console.log('\n📅 Rango de fechas:');
    console.log(`   Más antiguo: ${oldest?.scheduledAt.toISOString().split('T')[0]}`);
    console.log(`   Más reciente: ${newest?.scheduledAt.toISOString().split('T')[0]}`);
    
    // 6. ApiDrawMappings
    const mappings = await prisma.apiDrawMapping.count();
    console.log(`\n🔗 ApiDrawMappings: ${mappings}`);
    
    // 7. ExternalTickets
    const tickets = await prisma.externalTicket.count();
    console.log(`🎫 ExternalTickets: ${tickets}`);
    
    // 8. Verificar estructura de entidades en tickets
    if (tickets > 0) {
      const sampleTickets = await prisma.externalTicket.findMany({
        take: 5,
        select: { externalData: true }
      });
      
      console.log('\n📦 Muestra de estructura de entidades en tickets:');
      sampleTickets.forEach((t, i) => {
        const data = t.externalData;
        console.log(`   Ticket ${i + 1}:`);
        console.log(`      - Comercial ID: ${data.comercialID || 'N/A'}`);
        console.log(`      - Banca ID: ${data.bancaID || 'N/A'}`);
        console.log(`      - Grupo ID: ${data.grupoID || 'N/A'}`);
        console.log(`      - Taquilla ID: ${data.taquillaID || 'N/A'}`);
      });
    }
    
    // 9. Ejemplo de sorteo con ganador
    const sampleDraw = await prisma.draw.findFirst({
      where: { 
        winnerItemId: { not: null },
        status: 'PUBLISHED'
      },
      include: {
        game: true,
        winnerItem: true,
        apiMappings: {
          include: {
            tickets: {
              take: 3
            }
          }
        }
      }
    });
    
    if (sampleDraw) {
      console.log('\n🎯 Ejemplo de sorteo completo:');
      console.log(`   Juego: ${sampleDraw.game.name}`);
      console.log(`   Fecha: ${sampleDraw.scheduledAt.toISOString()}`);
      console.log(`   Estado: ${sampleDraw.status}`);
      console.log(`   Ganador: ${sampleDraw.winnerItem?.number} - ${sampleDraw.winnerItem?.name}`);
      console.log(`   Mappings: ${sampleDraw.apiMappings.length}`);
      if (sampleDraw.apiMappings.length > 0) {
        console.log(`   Tickets en primer mapping: ${sampleDraw.apiMappings[0].tickets.length}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ VERIFICACIÓN COMPLETADA\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
