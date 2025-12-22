# ROADMAP - Mejoras del Sistema de Taquilla

## 📋 Resumen Ejecutivo

Este documento detalla las mejoras planificadas para el sistema de taquilla online, incluyendo:
1. Estructura de entidades de proveedores (Comercial → Banca → Grupo → Taquilla)
2. Sincronización de tickets cada 5 minutos con limpieza previa
3. Proveedor interno para taquilla web
4. Validaciones de backend para ventas web
5. Control de acceso reforzado
6. Monitor de sorteos con análisis de bancas, números y tripletas
7. Reportes avanzados para selección de ganadores

---

## 🔍 Estado Actual del Sistema

### Base de Datos (Prisma Schema)
- **ExternalTicket**: Guarda tickets de proveedores externos con `externalData` JSON que contiene `taquillaID`, `grupoID`, `bancaID`, `comercialID`
- **Ticket/TicketDetail**: Sistema de tickets de taquilla web (usuarios PLAYER)
- **TripleBet**: Sistema de apuestas tripleta con verificación automática
- **ApiConfiguration**: Configuraciones de APIs externas (SRQ)
- **ApiDrawMapping**: Mapeo entre sorteos locales y externos

### Servicios Existentes
- `api-integration.service.js`: Importa tickets de SRQ
- `srq.service.js`: Sincronización con API SRQ
- `ticket.service.js`: Gestión de tickets de taquilla web
- `tripleta.service.js`: Gestión de apuestas tripleta
- `prewinner-selection.service.js`: Selección automática de pre-ganadores

### Jobs Existentes
- `sync-api-tickets.job.js`: Sincroniza tickets cada minuto (5 min antes del sorteo)
- `sync-api-planning.job.js`: Sincroniza planificación de sorteos

---

## 📌 FASE 1: Estructura de Entidades de Proveedores

### 1.1 Crear Modelos de Base de Datos

**Archivo:** `backend/prisma/schema.prisma`

```prisma
// Jerarquía: Comercial → Banca → Grupo → Taquilla
// El nivel más alto es Comercial, el más bajo es Taquilla

model ProviderComercial {
  id            String          @id @default(uuid())
  externalId    Int             @unique  // ID del proveedor externo
  providerId    String          // ID del ApiSystem (proveedor)
  name          String?         // Nombre (se llenará después)
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  
  provider      ApiSystem       @relation(fields: [providerId], references: [id])
  bancas        ProviderBanca[]
  
  @@unique([providerId, externalId])
  @@index([providerId])
  @@index([externalId])
}

model ProviderBanca {
  id            String              @id @default(uuid())
  externalId    Int                 // ID del proveedor externo
  comercialId   String
  name          String?
  isActive      Boolean             @default(true)
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  
  comercial     ProviderComercial   @relation(fields: [comercialId], references: [id], onDelete: Cascade)
  grupos        ProviderGrupo[]
  
  @@unique([comercialId, externalId])
  @@index([comercialId])
  @@index([externalId])
}

model ProviderGrupo {
  id            String          @id @default(uuid())
  externalId    Int
  bancaId       String
  name          String?
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  
  banca         ProviderBanca   @relation(fields: [bancaId], references: [id], onDelete: Cascade)
  taquillas     ProviderTaquilla[]
  
  @@unique([bancaId, externalId])
  @@index([bancaId])
  @@index([externalId])
}

model ProviderTaquilla {
  id            String          @id @default(uuid())
  externalId    Int
  grupoId       String
  name          String?
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  
  grupo         ProviderGrupo   @relation(fields: [grupoId], references: [id], onDelete: Cascade)
  
  @@unique([grupoId, externalId])
  @@index([grupoId])
  @@index([externalId])
}
```

### 1.2 Crear Servicio de Entidades

**Archivo:** `backend/src/services/provider-entities.service.js`

**Funcionalidades:**
- `ensureEntitiesExist(providerId, ticket)`: Verifica y crea entidades si no existen
- `getOrCreateComercial(providerId, comercialId)`
- `getOrCreateBanca(comercialId, bancaId)`
- `getOrCreateGrupo(bancaId, grupoId)`
- `getOrCreateTaquilla(grupoId, taquillaId)`

### 1.3 Modificar Importación de Tickets

**Archivo:** `backend/src/services/api-integration.service.js`

Modificar `saveTicket()` para:
1. Llamar a `providerEntitiesService.ensureEntitiesExist()` antes de guardar
2. Guardar referencias a las entidades en `ExternalTicket.externalData`

### Tareas:
- [ ] Crear migración Prisma con nuevos modelos
- [ ] Crear `provider-entities.service.js`
- [ ] Modificar `api-integration.service.js` para usar el nuevo servicio
- [ ] Agregar endpoint para listar entidades por proveedor
- [ ] Agregar endpoint para actualizar nombres de entidades

**Estimación:** 4-6 horas

---

## 📌 FASE 2: Sincronización de Tickets cada 5 Minutos

### 2.1 Modificar Job de Sincronización

**Archivo:** `backend/src/jobs/sync-api-tickets.job.js`

**Cambios:**
1. Cambiar `cronExpression` de `'* * * * *'` a `'*/5 * * * *'` (cada 5 minutos)
2. Antes de importar tickets, eliminar los existentes del sorteo

### 2.2 Modificar Servicio de Integración

**Archivo:** `backend/src/services/api-integration.service.js`

```javascript
async importSRQTickets(drawId, clearExisting = true) {
  // ... código existente ...
  
  // NUEVO: Limpiar tickets existentes antes de importar
  if (clearExisting && mapping) {
    await prisma.externalTicket.deleteMany({
      where: { mappingId: mapping.id }
    });
    logger.info(`  🗑️ Tickets anteriores eliminados para mapping ${mapping.id}`);
  }
  
  // ... resto del código ...
}
```

### Tareas:
- [ ] Modificar `sync-api-tickets.job.js` para ejecutar cada 5 minutos
- [ ] Agregar lógica de limpieza previa en `importSRQTickets()`
- [ ] Agregar logs para tracking de eliminaciones
- [ ] Probar que no se pierdan datos durante la sincronización

**Estimación:** 2-3 horas

---

## 📌 FASE 3: Proveedor Interno para Taquilla Web

### 3.1 Crear Proveedor "TAQUILLA_WEB"

**Datos a crear en DB:**

```javascript
// ApiSystem
{
  name: "TAQUILLA_WEB",
  description: "Proveedor interno para ventas de taquilla web"
}

// ProviderComercial (interno)
{
  externalId: 1,
  providerId: "<id_taquilla_web>",
  name: "Taquilla Web - Comercial"
}

// ProviderBanca
{
  externalId: 1,
  comercialId: "<id_comercial>",
  name: "Taquilla Web - Banca"
}

// ProviderGrupo
{
  externalId: 1,
  bancaId: "<id_banca>",
  name: "Taquilla Web - Grupo"
}

// ProviderTaquilla
{
  externalId: 1,
  grupoId: "<id_grupo>",
  name: "Taquilla Web - Taquilla"
}
```

### 3.2 Crear Script de Seed

**Archivo:** `backend/prisma/seed-taquilla-web.js`

### 3.3 Modificar Ticket Service

**Archivo:** `backend/src/services/ticket.service.js`

Al crear un ticket de taquilla web, también crear un `ExternalTicket` con las entidades del proveedor interno para mantener consistencia en reportes.

### Tareas:
- [ ] Crear seed para proveedor TAQUILLA_WEB
- [ ] Modificar `ticket.service.js` para crear ExternalTicket equivalente
- [ ] Asegurar que los reportes incluyan tickets de taquilla web

**Estimación:** 3-4 horas

---

## 📌 FASE 4: Validaciones de Backend para Taquilla Web

### 4.1 Validaciones en Ticket Service

**Archivo:** `backend/src/services/ticket.service.js`

**Validaciones actuales (ya implementadas):**
- ✅ Usuario existe
- ✅ Sorteo existe
- ✅ Sorteo en estado SCHEDULED
- ✅ Sorteo no cerrado
- ✅ Items pertenecen al juego
- ✅ Saldo suficiente

**Validaciones a agregar:**
- [ ] Verificar que el sorteo NO esté en estado CLOSED, DRAWN, PUBLISHED o CANCELLED
- [ ] Retornar detalles específicos de qué items no se pudieron vender y por qué
- [ ] Actualizar monto real descontado si algunos items fallan

### 4.2 Modificar Respuesta de Creación de Ticket

```javascript
// Respuesta mejorada
{
  success: true,
  ticket: { ... },
  warnings: [
    { itemId: "xxx", reason: "Sorteo cerrado", refunded: 10.00 }
  ],
  totalCharged: 50.00,
  totalRefunded: 10.00
}
```

### 4.3 Actualizar Frontend

**Archivo:** `frontend/app/jugar/page.js`

Mostrar alertas cuando algunos items no se vendieron.

### Tareas:
- [ ] Agregar validación de estado de sorteo por cada detalle
- [ ] Implementar respuesta parcial con warnings
- [ ] Actualizar frontend para mostrar warnings
- [ ] Agregar tests de validación

**Estimación:** 4-5 horas

---

## 📌 FASE 5: Control de Acceso Reforzado

### 5.1 Estado Actual

**Middleware existente:** `frontend/middleware.js`
- Rutas `/admin/*` protegidas para ADMIN y OPERATOR
- Rutas de taquilla protegidas para ADMIN y TAQUILLA_ADMIN
- Rutas de jugador protegidas para PLAYER

### 5.2 Verificaciones Adicionales

**Rutas de jugador a proteger:**
- `/jugar` - Solo PLAYER
- `/tripletas` - Solo PLAYER
- `/balance-historico` - Solo PLAYER
- `/juego/*` - Solo PLAYER

### 5.3 Tareas

- [ ] Agregar `/jugar`, `/tripletas`, `/balance-historico`, `/juego/*` al middleware
- [ ] Verificar que el backend también valide roles en cada endpoint
- [ ] Agregar tests de control de acceso

**Estimación:** 2-3 horas

---

## 📌 FASE 6: Monitor de Sorteos

### 6.1 Crear Página de Monitor

**Archivo:** `frontend/app/admin/monitor/page.js`

**Estructura:**
```
┌─────────────────────────────────────────────────────────┐
│ MONITOR DE SORTEOS                                       │
├─────────────────────────────────────────────────────────┤
│ Fecha: [____] Juego: [____▼] Sorteo: [____▼]           │
├─────────────────────────────────────────────────────────┤
│ [Bancas] [Números] [Reporte]                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  (Contenido según tab seleccionado)                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Tab: Bancas

**Columnas:**
| ID Banca | Nombre | Monto Jugado | Premio | Tickets |
|----------|--------|--------------|--------|---------|

**Funcionalidad:**
- Click en fila abre modal con tickets de esa banca

### 6.3 Tab: Números

**Columnas:**
| Número | Nombre | Apostado | Tickets | Premio Potencial | % vs Venta | Tripletas | Premio Tripleta | Total Premios |
|--------|--------|----------|---------|------------------|------------|-----------|-----------------|---------------|

**Funcionalidad:**
- Click en "Tickets" abre modal con listado de tickets
- Click en "Tripletas" abre modal con tripletas asociadas
- Click en ID de ticket abre detalle del ticket

### 6.4 Tab: Reporte

**Contenido:**
| Sorteo | Hora | Ganador | Jugado | Premio | Balance |
|--------|------|---------|--------|--------|---------|

### 6.5 Backend - Endpoints Necesarios

**Archivo:** `backend/src/controllers/monitor.controller.js`

```javascript
// GET /api/monitor/bancas?drawId=xxx
// GET /api/monitor/numeros?drawId=xxx
// GET /api/monitor/reporte?date=xxx&gameId=xxx
// GET /api/monitor/tickets-by-banca?drawId=xxx&bancaId=xxx
// GET /api/monitor/tickets-by-item?drawId=xxx&itemId=xxx
// GET /api/monitor/tripletas-by-item?drawId=xxx&itemId=xxx
```

### 6.6 Servicio de Monitor

**Archivo:** `backend/src/services/monitor.service.js`

**Métodos:**
- `getBancaStats(drawId)`: Estadísticas por banca
- `getItemStats(drawId)`: Estadísticas por número/item incluyendo tripletas
- `getDailyReport(date, gameId)`: Reporte diario
- `getTicketsByBanca(drawId, bancaId)`: Tickets de una banca
- `getTicketsByItem(drawId, itemId)`: Tickets de un número
- `getTripletasByItem(drawId, itemId)`: Tripletas que incluyen un número

### Tareas:
- [ ] Crear `monitor.service.js`
- [ ] Crear `monitor.controller.js`
- [ ] Crear rutas en `monitor.routes.js`
- [ ] Crear página `frontend/app/admin/monitor/page.js`
- [ ] Crear componentes de modales para tickets y tripletas
- [ ] Agregar al menú de admin

**Estimación:** 12-16 horas

---

## 📌 FASE 7: Reportes Avanzados para Selección de Ganadores

### 7.1 Crear Página de Análisis de Sorteo

**Archivo:** `frontend/app/admin/analisis-sorteo/page.js`

**Objetivo:** Ayudar al administrador a decidir qué número debería ganar considerando:
1. Jugada directa por número
2. Impacto en tripletas activas
3. Balance total (venta - premios directos - premios tripleta)

### 7.2 Estructura del Reporte

```
┌─────────────────────────────────────────────────────────┐
│ ANÁLISIS DE SORTEO                                       │
├─────────────────────────────────────────────────────────┤
│ Juego: [____▼] Sorteo: [____▼]                          │
├─────────────────────────────────────────────────────────┤
│ RESUMEN:                                                 │
│ - Total Vendido: $X,XXX.XX                              │
│ - Tripletas Activas: XX                                 │
│ - Máximo a Pagar (70%): $X,XXX.XX                       │
├─────────────────────────────────────────────────────────┤
│ ANÁLISIS POR NÚMERO:                                     │
│                                                          │
│ | # | Nombre | Jugado | Premio | Tripletas | Premio T | │
│ |   |        |        | Directo| Afectadas | Tripleta | │
│ |   |        |        |        |           |          | │
│ | TOTAL PREMIO | BALANCE | RECOMENDACIÓN |              │
│ |              |         |               |              │
│                                                          │
│ 🟢 Recomendado  🟡 Aceptable  🔴 Peligroso              │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Lógica de Análisis de Tripletas

Para cada número candidato a ganador:
1. Buscar todas las tripletas ACTIVE que incluyan ese número
2. Para cada tripleta, verificar si los otros 2 números ya salieron en sorteos anteriores del rango
3. Si los 3 números estarían completos, sumar el premio de esa tripleta
4. Calcular el impacto total

### 7.4 Backend - Servicio de Análisis

**Archivo:** `backend/src/services/draw-analysis.service.js`

```javascript
class DrawAnalysisService {
  /**
   * Analizar impacto de seleccionar cada número como ganador
   * @param {string} drawId - ID del sorteo
   * @returns {Promise<Object>} Análisis completo
   */
  async analyzeDrawWinnerImpact(drawId) {
    // 1. Obtener sorteo con juego y tickets
    // 2. Obtener todas las tripletas activas del juego
    // 3. Para cada item del juego:
    //    a. Calcular premio directo (jugado * multiplicador)
    //    b. Calcular tripletas que se completarían
    //    c. Calcular premio total de tripletas
    //    d. Calcular balance (venta - premio directo - premio tripleta)
    //    e. Clasificar: RECOMENDADO, ACEPTABLE, PELIGROSO
    // 4. Ordenar por balance descendente
    // 5. Retornar análisis
  }
  
  /**
   * Obtener tripletas que se completarían si un item gana
   */
  async getTripletasCompletedByItem(gameId, itemId, drawId) {
    // Buscar tripletas activas que incluyan este item
    // Verificar si los otros 2 items ya salieron en sorteos del rango
    // Retornar lista de tripletas que se completarían
  }
}
```

### 7.5 Endpoint de Análisis

```javascript
// GET /api/analysis/draw/:drawId
// Retorna análisis completo para toma de decisiones
```

### Tareas:
- [ ] Crear `draw-analysis.service.js`
- [ ] Crear endpoint de análisis
- [ ] Crear página `frontend/app/admin/analisis-sorteo/page.js`
- [ ] Implementar visualización con colores de recomendación
- [ ] Agregar filtros y ordenamiento
- [ ] Agregar al menú de admin

**Estimación:** 10-14 horas

---

## 📊 Resumen de Estimaciones

| Fase | Descripción | Horas |
|------|-------------|-------|
| 1 | Estructura de Entidades | 4-6 |
| 2 | Sincronización cada 5 min | 2-3 |
| 3 | Proveedor Taquilla Web | 3-4 |
| 4 | Validaciones Backend | 4-5 |
| 5 | Control de Acceso | 2-3 |
| 6 | Monitor de Sorteos | 12-16 |
| 7 | Reportes Avanzados | 10-14 |
| **TOTAL** | | **37-51 horas** |

---

## 🚀 Orden de Implementación Recomendado

1. **FASE 1** - Estructura de Entidades (base para todo lo demás)
2. **FASE 2** - Sincronización cada 5 min (mejora inmediata)
3. **FASE 3** - Proveedor Taquilla Web (necesario para consistencia)
4. **FASE 5** - Control de Acceso (seguridad)
5. **FASE 4** - Validaciones Backend (mejora UX)
6. **FASE 6** - Monitor de Sorteos (herramienta de gestión)
7. **FASE 7** - Reportes Avanzados (herramienta de decisión)

---

## 📝 Notas Técnicas

### Consideraciones de Tripletas

La tripleta funciona así:
- El jugador selecciona 3 números diferentes
- La apuesta es válida por N sorteos consecutivos
- Si los 3 números salen en cualquiera de esos sorteos, gana
- El premio es: `monto × multiplicador` (ej: 50x)

**Impacto en selección de ganador:**
- Al seleccionar un ganador, se debe considerar cuántas tripletas se completarían
- Una tripleta se completa cuando sus 3 números han salido en sorteos dentro de su rango
- El análisis debe mostrar el "peligro" de cada número

### Jerarquía de Entidades

```
Comercial (nivel más alto)
    └── Banca
        └── Grupo
            └── Taquilla (nivel más bajo)
```

Cada ticket del proveedor viene con los 4 IDs. La relación padre-hijo se infiere del ticket:
- Si banca 368 viene con comercial 361, entonces banca 368 pertenece a comercial 361

---

---

## ✅ ESTADO DE IMPLEMENTACIÓN

### Archivos Creados/Modificados

#### Backend - Nuevos Archivos
- `backend/prisma/schema.prisma` - Modelos de entidades de proveedores agregados
- `backend/prisma/seed-taquilla-web.js` - Seed para proveedor interno
- `backend/src/services/provider-entities.service.js` - Gestión de entidades
- `backend/src/services/taquilla-web.service.js` - Servicio de taquilla web
- `backend/src/services/monitor.service.js` - Servicio de monitor
- `backend/src/services/draw-analysis.service.js` - Análisis de sorteos
- `backend/src/controllers/monitor.controller.js` - Controlador de monitor
- `backend/src/controllers/draw-analysis.controller.js` - Controlador de análisis
- `backend/src/routes/monitor.routes.js` - Rutas de monitor
- `backend/src/routes/draw-analysis.routes.js` - Rutas de análisis

#### Backend - Archivos Modificados
- `backend/src/services/api-integration.service.js` - Integración con entidades
- `backend/src/services/ticket.service.js` - Creación de ExternalTickets
- `backend/src/jobs/sync-api-tickets.job.js` - Sincronización cada 5 min
- `backend/src/index.js` - Registro de nuevas rutas

#### Frontend - Nuevos Archivos
- `frontend/lib/api/monitor.js` - API client de monitor
- `frontend/lib/api/analysis.js` - API client de análisis
- `frontend/app/admin/monitor/page.js` - Página de monitor
- `frontend/app/admin/analisis-sorteo/page.js` - Página de análisis

#### Frontend - Archivos Modificados
- `frontend/middleware.js` - Control de acceso mejorado

### Pasos para Activar

1. **Ejecutar migración de Prisma:**
```bash
cd backend
npx prisma migrate dev --name add_provider_entities
```

2. **Ejecutar seed de TAQUILLA_WEB:**
```bash
cd backend
node prisma/seed-taquilla-web.js
```

3. **Reiniciar backend:**
```bash
cd backend
npm run dev
```

4. **Acceder a nuevas páginas:**
- Monitor: `/admin/monitor`
- Análisis: `/admin/analisis-sorteo`

---

*Documento creado: 2024-12-21*
*Última actualización: 2024-12-21*
*Estado: IMPLEMENTACIÓN COMPLETADA*
