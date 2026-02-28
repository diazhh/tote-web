# Plan: Sistema de Taquillas Fisicas

## Contexto

El sistema actual tiene una jerarquia de 4 niveles (Comercial -> Banca -> Grupo -> Taquilla) usada para mapear datos de proveedores externos (SRQ) y la taquilla web interna. Se necesita:

1. Agregar un **nuevo nivel "Agencia"** entre Grupo y Taquilla (5 niveles total)
2. Sistema completo de gestion multi-nivel con roles y permisos por entidad
3. Cada entidad tiene administradores que gestionan hacia abajo
4. Comisiones configurables (ventas, ganancias, compartidas)
5. Cupos/limites con herencia y Redis para rendimiento
6. Dashboards y reportes contables por entidad
7. Interfaz POS para taquillas fisicas

### Jerarquia Nueva (5 niveles)

```
Comercializador -> Banca -> Grupo -> Agencia -> Taquilla
```

- **Comercializador**: Entidad comercial de nivel superior (empresa)
- **Banca**: Sucursal o banco dentro del comercializador
- **Grupo**: Agrupacion logica de agencias dentro de una banca
- **Agencia**: Establecimiento fisico que contiene taquillas (NIVEL NUEVO)
- **Taquilla**: Punto de venta individual dentro de una agencia

> La jerarquia existente (Comercial -> Banca -> Grupo -> Taquilla) de 4 niveles se mantiene para SRQ. Para taquillas fisicas se usa la nueva de 5 niveles con Agencia intercalada.

---

## Fase 1: Modelo de Datos y Migracion

### 1.1 Nuevo modelo: ProviderAgencia

```prisma
model ProviderAgencia {
  id          String    @id @default(uuid())
  externalId  Int?
  grupoId     String
  name        String    @default("Agencia")
  isActive    Boolean   @default(true)
  type        EntityType @default(PHYSICAL)
  config      Json?     // Configuraciones generales
  address     String?   // Direccion fisica
  phone       String?   // Telefono de contacto
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  grupo       ProviderGrupo     @relation(fields: [grupoId], references: [id])
  taquillas   ProviderTaquilla[]

  @@unique([grupoId, externalId])
  @@index([grupoId])
}
```

### 1.2 Modificacion a ProviderTaquilla

Agregar relacion opcional a Agencia (para taquillas fisicas):

```prisma
model ProviderTaquilla {
  // ... campos existentes ...
  agenciaId     String?       // null para taquillas SRQ/online, set para fisicas
  isPhysical    Boolean       @default(false)
  type          EntityType    @default(EXTERNAL)
  config        Json?

  agencia       ProviderAgencia? @relation(fields: [agenciaId], references: [id])
}
```

### 1.3 Campos adicionales en modelos existentes

Agregar a ProviderComercial, ProviderBanca, ProviderGrupo:

```prisma
// En cada modelo:
  type        EntityType  @default(EXTERNAL)  // EXTERNAL, PHYSICAL, INTERNAL
  config      Json?       // Configuraciones de la entidad
```

### 1.4 Enum EntityType

```prisma
enum EntityType {
  EXTERNAL    // Proveedor externo (SRQ)
  PHYSICAL    // Taquilla fisica
  INTERNAL    // Taquilla web interna
}
```

### 1.5 Modelo UserEntity (relacion usuario-entidad)

```prisma
model UserEntity {
  id          String      @id @default(uuid())
  userId      String
  entityType  EntityLevel // COMERCIAL, BANCA, GRUPO, AGENCIA, TAQUILLA
  entityId    String
  role        EntityRole  // ADMIN, OPERATOR, VIEWER
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  user        User        @relation(fields: [userId], references: [id])

  @@unique([userId, entityType, entityId])
  @@index([entityType, entityId])
  @@index([userId])
}

enum EntityLevel {
  COMERCIAL
  BANCA
  GRUPO
  AGENCIA
  TAQUILLA
}

enum EntityRole {
  ADMIN       // Gestiona la entidad y crea sub-entidades y usuarios
  OPERATOR    // Opera (vende en taquilla, procesa pagos)
  VIEWER      // Solo ve reportes
}
```

### 1.6 Nuevos roles de usuario

```prisma
enum UserRole {
  ADMIN               // Admin del sistema (existente)
  OPERATOR            // Operador de sorteos (existente)
  VIEWER              // Solo lectura (existente)
  PLAYER              // Jugador online (existente)
  TAQUILLA_ADMIN      // Admin taquilla online (existente)
  COMERCIALIZADOR     // NUEVO - admin de comercializadora
  BANCA_ADMIN         // NUEVO - admin de banca
  GRUPO_ADMIN         // NUEVO - admin de grupo
  AGENCIA_ADMIN       // NUEVO - admin de agencia
  TAQUILLERO          // NUEVO - operador de taquilla fisica
}
```

### 1.7 Modelo EntityCommission (comisiones)

```prisma
model EntityCommission {
  id              String          @id @default(uuid())
  entityType      EntityLevel
  entityId        String
  gameId          String?         // null = todos los juegos
  commissionType  CommissionType
  salesPercent    Decimal         @default(0) @db.Decimal(5, 2)
  profitPercent   Decimal         @default(0) @db.Decimal(5, 2)
  shareLosses     Boolean         @default(false)
  isActive        Boolean         @default(true)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  game            Game?           @relation(fields: [gameId], references: [id])

  @@unique([entityType, entityId, gameId])
  @@index([entityType, entityId])
}

enum CommissionType {
  SALES       // % de ventas brutas (siempre gana, haya perdida o no)
  PROFIT      // % de ganancias netas (si hay perdida, no pierde)
  SHARED      // % de ganancias compartidas (si hay perdida, pierde proporcionalmente)
}
```

### 1.8 Modelo EntityQuota (cupos/limites)

```prisma
model EntityQuota {
  id              String      @id @default(uuid())
  entityType      EntityLevel
  entityId        String
  gameId          String?     // null = todos los juegos
  gameItemId      String?     // null = todos los numeros
  scope           QuotaScope
  maxAmount       Decimal     @db.Decimal(12, 2)
  isInherited     Boolean     @default(false) // Si fue heredado de entidad padre
  parentQuotaId   String?     // Referencia al cupo padre si es heredado
  isActive        Boolean     @default(true)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  game            Game?       @relation(fields: [gameId], references: [id])
  gameItem        GameItem?   @relation(fields: [gameItemId], references: [id])
  usage           QuotaUsage[]

  @@index([entityType, entityId])
  @@index([gameId])
  @@index([parentQuotaId])
}

enum QuotaScope {
  GLOBAL          // Limite total de la entidad (todas las ventas)
  PER_DRAW        // Limite por sorteo
  PER_NUMBER      // Limite por numero por sorteo
  PER_GAME        // Limite por juego
}
```

### 1.9 Modelo QuotaUsage (uso en tiempo real)

```prisma
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
```

### 1.10 Modelo EntityLedger (contabilidad)

```prisma
model EntityLedger {
  id                String        @id @default(uuid())
  entityType        EntityLevel
  entityId          String
  drawId            String
  gameId            String

  // Ventas
  totalSales        Decimal       @default(0) @db.Decimal(12, 2)
  ticketCount       Int           @default(0)
  detailCount       Int           @default(0)

  // Premios
  totalPrizes       Decimal       @default(0) @db.Decimal(12, 2)
  winnerCount       Int           @default(0)

  // Ganancias brutas
  grossProfit       Decimal       @default(0) @db.Decimal(12, 2)

  // Comisiones calculadas
  commissionSales   Decimal       @default(0) @db.Decimal(12, 2)
  commissionProfit  Decimal       @default(0) @db.Decimal(12, 2)
  totalCommission   Decimal       @default(0) @db.Decimal(12, 2)

  // Resultado neto (ganancia bruta - comisiones)
  netResult         Decimal       @default(0) @db.Decimal(12, 2)

  status            LedgerStatus  @default(PENDING)
  calculatedAt      DateTime?
  settledAt         DateTime?
  settledByUserId   String?
  notes             String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  draw              Draw          @relation(fields: [drawId], references: [id])

  @@unique([entityType, entityId, drawId, gameId])
  @@index([entityType, entityId])
  @@index([drawId])
  @@index([status])
}

enum LedgerStatus {
  PENDING       // Sorteo no ejecutado aun
  CALCULATED    // Comisiones calculadas post-sorteo
  SETTLED       // Liquidado/pagado
  DISPUTED      // En disputa
}
```

### 1.11 Modelo PhysicalSale (ventas fisicas)

```prisma
model PhysicalSale {
  id              String        @id @default(uuid())
  taquillaId      String
  ticketId        String
  operatorUserId  String        // Taquillero que realizo la venta
  clientName      String?
  clientPhone     String?
  paymentMethod   PaymentMethod @default(CASH)
  amountReceived  Decimal       @db.Decimal(12, 2)
  changeGiven     Decimal       @default(0) @db.Decimal(12, 2)
  isCancelled     Boolean       @default(false)
  cancelledAt     DateTime?
  cancelledByUserId String?
  createdAt       DateTime      @default(now())

  taquilla        ProviderTaquilla @relation(fields: [taquillaId], references: [id])
  ticket          Ticket           @relation(fields: [ticketId], references: [id])
  operator        User             @relation("SaleOperator", fields: [operatorUserId], references: [id])

  @@index([taquillaId])
  @@index([operatorUserId])
  @@index([createdAt])
}

enum PaymentMethod {
  CASH
  TRANSFER
  PAGO_MOVIL
}
```

### Archivos a modificar en Fase 1:
- `backend/prisma/schema.prisma` - Todos los modelos y enums nuevos
- Crear migracion Prisma
- `backend/prisma/seed-taquilla-web.js` - Actualizar seed si necesario

---

## Fase 2: Backend - Servicios Core

### 2.1 Servicio de Gestion de Entidades (`entity-management.service.js`)

**Archivo nuevo**: `backend/src/services/entity-management.service.js`

#### CRUD por nivel:

```javascript
// Comercializador (solo ADMIN del sistema puede crear)
createComercializador(data)           // Crea entidad + opcionalmente usuario admin
getComercializadores(filters)         // Lista con paginacion
getComercializadorById(id)            // Detalle con conteo de sub-entidades
updateComercializador(id, data)       // Actualizar nombre, config, estado
deactivateComercializador(id)         // Desactivar (soft delete)

// Banca (ADMIN o admin del comercializador padre)
createBanca(comercialId, data)
getBancas(comercialId, filters)
getBancaById(id)
updateBanca(id, data)
deactivateBanca(id)

// Grupo (ADMIN, admin comercializador, o admin de banca)
createGrupo(bancaId, data)
getGrupos(bancaId, filters)
getGrupoById(id)
updateGrupo(id, data)
deactivateGrupo(id)

// Agencia (ADMIN, admin comercializador, admin banca, o admin grupo)
createAgencia(grupoId, data)
getAgencias(grupoId, filters)
getAgenciaById(id)
updateAgencia(id, data)
deactivateAgencia(id)

// Taquilla (cualquier admin de nivel superior o admin agencia)
createTaquilla(agenciaId, data)
getTaquillas(agenciaId, filters)
getTaquillaById(id)
updateTaquilla(id, data)
deactivateTaquilla(id)
```

#### Gestion de arbol:

```javascript
// Arbol completo filtrado por permisos del usuario
getEntityTree(userId)

// Arbol desde una entidad especifica hacia abajo
getSubTree(entityType, entityId)

// Cadena de ancestros de una entidad (para breadcrumbs)
getAncestors(entityType, entityId)

// Contadores de sub-entidades
getEntityCounts(entityType, entityId)
// Retorna: { bancas: 5, grupos: 12, agencias: 34, taquillas: 128 }
```

#### Gestion de usuarios por entidad:

```javascript
// Crear usuario y asignarlo a una entidad
createEntityUser(entityType, entityId, userData, role)
// - Crea el User con el UserRole correspondiente
// - Crea el UserEntity con el EntityRole
// - Genera credenciales y las retorna

// Asignar usuario existente a una entidad
assignUserToEntity(userId, entityType, entityId, role)

// Listar usuarios de una entidad
getEntityUsers(entityType, entityId)
// Retorna: [{ user, role, assignedAt }]

// Cambiar rol de un usuario en una entidad
updateUserEntityRole(userId, entityType, entityId, newRole)

// Remover usuario de una entidad
removeUserFromEntity(userId, entityType, entityId)

// Obtener todas las entidades de un usuario
getUserEntities(userId)
// Retorna: [{ entityType, entityId, entityName, role, parentChain }]
```

### 2.2 Servicio de Comisiones (`commission.service.js`)

**Archivo nuevo**: `backend/src/services/commission.service.js`

```javascript
// Configurar comision de una entidad
setCommission(entityType, entityId, config)
// config: { commissionType, salesPercent, profitPercent, shareLosses, gameId? }

// Obtener comision configurada
getCommission(entityType, entityId, gameId?)

// Obtener comisiones de toda la cadena (para vista en cascada)
getCommissionChain(entityType, entityId, gameId?)
// Retorna: [
//   { level: 'COMERCIAL', name: 'Comercial X', salesPercent: 5, profitPercent: 10, type: 'SHARED' },
//   { level: 'BANCA', name: 'Banca Y', salesPercent: 3, profitPercent: 8, type: 'PROFIT' },
//   { level: 'GRUPO', name: 'Grupo Z', salesPercent: 2, profitPercent: 0, type: 'SALES' },
//   { level: 'AGENCIA', name: 'Agencia W', salesPercent: 1, profitPercent: 5, type: 'SHARED' },
//   { level: 'TAQUILLA', name: 'Taq #12', salesPercent: 0, profitPercent: 0, type: 'SALES' },
// ]
// + totalSalesPercent, totalProfitPercent, warning si > 100%

// Calcular comisiones para un sorteo (post-sorteo)
calculateCommissions(drawId)
// 1. Obtener todos los tickets del sorteo con providerData
// 2. Agrupar ventas y premios por cada entidad en cada nivel
// 3. Para cada entidad, aplicar su configuracion de comision:
//    - SALES: comision = totalVentas * salesPercent / 100
//    - PROFIT: comision = max(0, ganancia * profitPercent / 100)
//    - SHARED: comision = ganancia * profitPercent / 100 (puede ser negativo)
// 4. Crear/actualizar EntityLedger por cada entidad
// 5. Calcular de abajo (taquilla) hacia arriba (comercializador)

// Vista previa: que pasaria con un sorteo hipotetico
simulateCommissions(entityType, entityId, salesAmount, prizeAmount)
```

### 2.3 Servicio de Cupos (`quota.service.js`)

**Archivo nuevo**: `backend/src/services/quota.service.js`

```javascript
// Configurar cupo
setQuota(entityType, entityId, config)
// config: { scope, maxAmount, gameId?, gameItemId? }

// Obtener cupos de una entidad
getQuotas(entityType, entityId)

// Obtener cupos en cascada (toda la cadena)
getQuotaChain(entityType, entityId, drawId, gameItemId?)
// Retorna para cada nivel: cupo configurado, cupo usado, cupo disponible
// Ejemplo:
// [
//   { level: 'BANCA', name: 'Banca Y', maxAmount: 10000, used: 3500, available: 6500 },
//   { level: 'GRUPO', name: 'Grupo Z', maxAmount: 5000, used: 2000, available: 3000 },
//   { level: 'AGENCIA', name: 'Agencia W', maxAmount: 2000, used: 800, available: 1200 },
//   { level: 'TAQUILLA', name: 'Taq #12', maxAmount: 500, used: 150, available: 350 },
// ]
// effectiveAvailable: min(6500, 3000, 1200, 350) = 350

// Verificar si una venta cabe en el cupo
checkQuota(taquillaId, drawId, gameItemId, amount)
// 1. Buscar cupos de la taquilla y todos sus ancestros
// 2. Para cada cupo, obtener uso actual (Redis primero, luego DB)
// 3. Verificar que ninguno se exceda
// Retorna: { allowed: true/false, effectiveAvailable: number, details: [...] }

// Registrar uso de cupo
consumeQuota(taquillaId, drawId, gameItemId, amount)
// Actualiza uso en Redis y encola sync a DB

// Liberar cupo (cuando se anula una venta)
releaseQuota(taquillaId, drawId, gameItemId, amount)

// Vista de cupos de un sorteo para una entidad y todos sus hijos
getQuotaUsageMatrix(entityType, entityId, drawId)
// Retorna una tabla/matriz:
// Filas: numeros (gameItems)
// Columnas: entidades hijas
// Valores: monto usado / cupo maximo
```

### 2.4 Cache Redis para Cupos (`quota-cache.service.js`)

**Archivo nuevo**: `backend/src/services/quota-cache.service.js`

```javascript
// Keys en Redis:
// quota:usage:{drawId}:{entityType}:{entityId}:{gameItemId} -> monto usado (string numerico)
// quota:limit:{entityType}:{entityId}:{scope}:{gameItemId?} -> limite maximo

// Operaciones atomicas:
incrementUsage(drawId, entityType, entityId, gameItemId, amount)
// Usa INCRBYFLOAT para atomicidad

decrementUsage(drawId, entityType, entityId, gameItemId, amount)

getUsage(drawId, entityType, entityId, gameItemId)

// Bulk: obtener uso de toda una cadena de entidades
getChainUsage(drawId, entityChain, gameItemId)

// Sync Redis -> PostgreSQL
syncToDatabase()  // Cron cada 30 segundos
syncOnDrawClose(drawId)  // Al cerrar sorteo

// TTL: keys expiran 2 horas despues del cierre del sorteo
```

**Archivo nuevo**: `backend/src/config/redis.js`

### 2.5 Servicio de Contabilidad (`entity-ledger.service.js`)

**Archivo nuevo**: `backend/src/services/entity-ledger.service.js`

```javascript
// Calcular contabilidad post-sorteo (llamado por prize-processor)
calculateLedger(drawId)

// Obtener contabilidad de una entidad
getLedgerByEntity(entityType, entityId, filters)
// filters: { dateFrom, dateTo, gameId, status, page, limit }
// Retorna: registros paginados + totales

// Resumen financiero de una entidad
getLedgerSummary(entityType, entityId, dateRange)
// Retorna:
// {
//   totalSales, totalPrizes, grossProfit,
//   totalCommissionSales, totalCommissionProfit,
//   netResult,
//   drawCount, ticketCount,
//   avgSalesPerDraw, avgProfitPerDraw,
//   profitMargin,
//   bestDay: { date, profit }, worstDay: { date, profit },
//   dailyBreakdown: [{ date, sales, prizes, profit, commission, net }],
//   gameBreakdown: [{ game, sales, prizes, profit }]
//   statusBreakdown: { pending, calculated, settled, disputed }
// }

// Resumen en cascada (una entidad y todas sus hijas)
getLedgerCascade(entityType, entityId, drawId)
// Retorna el desglose de cada sub-entidad con sus numeros

// Marcar como liquidado
settleLedger(ledgerId, userId, notes?)

// Liquidacion masiva
settleMultiple(ledgerIds, userId, notes?)

// Reporte de liquidaciones pendientes
getPendingSettlements(entityType?, entityId?)
```

### 2.6 Servicio de Venta Fisica (`physical-sale.service.js`)

**Archivo nuevo**: `backend/src/services/physical-sale.service.js`

```javascript
// Realizar venta
createSale(taquillaId, operatorUserId, ticketData, paymentInfo)
// 1. Verificar que el operador pertenece a la taquilla
// 2. Verificar cupos (quota.service.checkQuota)
// 3. Crear Ticket con source=TAQUILLA_FISICA, providerData con toda la cadena
// 4. Crear PhysicalSale
// 5. Consumir cupos (quota.service.consumeQuota) en toda la cadena
// 6. Retornar ticket y recibo

// Anular venta
cancelSale(saleId, operatorUserId)
// 1. Verificar que la venta pertenece a la taquilla del operador
// 2. Verificar que el sorteo no se ha ejecutado
// 3. Marcar PhysicalSale.isCancelled
// 4. Cancelar el Ticket
// 5. Liberar cupos

// Historial de ventas del dia
getDailySales(taquillaId, date)

// Corte de caja
getCashReport(taquillaId, date)
// Retorna:
// {
//   totalSales, totalCancelled, netSales,
//   byPaymentMethod: { CASH: X, TRANSFER: Y, PAGO_MOVIL: Z },
//   ticketCount, cancelledCount,
//   totalReceived, totalChange,
//   sales: [{ time, ticketId, amount, method, status }]
// }

// Verificar ultimo resultado
getLastResults(taquillaId, limit)
```

### Archivos a modificar en Fase 2:
- `backend/src/services/ticket.service.js` - Source TAQUILLA_FISICA
- `backend/src/services/prize-processor.service.js` - Trigger calculateLedger y calculateCommissions
- `backend/src/services/draw-stats.service.js` - Stats de taquillas fisicas
- `backend/package.json` - Agregar `ioredis`

---

## Fase 3: Middleware de Permisos Multi-Nivel

### 3.1 Middleware de autorizacion por entidad

**Archivo nuevo**: `backend/src/middlewares/entity-auth.middleware.js`

```javascript
// Verifica que el usuario tiene permiso sobre una entidad especifica
function authorizeEntity(entityType, entityIdParam, requiredRole = 'ADMIN') {
  return async (req, res, next) => {
    const entityId = req.params[entityIdParam];
    const user = req.user;

    // 1. ADMIN del sistema siempre tiene acceso total
    if (user.role === 'ADMIN') return next();

    // 2. Buscar UserEntity directo
    const directAccess = await prisma.userEntity.findUnique({
      where: { userId_entityType_entityId: { userId: user.id, entityType, entityId } }
    });

    if (directAccess && hasRequiredRole(directAccess.role, requiredRole)) {
      req.entityAccess = directAccess;
      return next();
    }

    // 3. Verificar acceso por herencia (admin de entidad ancestro)
    const ancestors = await getAncestors(entityType, entityId);
    for (const ancestor of ancestors) {
      const ancestorAccess = await prisma.userEntity.findUnique({
        where: { userId_entityType_entityId: {
          userId: user.id,
          entityType: ancestor.type,
          entityId: ancestor.id
        }}
      });
      if (ancestorAccess && ancestorAccess.role === 'ADMIN') {
        req.entityAccess = { ...ancestorAccess, inherited: true };
        return next();
      }
    }

    return res.status(403).json({ error: 'No tienes permiso sobre esta entidad' });
  }
}

// Filtra resultados para mostrar solo entidades dentro del scope del usuario
function scopeToUserEntities(entityType) {
  return async (req, res, next) => {
    // Agrega req.entityScope con los IDs a los que el usuario tiene acceso
    // Los servicios usan este scope para filtrar queries
  }
}
```

### 3.2 Tabla de permisos por rol

| Accion | ADMIN Sistema | Admin Comercializador | Admin Banca | Admin Grupo | Admin Agencia | Taquillero |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Crear Comercializador | Si | - | - | - | - | - |
| Crear Banca | Si | Si (dentro de su comercializadora) | - | - | - | - |
| Crear Grupo | Si | Si | Si (dentro de su banca) | - | - | - |
| Crear Agencia | Si | Si | Si | Si (dentro de su grupo) | - | - |
| Crear Taquilla | Si | Si | Si | Si | Si (dentro de su agencia) | - |
| Crear usuarios | Si | Si (para su scope) | Si (para su scope) | Si (para su scope) | Si (para su scope) | - |
| Configurar comisiones | Si | Si (su scope) | Si (su scope) | Si (su scope) | Si (su scope) | - |
| Configurar cupos | Si | Si (su scope) | Si (su scope) | Si (su scope) | Si (su scope) | - |
| Ver reportes | Si (todo) | Si (su scope) | Si (su scope) | Si (su scope) | Si (su scope) | Si (su taquilla) |
| Liquidar | Si | Si (su scope) | Si (su scope) | - | - | - |
| Vender en taquilla | - | - | - | - | - | Si |
| Ver dashboard | Si (global) | Si (su scope) | Si (su scope) | Si (su scope) | Si (su scope) | Si (su taquilla) |

### Archivos a modificar:
- `backend/src/middlewares/auth.middleware.js` - Agregar nuevos roles a authorize()

---

## Fase 4: Rutas y Controladores

### 4.1 Rutas de Entidades (`entity.routes.js`)

**Archivo nuevo**: `backend/src/routes/entity.routes.js`

```
# Arbol y navegacion
GET    /api/entities/tree                         - Arbol filtrado por permisos del usuario
GET    /api/entities/my-entities                  - Entidades del usuario logueado
GET    /api/entities/:type/:id/ancestors          - Cadena de ancestros (breadcrumbs)
GET    /api/entities/:type/:id/counts             - Contadores de sub-entidades
GET    /api/entities/:type/:id/subtree            - Sub-arbol desde una entidad

# CRUD Comercializadores
POST   /api/entities/comercializadores            - Crear (ADMIN)
GET    /api/entities/comercializadores            - Listar (filtrado por scope)
GET    /api/entities/comercializadores/:id        - Detalle
PUT    /api/entities/comercializadores/:id        - Actualizar
DELETE /api/entities/comercializadores/:id        - Desactivar

# CRUD Bancas
POST   /api/entities/bancas                       - Crear
GET    /api/entities/bancas                       - Listar
GET    /api/entities/bancas/:id                   - Detalle
PUT    /api/entities/bancas/:id                   - Actualizar
DELETE /api/entities/bancas/:id                   - Desactivar

# CRUD Grupos
POST   /api/entities/grupos                       - Crear
GET    /api/entities/grupos                       - Listar
GET    /api/entities/grupos/:id                   - Detalle
PUT    /api/entities/grupos/:id                   - Actualizar
DELETE /api/entities/grupos/:id                   - Desactivar

# CRUD Agencias
POST   /api/entities/agencias                     - Crear
GET    /api/entities/agencias                     - Listar
GET    /api/entities/agencias/:id                 - Detalle
PUT    /api/entities/agencias/:id                 - Actualizar
DELETE /api/entities/agencias/:id                 - Desactivar

# CRUD Taquillas
POST   /api/entities/taquillas                    - Crear
GET    /api/entities/taquillas                    - Listar
GET    /api/entities/taquillas/:id                - Detalle
PUT    /api/entities/taquillas/:id                - Actualizar
DELETE /api/entities/taquillas/:id                - Desactivar

# Gestion de usuarios por entidad
POST   /api/entities/:type/:id/users              - Crear usuario y asignar
GET    /api/entities/:type/:id/users              - Listar usuarios de la entidad
PUT    /api/entities/:type/:id/users/:userId      - Cambiar rol del usuario
DELETE /api/entities/:type/:id/users/:userId      - Remover usuario
```

### 4.2 Rutas de Comisiones (`commission.routes.js`)

```
GET    /api/commissions/:entityType/:entityId              - Config de comision
POST   /api/commissions/:entityType/:entityId              - Crear/actualizar comision
GET    /api/commissions/:entityType/:entityId/chain         - Cadena completa de comisiones
GET    /api/commissions/:entityType/:entityId/simulate      - Simulador de comisiones
```

### 4.3 Rutas de Cupos (`quota.routes.js`)

```
GET    /api/quotas/:entityType/:entityId                    - Cupos configurados
POST   /api/quotas/:entityType/:entityId                    - Crear/actualizar cupo
DELETE /api/quotas/:quotaId                                 - Eliminar cupo
GET    /api/quotas/:entityType/:entityId/chain/:drawId      - Cadena de cupos con uso
GET    /api/quotas/:entityType/:entityId/matrix/:drawId     - Matriz de uso por numero y sub-entidad
GET    /api/quotas/check                                    - Verificar disponibilidad
```

### 4.4 Rutas de Contabilidad (`ledger.routes.js`)

```
GET    /api/ledger/:entityType/:entityId                    - Contabilidad paginada
GET    /api/ledger/:entityType/:entityId/summary            - Resumen financiero
GET    /api/ledger/:entityType/:entityId/cascade/:drawId    - Vista en cascada por sorteo
GET    /api/ledger/:entityType/:entityId/daily              - Reporte diario
GET    /api/ledger/pending                                  - Liquidaciones pendientes
POST   /api/ledger/:id/settle                               - Liquidar
POST   /api/ledger/settle-multiple                          - Liquidar multiples
```

### 4.5 Rutas POS (`pos.routes.js`)

```
POST   /api/pos/sell                           - Realizar venta
POST   /api/pos/cancel/:saleId                 - Anular venta
GET    /api/pos/draws                          - Sorteos disponibles
GET    /api/pos/games                          - Juegos disponibles
GET    /api/pos/items/:gameId                  - Numeros del juego
GET    /api/pos/my-sales                       - Ventas del dia
GET    /api/pos/cash-report                    - Corte de caja
GET    /api/pos/last-results                   - Ultimos resultados
GET    /api/pos/quota/:drawId/:gameItemId      - Cupo disponible para un numero
GET    /api/pos/my-taquilla                    - Info de la taquilla del operador
```

### Archivos a modificar:
- `backend/src/app.js` o `backend/src/routes/index.js` - Registrar nuevas rutas

---

## Fase 5: Frontend - Dashboards y Gestion por Rol

### 5.1 API Clients (frontend/lib/api/)

**Archivos nuevos**:
- `entities.js` - CRUD entidades, arbol, usuarios
- `commissions.js` - Config y consulta de comisiones
- `quotas.js` - Config y consulta de cupos
- `ledger.js` - Contabilidad y liquidaciones
- `pos.js` - POS API

### 5.2 Store de Entidades

**Archivo nuevo**: `frontend/lib/stores/entityStore.js`

```javascript
{
  // Estado
  tree: null,               // Arbol completo de entidades
  selectedEntity: null,      // Entidad seleccionada actualmente
  breadcrumb: [],            // Cadena de ancestros
  myEntities: [],            // Entidades del usuario logueado

  // Acciones
  loadTree(),
  selectEntity(type, id),
  loadMyEntities(),
  refreshEntity(type, id),
}
```

### 5.3 Dashboard del ADMIN del sistema (`/admin` existente - modificar)

Agregar al dashboard existente una seccion de resumen de entidades:

```
+----------------------------------------------------------+
| PANEL ADMIN SISTEMA                                      |
+----------------------------------------------------------+
| [Stats actuales: Sorteos, Juegos, etc.]                  |
|                                                          |
| --- ENTIDADES FISICAS ---                                |
| Comercializadores: 3  |  Bancas: 12  |  Grupos: 45     |
| Agencias: 128          |  Taquillas: 512                |
| Ventas Hoy (fisicas): $45,230  | Comisiones: $3,800     |
| Liquidaciones Pendientes: 28                             |
|                                                          |
| [Ver Entidades] [Ver Liquidaciones Pendientes]           |
+----------------------------------------------------------+
```

### 5.4 Pagina de Gestion de Entidades (`/admin/entidades`)

**Archivos nuevos**: `frontend/app/admin/entidades/page.js`

Layout con 2 paneles:
- **Panel izquierdo**: Arbol navegable de entidades (tipo explorador de archivos)
- **Panel derecho**: Detalle de la entidad seleccionada

```
+----------------------------------+----------------------------------------+
| ARBOL DE ENTIDADES               | DETALLE: Banca Norte                   |
|                                  |                                        |
| v Comercializadora ABC           | [Info] [Usuarios] [Comisiones] [Cupos] |
|   v Banca Norte  <-- selected    | [Contabilidad] [Sub-entidades]         |
|     v Grupo Centro               |                                        |
|       v Agencia Mall Plaza       | Nombre: Banca Norte                    |
|         Taquilla #1              | Estado: Activa                         |
|         Taquilla #2              | Padre: Comercializadora ABC            |
|       Agencia Centro Comercial   | Creada: 15/01/2026                     |
|     Grupo Sur                    |                                        |
|   v Banca Sur                    | Sub-entidades:                         |
|     Grupo Unico                  | Grupos: 2 | Agencias: 5 | Taquillas: 18|
| v Comercializadora XYZ           |                                        |
|   ...                            | Ventas Hoy: $12,500                    |
|                                  | Comisiones Hoy: $450                   |
| [+ Comercializador]              |                                        |
+----------------------------------+----------------------------------------+
```

### 5.5 Detalle de entidad: TAB Info General

```
+------------------------------------------------+
| INFORMACION GENERAL                            |
+------------------------------------------------+
| Nombre: [Banca Norte              ] [Guardar]  |
| Tipo: PHYSICAL                                 |
| Estado: [Activa v]                             |
| Padre: Comercializadora ABC                    |
| ID Externo: 368                                |
| Direccion: Av. Libertador #45 (solo Agencias)  |
| Telefono: 0412-1234567 (solo Agencias)         |
| Creada: 15/01/2026                             |
|                                                |
| --- RESUMEN RAPIDO ---                         |
| Sub-entidades directas: 2 Grupos               |
| Total sub-entidades: 5 Agencias, 18 Taquillas  |
| Usuarios asignados: 3                          |
| Ventas ultimas 24h: $12,500                    |
|                                                |
| [Desactivar Entidad]                           |
+------------------------------------------------+
```

### 5.6 Detalle de entidad: TAB Usuarios

**Componente**: `EntityUsersTab.js`

Cada admin de una entidad puede:
- **Ver** todos los usuarios asignados a su entidad y sub-entidades
- **Crear** nuevos usuarios con rol asignado
- **Editar** rol de usuarios en su scope
- **Desactivar** usuarios en su scope

```
+-------------------------------------------------------------+
| USUARIOS DE: Banca Norte                                    |
+-------------------------------------------------------------+
| [+ Crear Usuario]                                           |
|                                                             |
| Usuario     | Rol          | Entidad          | Estado      |
|-------------|--------------|------------------|-------------|
| juan.perez  | ADMIN        | Banca Norte      | Activo      |
| maria.lopez | ADMIN        | Grupo Centro     | Activo      |
| carlos.r    | ADMIN        | Agencia Mall     | Activo      |
| pedro.g     | OPERATOR     | Taquilla #1      | Activo      |
| ana.m       | OPERATOR     | Taquilla #2      | Activo      |
| luis.v      | VIEWER       | Banca Norte      | Activo      |
|                                                             |
| Mostrando usuarios de Banca Norte y sub-entidades           |
+-------------------------------------------------------------+

Modal "Crear Usuario":
+------------------------------------------+
| CREAR USUARIO                            |
+------------------------------------------+
| Nombre de usuario: [__________]          |
| Email: [__________]                      |
| Telefono: [__________]                   |
| Contrasena: [__________] [Generar]       |
|                                          |
| Asignar a:                               |
| Entidad: [Dropdown jerarquico]           |
|  - Banca Norte                           |
|  - Grupo Centro                          |
|    - Agencia Mall Plaza                  |
|      - Taquilla #1                       |
|      - Taquilla #2                       |
|    - Agencia Centro Com.                 |
|  - Grupo Sur                             |
|                                          |
| Rol: [ADMIN / OPERATOR / VIEWER]         |
|                                          |
| [Cancelar] [Crear Usuario]              |
+------------------------------------------+
```

### 5.7 Detalle de entidad: TAB Comisiones

**Componente**: `CommissionConfigTab.js`

```
+--------------------------------------------------------------+
| COMISIONES: Banca Norte                                      |
+--------------------------------------------------------------+
| --- CONFIGURACION DE ESTA ENTIDAD ---                        |
|                                                              |
| Tipo de Comision: [SHARED v]                                 |
|   ( ) SALES - Solo de ventas (siempre gana)                  |
|   ( ) PROFIT - Solo de ganancias (no pierde si hay perdida)  |
|   (*) SHARED - Compartida (comparte ganancias Y perdidas)    |
|                                                              |
| Comision de Ventas: [3.00] %                                 |
| Comision de Ganancias: [8.00] %                              |
| Comparte Perdidas: [Si v]                                    |
|                                                              |
| Juego especifico: [Todos los juegos v]                       |
|   (Puedes configurar comisiones diferentes por juego)        |
|                                                              |
| [Guardar Configuracion]                                      |
|                                                              |
| --- VISTA EN CASCADA (toda la cadena) ---                    |
|                                                              |
| Nivel          | Tipo    | Ventas | Ganancias | Perdidas?   |
|----------------|---------|--------|-----------|-------------|
| Comercial ABC  | SHARED  | 5.00%  | 10.00%    | Si          |
| > Banca Norte  | SHARED  | 3.00%  | 8.00%     | Si          |
| >> Grupo Centr | SALES   | 2.00%  | -         | No          |
| >>> Agencia M  | PROFIT  | 1.00%  | 5.00%     | No          |
| >>>> Taq #1    | SALES   | 0.50%  | -         | No          |
|                                                              |
| TOTAL CADENA:  | Ventas: 11.50%  | Ganancias: 23.00%        |
| ⚠ La suma de comisiones de ganancias es alta (23%)           |
|                                                              |
| --- SIMULADOR ---                                            |
| Si las ventas son $[10,000] y los premios $[7,000]:          |
| Ganancia bruta: $3,000                                       |
| Comision ventas Banca: $300 (3% de $10,000)                  |
| Comision ganancias Banca: $240 (8% de $3,000)               |
| Total comision Banca: $540                                   |
+--------------------------------------------------------------+
```

### 5.8 Detalle de entidad: TAB Cupos

**Componente**: `QuotaConfigTab.js`

```
+--------------------------------------------------------------+
| CUPOS: Grupo Centro                                          |
+--------------------------------------------------------------+
| --- CUPOS CONFIGURADOS ---                                   |
|                                                              |
| [+ Agregar Cupo]                                             |
|                                                              |
| Alcance      | Juego    | Numero  | Limite     | Acciones   |
|--------------|----------|---------|------------|------------|
| PER_NUMBER   | Delfin   | Todos   | $1,000.00  | [Editar][X]|
| PER_NUMBER   | Delfin   | #32     | $500.00    | [Editar][X]|
| PER_DRAW     | Delfin   | -       | $15,000.00 | [Editar][X]|
| GLOBAL       | Todos    | -       | $50,000.00 | [Editar][X]|
|                                                              |
| --- VISTA EN CASCADA (cupos heredados) ---                   |
|                                                              |
| Para: Delfin 1:00PM, Numero #32                             |
|                                                              |
| Nivel          | Cupo       | Usado     | Disponible  | %   |
|----------------|------------|-----------|-------------|-----|
| Banca Norte    | $5,000.00  | $2,300.00 | $2,700.00   | 46% |
| > Grupo Centro | $1,000.00  | $450.00   | $550.00     | 45% |
| >> Agencia M   | $500.00    | $200.00   | $300.00     | 40% |
| >>> Taq #1     | $200.00    | $80.00    | $120.00     | 40% |
| >>> Taq #2     | $200.00    | $120.00   | $80.00      | 60% |
|                                                              |
| Cupo efectivo para Taq #1: $120.00 (min de la cadena)        |
|                                                              |
| --- MATRIZ DE USO POR SORTEO ---                             |
| Sorteo: [Delfin 1:00PM v]                                   |
|                                                              |
| Numero | Taq #1  | Taq #2  | Taq #3  | Total  | Cupo  | %  |
|--------|---------|---------|---------|--------|-------|-----|
| #00    | $50     | $30     | $20     | $100   | $1000 | 10% |
| #01    | $0      | $80     | $0      | $80    | $1000 | 8%  |
| #32    | $80     | $120    | $45     | $245   | $500  | 49% |
| ...    |         |         |         |        |       |     |
|                                                              |
| [Barra de colores: verde < 50%, amarillo 50-80%, rojo > 80%]|
+--------------------------------------------------------------+
```

### 5.9 Detalle de entidad: TAB Contabilidad

**Componente**: `LedgerTab.js`

```
+--------------------------------------------------------------+
| CONTABILIDAD: Banca Norte                                    |
+--------------------------------------------------------------+
| Periodo: [01/02/2026] - [28/02/2026]  Juego: [Todos v]      |
|                                                              |
| --- RESUMEN DEL PERIODO ---                                  |
|                                                              |
| +-------------+ +-------------+ +-------------+ +-----------+|
| | Ventas      | | Premios     | | Gan. Bruta  | | Comision  ||
| | $245,600    | | $178,200    | | $67,400     | | $12,430   ||
| | 1,234 tix   | | 89 ganador  | | +27.4%      | | (5.06%)   ||
| +-------------+ +-------------+ +-------------+ +-----------+|
|                                                              |
| +-------------+ +-------------+                              |
| | Neto        | | Pendiente   |                              |
| | $54,970     | | 12 sorteos  |                              |
| | por liquidar| | $4,200      |                              |
| +-------------+ +-------------+                              |
|                                                              |
| --- DESGLOSE DIARIO ---                                      |
|                                                              |
| Fecha      | Ventas   | Premios  | Ganancia | Comision | Net |
|------------|----------|----------|----------|----------|-----|
| 28/02/2026 | $8,500   | $5,200   | $3,300   | $430     |$2870|
| 27/02/2026 | $9,200   | $7,800   | $1,400   | $460     | $940|
| 26/02/2026 | $7,100   | $8,900   | -$1,800  | $355     |-2155|
| ...        |          |          |          |          |     |
|                                                              |
| [Dias en rojo = perdida]                                     |
|                                                              |
| --- DESGLOSE POR JUEGO ---                                   |
|                                                              |
| Juego    | Ventas   | Premios  | Ganancia | Comision | Mrg% |
|----------|----------|----------|----------|----------|------|
| Delfin   | $120,300 | $89,400  | $30,900  | $6,015   | 25.7%|
| Guacharo | $85,200  | $62,100  | $23,100  | $4,260   | 27.1%|
| Lotto    | $40,100  | $26,700  | $13,400  | $2,155   | 33.4%|
|                                                              |
| --- DESGLOSE EN CASCADA (sub-entidades) ---                  |
|                                                              |
| Entidad        | Ventas   | Premios | Ganancia | Comision   |
|----------------|----------|---------|----------|------------|
| Grupo Centro   | $145,200 | $98,500 | $46,700  | $7,260     |
|   Agencia Mall | $82,100  | $55,300 | $26,800  | $4,105     |
|     Taq #1     | $45,600  | $30,200 | $15,400  | $2,280     |
|     Taq #2     | $36,500  | $25,100 | $11,400  | $1,825     |
|   Agencia CC   | $63,100  | $43,200 | $19,900  | $3,155     |
| Grupo Sur      | $100,400 | $79,700 | $20,700  | $5,170     |
|   ...          |          |         |          |            |
|                                                              |
| --- LIQUIDACIONES ---                                        |
|                                                              |
| [Seleccionar todo] [Liquidar seleccionados]                  |
|                                                              |
| Sorteo          | Fecha    | Ventas | Comision | Estado      |
|-----------------|----------|--------|----------|-------------|
| Delfin 1:00PM   | 28/02   | $2,300 | $115     | PENDIENTE   |
| Guacharo 2:00PM | 28/02   | $1,800 | $90      | PENDIENTE   |
| Delfin 1:00PM   | 27/02   | $2,500 | $125     | LIQUIDADO   |
| ...              |         |        |          |             |
+--------------------------------------------------------------+
```

### 5.10 Dashboard por rol de entidad

Cada rol ve SU dashboard adaptado al hacer login:

#### Dashboard COMERCIALIZADOR (`/admin/mi-comercializadora`)

```
+--------------------------------------------------------------+
| MI COMERCIALIZADORA: ABC Corp                                |
+--------------------------------------------------------------+
|                                                              |
| +----------+ +----------+ +----------+ +----------+         |
| | Bancas   | | Grupos   | | Agencias | | Taquillas|         |
| | 4        | | 12       | | 34       | | 128      |         |
| +----------+ +----------+ +----------+ +----------+         |
|                                                              |
| +----------+ +----------+ +----------+ +----------+         |
| | Ventas   | | Premios  | | Ganancia | | Comision |         |
| | Hoy      | | Hoy      | | Hoy      | | Hoy     |         |
| | $45,230  | | $32,100  | | $13,130  | | $2,261  |         |
| +----------+ +----------+ +----------+ +----------+         |
|                                                              |
| --- TOP BANCAS HOY ---                                       |
| 1. Banca Norte  $18,500 ventas | $1,200 comision            |
| 2. Banca Sur    $15,200 ventas | $680 comision              |
| 3. Banca Este   $11,530 ventas | $381 comision              |
|                                                              |
| --- ALERTAS ---                                              |
| ⚠ 3 liquidaciones pendientes por mas de 48h                 |
| ⚠ Taquilla #45 inactiva hace 2 horas                        |
| ⚠ Cupo al 90% en Banca Norte para Delfin 3:00PM            |
|                                                              |
| [Gestionar Entidades] [Reportes] [Liquidaciones]             |
+--------------------------------------------------------------+
```

#### Dashboard BANCA_ADMIN (`/admin/mi-banca`)

Similar pero scoped a su banca: muestra grupos, agencias, taquillas de su banca.

#### Dashboard AGENCIA_ADMIN (`/admin/mi-agencia`)

```
+--------------------------------------------------------------+
| MI AGENCIA: Mall Plaza                                       |
+--------------------------------------------------------------+
| +----------+ +----------+ +----------+ +----------+         |
| | Taquillas| | Activas  | | Ventas   | | Comision |         |
| | 6        | | 5        | | Hoy      | | Hoy     |         |
| |          | |          | | $8,200   | | $410    |         |
| +----------+ +----------+ +----------+ +----------+         |
|                                                              |
| --- TAQUILLAS ---                                            |
| Taquilla   | Operador   | Ventas Hoy | Tickets | Estado     |
|------------|------------|------------|---------|------------|
| Taquilla 1 | pedro.g    | $2,300     | 45      | En linea   |
| Taquilla 2 | ana.m      | $1,800     | 32      | En linea   |
| Taquilla 3 | -          | $0         | 0       | Sin operador|
| Taquilla 4 | jose.r     | $2,100     | 38      | En linea   |
| Taquilla 5 | maria.v    | $1,500     | 28      | En linea   |
| Taquilla 6 | luis.f     | $500       | 12      | En linea   |
|                                                              |
| --- CUPOS CRITICOS ---                                       |
| #32 Delfin 3PM: 82% usado ($410 de $500)                    |
| #15 Guacharo 4PM: 75% usado ($375 de $500)                  |
|                                                              |
| [Gestionar Taquillas] [Crear Taquilla] [Reportes]            |
+--------------------------------------------------------------+
```

#### Dashboard TAQUILLERO - Ver Fase 6 (POS)

### 5.11 Navegacion adaptativa en sidebar

**Archivo a modificar**: `frontend/app/admin/layout.js`

```javascript
const navigationByRole = {
  ADMIN: [
    // Todo lo actual +
    { name: 'Entidades', href: '/admin/entidades', icon: Building2 },
    { name: 'Liquidaciones', href: '/admin/liquidaciones', icon: Receipt },
  ],
  COMERCIALIZADOR: [
    { name: 'Dashboard', href: '/admin/mi-comercializadora', icon: LayoutDashboard },
    { name: 'Entidades', href: '/admin/entidades', icon: Building2 },
    { name: 'Usuarios', href: '/admin/mis-usuarios', icon: Users },
    { name: 'Comisiones', href: '/admin/comisiones', icon: Percent },
    { name: 'Cupos', href: '/admin/cupos', icon: Gauge },
    { name: 'Contabilidad', href: '/admin/contabilidad', icon: Calculator },
    { name: 'Reportes', href: '/admin/reportes-entidad', icon: FileText },
    { name: 'Liquidaciones', href: '/admin/liquidaciones', icon: Receipt },
  ],
  BANCA_ADMIN: [
    { name: 'Dashboard', href: '/admin/mi-banca', icon: LayoutDashboard },
    { name: 'Entidades', href: '/admin/entidades', icon: Building2 },
    { name: 'Usuarios', href: '/admin/mis-usuarios', icon: Users },
    { name: 'Comisiones', href: '/admin/comisiones', icon: Percent },
    { name: 'Cupos', href: '/admin/cupos', icon: Gauge },
    { name: 'Contabilidad', href: '/admin/contabilidad', icon: Calculator },
    { name: 'Reportes', href: '/admin/reportes-entidad', icon: FileText },
  ],
  GRUPO_ADMIN: [
    { name: 'Dashboard', href: '/admin/mi-grupo', icon: LayoutDashboard },
    { name: 'Agencias', href: '/admin/entidades', icon: Building2 },
    { name: 'Usuarios', href: '/admin/mis-usuarios', icon: Users },
    { name: 'Comisiones', href: '/admin/comisiones', icon: Percent },
    { name: 'Cupos', href: '/admin/cupos', icon: Gauge },
    { name: 'Contabilidad', href: '/admin/contabilidad', icon: Calculator },
    { name: 'Reportes', href: '/admin/reportes-entidad', icon: FileText },
  ],
  AGENCIA_ADMIN: [
    { name: 'Dashboard', href: '/admin/mi-agencia', icon: LayoutDashboard },
    { name: 'Taquillas', href: '/admin/entidades', icon: Monitor },
    { name: 'Usuarios', href: '/admin/mis-usuarios', icon: Users },
    { name: 'Cupos', href: '/admin/cupos', icon: Gauge },
    { name: 'Contabilidad', href: '/admin/contabilidad', icon: Calculator },
    { name: 'Reportes', href: '/admin/reportes-entidad', icon: FileText },
  ],
  TAQUILLERO: [
    // Redirige automaticamente a /pos
  ],
};
```

---

## Fase 6: Frontend - POS de Taquilla Fisica

### 6.1 Layout y pagina

```
frontend/app/pos/
  layout.js     - Layout fullscreen (sin sidebar admin)
  page.js       - Pantalla principal del POS
```

### 6.2 Componentes POS

```
frontend/components/pos/
  POSLayout.js        - Layout 3 columnas
  NumberInput.js      - Input de numeros (numpad)
  AmountInput.js      - Input de monto con botones rapidos
  DrawSelector.js     - Selector de sorteo activo
  GameSelector.js     - Selector de juego
  TicketBuilder.js    - Lista de jugadas del ticket actual
  TicketReceipt.js    - Recibo imprimible
  SalesHistory.js     - Ventas del dia
  CashReport.js       - Corte de caja
  QuotaIndicator.js   - Cupo disponible en tiempo real
  ResultsBanner.js    - Ultimos resultados
  POSHeader.js        - Barra superior con info de taquilla
  KeyboardHelp.js     - Overlay de atajos
  CancelModal.js      - Modal para anular venta
```

### 6.3 Interfaz POS

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

### 6.5 Mobile/Tablet

- Layout vertical en pantallas < 768px
- NumberPad ocupa ancho completo
- Tabs deslizables: Jugadas | Resultados | Cupos
- Touch-friendly con botones grandes

---

## Fase 7: Redis

### 7.1 Configuracion (`backend/src/config/redis.js`)

- Conexion con `ioredis`
- Retry y reconexion automatica
- Health check

### 7.2 Uso

- Cache de cupos en tiempo real (operaciones atomicas INCRBYFLOAT)
- TTL por sorteo (expira 2h despues de cierre)
- Sync periodico a PostgreSQL (cada 30s)
- Fallback a PostgreSQL si Redis no disponible

---

## Fase 8: Seguridad y Validaciones

- Un usuario solo puede ser admin de UNA entidad por nivel
- No eliminar entidades con sub-entidades activas
- Cupos hijos no pueden exceder al padre
- Comisiones combinadas no pueden exceder 100%
- Todas las operaciones en AuditLog
- Rate limiting en endpoints POS

---

## Orden de Implementacion

1. **Fase 1** - Schema y migracion (modelos, enums, relaciones)
2. **Fase 2.1** - entity-management.service.js (CRUD + arbol + usuarios)
3. **Fase 3** - entity-auth.middleware.js (permisos multi-nivel)
4. **Fase 4.1** - entity.routes.js + entity.controller.js
5. **Fase 5.1-5.3** - API clients + store + pagina entidades
6. **Fase 5.4-5.6** - Tabs de info, usuarios, navegacion por rol
7. **Fase 2.2** - commission.service.js
8. **Fase 4.2** - commission.routes.js
9. **Fase 5.7** - Tab comisiones con cascada y simulador
10. **Fase 7** - Redis config
11. **Fase 2.3-2.4** - quota.service.js + quota-cache.service.js
12. **Fase 4.3** - quota.routes.js
13. **Fase 5.8** - Tab cupos con cascada y matriz
14. **Fase 2.5** - entity-ledger.service.js
15. **Fase 4.4** - ledger.routes.js
16. **Fase 5.9** - Tab contabilidad + liquidaciones
17. **Fase 5.10** - Dashboards por rol
18. **Fase 2.6** - physical-sale.service.js
19. **Fase 4.5** - pos.routes.js
20. **Fase 6** - Frontend POS completo
21. **Fase 8** - Validaciones finales y seguridad

## Resumen de Archivos

### Backend (nuevos: 18 archivos):
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

### Frontend (nuevos: ~30 archivos):
- `frontend/lib/api/entities.js`
- `frontend/lib/api/commissions.js`
- `frontend/lib/api/quotas.js`
- `frontend/lib/api/pos.js`
- `frontend/lib/api/ledger.js`
- `frontend/lib/stores/entityStore.js`
- `frontend/app/admin/entidades/page.js`
- `frontend/app/admin/entidades/[entityType]/[id]/page.js`
- `frontend/app/admin/mi-comercializadora/page.js`
- `frontend/app/admin/mi-banca/page.js`
- `frontend/app/admin/mi-grupo/page.js`
- `frontend/app/admin/mi-agencia/page.js`
- `frontend/app/admin/mis-usuarios/page.js`
- `frontend/app/admin/comisiones/page.js`
- `frontend/app/admin/cupos/page.js`
- `frontend/app/admin/contabilidad/page.js`
- `frontend/app/admin/reportes-entidad/page.js`
- `frontend/app/admin/liquidaciones/page.js`
- `frontend/app/pos/layout.js`
- `frontend/app/pos/page.js`
- `frontend/components/entities/EntityTree.js`
- `frontend/components/entities/EntityForm.js`
- `frontend/components/entities/EntityUsersTab.js`
- `frontend/components/entities/CommissionConfigTab.js`
- `frontend/components/entities/QuotaConfigTab.js`
- `frontend/components/entities/LedgerTab.js`
- `frontend/components/pos/*.js` (13 componentes)

### Backend (modificar):
- `backend/prisma/schema.prisma`
- `backend/src/middlewares/auth.middleware.js`
- `backend/src/services/ticket.service.js`
- `backend/src/services/prize-processor.service.js`
- `backend/src/app.js` o `backend/src/routes/index.js`
- `backend/package.json`

### Frontend (modificar):
- `frontend/app/admin/layout.js`
- `frontend/middleware.js`
- `frontend/app/admin/page.js`
