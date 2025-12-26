#!/usr/bin/env node
/**
 * Script para procesar sorteos pasados de hoy
 * Cierra y ejecuta sorteos cuya hora ya pasó
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Obtener hora actual en Venezuela
function getVenezuelaTimeString() {
  const now = new Date();
  return now.toLocaleTimeString('es-VE', {
    timeZone: 'America/Caracas',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Obtener fecha de Venezuela como Date UTC
function getVenezuelaDateAsUTC() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

async function processPastDraws() {
  try {
    const venezuelaTime = getVenezuelaTimeString();
    const venezuelaDate = getVenezuelaDateAsUTC();
    
    console.log(`\n🕐 Hora Venezuela: ${venezuelaTime}`);
    console.log(`📅 Fecha Venezuela: ${venezuelaDate.toISOString().split('T')[0]}`);
    
    // 1. Buscar sorteos SCHEDULED cuya hora ya pasó (+ 5 min para cierre)
    const drawsToProcess = await prisma.draw.findMany({
      where: {
        status: 'SCHEDULED',
        drawDate: venezuelaDate,
        drawTime: {
          lt: venezuelaTime // Hora menor a la actual
        }
      },
      include: {
        game: {
          include: {
            items: {
              where: { isActive: true }
            }
          }
        }
      },
      orderBy: { drawTime: 'asc' }
    });
    
    console.log(`\n📋 Sorteos pasados por procesar: ${drawsToProcess.length}`);
    
    if (drawsToProcess.length === 0) {
      console.log('✅ No hay sorteos pasados pendientes');
      return;
    }
    
    let closedCount = 0;
    let executedCount = 0;
    
    for (const draw of drawsToProcess) {
      try {
        // Seleccionar item aleatorio como preganador si no tiene
        let preselectedItemId = draw.preselectedItemId;
        if (!preselectedItemId && draw.game.items.length > 0) {
          const randomIndex = Math.floor(Math.random() * draw.game.items.length);
          preselectedItemId = draw.game.items[randomIndex].id;
        }
        
        if (!preselectedItemId) {
          console.log(`  ⚠️ ${draw.game.name} ${draw.drawTime} - Sin items disponibles`);
          continue;
        }
        
        // Cerrar el sorteo
        await prisma.draw.update({
          where: { id: draw.id },
          data: {
            status: 'CLOSED',
            preselectedItemId,
            closedAt: new Date()
          }
        });
        closedCount++;
        
        // Ejecutar el sorteo (usar preselected como ganador)
        const updatedDraw = await prisma.draw.update({
          where: { id: draw.id },
          data: {
            status: 'DRAWN',
            winnerItemId: preselectedItemId,
            drawnAt: new Date()
          },
          include: {
            winnerItem: true
          }
        });
        executedCount++;
        
        console.log(`  ✅ ${draw.game.name} ${draw.drawTime} -> Ganador: ${updatedDraw.winnerItem.number} - ${updatedDraw.winnerItem.name}`);
        
      } catch (error) {
        console.error(`  ❌ Error procesando ${draw.game.name} ${draw.drawTime}:`, error.message);
      }
    }
    
    console.log(`\n📊 Resumen:`);
    console.log(`   - Sorteos cerrados: ${closedCount}`);
    console.log(`   - Sorteos ejecutados: ${executedCount}`);
    console.log(`✅ Proceso completado`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

processPastDraws();
