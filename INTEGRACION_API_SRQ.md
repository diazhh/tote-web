# Integración API SRQ - Sistema de Ventas Externas

## 📋 Resumen

El sistema **NO vende tickets directamente**. En su lugar, **importa ventas de sistemas externos** (terceros) que ya están vendiendo para los mismos sorteos. La integración principal es con **SRQ (Sistema RQ)**.

## 🔄 Flujo de Trabajo

### 1️⃣ **Planificación Matutina** (00:05 AM)
Después de que el sistema crea los sorteos del día (`planned_draws`):

1. Se consulta la **API de Planificación de SRQ** para obtener los sorteos del día
2. Se **relacionan** los sorteos locales con los sorteos externos
3. Se guarda el mapeo en `api_draw_mappings`

**Endpoint de Planificación:**
```
GET https://api2.sistemasrq.com/externalapi/operator/loteries?date=YYYY-MM-DD&token={TOKEN}
```

### 2️⃣ **Cierre de Sorteo** (Al cerrar cada sorteo)
Cuando un sorteo se cierra:

1. Se consulta la **API de Ventas de SRQ** usando el `external_draw_id`
2. Se obtienen todos los **tickets vendidos** en el sistema externo
3. Se guardan en `item_sales` (ventas por número/item)
4. Se totalizan en `planned_draws` (total_sales, total_prizes, profit)

**Endpoint de Ventas:**
```
GET https://api2.sistemasrq.com/externalapi/operator/tickets/{external_draw_id}?token={TOKEN}
```

---

## 🗄️ Estructura de Tablas

### **api_systems**
Sistemas de APIs externos disponibles.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | ID único |
| name | varchar(255) | Nombre (ej: "SRQ") |
| description | text | Descripción |

**Datos actuales:**
- ID: 1, Name: "SRQ"

---

### **api_configurations**
Configuraciones de endpoints por juego y tipo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | ID único |
| name | varchar(255) | Nombre descriptivo |
| base_url | text | URL del endpoint |
| token | text | Token de autenticación |
| type | enum | 'planificacion' o 'ventas' |
| api_system_id | bigint | FK → api_systems |
| game_id | bigint | FK → games |

**Ejemplo - Planificación:**
```json
{
  "id": 12,
  "name": "SRQ Planificación Juego 1",
  "base_url": "https://api2.sistemasrq.com/externalapi/operator/loteries?date=",
  "token": "883124a2d52127a67e2922755331b164028372724373643d9da5a9db3f8de30a",
  "type": "planificacion",
  "api_system_id": 1,
  "game_id": 1
}
```

**Ejemplo - Ventas:**
```json
{
  "id": 11,
  "name": "SRQ Ventas Juego 1",
  "base_url": "https://api2.sistemasrq.com/externalapi/operator/tickets/",
  "token": "883124a2d52127a67e2922755331b164028372724373643d9da5a9db3f8de30a",
  "type": "ventas",
  "api_system_id": 1,
  "game_id": 1
}
```

**Configuraciones por Juego:**
- **Juego 1 (LOTOANIMALITO)**: IDs 11, 12
- **Juego 2 (LOTTOPANTERA)**: IDs 7, 8
- **Juego 3 (LOTOTRIPLE)**: IDs 9, 10

---

### **api_draw_mappings**
Relaciona sorteos locales con sorteos externos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | ID único |
| api_id | bigint | FK → api_configurations |
| planned_draw_id | bigint | FK → planned_draws |
| external_draw_id | varchar(255) | ID del sorteo en el sistema externo |

**Ejemplo:**
```json
{
  "id": 367,
  "api_id": 1,
  "planned_draw_id": 5545,
  "external_draw_id": "661868"
}
```

**Estadísticas:**
- Total de mappings: **8,460**

---

### **item_sales**
Ventas individuales por número/item (tickets vendidos).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | ID único |
| planned_draw_id | bigint | FK → planned_draws |
| game_item_id | bigint | FK → game_items |
| sales_date | date | Fecha de venta |
| taquilla_id | bigint | ID de taquilla externa |
| grupo_id | bigint | ID de grupo externo |
| banca_id | bigint | ID de banca externa |
| comercial_id | bigint | ID de comercial externo |
| amount | decimal(10,2) | Monto apostado |

**Ejemplo:**
```json
{
  "id": 66766,
  "planned_draw_id": 5545,
  "game_item_id": 61,
  "sales_date": "2025-01-29",
  "taquilla_id": 25382,
  "grupo_id": 1914,
  "banca_id": 368,
  "comercial_id": 361,
  "amount": "5.00"
}
```

**Estadísticas:**
- Total de tickets importados: **1,090,756**

---

### **entity_sales**
Ventas totalizadas por entidad (resumen).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | ID único |
| planned_draw_id | bigint | FK → planned_draws |
| game_item_id | bigint | FK → game_items (nullable) |
| total_sales | decimal(10,2) | Total vendido |
| total_prizes | decimal(10,2) | Total premios |
| net_profit | decimal(10,2) | Ganancia neta |
| taquilla_id | bigint | ID de taquilla |
| grupo_id | bigint | ID de grupo |
| banca_id | bigint | ID de banca |
| comercial_id | bigint | ID de comercial |

**Estadísticas:**
- Total de registros: **0** (no se está usando actualmente)

---

## 📊 Ejemplo de Datos Reales

### Sorteo: LOTTOPANTERA - 02 PM (2025-02-09)

**Planned Draw:**
```json
{
  "id": 5545,
  "game_id": 2,
  "game_draw_id": 32,
  "date": "2025-02-09",
  "status": "totalizado",
  "winner_item_id": 84,
  "total_sales": "68.00",
  "total_prizes": "0.00",
  "profit": "68.00",
  "profit_percentage": "100.00",
  "external_draw_id": "661868"
}
```

**Tickets Vendidos:**
- Total tickets: **9**
- Total ventas: **$68.00**
- Números apostados: 40 (PANTERA), 49, 44, 61, 75, 53, 101
- Taquillas: 25382, 18940, 14813, 20805, 19256, 17761

---

## 🔧 Implementación Técnica

### Jobs Necesarios (Backend)

#### 1. **Job de Sincronización de Planificación**
```javascript
// Se ejecuta después de generate-daily-draws.job.js (00:05 AM)
// Archivo: sync-api-planning.job.js

async function syncApiPlanning() {
  const today = new Date().toISOString().split('T')[0];
  
  // Obtener configuraciones de planificación activas
  const planningConfigs = await prisma.apiConfiguration.findMany({
    where: { type: 'planificacion' }
  });
  
  for (const config of planningConfigs) {
    // Llamar a la API
    const url = `${config.base_url}${today}&token=${config.token}`;
    const response = await fetch(url);
    const data = await response.json();
    
    // Mapear sorteos externos con sorteos locales
    for (const externalDraw of data.loteries) {
      const plannedDraw = await findMatchingPlannedDraw(
        config.game_id,
        externalDraw.time,
        today
      );
      
      if (plannedDraw) {
        await prisma.apiDrawMapping.create({
          data: {
            api_id: config.id,
            planned_draw_id: plannedDraw.id,
            external_draw_id: externalDraw.id
          }
        });
      }
    }
  }
}
```

#### 2. **Job de Importación de Ventas**
```javascript
// Se ejecuta al cerrar cada sorteo
// Modificar: close-draw.job.js

async function importSalesAfterClose(plannedDrawId) {
  // Obtener el mapping
  const mapping = await prisma.apiDrawMapping.findFirst({
    where: { planned_draw_id: plannedDrawId },
    include: { apiConfiguration: true }
  });
  
  if (!mapping) return;
  
  // Obtener configuración de ventas para este juego
  const salesConfig = await prisma.apiConfiguration.findFirst({
    where: {
      game_id: mapping.plannedDraw.game_id,
      type: 'ventas'
    }
  });
  
  // Llamar a la API de tickets
  const url = `${salesConfig.base_url}${mapping.external_draw_id}?token=${salesConfig.token}`;
  const response = await fetch(url);
  const data = await response.json();
  
  // Guardar tickets en item_sales
  for (const ticket of data.tickets) {
    const gameItem = await findGameItemByNumber(ticket.number);
    
    await prisma.itemSale.create({
      data: {
        planned_draw_id: plannedDrawId,
        game_item_id: gameItem.id,
        sales_date: ticket.date,
        taquilla_id: ticket.taquilla_id,
        grupo_id: ticket.grupo_id,
        banca_id: ticket.banca_id,
        comercial_id: ticket.comercial_id,
        amount: ticket.amount
      }
    });
  }
  
  // Totalizar ventas
  const totalSales = data.tickets.reduce((sum, t) => sum + t.amount, 0);
  
  await prisma.plannedDraw.update({
    where: { id: plannedDrawId },
    data: {
      total_sales: totalSales,
      total_prizes: calculatePrizes(data.tickets, winnerItem),
      profit: totalSales - totalPrizes
    }
  });
}
```

---

## 🎯 Puntos Clave

1. ✅ **El sistema NO vende tickets** - Solo importa ventas de terceros
2. ✅ **Doble planificación** - Local (planned_draws) + Externa (SRQ)
3. ✅ **Mapeo 1:1** - Cada sorteo local se relaciona con un sorteo externo
4. ✅ **Importación al cierre** - Las ventas se traen cuando el sorteo cierra
5. ✅ **Jerarquía de entidades** - Comercial → Banca → Grupo → Taquilla
6. ✅ **Totalización automática** - Se calculan ventas, premios y ganancias

---

## 📈 Estadísticas del Sistema

- **Total de sorteos mapeados**: 8,460
- **Total de tickets importados**: 1,090,756
- **Sistemas integrados**: 1 (SRQ)
- **Juegos con integración**: 3 (LOTOANIMALITO, LOTTOPANTERA, LOTOTRIPLE)

---

## 🔐 Seguridad

- Los tokens están almacenados en la base de datos
- Cada juego tiene su propio token
- Los tokens pueden expirar y necesitan renovación
- **Nota**: Los tokens actuales parecen estar inactivos/expirados
