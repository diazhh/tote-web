/**
 * Script para migrar ExternalTicket a Ticket + TicketDetail
 * Agrupa tickets por externalTicketId y crea la estructura correcta
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';

async function migrateExternalTickets() {
  try {
    console.log('=== INICIANDO MIGRACIÓN DE TICKETS EXTERNOS ===\n');
    
    // Verificar si existe la tabla ExternalTicket
    const externalTickets = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ExternalTicket'
      );
    `;
    
    if (!externalTickets[0].exists) {
      console.log('✓ No hay tabla ExternalTicket, no se requiere migración');
      return;
    }
    
    // Obtener todos los tickets externos agrupados por ticketID
    const tickets = await prisma.$queryRaw`
      SELECT 
        et."mappingId",
        et."externalData"->>'ticketID' as "externalTicketId",
        et."externalData",
        adm."drawId",
        array_agg(json_build_object(
          'gameItemId', et."gameItemId",
          'amount', et."amount"
        )) as details,
        SUM(et."amount") as "totalAmount",
        MIN(et."createdAt") as "createdAt"
      FROM "ExternalTicket" et
      JOIN "ApiDrawMapping" adm ON adm.id = et."mappingId"
      WHERE et."externalData"->>'ticketID' IS NOT NULL
      GROUP BY et."mappingId", et."externalData"->>'ticketID', et."externalData", adm."drawId"
      ORDER BY MIN(et."createdAt")
    `;
    
    console.log(`Encontrados ${tickets.length} tickets externos únicos\n`);
    
    let migrated = 0;
    let errors = 0;
    
    for (const ticket of tickets) {
      try {
        // Crear el Ticket
        const newTicket = await prisma.ticket.create({
          data: {
            drawId: ticket.drawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.externalTicketId,
            totalAmount: parseFloat(ticket.totalAmount),
            totalPrize: 0,
            status: 'ACTIVE',
            providerData: ticket.externalData,
            createdAt: ticket.createdAt,
            updatedAt: ticket.createdAt
          }
        });
        
        // Crear los TicketDetail
        for (const detail of ticket.details) {
          await prisma.ticketDetail.create({
            data: {
              ticketId: newTicket.id,
              gameItemId: detail.gameItemId,
              amount: parseFloat(detail.amount),
              multiplier: 30.00, // Default
              prize: 0,
              status: 'ACTIVE',
              createdAt: ticket.createdAt
            }
          });
        }
        
        migrated++;
        if (migrated % 100 === 0) {
          console.log(`  Migrados ${migrated} tickets...`);
        }
      } catch (error) {
        console.error(`Error migrando ticket ${ticket.externalTicketId}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n=== MIGRACIÓN COMPLETADA ===`);
    console.log(`✓ Tickets migrados: ${migrated}`);
    console.log(`✗ Errores: ${errors}`);
    
    if (errors === 0) {
      console.log('\n⚠️  IMPORTANTE: Ahora puedes eliminar la tabla ExternalTicket');
      console.log('   Ejecuta: DROP TABLE "ExternalTicket";');
    }
    
  } catch (error) {
    console.error('Error en migración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateExternalTickets();
