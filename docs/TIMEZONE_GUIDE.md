# Guía de Manejo de Fechas y Zonas Horarias

## Resumen

El sistema opera en **hora de Caracas (America/Caracas, UTC-4)**. Todas las fechas se almacenan en UTC en PostgreSQL y se convierten a hora de Caracas para mostrar al usuario.

## Reglas Fundamentales

### 1. Almacenamiento en Base de Datos
- **PostgreSQL almacena fechas en UTC** (timestamp without timezone se interpreta como UTC)
- Los campos `scheduledAt`, `createdAt`, `drawnAt`, etc. están en UTC

### 2. Horas de Sorteos
- Los sorteos están programados en **hora de Caracas**
- Ejemplo: Un sorteo de las "17:00" significa 17:00 hora Caracas = 21:00 UTC

### 3. Conversión de Fechas

```javascript
// Backend: Usar las utilidades de dateUtils.js
import { 
  createCaracasDate,      // Crear fecha en Caracas → UTC
  toCaracasTime,          // UTC → Caracas para mostrar
  startOfDayInCaracas,    // Inicio del día en Caracas (00:00) → UTC
  endOfDayInCaracas,      // Fin del día en Caracas (23:59) → UTC
  formatCaracasTime       // Formatear hora para mostrar
} from '../lib/dateUtils.js';

// Ejemplo: Crear sorteo de las 17:00 del 22/12/2025
const scheduledAt = createCaracasDate(2025, 12, 22, 17, 0, 0);
// Resultado: 2025-12-22T21:00:00.000Z (UTC)

// Ejemplo: Filtrar sorteos del día 22/12/2025
const start = startOfDayInCaracas(new Date('2025-12-22'));
// Resultado: 2025-12-22T04:00:00.000Z (00:00 Caracas = 04:00 UTC)
const end = endOfDayInCaracas(new Date('2025-12-22'));
// Resultado: 2025-12-23T03:59:59.000Z (23:59 Caracas = 03:59 UTC del día siguiente)
```

### 4. Frontend
```javascript
// Usar las utilidades de lib/dateUtils.js
import { 
  getTodayVenezuela,      // Fecha actual en formato YYYY-MM-DD
  formatTimeVenezuela,    // Formatear hora ISO → HH:MM
  formatDateVenezuela,    // Formatear fecha ISO → DD/MM/YYYY
  formatDateTimeVenezuela // Formatear fecha+hora
} from '@/lib/dateUtils';

// Ejemplo: Obtener fecha de hoy para input
const today = getTodayVenezuela(); // "2025-12-22"

// Ejemplo: Mostrar hora de sorteo
const hora = formatTimeVenezuela(draw.scheduledAt); // "17:00"
```

### 5. API Endpoints
Cuando el frontend envía una fecha (ej: `dateFrom=2025-12-22`), el backend la interpreta como fecha en Caracas:

```javascript
// En el controlador/servicio
if (filters.dateFrom) {
  // Interpretar como medianoche en Caracas
  const fromDate = new Date(filters.dateFrom + 'T00:00:00-04:00');
  where.scheduledAt.gte = fromDate;
}
```

## Errores Comunes a Evitar

### ❌ Incorrecto
```javascript
// NO usar new Date() sin timezone para filtros de fecha
const today = new Date();
today.setHours(0, 0, 0, 0); // Esto usa timezone del servidor, no Caracas!

// NO usar startOfDay/endOfDay de date-fns sin timezone
import { startOfDay } from 'date-fns';
const start = startOfDay(date); // Usa timezone local del servidor!
```

### ✅ Correcto
```javascript
// Usar las funciones de dateUtils.js
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';
const start = startOfDayInCaracas(date);
const end = endOfDayInCaracas(date);
```

## Sincronización MySQL → PostgreSQL

### Datos en MySQL (Producción)
- Las horas en MySQL están en **hora de Caracas**
- Ejemplo: `game_draws.time = '17:00:00'` significa 17:00 Caracas

### Conversión al Sincronizar
```javascript
// El script sync-mysql-production.js convierte correctamente:
function mysqlToUTC(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  
  // Crear fecha en Caracas y convertir a UTC
  return createCaracasDate(year, month, day, hours, minutes, seconds);
}
```

## Comandos de Sincronización

```bash
# Sincronización completa
yarn sync:production

# Solo sorteos
yarn sync:production:draws

# Solo tickets
yarn sync:production:tickets

# Ver qué haría sin ejecutar
yarn sync:production:dry

# Desde una fecha específica
yarn sync:production -- --date=2025-12-01
```

## Tabla de Conversión Rápida

| Hora Caracas | Hora UTC |
|--------------|----------|
| 00:00        | 04:00    |
| 08:00        | 12:00    |
| 12:00        | 16:00    |
| 17:00        | 21:00    |
| 19:00        | 23:00    |
| 23:59        | 03:59 (+1 día) |

## Archivos Clave

- **Backend**: `/backend/src/lib/dateUtils.js` - Utilidades de conversión
- **Frontend**: `/frontend/lib/dateUtils.js` - Utilidades para UI
- **Sincronización**: `/backend/src/scripts/sync-mysql-production.js` - Script oficial
