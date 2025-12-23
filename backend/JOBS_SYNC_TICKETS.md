# Job de Sincronización de Tickets (SRQ)

## 📋 Descripción

`sync-api-tickets.job.js` - Job automático que sincroniza tickets de ventas desde SRQ cada 5 minutos.

## 🔄 Lógica del Job

### Proceso

1. **Se ejecuta cada 5 minutos** (cron: `*/5 * * * *`)

2. **Por cada juego activo**:
   - Busca el **sorteo próximo a cerrar** (status `SCHEDULED`)
   - Solo sorteos que tengan **mapping de SRQ** (`external_draw_id`)
   - Solo si está **próximo a cerrar** (menos de 30 minutos)

3. **Para cada sorteo encontrado**:
   - **Elimina** todos los tickets y detalles existentes del sorteo
   - **Consulta** API de SRQ para obtener ventas actualizadas
   - **Inserta** todos los tickets y detalles asociados
   - **Selecciona** pre-ganador si no existe

### Objetivo

Permite **monitorear las jugadas en tiempo real** antes del cierre del sorteo para:
- Ver ventas actualizadas en el dashboard de admin
- Calcular pre-ganador basado en ventas reales
- Tomar decisiones antes del cierre

## 📊 Ejemplo de Ejecución

```
🎫 Sincronizando tickets de sorteos próximos a cerrar...
  📊 LOTOANIMALITO 04:00 p. m. (en 15 min)
     ✓ 45 tickets importados, 38 eliminados
     🎯 Pre-ganador: 05 (TIGRE)
  📊 LOTTOPANTERA 04:00 p. m. (en 15 min)
     ✓ 0 tickets importados, 0 eliminados
  📊 TRIPLE PANTERA 04:00 p. m. (en 15 min)
     ✓ 0 tickets importados, 0 eliminados
```

## ⚙️ Configuración

### Cron Schedule
```javascript
cronExpression: '*/5 * * * *'  // Cada 5 minutos
timezone: 'America/Caracas'
```

### Requisitos

1. **Juego activo**: `Game.isActive = true`
2. **Sorteo SCHEDULED**: `Draw.status = 'SCHEDULED'`
3. **Mapping de SRQ**: Debe existir `ApiDrawMapping` con `external_draw_id`
4. **API Config**: Debe existir `ApiConfiguration` tipo `SALES` activa

### Ventana de Sincronización

Solo sincroniza sorteos que estén a **menos de 30 minutos** de su hora programada.

## 🚀 Uso

### Automático (Producción)

El job se inicia automáticamente con el servidor:

```javascript
// src/jobs/index.js
syncApiTicketsJob.start();  // Se inicia con el servidor
```

### Manual (Pruebas)

```bash
# Ejecutar una vez manualmente
node test-sync-tickets.js

# Ver logs en tiempo real
tail -f logs/combined.log | grep "🎫"
```

### Ejecutar para un sorteo específico

```javascript
import syncApiTicketsJob from './src/jobs/sync-api-tickets.job.js';

// Sincronizar tickets de un sorteo específico
await syncApiTicketsJob.executeForDraw('draw-id-uuid');
```

### Ejecutar para todos los sorteos de hoy

```javascript
import syncApiTicketsJob from './src/jobs/sync-api-tickets.job.js';

// Sincronizar todos los sorteos de hoy
await syncApiTicketsJob.executeForToday();
```

## 📝 Logs

El job genera logs detallados:

```
info: 🎫 Sincronizando tickets de sorteos próximos a cerrar...
info:   📊 LOTOANIMALITO 04:00 p. m. (en 15 min)
info:      ✓ 45 tickets importados, 38 eliminados
info:      🎯 Pre-ganador: 05 (TIGRE)
```

## 🔍 Verificación

### Ver sorteos próximos a cerrar

```sql
SELECT 
  g.name,
  d."scheduledAt",
  d.status,
  COUNT(m.id) as tiene_mapping,
  COUNT(t.id) as tickets
FROM "Draw" d
JOIN "Game" g ON d."gameId" = g.id
LEFT JOIN "ApiDrawMapping" m ON m."drawId" = d.id
LEFT JOIN "Ticket" t ON t."drawId" = d.id AND t.source = 'EXTERNAL_API'
WHERE d.status = 'SCHEDULED'
  AND d."scheduledAt" > NOW()
  AND d."scheduledAt" < NOW() + INTERVAL '30 minutes'
GROUP BY g.name, d."scheduledAt", d.status
ORDER BY d."scheduledAt";
```

### Ver tickets sincronizados recientemente

```sql
SELECT 
  g.name,
  d."scheduledAt",
  COUNT(t.id) as tickets,
  SUM(t."totalAmount") as ventas,
  MAX(t."updatedAt") as ultima_sync
FROM "Draw" d
JOIN "Game" g ON d."gameId" = g.id
LEFT JOIN "Ticket" t ON t."drawId" = d.id AND t.source = 'EXTERNAL_API'
WHERE d.status = 'SCHEDULED'
GROUP BY g.name, d."scheduledAt"
ORDER BY ultima_sync DESC
LIMIT 10;
```

## ⚠️ Consideraciones

### 1. Solo LOTOANIMALITO tiene tickets

Actualmente, solo LOTOANIMALITO tiene mappings de SRQ en la base de datos:
- ✅ LOTOANIMALITO: 11,412 mappings → **sincroniza tickets**
- ❌ LOTTOPANTERA: 0 mappings → **no sincroniza tickets**
- ❌ TRIPLE PANTERA: 0 mappings → **no sincroniza tickets**

### 2. Eliminación de tickets

Cada sincronización **elimina todos los tickets anteriores** del sorteo antes de insertar los nuevos. Esto asegura que los datos estén siempre actualizados con SRQ.

### 3. Pre-ganador

El job selecciona automáticamente un pre-ganador basado en:
- Número con **menos ventas**
- Solo si hay tickets importados
- Solo si no existe pre-ganador previo

### 4. Performance

- Se ejecuta cada 5 minutos
- Solo procesa sorteos próximos (< 30 min)
- Procesa máximo 1 sorteo por juego
- Operación rápida (< 5 segundos por sorteo)

## 🐛 Troubleshooting

### No sincroniza tickets

**Verificar**:
1. ¿El juego está activo? (`Game.isActive = true`)
2. ¿Hay sorteo SCHEDULED próximo? (< 30 min)
3. ¿El sorteo tiene mapping? (`ApiDrawMapping` existe)
4. ¿Hay configuración de API? (`ApiConfiguration` tipo SALES activa)

### Tickets siempre en 0

**Posibles causas**:
1. No hay mappings de SRQ para ese juego en MySQL
2. El `external_draw_id` es incorrecto
3. El token de API de SRQ es inválido
4. SRQ no tiene ventas para ese sorteo

### Error al seleccionar pre-ganador

**Normal si**:
- No hay tickets importados
- Ya existe un pre-ganador
- Todos los números tienen las mismas ventas

## 📈 Monitoreo

### Dashboard de Admin

El dashboard de admin muestra:
- Sorteos próximos a cerrar
- Tickets importados en tiempo real
- Pre-ganador seleccionado
- Última sincronización

### Logs

```bash
# Ver logs de sincronización
tail -f logs/combined.log | grep "🎫"

# Ver solo errores
tail -f logs/error.log | grep "SyncApiTickets"
```

## 🔧 Mantenimiento

### Detener el job

```javascript
import syncApiTicketsJob from './src/jobs/sync-api-tickets.job.js';

syncApiTicketsJob.stop();
```

### Cambiar frecuencia

Editar `sync-api-tickets.job.js`:

```javascript
this.cronExpression = '*/10 * * * *'; // Cada 10 minutos
```

### Cambiar ventana de tiempo

Editar `sync-api-tickets.job.js`:

```javascript
// Línea 105
if (minutesUntilDraw > 60) {  // Cambiar a 60 minutos
  continue;
}
```
