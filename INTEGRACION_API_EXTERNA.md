# Integración con APIs Externas - Sistema Nuevo

## 📋 Resumen

El sistema **NUEVO** (PostgreSQL + Prisma) integra ventas de sistemas externos mediante APIs. No vende tickets directamente, sino que importa las ventas de otros sistemas que ya están vendiendo para los mismos sorteos.

## 🏗️ Arquitectura

### Tablas Agregadas al Schema de Prisma

#### 1. **ApiSystem**
Define los sistemas de APIs externos disponibles.

```prisma
model ApiSystem {
  id            String            @id @default(uuid())
  name          String            // "SRQ", "OtroSistema"
  description   String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  
  configurations ApiConfiguration[]
}
```

#### 2. **ApiConfiguration**
Configuraciones de endpoints por juego y tipo.

```prisma
model ApiConfiguration {
  id            String            @id @default(uuid())
  name          String            // "SRQ Planificación Juego X"
  apiSystemId   String
  gameId        String
  type          ApiConfigType     // "PLANNING" | "SALES"
  baseUrl       String            // URL base del endpoint
  token         String            // Token de autenticación
  isActive      Boolean           @default(true)
  
  apiSystem     ApiSystem         @relation(...)
  game          Game              @relation(...)
  drawMappings  ApiDrawMapping[]
}

enum ApiConfigType {
  PLANNING  // Para obtener planificación de sorteos
  SALES     // Para obtener ventas/tickets
}
```

#### 3. **ApiDrawMapping**
Relaciona sorteos locales (`Draw`) con sorteos externos.

```prisma
model ApiDrawMapping {
  id              String            @id @default(uuid())
  apiConfigId     String
  drawId          String
  externalDrawId  String            // ID del sorteo en el sistema externo
  
  apiConfig       ApiConfiguration  @relation(...)
  draw            Draw              @relation(...)
  tickets         ExternalTicket[]
  
  @@unique([externalDrawId])
  @@unique([drawId, apiConfigId])
}
```

#### 4. **ExternalTicket**
Tickets/ventas importados de sistemas externos.

```prisma
model ExternalTicket {
  id              String            @id @default(uuid())
  mappingId       String
  gameItemId      String
  amount          Decimal           @db.Decimal(10, 2)
  externalData    Json?             // Datos adicionales (taquilla, grupo, etc)
  
  mapping         ApiDrawMapping    @relation(...)
  gameItem        GameItem          @relation(...)
}
```

---

## 🔄 Flujo de Trabajo

### 1️⃣ **Generación de Sorteos** (00:05 AM)
El job `generate-daily-draws.job.js` crea los sorteos del día basados en las plantillas.

### 2️⃣ **Sincronización con API Externa** (6:00 AM)
El job `sync-api-planning.job.js` ejecuta:

1. Consulta las configuraciones de tipo `PLANNING` activas
2. Para cada configuración, llama a la API externa:
   ```
   GET {baseUrl}{fecha}&token={token}
   ```
3. Recibe la lista de sorteos externos del día
4. **Mapea hardcoded** cada sorteo externo con un sorteo local por hora
5. Crea registros en `ApiDrawMapping`

**Ejemplo de mapeo:**
- Sorteo externo: `{ id: "661868", time: "02 PM" }`
- Sorteo local: `Draw` con `scheduledAt` a las 14:00
- Se crea: `ApiDrawMapping` con `externalDrawId: "661868"` y `drawId: {uuid}`

### 3️⃣ **Cierre de Sorteo** (5 minutos antes)
El job `close-draw.job.js` modificado ejecuta:

1. **ANTES de cerrar**: Importa tickets de la API externa
   - Busca el `ApiDrawMapping` del sorteo
   - Obtiene la configuración de tipo `SALES`
   - Llama a la API:
     ```
     GET {baseUrl}{externalDrawId}?token={token}
     ```
   - Recibe los tickets vendidos
   - Guarda cada ticket en `ExternalTicket`

2. **Cierra el sorteo**: Selecciona ganador aleatorio y cambia status a `CLOSED`

---

## 📁 Archivos Creados/Modificados

### Nuevos Archivos

1. **`/backend/src/services/api-integration.service.js`**
   - `syncSRQPlanning(date)` - Sincroniza planificación
   - `mapExternalDraw()` - Mapea sorteo externo con local
   - `findMatchingLocalDraw()` - Encuentra sorteo local por hora
   - `parseDrawTime()` - Parsea formatos de hora ("08 AM", "14:00")
   - `importSRQTickets(drawId)` - Importa tickets de un sorteo
   - `saveTicket()` - Guarda un ticket individual
   - `getDrawSalesStats(drawId)` - Obtiene estadísticas de ventas

2. **`/backend/src/jobs/sync-api-planning.job.js`**
   - Job que se ejecuta a las 6:00 AM
   - Llama a `apiIntegrationService.syncSRQPlanning()`

### Archivos Modificados

1. **`/backend/prisma/schema.prisma`**
   - Agregados modelos: `ApiSystem`, `ApiConfiguration`, `ApiDrawMapping`, `ExternalTicket`
   - Agregado enum: `ApiConfigType`
   - Agregadas relaciones en `Game`, `GameItem`, `Draw`

2. **`/backend/src/jobs/close-draw.job.js`**
   - Agregada importación de `apiIntegrationService`
   - Agregado código para importar tickets antes de cerrar sorteo

3. **`/backend/src/jobs/index.js`**
   - Agregado `syncApiPlanningJob` al inicio y detención de jobs

---

## 🚀 Uso

### Migrar la Base de Datos

```bash
cd backend
npx prisma migrate dev --name add_api_integration
npx prisma generate
```

### Crear Configuraciones de API

```javascript
// Crear sistema API
const srqSystem = await prisma.apiSystem.create({
  data: {
    name: 'SRQ',
    description: 'Sistema RQ - Proveedor de ventas externas'
  }
});

// Crear configuración de planificación
await prisma.apiConfiguration.create({
  data: {
    name: 'SRQ Planificación Animalitos',
    apiSystemId: srqSystem.id,
    gameId: '{game-uuid}',
    type: 'PLANNING',
    baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/loteries?date=',
    token: 'tu-token-aqui',
    isActive: true
  }
});

// Crear configuración de ventas
await prisma.apiConfiguration.create({
  data: {
    name: 'SRQ Ventas Animalitos',
    apiSystemId: srqSystem.id,
    gameId: '{game-uuid}',
    type: 'SALES',
    baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/tickets/',
    token: 'tu-token-aqui',
    isActive: true
  }
});
```

### Ejecutar Manualmente

```javascript
import apiIntegrationService from './src/services/api-integration.service.js';

// Sincronizar planificación de hoy
const result = await apiIntegrationService.syncSRQPlanning(new Date());
console.log(`Mapeados: ${result.mapped}, Saltados: ${result.skipped}`);

// Importar tickets de un sorteo específico
const tickets = await apiIntegrationService.importSRQTickets('draw-uuid');
console.log(`Importados: ${tickets.imported}, Saltados: ${tickets.skipped}`);

// Obtener estadísticas de ventas
const stats = await apiIntegrationService.getDrawSalesStats('draw-uuid');
console.log(`Total ventas: $${stats.totalSales}`);
console.log(`Total tickets: ${stats.totalTickets}`);
```

---

## 🔐 Configuración de Tokens

Los tokens de API se almacenan en la base de datos en la tabla `ApiConfiguration`. Asegúrate de:

1. Usar tokens válidos y activos
2. Configurar un token diferente por juego si es necesario
3. Renovar tokens cuando expiren

---

## 📊 Consultas Útiles

### Ver mappings de un sorteo
```javascript
const mapping = await prisma.apiDrawMapping.findFirst({
  where: { drawId: 'draw-uuid' },
  include: {
    apiConfig: true,
    tickets: {
      include: {
        gameItem: true
      }
    }
  }
});
```

### Ver tickets importados de un sorteo
```javascript
const tickets = await prisma.externalTicket.findMany({
  where: {
    mapping: {
      drawId: 'draw-uuid'
    }
  },
  include: {
    gameItem: true
  }
});
```

### Total de ventas por sorteo
```javascript
const total = await prisma.externalTicket.aggregate({
  where: {
    mapping: {
      drawId: 'draw-uuid'
    }
  },
  _sum: {
    amount: true
  }
});
```

---

## ⚠️ Notas Importantes

1. **Sistema Nuevo vs Legacy**: Este código es para el sistema NUEVO con PostgreSQL. NO modifica la base de datos MySQL legacy.

2. **Mapeo Hardcoded**: El mapeo entre sorteos externos y locales se hace por coincidencia de hora. Ajusta la lógica en `findMatchingLocalDraw()` según tus necesidades.

3. **Fetch Nativo**: Usa `fetch` nativo de Node.js 18+. No requiere `node-fetch`.

4. **Manejo de Errores**: Si falla la importación de tickets, el sorteo se cierra de todas formas. Los errores se registran en los logs.

5. **Duplicados**: El sistema evita duplicados verificando si ya existe un mapping o ticket antes de crearlo.

---

## 🎯 Próximos Pasos

- [ ] Crear endpoints API para gestionar configuraciones de APIs
- [ ] Agregar UI para configurar tokens y URLs
- [ ] Implementar sistema de notificaciones cuando falle la importación
- [ ] Agregar métricas y monitoreo de importaciones
- [ ] Soportar múltiples proveedores de APIs (no solo SRQ)
