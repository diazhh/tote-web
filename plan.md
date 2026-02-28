# Plan: Sistema de Taquillas Fisicas

## Contexto

El sistema actual tiene una jerarquia de proveedores (Comercial -> Banca -> Grupo -> Taquilla) que se usa solo para mapear datos de proveedores externos (SRQ) y para la taquilla web interna. Se necesita convertir esto en un sistema completo de taquillas fisicas con gestion multi-nivel, comisiones, cupos y un POS (punto de venta) optimizado.

---

## Fase 1: Modelo de Datos y Migracion de Esquema

### 1.1 Renombrar entidades en el esquema Prisma

La jerarquia actual `ProviderComercial -> ProviderBanca -> ProviderGrupo -> ProviderTaquilla` se renombra conceptualmente:

- **Comercializador** (era ProviderComercial) - Entidad comercial de nivel superior
- **Banca** (era ProviderBanca) - Banco/sucursal
- **Agencia** (era ProviderGrupo) - Agencia que agrupa taquillas
- **Taquilla** (era ProviderTaquilla) - Punto de venta fisico

> **Decision**: No renombrar las tablas en la DB para no romper lo existente. En su lugar, agregar campos nuevos a los modelos existentes y crear modelos nuevos para comisiones/cupos. Las relaciones con SRQ siguen funcionando igual.

### 1.2 Nuevos campos en modelos existentes (schema.prisma)

```prisma
// Agregar a ProviderComercial, ProviderBanca, ProviderGrupo, ProviderTaquilla:
model ProviderComercial {
  // ... campos existentes ...
  type          EntityType    @default(EXTERNAL)  // EXTERNAL (SRQ), PHYSICAL, INTERNAL (web)
  adminUserId   String?       // Usuario administrador de esta entidad
  adminUser     User?         @relation("ComercialAdmin", fields: [adminUserId], references: [id])
  config        Json?         // Configuracion general de la entidad
}

// Similar para Banca, Grupo, Taquilla
model ProviderTaquilla {
  // ... campos existentes ...
  type          EntityType    @default(EXTERNAL)
  operatorUserId String?      // Taquillero asignado
  operatorUser  User?         @relation("TaquillaOperator", fields: [operatorUserId], references: [id])
  config        Json?
  isPhysical    Boolean       @default(false)
}
```

### 1.3 Nuevos modelos

```prisma
// ===== COMISIONES =====
model EntityCommission {
  id              String    @id @default(uuid())
  entityType      EntityLevel   // COMERCIAL, BANCA, GRUPO, TAQUILLA
  entityId        String
  gameId          String?       // null = aplica a todos los juegos
  commissionType  CommissionType // SALES, PROFIT, BOTH
  salesPercent    Decimal   @default(0) @db.Decimal(5, 2)  // % de ventas
  profitPercent   Decimal   @default(0) @db.Decimal(5, 2)  // % de ganancias
  shareLosses     Boolean   @default(false) // Si es PROFIT y hay perdidas, comparte?
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  game            Game?     @relation(fields: [gameId], references: [id])

  @@unique([entityType, entityId, gameId])
}

enum CommissionType {
  SALES       // Solo de las ventas (siempre gana)
  PROFIT      // Solo de las ganancias (si pierde, no pierde)
  SHARED      // Ganancias compartidas (si pierde, ambos pierden proporcionalmente)
}

// ===== CUPOS / LIMITES =====
model EntityQuota {
  id              String    @id @default(uuid())
  entityType      EntityLevel
  entityId        String
  gameId          String?       // null = todos los juegos
  gameItemId      String?       // null = todos los numeros
  scope           QuotaScope    // GLOBAL, PER_DRAW, PER_NUMBER
  maxAmount       Decimal   @db.Decimal(12, 2)  // Monto maximo
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  game            Game?     @relation(fields: [gameId], references: [id])
  gameItem        GameItem? @relation(fields: [gameItemId], references: [id])

  @@index([entityType, entityId])
}

enum QuotaScope {
  GLOBAL          // Limite global para la entidad (sin importar numero)
  PER_DRAW        // Limite por sorteo
  PER_NUMBER      // Limite por numero por sorteo
}

// ===== USO DE CUPOS EN TIEMPO REAL (respaldado por Redis) =====
model QuotaUsage {
  id          String    @id @default(uuid())
  quotaId     String
  drawId      String
  gameItemId  String?
  usedAmount  Decimal   @default(0) @db.Decimal(12, 2)
  updatedAt   DateTime  @updatedAt

  quota       EntityQuota @relation(fields: [quotaId], references: [id])
  draw        Draw        @relation(fields: [drawId], references: [id])

  @@unique([quotaId, drawId, gameItemId])
}

// ===== CONTABILIDAD POR ENTIDAD =====
model EntityLedger {
  id              String    @id @default(uuid())
  entityType      EntityLevel
  entityId        String
  drawId          String
  gameId          String
  totalSales      Decimal   @default(0) @db.Decimal(12, 2)
  totalPrizes     Decimal   @default(0) @db.Decimal(12, 2)
  grossProfit     Decimal   @default(0) @db.Decimal(12, 2)
  commissionSales Decimal   @default(0) @db.Decimal(12, 2)
  commissionProfit Decimal  @default(0) @db.Decimal(12, 2)
  netResult       Decimal   @default(0) @db.Decimal(12, 2)
  ticketCount     Int       @default(0)
  status          LedgerStatus @default(PENDING)
  calculatedAt    DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  draw            Draw      @relation(fields: [drawId], references: [id])

  @@unique([entityType, entityId, drawId, gameId])
  @@index([entityType, entityId])
  @@index([drawId])
}

enum LedgerStatus {
  PENDING       // Sorteo no ha ocurrido
  CALCULATED    // Comisiones calculadas
  SETTLED       // Liquidado/pagado
}

// ===== VENTAS EN TAQUILLA FISICA =====
model PhysicalSale {
  id              String    @id @default(uuid())
  taquillaId      String    // ProviderTaquilla.id
  ticketId        String    // Ticket generado
  clientName      String?   // Nombre del cliente (opcional)
  clientPhone     String?   // Telefono del cliente (opcional)
  paymentMethod   PaymentMethod @default(CASH)
  amountReceived  Decimal   @db.Decimal(12, 2)
  changeGiven     Decimal   @default(0) @db.Decimal(12, 2)
  createdAt       DateTime  @default(now())

  taquilla        ProviderTaquilla @relation(fields: [taquillaId], references: [id])
  ticket          Ticket    @relation(fields: [ticketId], references: [id])

  @@index([taquillaId])
  @@index([ticketId])
}

enum PaymentMethod {
  CASH
  TRANSFER
  PAGO_MOVIL
}
```

### 1.4 Nuevos roles de usuario

```prisma
enum UserRole {
  ADMIN               // Existente - admin del sistema
  OPERATOR            // Existente - operador de sorteos
  VIEWER              // Existente
  PLAYER              // Existente - jugador online
  TAQUILLA_ADMIN      // Existente - admin taquilla online
  COMERCIALIZADOR     // NUEVO - admin de comercializadora
  BANCA_ADMIN         // NUEVO - admin de banca
  AGENCIA_ADMIN       // NUEVO - admin de agencia
  TAQUILLERO          // NUEVO - operador de taquilla fisica
}
```

### 1.5 Relacion Usuario-Entidad

```prisma
model UserEntity {
  id          String      @id @default(uuid())
  userId      String
  entityType  EntityLevel
  entityId    String
  role        EntityRole  // ADMIN, OPERATOR, VIEWER
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())

  user        User        @relation(fields: [userId], references: [id])

  @@unique([userId, entityType, entityId])
  @@index([entityType, entityId])
}

enum EntityRole {
  ADMIN       // Puede gestionar la entidad y crear sub-entidades
  OPERATOR    // Puede operar (vender en taquilla)
  VIEWER      // Solo puede ver reportes
}

enum EntityLevel {
  COMERCIAL
  BANCA
  GRUPO       // Agencia
  TAQUILLA
}
```

### Archivos a modificar:
- `backend/prisma/schema.prisma` - Agregar todos los modelos y enums nuevos
- Crear migracion Prisma

---

## Fase 2: Backend - Servicios Core

### 2.1 Servicio de Gestion de Entidades (`entity-management.service.js`)

**Archivo nuevo**: `backend/src/services/entity-management.service.js`

Funcionalidad:
- CRUD completo para cada nivel de la jerarquia
- Validacion de permisos: un usuario solo puede gestionar entidades dentro de su scope
- `createComercializador(data, createdByUserId)` - Solo ADMIN del sistema
- `createBanca(comercialId, data, createdByUserId)` - ADMIN o COMERCIALIZADOR
- `createAgencia(bancaId, data, createdByUserId)` - ADMIN, COMERCIALIZADOR o BANCA_ADMIN
- `createTaquilla(grupoId, data, createdByUserId)` - ADMIN, COMERCIALIZADOR, BANCA_ADMIN o AGENCIA_ADMIN
- `getEntityTree(entityType, entityId)` - Arbol completo de sub-entidades
- `getEntityAncestors(entityType, entityId)` - Cadena de entidades padre
- `assignUserToEntity(userId, entityType, entityId, role)` - Asignar usuario a entidad
- `getUserEntities(userId)` - Todas las entidades que puede gestionar un usuario

### 2.2 Servicio de Comisiones (`commission.service.js`)

**Archivo nuevo**: `backend/src/services/commission.service.js`

Funcionalidad:
- `setCommission(entityType, entityId, config)` - Configurar comision
- `getCommission(entityType, entityId, gameId?)` - Obtener configuracion
- `calculateCommissions(drawId)` - Calcular comisiones post-sorteo para todas las entidades
- Logica:
  - **SALES**: comision = totalVentas * salesPercent / 100 (siempre positivo)
  - **PROFIT**: comision = max(0, ganancia * profitPercent / 100) (nunca pierde)
  - **SHARED**: comision = ganancia * profitPercent / 100 (puede ser negativo si hay perdida)
- Se calcula de abajo hacia arriba (Taquilla -> Agencia -> Banca -> Comercializador)
- Cada nivel puede tener su propia configuracion

### 2.3 Servicio de Cupos (`quota.service.js`)

**Archivo nuevo**: `backend/src/services/quota.service.js`

Funcionalidad:
- `setQuota(entityType, entityId, config)` - Configurar cupo
- `checkQuota(taquillaId, drawId, gameItemId, amount)` - Verificar si una apuesta cabe dentro del cupo
- `getAvailableQuota(entityType, entityId, drawId, gameItemId?)` - Cupo disponible
- `updateQuotaUsage(taquillaId, drawId, gameItemId, amount)` - Registrar uso

**Logica de herencia de cupos:**
1. Un cupo en nivel GRUPO limita a TODAS las taquillas del grupo combinadas
2. Un cupo en nivel BANCA limita a TODOS los grupos de esa banca combinados
3. Al verificar cupo de una taquilla, se revisa toda la cadena hacia arriba
4. El cupo efectivo es el MINIMO disponible en toda la cadena

### 2.4 Integracion con Redis (`quota-cache.service.js`)

**Archivo nuevo**: `backend/src/services/quota-cache.service.js`

- Redis como cache de cupos en tiempo real
- Keys: `quota:{drawId}:{entityType}:{entityId}:{gameItemId}` -> monto usado
- Operaciones atomicas con INCRBY para evitar race conditions
- TTL basado en el cierre del sorteo
- Fallback a PostgreSQL si Redis no esta disponible
- Sync periodico Redis -> QuotaUsage (cada 30s o al cerrar sorteo)

**Archivo nuevo**: `backend/src/config/redis.js`
- Configuracion de conexion Redis
- Retry logic
- Health check

### 2.5 Servicio de Contabilidad (`entity-ledger.service.js`)

**Archivo nuevo**: `backend/src/services/entity-ledger.service.js`

- `calculateLedger(drawId)` - Despues de ejecutar el sorteo, calcula la contabilidad por entidad
- `getLedgerByEntity(entityType, entityId, filters)` - Reporte de contabilidad
- `getLedgerSummary(entityType, entityId, dateRange)` - Resumen financiero
- `settleLedger(ledgerId)` - Marcar como liquidado
- Llamado automaticamente despues de `prize-processor.service.js`

### 2.6 Servicio de Venta Fisica (`physical-sale.service.js`)

**Archivo nuevo**: `backend/src/services/physical-sale.service.js`

- `createSale(taquillaId, ticketData, paymentInfo)` - Crear venta en taquilla fisica
  1. Verifica cupos (via quota.service)
  2. Crea el Ticket con source=TAQUILLA_FISICA
  3. Registra la PhysicalSale
  4. Actualiza cupos en Redis
  5. Retorna ticket creado
- `cancelSale(saleId, taquillaId)` - Anular venta
- `getSalesReport(taquillaId, dateRange)` - Reporte de ventas
- `getDailyCashReport(taquillaId, date)` - Corte de caja

### Archivos a modificar:
- `backend/src/services/ticket.service.js` - Agregar soporte para source TAQUILLA_FISICA
- `backend/src/services/prize-processor.service.js` - Disparar calculo de ledger y comisiones post-sorteo
- `backend/src/services/draw-stats.service.js` - Incluir estadisticas de taquillas fisicas

---

## Fase 3: Backend - Middleware de Permisos Multi-Nivel

### 3.1 Middleware de autorizacion por entidad (`entity-auth.middleware.js`)

**Archivo nuevo**: `backend/src/middlewares/entity-auth.middleware.js`

```javascript
// Verifica que el usuario tiene permiso sobre una entidad especifica
function authorizeEntity(entityType, entityIdParam, requiredRole = 'ADMIN') {
  return async (req, res, next) => {
    const entityId = req.params[entityIdParam];
    // 1. ADMIN del sistema siempre tiene acceso
    // 2. Verificar UserEntity del usuario para esta entidad
    // 3. Verificar si tiene acceso por herencia (admin de entidad padre)
  }
}

// Ejemplo de uso:
router.put('/bancas/:bancaId',
  authenticate,
  authorizeEntity('BANCA', 'bancaId', 'ADMIN'),
  controller.updateBanca
);
```

### 3.2 Permisos heredados

- Un COMERCIALIZADOR tiene acceso a su comercializadora y TODAS las entidades hijas
- Un BANCA_ADMIN tiene acceso a su banca y TODAS las agencias y taquillas debajo
- Un AGENCIA_ADMIN tiene acceso a su agencia y TODAS las taquillas
- Un TAQUILLERO solo tiene acceso a su taquilla

### Archivos a modificar:
- `backend/src/middlewares/auth.middleware.js` - Agregar los nuevos roles al sistema existente

---

## Fase 4: Backend - Rutas y Controladores

### 4.1 Rutas de gestion de entidades (`entity.routes.js`)

**Archivo nuevo**: `backend/src/routes/entity.routes.js`

```
GET    /api/entities/tree                    - Arbol completo (filtrado por permisos del usuario)
GET    /api/entities/my-entities             - Entidades del usuario actual

POST   /api/entities/comercializadores       - Crear comercializador (ADMIN)
GET    /api/entities/comercializadores       - Listar comercializadores
GET    /api/entities/comercializadores/:id   - Detalle
PUT    /api/entities/comercializadores/:id   - Actualizar
DELETE /api/entities/comercializadores/:id   - Desactivar

POST   /api/entities/bancas                  - Crear banca
GET    /api/entities/bancas                  - Listar bancas (filtrado por scope)
GET    /api/entities/bancas/:id              - Detalle
PUT    /api/entities/bancas/:id              - Actualizar
DELETE /api/entities/bancas/:id              - Desactivar

POST   /api/entities/agencias               - Crear agencia
GET    /api/entities/agencias               - Listar agencias
GET    /api/entities/agencias/:id           - Detalle
PUT    /api/entities/agencias/:id           - Actualizar
DELETE /api/entities/agencias/:id           - Desactivar

POST   /api/entities/taquillas              - Crear taquilla
GET    /api/entities/taquillas              - Listar taquillas
GET    /api/entities/taquillas/:id          - Detalle
PUT    /api/entities/taquillas/:id          - Actualizar
DELETE /api/entities/taquillas/:id          - Desactivar

POST   /api/entities/:type/:id/users        - Asignar usuario a entidad
GET    /api/entities/:type/:id/users        - Usuarios de una entidad
DELETE /api/entities/:type/:id/users/:userId - Remover usuario
```

### 4.2 Rutas de comisiones (`commission.routes.js`)

**Archivo nuevo**: `backend/src/routes/commission.routes.js`

```
GET    /api/commissions/:entityType/:entityId           - Obtener comision
POST   /api/commissions/:entityType/:entityId           - Configurar comision
GET    /api/commissions/:entityType/:entityId/calculate  - Vista previa del calculo
```

### 4.3 Rutas de cupos (`quota.routes.js`)

**Archivo nuevo**: `backend/src/routes/quota.routes.js`

```
GET    /api/quotas/:entityType/:entityId            - Obtener cupos
POST   /api/quotas/:entityType/:entityId            - Configurar cupo
GET    /api/quotas/:entityType/:entityId/usage/:drawId  - Uso de cupos por sorteo
GET    /api/quotas/check                            - Verificar disponibilidad antes de venta
```

### 4.4 Rutas de taquilla POS (`pos.routes.js`)

**Archivo nuevo**: `backend/src/routes/pos.routes.js`

```
POST   /api/pos/sell                    - Realizar venta (crea ticket)
POST   /api/pos/cancel/:ticketId        - Anular venta
GET    /api/pos/draws                   - Sorteos disponibles para venta
GET    /api/pos/games                   - Juegos disponibles
GET    /api/pos/items/:gameId           - Numeros del juego
GET    /api/pos/my-sales                - Mis ventas del dia
GET    /api/pos/daily-report            - Corte de caja
GET    /api/pos/last-results            - Ultimos resultados
GET    /api/pos/quota-check/:drawId/:gameItemId  - Cupo disponible para un numero
```

### 4.5 Rutas de contabilidad (`ledger.routes.js`)

**Archivo nuevo**: `backend/src/routes/ledger.routes.js`

```
GET    /api/ledger/:entityType/:entityId           - Contabilidad de una entidad
GET    /api/ledger/:entityType/:entityId/summary    - Resumen por rango de fechas
GET    /api/ledger/draw/:drawId                     - Contabilidad por sorteo
POST   /api/ledger/:id/settle                       - Marcar como liquidado
```

### Archivos a modificar:
- `backend/src/routes/index.js` o `backend/src/app.js` - Registrar las nuevas rutas

---

## Fase 5: Frontend - Gestion de Entidades (Admin)

### 5.1 API clients

**Archivos nuevos**:
- `frontend/lib/api/entities.js` - API client para entidades
- `frontend/lib/api/commissions.js` - API client para comisiones
- `frontend/lib/api/quotas.js` - API client para cupos
- `frontend/lib/api/pos.js` - API client para POS
- `frontend/lib/api/ledger.js` - API client para contabilidad

### 5.2 Store de entidades

**Archivo nuevo**: `frontend/lib/stores/entityStore.js`

- Estado del arbol de entidades
- Entidad seleccionada
- Breadcrumb de navegacion en la jerarquia

### 5.3 Paginas de admin para gestion de entidades

**Archivos nuevos**:

```
frontend/app/admin/entidades/
  page.js                     - Vista principal con arbol de entidades
  [entityType]/
    [id]/
      page.js                 - Detalle de entidad con tabs:
                                 - Info general
                                 - Sub-entidades
                                 - Usuarios asignados
                                 - Comisiones
                                 - Cupos
                                 - Contabilidad/Reportes
```

**Componentes nuevos**:
```
frontend/components/entities/
  EntityTree.js               - Arbol navegable de entidades (acordeon expandible)
  EntityForm.js               - Formulario crear/editar entidad
  EntityDetail.js             - Vista detalle de entidad
  CommissionConfig.js         - Configurador de comisiones
  QuotaConfig.js              - Configurador de cupos
  UserAssignment.js           - Asignar/gestionar usuarios de una entidad
  LedgerTable.js              - Tabla de contabilidad
  LedgerSummary.js            - Resumen financiero con graficas simples
```

### 5.4 Navegacion adaptativa por rol

**Archivo a modificar**: `frontend/app/admin/layout.js`

- Agregar seccion "Entidades" en el sidebar para ADMIN
- Agregar seccion "Mi Comercializadora" / "Mi Banca" / "Mi Agencia" segun rol
- Los roles de entidad (COMERCIALIZADOR, BANCA_ADMIN, etc.) ven su dashboard propio
- Redirigir segun rol al hacer login

**Archivo a modificar**: `frontend/middleware.js`

- Agregar rutas protegidas para los nuevos roles
- Redirigir al dashboard correspondiente segun el rol

---

## Fase 6: Frontend - POS de Taquilla Fisica

### 6.1 Layout del POS

**Archivos nuevos**:
```
frontend/app/pos/
  layout.js           - Layout fullscreen del POS (sin sidebar admin)
  page.js             - Pantalla principal del POS
```

### 6.2 Componentes del POS

```
frontend/components/pos/
  POSLayout.js        - Layout principal dividido en zonas
  NumberInput.js      - Input de numeros con teclado (2-3 digitos)
  AmountInput.js      - Input de monto
  QuickAmounts.js     - Botones de montos rapidos
  DrawSelector.js     - Selector de sorteo activo
  GameSelector.js     - Selector de juego
  TicketBuilder.js    - Constructor de ticket (lista de jugadas)
  TicketPreview.js    - Vista previa del ticket antes de confirmar
  TicketReceipt.js    - Recibo imprimible del ticket
  SalesHistory.js     - Historial de ventas del dia
  CashReport.js       - Corte de caja
  QuotaIndicator.js   - Indicador visual de cupo disponible
  ResultsBanner.js    - Banner con ultimos resultados
  POSHeader.js        - Barra superior con info de taquilla, hora, sorteos
  KeyboardHelp.js     - Ayuda de atajos de teclado (overlay)
```

### 6.3 Diseno de la interfaz POS

```
+------------------------------------------------------------------+
| [Logo] Taquilla: San Juan #12  |  Sorteo: 1:00PM Delfin  | 12:45 |
+------------------------------------------------------------------+
|                    |                          |                   |
|   NUMERO: [32]     |  JUGADAS:                |  ULTIMO RESULTADO |
|                    |  +---------+--------+    |  1:00PM - 32      |
|   MONTO: [5.00]   |  | Numero  | Monto  |    |  12:00PM - 15     |
|                    |  +---------+--------+    |                   |
|   [1] [2] [3]     |  | 32      | $5.00  |    |  CUPO DISPONIBLE  |
|   [4] [5] [6]     |  | 15      | $3.00  |    |  Num 32: $995.00  |
|   [7] [8] [9]     |  | 07      | $2.00  |    |                   |
|   [DEL] [0] [OK]  |  +---------+--------+    |                   |
|                    |  TOTAL: $10.00           |                   |
|  Montos rapidos:   |                          |                   |
|  [$1][$2][$5][$10] |  [F2:VENDER] [ESC:LIMPIAR]                  |
|  [$20][$50][$100]  |                          |                   |
+------------------------------------------------------------------+
| F1:Juego | F2:Vender | F3:Anular | F4:Reportes | F5:Resultados   |
+------------------------------------------------------------------+
```

### 6.4 Atajos de teclado

| Tecla | Accion |
|-------|--------|
| 0-9 | Ingresar numero |
| Backspace | Borrar ultimo digito |
| Enter | Agregar jugada a la lista |
| Tab | Cambiar entre campo numero y monto |
| F1 | Cambiar juego |
| F2 | Confirmar y vender ticket |
| F3 | Anular ultimo ticket |
| F4 | Ver reporte / corte de caja |
| F5 | Ver ultimos resultados |
| F6 | Cambiar sorteo |
| Escape | Limpiar ticket actual |
| +/- | Subir/bajar monto |
| Ctrl+Z | Quitar ultima jugada |

### 6.5 Soporte mobile/tablet

- Layout responsive: en pantalla pequena se usa un layout vertical (stacked)
- NumberPad mas grande en tablet
- Botones de montos rapidos como chips tocables
- Swipe para cambiar entre panel de jugadas y panel de resultados

### Archivos a modificar:
- `frontend/middleware.js` - Agregar ruta /pos como protegida para TAQUILLERO

---

## Fase 7: Integracion Redis

### 7.1 Configuracion

**Archivo nuevo**: `backend/src/config/redis.js`

- Conexion a Redis (usando `ioredis`)
- Pool de conexiones
- Manejo de reconexion
- Health check endpoint

### 7.2 Dependencia

- Agregar `ioredis` al package.json del backend

### 7.3 Fallback

Si Redis no esta disponible:
- Las verificaciones de cupos se hacen directamente contra PostgreSQL
- Se loguea warning pero el sistema sigue funcionando
- Performance degradado pero funcional

---

## Fase 8: Seguridad y Validaciones

### 8.1 Validaciones de negocio

- Un usuario solo puede pertenecer a UNA entidad de cada nivel (evitar conflictos de interes)
- No se puede eliminar una entidad con sub-entidades activas
- No se puede eliminar un usuario con entidades asignadas sin reasignar
- Cupos de entidades hijas no pueden exceder al padre
- Comisiones combinadas de todas las entidades en una cadena no pueden exceder el 100%

### 8.2 Auditoria

- Todas las operaciones de gestion de entidades se registran en AuditLog (modelo existente)
- Las ventas en taquilla fisica se registran con timestamp, taquillero, y monto

---

## Orden de Implementacion

Dado que esto es un sistema grande, se implementa en este orden:

1. **Fase 1** - Schema y migracion (base de datos)
2. **Fase 2.1** - Servicio de gestion de entidades (CRUD basico)
3. **Fase 3** - Middleware de permisos por entidad
4. **Fase 4.1** - Rutas de entidades
5. **Fase 5** - Frontend de gestion de entidades (admin)
6. **Fase 1.4** - Nuevos roles y relaciones usuario-entidad
7. **Fase 2.2** - Servicio de comisiones
8. **Fase 2.3 + 2.4** - Servicio de cupos + Redis
9. **Fase 7** - Integracion Redis completa
10. **Fase 2.5 + 2.6** - Contabilidad y ventas fisicas
11. **Fase 4** - Resto de rutas (comisiones, cupos, POS, contabilidad)
12. **Fase 6** - Frontend del POS
13. **Fase 8** - Seguridad y validaciones finales

## Resumen de Archivos

### Archivos nuevos (backend):
- `backend/src/config/redis.js`
- `backend/src/services/entity-management.service.js`
- `backend/src/services/commission.service.js`
- `backend/src/services/quota.service.js`
- `backend/src/services/quota-cache.service.js`
- `backend/src/services/entity-ledger.service.js`
- `backend/src/services/physical-sale.service.js`
- `backend/src/controllers/entity.controller.js`
- `backend/src/controllers/commission.controller.js`
- `backend/src/controllers/quota.controller.js`
- `backend/src/controllers/pos.controller.js`
- `backend/src/controllers/ledger.controller.js`
- `backend/src/routes/entity.routes.js`
- `backend/src/routes/commission.routes.js`
- `backend/src/routes/quota.routes.js`
- `backend/src/routes/pos.routes.js`
- `backend/src/routes/ledger.routes.js`
- `backend/src/middlewares/entity-auth.middleware.js`

### Archivos nuevos (frontend):
- `frontend/lib/api/entities.js`
- `frontend/lib/api/commissions.js`
- `frontend/lib/api/quotas.js`
- `frontend/lib/api/pos.js`
- `frontend/lib/api/ledger.js`
- `frontend/lib/stores/entityStore.js`
- `frontend/app/admin/entidades/page.js`
- `frontend/app/admin/entidades/[entityType]/[id]/page.js`
- `frontend/app/pos/layout.js`
- `frontend/app/pos/page.js`
- `frontend/components/entities/*.js` (8 componentes)
- `frontend/components/pos/*.js` (13 componentes)

### Archivos a modificar:
- `backend/prisma/schema.prisma` - Modelos y enums nuevos
- `backend/src/middlewares/auth.middleware.js` - Nuevos roles
- `backend/src/services/ticket.service.js` - Source TAQUILLA_FISICA
- `backend/src/services/prize-processor.service.js` - Trigger ledger/comisiones
- `backend/src/services/draw-stats.service.js` - Stats de taquillas fisicas
- `backend/src/app.js` o `backend/src/routes/index.js` - Registrar nuevas rutas
- `backend/package.json` - Agregar ioredis
- `frontend/app/admin/layout.js` - Sidebar con nuevas secciones
- `frontend/middleware.js` - Rutas protegidas nuevas
