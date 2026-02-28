# INFORME: Análisis del Sistema de Juego en Línea — TOTE-WEB

**Fecha:** 2026-02-28
**Alcance:** Funcionalidad de juego online para jugadores

---

## Tabla de Contenidos

1. [Registro y Autenticación de Jugadores](#1-registro-y-autenticación-de-jugadores)
2. [Gestión de Saldo (Wallet)](#2-gestión-de-saldo-wallet)
3. [Proceso de Hacer Jugadas Online](#3-proceso-de-hacer-jugadas-online)
4. [Cálculo de Premios y Totalización](#4-cálculo-de-premios-y-totalización)
5. [Modalidad Tripleta](#5-modalidad-tripleta)
6. [Estado General de la Funcionalidad Online](#6-estado-general-de-la-funcionalidad-online)

---

## 1. Registro y Autenticación de Jugadores

### 1.1 Modelo de Usuario

**Archivo:** `backend/prisma/schema.prisma` (líneas 304-340)

El modelo `User` contiene los siguientes campos clave:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | String (UUID) | Identificador único |
| `username` | String (unique) | Nombre de usuario |
| `email` | String (unique) | Correo electrónico |
| `password` | String | Hash bcrypt |
| `phone` | String (unique) | Teléfono venezolano |
| `phoneVerified` | Boolean | Estado de verificación del teléfono |
| `role` | UserRole | Rol del usuario |
| `balance` | Decimal(12,2) | Saldo disponible |
| `blockedBalance` | Decimal(12,2) | Saldo bloqueado (retiros pendientes) |
| `isActive` | Boolean | Usuario activo/inactivo |
| `lastLoginAt` | DateTime | Último login |
| `telegramUserId` | String | ID de Telegram (para bot) |
| `telegramChatId` | String | Chat ID para notificaciones |

### 1.2 Roles del Sistema

**Enum `UserRole`** (líneas 358-364):

| Rol | Descripción |
|-----|-------------|
| `ADMIN` | Acceso total al sistema |
| `OPERATOR` | Gestión de sorteos |
| `VIEWER` | Solo lectura |
| **`PLAYER`** | **Jugador online (taquilla online)** |
| `TAQUILLA_ADMIN` | Administrador de taquilla online |

> **Nota:** No existe un rol "taquillero presencial" porque los tickets presenciales se importan desde proveedores externos (SRQ) vía API, sin necesidad de un usuario en el sistema.

### 1.3 Flujo de Registro de Jugador

**Endpoint:** `POST /api/auth/register-player`
**Controlador:** `backend/src/controllers/auth.controller.js` (líneas 205-237)
**Servicio:** `backend/src/services/auth.service.js` → `registerPlayer()` (líneas 264-350)

**Datos requeridos:**
```json
{
  "username": "string (requerido)",
  "email": "string (requerido)",
  "password": "string (requerido, mín. 6 caracteres)",
  "phone": "string (opcional, formato venezolano)"
}
```

**Validaciones aplicadas:**
1. **Email:** Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
2. **Contraseña:** Mínimo 6 caracteres
3. **Teléfono:** Regex `/^(\+58|0)?4\d{9}$/` (formato venezolano)
4. **Unicidad:** Se verifica que username, email y phone no estén registrados

**Proceso de creación:**
1. Hash de contraseña con bcrypt (10 rondas de salt)
2. Creación del usuario con `role: 'PLAYER'`, `balance: 0`, `blockedBalance: 0`
3. Generación automática de token JWT
4. Respuesta con datos del usuario + token

### 1.4 Autenticación (JWT)

**Servicio:** `backend/src/services/auth.service.js`

- **Token:** JWT con payload `{ id, username, email, role }`
- **Expiración:** 7 días (`JWT_EXPIRES_IN` o default `'7d'`)
- **Secreto:** Variable de entorno `JWT_SECRET`
- **Login:** `POST /api/auth/login` — verifica usuario + contraseña bcrypt, actualiza `lastLoginAt`

### 1.5 Middleware de Autorización

**Archivo:** `backend/src/middlewares/auth.middleware.js`

- **`authenticate()`** (líneas 7-51): Extrae token del header `Authorization: Bearer <TOKEN>`, valida JWT, busca usuario en BD, verifica `isActive`
- **`authorize(roles)`** (líneas 56-80): Verifica que `req.user.role` esté en el array de roles permitidos

### 1.6 Endpoints de Autenticación

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/auth/login` | Público | Login |
| POST | `/api/auth/register-player` | Público | Registro de jugador |
| GET | `/api/auth/me` | Autenticado | Usuario actual |
| POST | `/api/auth/change-password` | Autenticado | Cambiar contraseña |
| PATCH | `/api/auth/profile` | Autenticado | Actualizar perfil |
| POST | `/api/auth/register` | ADMIN | Crear usuario no-jugador |
| GET | `/api/auth/users` | ADMIN | Listar usuarios |

### 1.7 Frontend de Login/Registro

**Ruta:** `/login`
**Archivo:** `frontend/app/login/page.js`

- Interfaz con tabs "Iniciar Sesión" / "Registrarse"
- Campos de registro: usuario, email, teléfono (opcional), contraseña, confirmación
- Integración con `authStore` (Zustand)
- Redirección automática a `/dashboard` tras login/registro exitoso

---

## 2. Gestión de Saldo (Wallet)

### 2.1 Arquitectura del Saldo

El sistema implementa una **billetera digital completa** con dos campos en el modelo `User`:

- **`balance`** (Decimal 12,2): Saldo total del usuario
- **`blockedBalance`** (Decimal 12,2): Saldo retenido por retiros pendientes
- **Saldo disponible** = `balance - blockedBalance`

### 2.2 Sistema de Depósitos (Recarga vía Pago Móvil)

**Modelo:** `Deposit` (schema.prisma, líneas 766-788)
**Servicio:** `backend/src/services/deposit.service.js`
**Rutas:** `backend/src/routes/deposit.routes.js`

**Flujo completo:**

```
1. Jugador → POST /api/deposits
   { systemPagoMovilId, amount, reference, phone, bankCode }
   Estado: PENDING

2. Admin/TAQUILLA_ADMIN revisa → POST /api/deposits/:id/approve
   → Transacción Prisma:
     - Estado → APPROVED
     - balance += amount
     - Se registra PlayerMovement (type: DEPOSIT)

3. O rechaza → POST /api/deposits/:id/reject
   → Sin cambios en balance
```

**Endpoints de depósitos:**

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/deposits` | PLAYER | Crear solicitud de depósito |
| GET | `/api/deposits/my-deposits` | PLAYER | Mis depósitos |
| GET | `/api/deposits` | ADMIN/TAQUILLA_ADMIN | Todos los depósitos |
| POST | `/api/deposits/:id/approve` | ADMIN/TAQUILLA_ADMIN | Aprobar (incrementa balance) |
| POST | `/api/deposits/:id/reject` | ADMIN/TAQUILLA_ADMIN | Rechazar |

### 2.3 Sistema de Retiros

**Modelo:** `Withdrawal` (schema.prisma, líneas 798-817)
**Servicio:** `backend/src/services/withdrawal.service.js`

**Validaciones al crear retiro:**
1. Teléfono verificado (`phoneVerified === true`)
2. Saldo disponible >= monto solicitado
3. Monto > 0
4. Cuenta Pago Móvil activa y perteneciente al usuario

**Flujo de estados:**

```
PENDING → PROCESSING → COMPLETED    (retiro exitoso)
PENDING → REJECTED                   (admin rechaza, saldo se desbloquea)
PENDING → CANCELLED                  (jugador cancela, saldo se desbloquea)
```

**Detalle del bloqueo de saldo:**
- Al crear retiro: `blockedBalance += amount` (dinero reservado)
- Al completar: `blockedBalance -= amount` Y `balance -= amount` (dinero sale)
- Al rechazar/cancelar: `blockedBalance -= amount` (dinero vuelve a estar disponible)

**Endpoints de retiros:**

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/withdrawals` | PLAYER | Solicitar retiro |
| GET | `/api/withdrawals/my-withdrawals` | PLAYER | Mis retiros |
| DELETE | `/api/withdrawals/:id` | PLAYER | Cancelar retiro pendiente |
| POST | `/api/withdrawals/:id/process` | ADMIN/TAQUILLA_ADMIN | Marcar en proceso |
| POST | `/api/withdrawals/:id/complete` | ADMIN/TAQUILLA_ADMIN | Completar retiro |
| POST | `/api/withdrawals/:id/reject` | ADMIN/TAQUILLA_ADMIN | Rechazar |

### 2.4 Trazabilidad de Movimientos (PlayerMovement)

**Modelo:** `PlayerMovement` (schema.prisma, líneas 941-962)
**Servicio:** `backend/src/services/player-movement.service.js`

Cada movimiento de dinero queda registrado con:

| Campo | Descripción |
|-------|-------------|
| `type` | DEPOSIT, WITHDRAWAL, BET, PRIZE, REFUND, ADJUSTMENT, BONUS |
| `amount` | Positivo (entrada) o negativo (salida) |
| `balanceBefore` | Saldo antes del movimiento |
| `balanceAfter` | Saldo después del movimiento |
| `description` | Texto descriptivo |
| `referenceType` | TICKET, DEPOSIT, WITHDRAWAL, TRIPLETA, ADJUSTMENT |
| `referenceId` | ID de la referencia |
| `metadata` | JSON con datos adicionales (drawId, gameName, etc.) |
| `createdBy` | ID del admin (para ajustes manuales) |

**Métodos de registro:**
- `recordBet()` — Al crear apuesta (amount negativo)
- `recordPrize()` — Al ganar premio (amount positivo)
- `recordDeposit()` — Al aprobar depósito (amount positivo)
- `recordWithdrawal()` — Al completar retiro (amount negativo)
- `recordRefund()` — Al cancelar apuesta (amount positivo)
- `recordAdjustment()` — Ajuste manual por admin

### 2.5 Endpoints de Consulta del Jugador

**Rutas:** `backend/src/routes/player-query.routes.js`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/player/balance` | Saldo actual (total, bloqueado, disponible) |
| GET | `/api/player/balance-history` | Historial con saldo en ejecución |
| GET | `/api/player/transactions` | Depósitos y retiros filtrados |
| GET | `/api/player/statistics` | Estadísticas acumuladas |
| GET | `/api/player/tickets` | Mis tickets |
| GET | `/api/player/deposits` | Mis depósitos |
| GET | `/api/player/withdrawals` | Mis retiros |

### 2.6 Estadísticas del Jugador (PlayerStats)

**Modelo:** `PlayerStats` (schema.prisma, líneas 1050-1080)

| Estadística | Descripción |
|-------------|-------------|
| `totalTickets` / `wonTickets` / `lostTickets` | Tickets totales, ganados, perdidos |
| `totalTripletas` / `wonTripletas` / `lostTripletas` | Tripletas totales, ganadas, perdidas |
| `totalBet` | Total apostado |
| `totalPrize` | Total ganado |
| `totalDeposits` | Total depositado |
| `totalWithdrawals` | Total retirado |

Se recalculan automáticamente con `playerMovementService.updatePlayerStats()`.

### 2.7 Permisos por Rol

| Operación | PLAYER | ADMIN | TAQUILLA_ADMIN |
|-----------|--------|-------|----------------|
| Ver su balance | Si | Si | Si |
| Ver su historial | Si | Si | Si |
| Crear depósito | Si | — | — |
| Crear retiro | Si | — | — |
| Aprobar depósito | — | Si | Si |
| Rechazar depósito | — | Si | Si |
| Completar retiro | — | Si | Si |
| Ver todos los jugadores | — | Si | Si |
| Ver movimientos de otros | — | Si | Si |

---

## 3. Proceso de Hacer Jugadas Online

### 3.1 Conceptos Clave

- **Game** (Juego): Tipo de lotería (ej: Triple, Ruleta, Animalitos)
- **GameItem**: Número/animal/item disponible en un juego (con `multiplier`)
- **Draw** (Sorteo): Instancia de un sorteo programado
- **Ticket**: Apuesta del jugador, puede contener múltiples jugadas
- **TicketDetail**: Cada jugada individual dentro de un ticket

### 3.2 Modelo de Sorteo (Draw)

**Estados del sorteo:**

```
SCHEDULED → CLOSED → DRAWN → PUBLISHED → (CANCELLED)
    ↑           ↑        ↑         ↑
 Creado    -5 min    Hora exacta  Publicado
 Abierto   Preselección  Ganador    en canales
 a apuestas  de ganador  confirmado
```

- **SCHEDULED:** Abierto para recibir apuestas
- **CLOSED:** Cerrado 5 minutos antes de la hora del sorteo
- **DRAWN:** Ejecutado, ganador asignado (`winnerItemId`)
- **PUBLISHED:** Resultado publicado en canales (WhatsApp, Telegram, etc.)

### 3.3 Modelo de Ticket

**Campos principales** (schema.prisma, líneas 835-860):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `userId` | String | Jugador (null para tickets externos) |
| `drawId` | String | Sorteo en el que juega |
| `source` | TicketSource | `TAQUILLA_ONLINE` o `EXTERNAL_API` |
| `totalAmount` | Decimal | Monto total apostado |
| `totalPrize` | Decimal | Premio total si gana |
| `status` | TicketStatus | ACTIVE, WON, LOST, CANCELLED |
| `externalTicketId` | String | ID en sistema externo (SRQ) |
| `providerData` | JSON | Datos del proveedor (comercial, banca, grupo, taquilla) |

**TicketDetail** (líneas 868-885):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `gameItemId` | String | Número/animal apostado |
| `amount` | Decimal | Monto de esta jugada |
| `multiplier` | Decimal | Multiplicador al momento de la apuesta |
| `prize` | Decimal | Premio por esta jugada |
| `status` | TicketDetailStatus | ACTIVE, WON, LOST |

### 3.4 Endpoint de Creación de Apuesta

**Endpoint:** `POST /api/tickets`
**Controlador:** `backend/src/controllers/ticket.controller.js` (líneas 5-41)
**Servicio:** `backend/src/services/ticket.service.js` (líneas 7-143)

**Cuerpo de la solicitud:**
```json
{
  "drawId": "uuid-del-sorteo",
  "details": [
    { "gameItemId": "uuid-del-numero", "amount": 10.00 },
    { "gameItemId": "uuid-del-numero", "amount": 20.00 }
  ]
}
```

### 3.5 Validaciones al Crear Ticket

1. **Usuario existe** y está activo
2. **Sorteo existe** y pertenece a un juego activo
3. **Sorteo en estado `SCHEDULED`** — Error: "Solo puedes jugar en sorteos programados (SCHEDULED)"
4. **No ha cerrado** (hora actual < closeTime) — Error: "El sorteo ya cerró"
5. **Detalles válidos:** al menos 1 jugada, cada una con `gameItemId` y `amount > 0`
6. **GameItems existen** y pertenecen al juego del sorteo
7. **Saldo suficiente:** `(balance - blockedBalance) >= totalAmount` — Error: "Saldo insuficiente"

### 3.6 Flujo Completo de la Apuesta (Transacción Atómica)

```
await prisma.$transaction(async (tx) => {
  1. Validar sorteo (SCHEDULED, no cerrado)
  2. Validar items y calcular total
  3. Validar saldo disponible >= total
  4. DEDUCIR balance: balance -= totalAmount
  5. Crear Ticket con TicketDetails
  6. Registrar PlayerMovement (type: BET, amount: -totalAmount)
  7. Retornar ticket creado con relaciones
});
```

> **El balance se descuenta automáticamente e inmediatamente** dentro de una transacción atómica. Si cualquier paso falla, todo se revierte.

### 3.7 Diferencia entre Jugadas Online vs Presenciales

| Aspecto | TAQUILLA_ONLINE (Online) | EXTERNAL_API (Presencial/SRQ) |
|---------|--------------------------|-------------------------------|
| `source` | `TAQUILLA_ONLINE` | `EXTERNAL_API` |
| `userId` | Tiene (jugador registrado) | NULL |
| Creación | `POST /api/tickets` | Importado vía job de sincronización SRQ |
| Balance | Se descuenta inmediatamente | No afecta balance (sin usuario local) |
| `providerData` | Datos de la plataforma | { comercial, banca, grupo, taquilla } |
| Premio | Se acredita al balance del usuario | No se acredita (va al proveedor externo) |
| Estadísticas | Se cuentan en `PlayerStats` | Se cuentan en `ProviderStats` |

### 3.8 Endpoints de Tickets

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/tickets` | PLAYER | Crear ticket (apuesta) |
| GET | `/api/tickets/my-tickets` | PLAYER | Mis tickets |
| GET | `/api/tickets/:id` | Autenticado | Detalle de ticket |
| DELETE | `/api/tickets/:id` | PLAYER | Cancelar ticket |
| GET | `/api/tickets` | ADMIN | Listar todos |
| GET | `/api/tickets/by-draw/:drawId` | ADMIN | Tickets por sorteo |
| GET | `/api/tickets/stats/:drawId` | ADMIN | Estadísticas por sorteo |

### 3.9 Frontend: Página de Juego

**Ruta:** `/jugar`
**Archivo:** `frontend/app/jugar/page.js`

**Flujo de UI:**
1. Seleccionar juego (`GameSelector`)
2. Seleccionar sorteo con validación de cierre (`DrawSelector`)
3. Seleccionar monto (`AmountSelector`)
4. Ingresar números vía pad numérico (`NumberPad`)
5. Revisar selecciones (`SelectedItems`)
6. Confirmar compra → crear ticket(s)
7. Modal de confirmación (`TicketModal`)
8. Actualización de balance y redirección

**Soporte para teclado físico** y pad numérico en pantalla. Diseño responsive (móvil + escritorio).

---

## 4. Cálculo de Premios y Totalización

### 4.1 Servicio de Procesamiento de Premios

**Archivo:** `backend/src/services/prize-processor.service.js` (líneas 1-267)

**Función principal:** `processPrizesForDraw(drawId)`

### 4.2 Lógica de Cálculo

```
premio = amount × multiplier
```

- `amount`: Monto apostado en el TicketDetail
- `multiplier`: Multiplicador del GameItem al momento de la apuesta (default: 30x)

**Determinación de ganador** (línea 73):
```javascript
const isWinner = detail.gameItemId === draw.winnerItemId;
const prize = isWinner ? parseFloat(detail.amount) * parseFloat(detail.multiplier) : 0;
```

### 4.3 Integración de Jugadas Online + Presenciales

El servicio `processPrizesForDraw` procesa **TODOS** los tickets del sorteo, tanto online (`TAQUILLA_ONLINE`) como presenciales (`EXTERNAL_API`).

**Diferencia clave en acreditación** (línea ~149):
```javascript
// Solo acreditar balance si el ticket tiene usuario (TAQUILLA_ONLINE)
if (ticket.userId) {
  await tx.user.update({
    where: { id: ticket.userId },
    data: { balance: { increment: thisDrawPrize } }
  });
  // Registrar PlayerMovement (PRIZE)
}
// Los tickets EXTERNAL_API no tienen userId → no se acredita balance local
```

### 4.4 Flujo Completo de Ejecución de Sorteo

**Jobs automáticos:**

1. **`close-draw.job.js`** — Ejecuta cada minuto:
   - Busca sorteos `SCHEDULED` cuya hora es `ahora + 5 minutos`
   - Cierra el sorteo (`status → CLOSED`)
   - Preselecciona ganador (aleatorio, inteligente o admin)
   - Emite eventos WebSocket

2. **`execute-draw.job.js`** — Ejecuta cada minuto:
   - Busca sorteos `CLOSED` cuya hora ya pasó
   - Ejecuta el sorteo (`status → DRAWN`, asigna `winnerItemId`)
   - **Llama a `prizeProcessorService.processPrizesForDraw()`**
   - Calcula estadísticas (`drawStatsService.calculateAllStats()`)
   - Crea publicaciones para canales (Telegram, WhatsApp, etc.)
   - Verifica apuestas tripleta

3. **Procesamiento de premios:**
   - Itera cada TicketDetail del sorteo
   - Compara `gameItemId` con `winnerItemId`
   - Si gana: calcula premio, actualiza status a `WON`, acredita balance (solo online)
   - Si pierde: actualiza status a `LOST`
   - Registra PlayerMovement para ganadores

### 4.5 Estadísticas del Sorteo (DrawStats)

**Modelo:** `DrawStats` (schema.prisma, líneas 968-999)

| Métrica | Descripción |
|---------|-------------|
| `totalSales` | Ventas totales |
| `totalPrize` | Premios pagados |
| `grossProfit` | Ganancia bruta (ventas - premios) |
| `profitMargin` | Margen de ganancia (%) |
| Conteos | Tickets, jugadas, ganadores |
| Tripletas | Estadísticas de tripletas |

**ProviderStats** (líneas 1012-1044): Agrupación por nivel (TAQUILLA, GRUPO, BANCA, COMERCIAL) para tickets presenciales.

### 4.6 Estado de los Tickets Tras Procesamiento

```javascript
// Si el ticket tiene detalles en múltiples sorteos:
const hasWinningDetail = allDetails.some(d => d.status === 'WON');
const hasActiveDetail = allDetails.some(d => d.status === 'ACTIVE');

if (hasWinningDetail) ticketStatus = 'WON';
else if (hasActiveDetail) ticketStatus = 'ACTIVE';  // Aún participando
else ticketStatus = 'LOST';  // Todos procesados, ninguno ganó
```

---

## 5. Modalidad Tripleta

### 5.1 Descripción

La **Tripleta** es una modalidad de apuesta donde el jugador selecciona **3 números diferentes** y gana si los 3 salen como ganadores dentro de una **ventana de sorteos consecutivos**.

### 5.2 Implementación

**SI, está completamente implementada.**

**Modelo:** `TripleBet` (schema.prisma, líneas 898-925)
**Servicio:** `backend/src/services/tripleta.service.js` (471 líneas)
**Rutas:** `backend/src/routes/tripleta.routes.js`

### 5.3 Modelo TripleBet

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `userId` | String | Jugador |
| `gameId` | String | Juego |
| `item1Id` | String | Primer número |
| `item2Id` | String | Segundo número |
| `item3Id` | String | Tercer número |
| `amount` | Decimal | Monto apostado |
| `multiplier` | Decimal | Multiplicador (ej: 50x) |
| `drawsCount` | Int | Cantidad de sorteos de la ventana |
| `startDrawId` | String | Primer sorteo de la ventana |
| `endDrawId` | String | Último sorteo de la ventana |
| `winnerDrawId` | String | Sorteo donde ganó (si aplica) |
| `prize` | Decimal | Premio ganado |
| `status` | TripletaStatus | ACTIVE, WON, LOST, EXPIRED |
| `expiresAt` | DateTime | Fecha de expiración |

### 5.4 Configuración por Juego

La tripleta se configura en el campo `config.tripleta` del modelo `Game`:

```json
{
  "tripleta": {
    "enabled": true,
    "drawsCount": 10,
    "multiplier": 50
  }
}
```

- `enabled`: Habilita/deshabilita la modalidad para el juego
- `drawsCount`: Ventana de sorteos consecutivos
- `multiplier`: Multiplicador del premio (ej: 50x)

### 5.5 Flujo de Creación de Tripleta

**Endpoint:** `POST /api/tripleta/bet`
**Servicio:** `tripleta.service.js` → `createTripleBet()` (líneas 14-147)

**Validaciones:**
1. Juego existe y está activo
2. Tripleta habilitada en el juego (`config.tripleta.enabled`)
3. Los 3 números son **diferentes entre sí**
4. Los 3 items existen y pertenecen al juego
5. Saldo suficiente (`balance - blockedBalance >= amount`)
6. Hay suficientes sorteos `SCHEDULED` futuros para cubrir `drawsCount`

**Proceso (transacción atómica):**
1. Buscar próximos N sorteos programados
2. Deducir balance del jugador (`balance -= amount`)
3. Crear TripleBet con `startDrawId`, `endDrawId`, `expiresAt`
4. Registrar PlayerMovement (type: BET)

### 5.6 Verificación de Ganadores de Tripleta

**Función:** `checkTripleBetsForDraw(drawId)` — Se ejecuta cada vez que se ejecuta un sorteo.

**Lógica:**
```javascript
// Obtener los sorteos ejecutados dentro de la ventana de la tripleta
const executedDraws = await getDrawsBetween(bet.startDrawId, bet.endDrawId);
const winnerItemIds = executedDraws.map(d => d.winnerItemId);

// Verificar si los 3 números han salido (en CUALQUIER orden)
const hasItem1 = winnerItemIds.includes(bet.item1Id);
const hasItem2 = winnerItemIds.includes(bet.item2Id);
const hasItem3 = winnerItemIds.includes(bet.item3Id);

if (hasItem1 && hasItem2 && hasItem3) {
  // ¡GANADOR!
  prize = bet.amount * bet.multiplier;
  status = 'WON';
  // Acreditar balance del usuario
} else if (executedDraws.length >= bet.drawsCount) {
  // Ventana agotada sin ganar
  status = 'EXPIRED';
}
```

**Puntos importantes:**
- Los 3 números **NO** necesitan salir en orden
- Pueden salir en **cualquier sorteo** dentro de la ventana
- La verificación se ejecuta en **cada sorteo** de la ventana
- El premio se calcula como `amount × multiplier`

### 5.7 Tripletas del Proveedor Externo (SRQ)

**Servicio:** `backend/src/services/srq-tripleta.service.js` (813 líneas)

- Sincronización automática de tripletas externas
- Se crean 3 TicketDetail por cada número de la tripleta
- Verificación independiente para tripletas externas
- Los premios de tripletas externas **NO se acreditan en balance local**

### 5.8 Soporte Frontend

- **Ruta:** `/tripletas`
- **Componente Modal:** `TripletaBetModal` — Para seleccionar los 3 números
- **Componente Detalle:** `TripletaDetailModal` — Muestra estado de la tripleta
- **API Client:** `frontend/lib/api/tripleta.js`

### 5.9 Endpoints de Tripleta

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/tripleta/bet` | PLAYER | Crear apuesta tripleta |
| GET | `/api/tripleta/my-bets` | PLAYER | Mis tripletas |
| GET | `/api/players/:id/tripletas` | ADMIN/TAQUILLA_ADMIN | Tripletas de un jugador |

---

## 6. Estado General de la Funcionalidad Online

### 6.1 Resumen por Módulo

| Módulo | Estado | Observaciones |
|--------|--------|---------------|
| Registro de jugadores | ✅ Completo | Validaciones, JWT, roles |
| Login/autenticación | ✅ Completo | JWT 7 días, middleware RBAC |
| Wallet/balance | ✅ Completo | Balance + blockedBalance, transacciones atómicas |
| Depósitos (Pago Móvil) | ✅ Completo | Flujo PENDING → APPROVED/REJECTED |
| Retiros (Pago Móvil) | ✅ Completo | Flujo con bloqueo de saldo |
| Trazabilidad (movimientos) | ✅ Completo | PlayerMovement tipo banco |
| Creación de apuestas | ✅ Completo | Validaciones, descuento automático |
| Cálculo de premios | ✅ Completo | Integra online + presencial |
| Acreditación de premios | ✅ Completo | Solo para tickets online (con userId) |
| Modalidad Tripleta | ✅ Completo | Online + SRQ externo |
| Estadísticas jugador | ✅ Completo | PlayerStats auto-calculadas |
| Frontend jugador | ✅ Completo | Dashboard, jugar, depósitos, retiros, tripletas |
| Landing pública | ✅ Completo | Resultados en vivo, countdown, juegos |
| WebSocket (tiempo real) | ✅ Completo | Actualizaciones de sorteos en vivo |
| Publicación multi-canal | ✅ Completo | WhatsApp, Telegram, Facebook, Instagram, TikTok |

### 6.2 Funcionalidades Completas

1. **Registro y autenticación** — Sistema JWT completo con roles diferenciados
2. **Billetera digital** — Balance con bloqueo, Pago Móvil, trazabilidad completa
3. **Apuestas online** — Flujo end-to-end con validaciones robustas
4. **Tripleta** — Implementada online y para proveedores externos
5. **Cálculo de premios** — Totalización automática con acreditación
6. **UI jugador** — Dashboard, jugar, depósitos, retiros, histórico

### 6.3 Aspectos Sólidos de la Arquitectura

- **Transacciones atómicas:** Todas las operaciones de dinero usan `prisma.$transaction()`
- **Doble campo de saldo:** `balance` + `blockedBalance` evita sobre-giros
- **Trazabilidad tipo banco:** Cada movimiento registra `balanceBefore` y `balanceAfter`
- **Separación online/presencial:** `TicketSource` diferencia claramente ambos canales
- **Jobs automáticos:** Cierre, ejecución, totalización y publicación son automáticos
- **Rate limiting:** 1000 req/15min general, 50 req/15min para auth

### 6.4 Observaciones y Posibles Mejoras

| # | Observación | Severidad | Descripción |
|---|-------------|-----------|-------------|
| 1 | Verificación de teléfono | Media | `phoneVerified` se requiere para retiros, pero **no hay flujo visible de verificación** (SMS/OTP). Parece ser un flag que un admin activa manualmente |
| 2 | Cancelación de tickets | Baja | `DELETE /api/tickets/:id` existe, pero las condiciones de cancelación (antes del cierre del sorteo) deberían verificarse |
| 3 | Notificaciones al jugador | Media | El sistema publica en canales (WhatsApp, Telegram), pero no es claro si hay **notificaciones personalizadas** al jugador cuando gana un premio |
| 4 | Límites de apuesta | Baja | No se observan límites máximos de apuesta por jugada o por sorteo (podría ser intencional) |
| 5 | Multi-sorteo en un ticket | Info | Un ticket puede cubrir un solo sorteo. Para jugar en múltiples sorteos, se crean múltiples tickets |
| 6 | Recuperación de contraseña | Media | No se observa endpoint de "olvidé mi contraseña" o reset por email |
| 7 | KYC / Verificación de identidad | Baja | El registro solo pide username, email, password y teléfono opcional. No hay verificación de identidad más allá del teléfono |
| 8 | Historial público de resultados | Info | Existe en `/juego/[slug]` con paginación, bien implementado |

### 6.5 Conclusión General

**La funcionalidad de juego en línea está esencialmente COMPLETA y funcional.** El sistema cubre todo el ciclo de vida del jugador online:

```
Registro → Depósito → Jugar → Ganar/Perder → Cobrar → Retirar
```

Todos los módulos críticos (autenticación, wallet, apuestas, premios, tripleta) están implementados con buenas prácticas:
- Transacciones atómicas para integridad de datos
- Trazabilidad completa de movimientos financieros
- Separación clara entre jugadas online y presenciales
- Frontend responsive con UI optimizada para jugadores
- Integración multi-canal para publicación de resultados

Las observaciones listadas en la sección 6.4 son mejoras incrementales, no bloqueantes para la operación del sistema.

---

## Apéndice: Stack Tecnológico

### Backend
- **Runtime:** Node.js (ES Modules)
- **Framework:** Express.js
- **Base de datos:** PostgreSQL
- **ORM:** Prisma 6.16+
- **Auth:** JWT + bcrypt
- **Jobs:** Croner + node-cron (timezone América/Caracas)
- **WebSocket:** Socket.io
- **Imágenes:** Sharp
- **Integraciones:** Baileys (WhatsApp), Telegram Bot API, Graph API (Facebook/Instagram)

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** React 18 + TailwindCSS 4 + shadcn/ui
- **Estado:** Zustand
- **Forms:** React Hook Form + Zod
- **HTTP:** Axios
- **Real-time:** Socket.io-client
- **Gráficos:** Recharts

### Infraestructura
- **Process Manager:** PM2
- **Contenedores:** Docker Compose
- **Almacenamiento:** Disco local (sesiones WhatsApp, imágenes)
