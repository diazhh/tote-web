# Flujo Completo de Sorteos

## 📋 Resumen del Flujo

### 1. Generación Diaria de Sorteos (01:05 AM)
**Job:** `generate-daily-draws.job.js`
- Se ejecuta a la 1:05 AM (hora Caracas)
- Lee las plantillas activas (`DrawTemplate`)
- Crea sorteos para cada hora del día
- Estado inicial: `SCHEDULED`

### 2. Sincronización con SRQ (06:00 AM)
**Job:** `sync-api-planning.job.js`
- Se ejecuta a las 6:00 AM (hora Caracas)
- Obtiene los IDs externos de SRQ
- Crea `ApiDrawMapping` para asociar sorteos locales con IDs de SRQ

### 3. Sincronización de Tickets (Cada 5 minutos)
**Job:** `sync-api-tickets.job.js`
- Se ejecuta cada 5 minutos
- Por cada juego activo, busca el sorteo PRÓXIMO a cerrar (status SCHEDULED)
- Solo sincroniza sorteos que tengan mapping de SRQ

**Proceso por sorteo:**
1. **Elimina** todos los tickets externos existentes del sorteo
2. Consulta API de SRQ para obtener ventas actualizadas
3. **Inserta** todos los tickets y detalles asociados
4. Se repite cada 5 minutos hasta que el sorteo cambie a CLOSED

**Ejemplo:**
- 5:00pm → Sincroniza sorteo de 6:00pm
- 5:05pm → Sincroniza sorteo de 6:00pm (elimina + inserta)
- 5:50pm → Sincroniza sorteo de 6:00pm (elimina + inserta)
- 5:55pm → **Sorteo se cierra**, deja de sincronizar
- 6:00pm → Comienza a sincronizar sorteo de 7:00pm

### 4. Cierre de Sorteos (Cada minuto, 5 min antes)
**Job:** `close-draw.job.js`
- Se ejecuta cada minuto
- Busca sorteos que deben cerrarse (5 minutos antes de su hora)
- Ejemplo: Sorteo de 6:00pm se cierra a las 5:55pm

**Proceso de cierre:**

1. **Importación final de tickets:**
   - Elimina todos los tickets externos anteriores
   - Consulta API de SRQ por última vez
   - Inserta tickets actualizados

2. **Pre-selección de ganador:**
   - Si hay tickets: usa lógica inteligente (`prewinner-selection.service.js`)
     - Calcula ventas totales y máximo a pagar
     - Agrupa ventas por número
     - Selecciona número que minimice pago pero maximice ganadores
     - Evita números usados hoy
     - Para TRIPLE: distribuye en diferentes centenas
   - Si no hay tickets: selección aleatoria

3. **Actualización del sorteo:**
   - Cambia status a `CLOSED`
   - Guarda `preselectedItemId`
   - Registra `closedAt`

4. **Generación de PDF:**
   - Genera reporte con ventas y pre-ganador
   - Guarda PDF en storage

5. **Notificación por Telegram:**
   - Envía mensaje a administradores
   - Adjunta PDF del reporte
   - Incluye detalles de ventas y pre-ganador

### 5. Ejecución del Sorteo (A su hora exacta)
**Job:** `execute-draw.job.js`
- Se ejecuta cada minuto
- Busca sorteos CLOSED cuya hora ya pasó
- Cambia status a `DRAWN`
- Copia `preselectedItemId` a `winnerItemId`
- Registra `drawnAt`

### 6. Publicación en Canales (Después de ejecutar)
**Job:** `publish-draw.job.js`
- Se ejecuta cada minuto
- Busca sorteos DRAWN no publicados
- Publica en canales configurados (Telegram, WhatsApp)
- Cambia status a `PUBLISHED`
- Registra `publishedAt`

## 🔧 Servicios Clave

### `api-integration.service.js`
- `importSRQTickets(drawId, clearExisting = true)`
  - Si `clearExisting = true`: elimina tickets anteriores
  - Consulta API de SRQ
  - Inserta nuevos tickets

### `prewinner-selection.service.js`
- `selectPrewinner(drawId)`
  - Lógica inteligente de selección
  - Genera PDF
  - Envía notificación por Telegram
  - Actualiza sorteo con pre-ganador

### `pdf-report.service.js`
- `generateDrawClosingReport(data)`
  - Genera PDF con ventas y pre-ganador

### `admin-notification.service.js`
- `notifyPrewinnerSelected(data)`
  - Envía mensaje por Telegram
  - Adjunta PDF

## ⏰ Timeline de un Sorteo (Ejemplo: 6:00 PM)

```
05:00 PM → Sincroniza tickets (elimina + inserta)
05:05 PM → Sincroniza tickets (elimina + inserta)
05:10 PM → Sincroniza tickets (elimina + inserta)
...
05:50 PM → Sincroniza tickets (elimina + inserta)
05:55 PM → CIERRE:
           1. Importa tickets por última vez (elimina + inserta)
           2. Pre-selecciona ganador (lógica inteligente)
           3. Genera PDF
           4. Envía Telegram
           Status: CLOSED
06:00 PM → EJECUCIÓN:
           - Copia pre-ganador a ganador
           Status: DRAWN
06:01 PM → PUBLICACIÓN:
           - Publica en canales
           Status: PUBLISHED
```

## 🔄 Jobs Registrados

Todos los jobs se inician en `src/index.js:294` con `startAllJobs()`:

1. `generateDailyDrawsJob` - 01:05 AM
2. `syncApiPlanningJob` - 06:00 AM
3. `syncApiTicketsJob` - Cada 5 minutos
4. `closeDrawJob` - Cada minuto
5. `executeDrawJob` - Cada minuto
6. `publishDrawJob` - Cada minuto

## ✅ Verificación del Flujo

Para verificar que el flujo funciona correctamente:

```bash
# Ver sorteos de hoy
node check-draws-today.js

# Ver estado de sorteos específicos
node check-8am-status.js

# Ejecutar manualmente cierre de sorteos
node close-8am-draws.js
```
