#!/usr/bin/env node

/**
 * Script para re-sincronizar todas las tripletas de fechas específicas
 * 
 * Este script:
 * 1. Elimina todas las tripletas existentes de las fechas especificadas
 * 2. Re-sincroniza todas las tripletas usando ventaID como identificador único
 * 3. Recalcula el estado de las tripletas para sorteos completados
 * 
 * Uso:
 *   node scripts/resync-all-tripletas.js 2026-01-21 2026-01-22
 */

import { prisma } from '../src/lib/prisma.js';
import logger from '../src/lib/logger.js';

async function resyncTripletas(startDate, endDate) {
  const token = 'e403d7ca-31ca-4dba-8179-55ecca035e10';
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 RE-SINCRONIZACIÓN DE TRIPLETAS`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Desde: ${startDate}`);
  console.log(`Hasta: ${endDate}`);
  console.log('');

  const game = await prisma.game.findFirst({ where: { name: 'LOTOANIMALITO' } });
  if (!game) {
    throw new Error('Juego LOTOANIMALITO no encontrado');
  }

  const tripletaConfig = game.config?.tripleta;
  const multiplier = tripletaConfig?.multiplier || 50;

  // Paso 1: Eliminar tripletas existentes en el rango de fechas
  console.log('📦 PASO 1: Eliminando tripletas existentes...\n');
  
  const deletedResult = await prisma.ticket.deleteMany({
    where: {
      source: 'EXTERNAL_API',
      providerData: {
        path: ['type'],
        equals: 'TRIPLETA'
      },
      draw: {
        gameId: game.id,
        drawDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      }
    }
  });

  console.log(`✅ Eliminadas ${deletedResult.count} tripletas existentes\n`);

  // Paso 2: Re-sincronizar todas las tripletas
  console.log('📥 PASO 2: Re-sincronizando tripletas desde SRQ...\n');

  let totalProcessed = 0;
  let totalSkipped = 0;

  // Procesar cada fecha
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📅 Fecha: ${dateStr}`);
    console.log(`${'─'.repeat(70)}\n`);

    // Obtener sorteos de tripleta de SRQ
    const planningUrl = `https://api2.sistemasrq.com/externalapi/operator/loteries?date=${dateStr}`;
    const planningResponse = await fetch(planningUrl, {
      headers: { 'APIKEY': token }
    });
    const loteries = await planningResponse.json();

    const tripletaDraws = loteries.filter(l => 
      l.descripcion && l.descripcion.toUpperCase().includes('TRIPLETA')
    );

    console.log(`  Sorteos de tripleta: ${tripletaDraws.length}\n`);

    for (const tripletaDraw of tripletaDraws) {
      console.log(`  📌 ${tripletaDraw.descripcion} (ID: ${tripletaDraw.sorteoID})`);

      // Extraer hora de cierre
      const match = tripletaDraw.descripcion.match(/(\d+)(AM|PM)\s*-\s*(\d+)(AM|PM)/);
      if (!match) {
        console.log(`     ⚠️ No se pudo extraer hora de cierre`);
        continue;
      }

      const closeHour = parseInt(match[3]);
      const closePeriod = match[4];
      let closeTime24 = closeHour;
      if (closePeriod === 'PM' && closeHour !== 12) {
        closeTime24 = closeHour + 12;
      } else if (closePeriod === 'AM' && closeHour === 12) {
        closeTime24 = 0;
      }
      const closeTimeStr = `${String(closeTime24).padStart(2, '0')}:00:00`;

      // Buscar sorteo local
      const localDraw = await prisma.draw.findFirst({
        where: {
          gameId: game.id,
          drawDate: new Date(dateStr),
          drawTime: closeTimeStr
        }
      });

      if (!localDraw) {
        console.log(`     ❌ No se encontró sorteo local para ${closeTimeStr}`);
        continue;
      }

      // Obtener tickets
      const ticketsUrl = `https://api2.sistemasrq.com/externalapi/operator/tickets/${tripletaDraw.sorteoID}`;
      const ticketsResponse = await fetch(ticketsUrl, {
        headers: { 'APIKEY': token }
      });
      const tickets = await ticketsResponse.json();

      if (!Array.isArray(tickets)) {
        console.log(`     ⚠️ Respuesta inválida de SRQ`);
        continue;
      }

      console.log(`     📦 Tickets en SRQ: ${tickets.length}`);

      let processed = 0;
      let skipped = 0;

      for (const ticket of tickets) {
        try {
          if (ticket.anulado) {
            skipped++;
            continue;
          }

          if (!ticket.ticketID || !ticket.numerosTexto || !ticket.ventaID) {
            skipped++;
            continue;
          }

          // Parsear números
          const numbers = ticket.numerosTexto.split(',').map(num => {
            const trimmed = num.trim();
            return trimmed === '0' ? '0' : trimmed.padStart(2, '0');
          });

          if (numbers.length !== 3) {
            skipped++;
            continue;
          }

          // Buscar GameItems
          const items = await Promise.all(
            numbers.map(number => 
              prisma.gameItem.findFirst({
                where: { number, gameId: game.id, isActive: true }
              })
            )
          );

          if (items.some(item => !item)) {
            skipped++;
            continue;
          }

          const [item1, item2, item3] = items;
          const amount = parseFloat(ticket.monto || 0);
          
          if (amount <= 0) {
            skipped++;
            continue;
          }

          // Crear ticket usando ventaID como identificador único
          await prisma.ticket.create({
            data: {
              drawId: localDraw.id,
              source: 'EXTERNAL_API',
              externalTicketId: ticket.ventaID.toString(),
              totalAmount: amount,
              totalPrize: 0,
              status: 'ACTIVE',
              providerData: {
                ticketID: ticket.ticketID,
                ventaID: ticket.ventaID,
                taquillaID: ticket.taquillaID,
                bancaID: ticket.bancaID,
                usuarioID: ticket.usuarioID,
                codigo: ticket.codigo,
                type: 'TRIPLETA',
                numeros: ticket.numeros,
                numerosTexto: ticket.numerosTexto,
                numbers: [item1.number, item2.number, item3.number],
                externalDrawId: tripletaDraw.sorteoID
              },
              details: {
                create: [
                  {
                    gameItemId: item1.id,
                    amount: amount / 3,
                    multiplier,
                    prize: 0,
                    status: 'ACTIVE'
                  },
                  {
                    gameItemId: item2.id,
                    amount: amount / 3,
                    multiplier,
                    prize: 0,
                    status: 'ACTIVE'
                  },
                  {
                    gameItemId: item3.id,
                    amount: amount / 3,
                    multiplier,
                    prize: 0,
                    status: 'ACTIVE'
                  }
                ]
              }
            }
          });

          processed++;
        } catch (error) {
          logger.error(`Error procesando ticket ${ticket.ticketID}/${ticket.ventaID}:`, error);
          skipped++;
        }
      }

      console.log(`     ✅ Procesados: ${processed}, Saltados: ${skipped}`);
      totalProcessed += processed;
      totalSkipped += skipped;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESUMEN DE SINCRONIZACIÓN`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Total procesados: ${totalProcessed}`);
  console.log(`Total saltados: ${totalSkipped}`);
  console.log(`${'='.repeat(70)}\n`);

  // Paso 3: Recalcular estado de tripletas para sorteos completados
  console.log('🔄 PASO 3: Recalculando estado de tripletas...\n');

  const completedDraws = await prisma.draw.findMany({
    where: {
      gameId: game.id,
      drawDate: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      },
      status: 'DRAWN',
      winnerItemId: { not: null }
    },
    include: {
      winnerItem: true
    },
    orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }]
  });

  console.log(`Sorteos completados: ${completedDraws.length}\n`);

  for (const draw of completedDraws) {
    console.log(`  🎯 ${draw.drawDate.toISOString().split('T')[0]} ${draw.drawTime} - Ganador: ${draw.winnerItem.number} ${draw.winnerItem.name}`);

    // Obtener tripletas activas para este sorteo (últimos 11 sorteos)
    const previousDraws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        OR: [
          { drawDate: { lt: draw.drawDate } },
          { drawDate: draw.drawDate, drawTime: { lte: draw.drawTime } }
        ]
      },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
      take: 11,
      select: { id: true }
    });

    const drawIdsToCheck = previousDraws.map(d => d.id);

    // Buscar tripletas ganadoras
    const winningTripletas = await prisma.ticket.findMany({
      where: {
        source: 'EXTERNAL_API',
        providerData: {
          path: ['type'],
          equals: 'TRIPLETA'
        },
        drawId: { in: drawIdsToCheck },
        details: {
          some: {
            gameItemId: draw.winnerItemId
          }
        }
      },
      include: {
        details: {
          include: {
            gameItem: true
          }
        }
      }
    });

    // Verificar si completaron la tripleta
    let winnersUpdated = 0;
    for (const ticket of winningTripletas) {
      const numbers = ticket.details.map(d => d.gameItem.number);
      const allWon = numbers.every(num => {
        // Aquí deberíamos verificar si todos los números ya salieron
        // Por ahora solo marcamos como ganador si tiene el número que salió
        return num === draw.winnerItem.number;
      });

      if (allWon) {
        const prize = parseFloat(ticket.totalAmount) * multiplier;
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'WON',
            totalPrize: prize
          }
        });
        winnersUpdated++;
      }
    }

    if (winnersUpdated > 0) {
      console.log(`     ✅ ${winnersUpdated} tripletas ganadoras actualizadas`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ RE-SINCRONIZACIÓN COMPLETADA`);
  console.log(`${'='.repeat(70)}\n`);

  await prisma.$disconnect();
}

// Ejecutar
const startDate = process.argv[2] || '2026-01-21';
const endDate = process.argv[3] || '2026-01-22';

resyncTripletas(startDate, endDate).catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
