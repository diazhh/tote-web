# Guía de Migración: ExternalTicket → Ticket + TicketDetail

## Resumen de Cambios

Se ha unificado la estructura de tickets para que **todos los proveedores** (SRQ, taquilla online, etc.) usen el mismo modelo: `Ticket` + `TicketDetail`.

### Antes (Estructura Antigua)
- **Taquilla Online**: `Ticket` + `TicketDetail`
- **Proveedores Externos (SRQ)**: `ExternalTicket` (flat, un registro por jugada)

### Ahora (Estructura Unificada)
- **Todos**: `Ticket` + `TicketDetail`
- Campo `source` en Ticket: `TAQUILLA_ONLINE` o `EXTERNAL_API`
- Campo `externalTicketId` para tickets de proveedores externos

## Cambios en el Schema

### Modelo Ticket (Modificado)
```prisma
model Ticket {
  id              String        @id @default(uuid())
  userId          String?       // Null para tickets externos
  drawId          String
  source          TicketSource  @default(TAQUILLA_ONLINE)
  externalTicketId String?      // ID del ticket en el sistema externo
  totalAmount     Decimal       @db.Decimal(12, 2)
  totalPrize      Decimal       @default(0) @db.Decimal(12, 2)
  status          TicketStatus  @default(ACTIVE)
  providerData    Json?         // Datos del proveedor (comercial, banca, grupo, taquilla)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  user            User?         @relation(fields: [userId], references: [id])
  draw            Draw          @relation(fields: [drawId], references: [id])
  details         TicketDetail[]
}
```

### Modelo ExternalTicket (ELIMINADO)
Este modelo ya no existe. Todos los tickets usan `Ticket` + `TicketDetail`.

## Pasos de Migración

### 1. Aplicar cambios al schema
```bash
cd backend
npx prisma migrate dev --name unify-ticket-structure
```

### 2. Migrar datos existentes
```bash
node migrate-external-tickets.js
```

Este script:
- Agrupa `ExternalTicket` por `ticketID`
- Crea registros en `Ticket` con `source = 'EXTERNAL_API'`
- Crea registros en `TicketDetail` para cada jugada

### 3. Verificar migración
```bash
node -e "import('./src/lib/prisma.js').then(async ({prisma}) => { 
  const tickets = await prisma.ticket.count({ where: { source: 'EXTERNAL_API' } }); 
  const details = await prisma.ticketDetail.count(); 
  console.log('Tickets externos:', tickets); 
  console.log('Detalles:', details); 
  await prisma.\$disconnect(); 
});"
```

### 4. Eliminar tabla antigua (SOLO después de verificar)
```sql
DROP TABLE "ExternalTicket";
```

## Archivos Modificados

### Backend
- ✅ `prisma/schema.prisma` - Schema actualizado
- ✅ `src/services/api-integration.service.js` - Importación SRQ actualizada
- ⚠️ `src/services/srq.service.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ `src/services/ticket.service.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ `src/services/taquilla-web.service.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ `src/jobs/execute-draw.job.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ `src/scripts/*.js` - REQUIEREN ACTUALIZACIÓN

### Frontend
- ⚠️ `app/admin/monitor/page.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ `app/admin/tickets/page.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ `app/admin/reportes-taquilla/page.js` - REQUIERE ACTUALIZACIÓN
- ⚠️ Otros archivos que consultan tickets

## Consultas Actualizadas

### Obtener tickets de un sorteo (todos los proveedores)
```javascript
const tickets = await prisma.ticket.findMany({
  where: { drawId },
  include: {
    user: true,
    details: {
      include: {
        gameItem: true
      }
    }
  }
});
```

### Obtener solo tickets externos
```javascript
const externalTickets = await prisma.ticket.findMany({
  where: { 
    drawId,
    source: 'EXTERNAL_API'
  },
  include: {
    details: {
      include: {
        gameItem: true
      }
    }
  }
});
```

### Obtener solo tickets de taquilla online
```javascript
const onlineTickets = await prisma.ticket.findMany({
  where: { 
    drawId,
    source: 'TAQUILLA_ONLINE'
  },
  include: {
    user: true,
    details: {
      include: {
        gameItem: true
      }
    }
  }
});
```

## Beneficios

1. **Estructura consistente**: Todos los tickets usan el mismo modelo
2. **Mejor agrupación**: Un ticket con múltiples jugadas se ve como una unidad
3. **Reportes simplificados**: No más duplicados por jugadas múltiples
4. **Fácil distinción**: Campo `source` identifica el origen
5. **Datos del proveedor**: Campo `providerData` JSON con info completa

## Notas Importantes

- Los tickets externos tienen `userId = null`
- El campo `externalTicketId` guarda el ID original del proveedor
- El campo `providerData` guarda info de comercial, banca, grupo, taquilla
- Los índices están optimizados para consultas por `source` y `drawId`
