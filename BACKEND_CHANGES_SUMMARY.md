# Resumen de Cambios Backend - Unificación de Tickets

## ✅ Cambios Completados

### 1. Schema de Base de Datos (`prisma/schema.prisma`)
- ✅ Eliminado modelo `ExternalTicket`
- ✅ Modificado modelo `Ticket`:
  - Agregado campo `source` (TAQUILLA_ONLINE | EXTERNAL_API)
  - Agregado campo `externalTicketId` (ID del ticket en sistema externo)
  - Agregado campo `providerData` (JSON con info del proveedor)
  - Campo `userId` ahora es opcional (null para tickets externos)
- ✅ Migración aplicada: `20251222190933_unify_ticket_structure`

### 2. Servicios Actualizados

#### `api-integration.service.js` ✅
- **Método `importSRQTickets()`**: Reescrito para agrupar por ticketID
- **Método `groupTicketsByExternalId()`**: Nuevo - agrupa jugadas del mismo ticket
- **Método `saveTicketWithDetails()`**: Nuevo - crea Ticket + TicketDetail en transacción
- **Método `getDrawSalesStats()`**: Actualizado para usar Ticket + TicketDetail
- **Método `saveTicket()`**: Eliminado (obsoleto)

#### `srq.service.js` ✅
- Actualizado para agrupar tickets por ticketID
- Crea Ticket + TicketDetail en lugar de ExternalTicket

#### `taquilla-web.service.js` ✅
- **Método `createExternalTicketEquivalent()`**: Eliminado (ya no necesario)
- **Método `deleteExternalTicketEquivalent()`**: Eliminado (ya no necesario)

#### `ticket.service.js` ✅
- Eliminada llamada a `createExternalTicketEquivalent()` después de crear ticket

#### `monitor.service.js` ✅
- **Método `getBancaStats()`**: Actualizado para usar `draw.tickets` con `details`
- **Método `getItemStats()`**: Actualizado para iterar sobre `ticket.details`
- **Método `getDailyReport()`**: Actualizado para calcular con nueva estructura
- **Método `getTicketsByBanca()`**: Ahora retorna tickets completos con sus detalles
- **Método `getTicketsByItem()`**: Ahora retorna tickets completos con sus detalles

#### `execute-draw.job.js` ✅
- **Método `calculateDrawStats()`**: Actualizado para usar `draw.tickets` con `details`
- **Método `getPeriodStats()`**: Actualizado para calcular estadísticas con nueva estructura

### 3. Scripts de Migración
- ✅ `migrate-external-tickets.js` - Script para migrar datos (ya ejecutado)
- ✅ `MIGRATION_GUIDE.md` - Guía completa de migración

## 📊 Nueva Estructura de Datos

### Antes (Estructura Antigua)
```
ExternalTicket (flat):
- id
- mappingId
- gameItemId
- amount
- externalData (JSON)
```
**Problema**: Un ticket con 3 jugadas = 3 registros separados

### Ahora (Estructura Unificada)
```
Ticket (cabecera):
- id
- userId (null para externos)
- drawId
- source (TAQUILLA_ONLINE | EXTERNAL_API)
- externalTicketId
- totalAmount
- providerData (JSON)

TicketDetail (detalles):
- id
- ticketId
- gameItemId
- amount
- multiplier
- prize
```
**Beneficio**: Un ticket con 3 jugadas = 1 Ticket + 3 TicketDetail

## 🔍 Cómo Consultar Tickets Ahora

### Obtener todos los tickets de un sorteo
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

### Obtener solo tickets externos (SRQ)
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
    source: 'TAQUILLA_ONLINE',
    userId: { not: null }
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

## 📝 Cambios en Respuestas de API

### Monitor - `getTicketsByBanca()`
**Antes**: Array de jugadas individuales
```json
[
  { "id": "1", "ticketId": "T123", "number": "05", "amount": 10 },
  { "id": "2", "ticketId": "T123", "number": "12", "amount": 5 }
]
```

**Ahora**: Array de tickets con sus detalles
```json
[
  {
    "id": "ticket-uuid",
    "externalTicketId": "T123",
    "totalAmount": 15,
    "details": [
      { "number": "05", "name": "TIGRE", "amount": 10 },
      { "number": "12", "name": "ELEFANTE", "amount": 5 }
    ]
  }
]
```

### Monitor - `getTicketsByItem()`
Similar estructura: tickets completos con detalles filtrados por item

## ⚠️ Próximos Pasos (Frontend)

Los siguientes archivos frontend necesitan actualización:

1. **Monitores y Reportes**:
   - `/app/admin/monitor/page.js` - Mostrar tickets agrupados
   - `/app/admin/reportes-taquilla/page.js` - Actualizar visualización
   - `/app/admin/tickets/page.js` - Lista de tickets

2. **Modales**:
   - Crear modal de detalles de ticket
   - Mostrar ticket con todas sus jugadas
   - No duplicar tickets por múltiples jugadas

3. **Componentes**:
   - Actualizar componentes que muestran tickets
   - Adaptar a nueva estructura de respuesta

## 🎯 Beneficios de la Unificación

1. **Consistencia**: Misma estructura para todos los proveedores
2. **No duplicados**: Un ticket = un registro (no uno por jugada)
3. **Mejor UX**: Ver ticket completo con todas sus jugadas
4. **Reportes claros**: Contar tickets correctamente
5. **Fácil mantenimiento**: Un solo modelo para todos
