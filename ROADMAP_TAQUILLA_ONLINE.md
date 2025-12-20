# ROADMAP: Sistema de Taquilla Online

## 📋 Resumen Ejecutivo

Este documento define el roadmap para implementar un sistema de **taquilla en línea** que permita a usuarios registrarse, recargar saldo, jugar, y retirar ganancias. El sistema se integrará con la infraestructura existente de sorteos y jugadas.

---

## 🏗️ Análisis del Sistema Actual

### Base de Datos Existente
- **Usuarios**: Modelo `User` con roles ADMIN, OPERATOR, VIEWER
- **Juegos**: `Game`, `GameItem` con multiplicadores
- **Sorteos**: `Draw` con estados SCHEDULED → CLOSED → DRAWN → PUBLISHED
- **Tickets Externos**: `ExternalTicket` para jugadas de proveedores (SRQ)
- **Canales**: Sistema multi-canal (Telegram, WhatsApp, etc.)

### Arquitectura Backend
- Express.js con Prisma ORM
- Jobs con node-cron para automatización
- Sistema de publicación multi-canal
- Integración con APIs externas (SRQ)

### Lo que YA existe y se puede reutilizar:
- ✅ Sistema de autenticación JWT
- ✅ Estructura de juegos y sorteos
- ✅ Modelo `ExternalTicket` (base para tickets internos)
- ✅ Jobs de cierre/ejecución de sorteos
- ✅ Integración WhatsApp con Baileys
- ✅ Sistema de cambio de contraseña básico

---

## 🎯 Módulos a Implementar

### FASE 1: Fundamentos (2-3 semanas)

#### 1.1 Modelo de Datos - Usuarios Jugadores
```prisma
// Extender modelo User existente
enum UserRole {
  ADMIN
  OPERATOR
  VIEWER
  PLAYER      // NUEVO: Usuario jugador
}

model User {
  // Campos existentes...
  
  // NUEVOS campos para jugadores
  phone           String?   @unique
  phoneVerified   Boolean   @default(false)
  balance         Decimal   @default(0) @db.Decimal(12, 2)
  blockedBalance  Decimal   @default(0) @db.Decimal(12, 2) // Saldo bloqueado por retiros pendientes
  
  // Relaciones nuevas
  tickets         Ticket[]
  deposits        Deposit[]
  withdrawals     Withdrawal[]
  pagoMovilAccounts PagoMovilAccount[]
}
```

#### 1.2 Sistema de Pago Móvil
```prisma
// Cuentas Pago Móvil del Sistema (para recibir pagos)
model SystemPagoMovil {
  id          String    @id @default(uuid())
  bankCode    String    // Código del banco (0102, 0134, etc.)
  bankName    String    // Nombre del banco
  phone       String    // Número de teléfono
  cedula      String    // Cédula del titular
  holderName  String    // Nombre del titular
  isActive    Boolean   @default(true)
  priority    Int       @default(0) // Para ordenar cuál mostrar primero
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  deposits    Deposit[]
}

// Cuentas Pago Móvil del Usuario (para recibir retiros)
model PagoMovilAccount {
  id          String    @id @default(uuid())
  userId      String
  bankCode    String
  bankName    String
  phone       String
  cedula      String
  holderName  String
  isDefault   Boolean   @default(false)
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  withdrawals Withdrawal[]
  
  @@index([userId])
}
```

#### 1.3 Sistema de Depósitos
```prisma
enum DepositStatus {
  PENDING     // Esperando validación
  APPROVED    // Aprobado, saldo acreditado
  REJECTED    // Rechazado
}

model Deposit {
  id                  String        @id @default(uuid())
  userId              String
  systemPagoMovilId   String
  amount              Decimal       @db.Decimal(12, 2)
  reference           String        // Referencia del pago móvil
  phone               String        // Teléfono desde donde se hizo el pago
  bankCode            String        // Banco origen
  status              DepositStatus @default(PENDING)
  notes               String?       // Notas del admin
  processedBy         String?       // ID del admin que procesó
  processedAt         DateTime?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  
  user                User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  systemPagoMovil     SystemPagoMovil @relation(fields: [systemPagoMovilId], references: [id])
  
  @@index([userId])
  @@index([status])
  @@index([reference])
}
```

#### 1.4 Sistema de Retiros
```prisma
enum WithdrawalStatus {
  PENDING     // Solicitado, saldo bloqueado
  PROCESSING  // En proceso de pago
  COMPLETED   // Pagado
  REJECTED    // Rechazado, saldo desbloqueado
  CANCELLED   // Cancelado por usuario
}

model Withdrawal {
  id                  String            @id @default(uuid())
  userId              String
  pagoMovilAccountId  String
  amount              Decimal           @db.Decimal(12, 2)
  status              WithdrawalStatus  @default(PENDING)
  reference           String?           // Referencia del pago realizado
  notes               String?
  processedBy         String?
  processedAt         DateTime?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  
  user                User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  pagoMovilAccount    PagoMovilAccount  @relation(fields: [pagoMovilAccountId], references: [id])
  
  @@index([userId])
  @@index([status])
}
```

#### 1.5 Tareas Fase 1

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 1.1.1 | Agregar rol PLAYER al enum UserRole | Alta | - | 1h |
| 1.1.2 | Agregar campos balance, blockedBalance, phone, phoneVerified a User | Alta | 1.1.1 | 2h |
| 1.1.3 | Crear modelo SystemPagoMovil | Alta | - | 2h |
| 1.1.4 | Crear modelo PagoMovilAccount | Alta | 1.1.2 | 2h |
| 1.1.5 | Crear modelo Deposit | Alta | 1.1.3 | 2h |
| 1.1.6 | Crear modelo Withdrawal | Alta | 1.1.4 | 2h |
| 1.1.7 | Ejecutar migración de base de datos | Alta | 1.1.1-1.1.6 | 1h |
| 1.2.1 | Crear endpoint de auto-registro público | Alta | 1.1.7 | 4h |
| 1.2.2 | Crear página de registro en frontend | Alta | 1.2.1 | 6h |
| 1.2.3 | Crear CRUD de SystemPagoMovil (admin) | Media | 1.1.7 | 4h |
| 1.2.4 | Crear página admin para gestionar Pago Móvil del sistema | Media | 1.2.3 | 4h |

---

### FASE 2: Sistema de Tickets y Jugadas (2-3 semanas)

#### 2.1 Modelo de Tickets
```prisma
enum TicketStatus {
  ACTIVE      // Ticket activo, sorteo no ha ocurrido
  WON         // Ticket ganador
  LOST        // Ticket perdedor
  CANCELLED   // Cancelado (reembolsado)
}

model Ticket {
  id          String        @id @default(uuid())
  userId      String
  drawId      String
  totalAmount Decimal       @db.Decimal(12, 2)
  totalPrize  Decimal       @default(0) @db.Decimal(12, 2)
  status      TicketStatus  @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  draw        Draw          @relation(fields: [drawId], references: [id], onDelete: Cascade)
  details     TicketDetail[]
  
  @@index([userId])
  @@index([drawId])
  @@index([status])
  @@index([userId, status])
}

enum TicketDetailStatus {
  ACTIVE
  WON
  LOST
}

model TicketDetail {
  id          String              @id @default(uuid())
  ticketId    String
  gameItemId  String
  amount      Decimal             @db.Decimal(12, 2)
  multiplier  Decimal             @db.Decimal(10, 2) // Multiplicador al momento de la jugada
  prize       Decimal             @default(0) @db.Decimal(12, 2)
  status      TicketDetailStatus  @default(ACTIVE)
  createdAt   DateTime            @default(now())
  
  ticket      Ticket              @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  gameItem    GameItem            @relation(fields: [gameItemId], references: [id])
  
  @@index([ticketId])
  @@index([gameItemId])
}
```

#### 2.2 Modificar Draw para incluir Tickets
```prisma
model Draw {
  // Campos existentes...
  
  // NUEVA relación
  tickets     Ticket[]
}

model GameItem {
  // Campos existentes...
  
  // NUEVA relación
  ticketDetails TicketDetail[]
}
```

#### 2.3 Tareas Fase 2

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 2.1.1 | Crear modelo Ticket | Alta | Fase 1 | 2h |
| 2.1.2 | Crear modelo TicketDetail | Alta | 2.1.1 | 2h |
| 2.1.3 | Agregar relación tickets a Draw | Alta | 2.1.1 | 1h |
| 2.1.4 | Agregar relación ticketDetails a GameItem | Alta | 2.1.2 | 1h |
| 2.1.5 | Ejecutar migración | Alta | 2.1.1-2.1.4 | 1h |
| 2.2.1 | Crear servicio de tickets (crear, validar saldo) | Alta | 2.1.5 | 6h |
| 2.2.2 | Crear endpoint POST /api/player/tickets | Alta | 2.2.1 | 4h |
| 2.2.3 | Crear endpoint GET /api/player/tickets (historial) | Alta | 2.2.1 | 3h |
| 2.2.4 | Crear endpoint GET /api/player/tickets/:id | Alta | 2.2.1 | 2h |
| 2.3.1 | Crear página de juego (selección de sorteos y números) | Alta | 2.2.2 | 8h |
| 2.3.2 | Crear página de historial de tickets | Alta | 2.2.3 | 6h |
| 2.3.3 | Crear componente de detalle de ticket | Alta | 2.2.4 | 4h |

---

### FASE 3: Totalización y Premios (1-2 semanas)

#### 3.1 Job de Totalización de Premios
Modificar el flujo existente para calcular premios cuando el sorteo se **totaliza** (no cuando se cierra).

```javascript
// Nuevo job: totalize-draw.job.js
// Se ejecuta después de que el sorteo tiene ganador (status: DRAWN)

async function totalizeDraw(drawId) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: {
      winnerItem: true,
      tickets: {
        include: { details: true }
      }
    }
  });
  
  if (!draw.winnerItem) return;
  
  for (const ticket of draw.tickets) {
    let totalPrize = 0;
    
    for (const detail of ticket.details) {
      if (detail.gameItemId === draw.winnerItemId) {
        // ¡Ganador!
        const prize = detail.amount * detail.multiplier;
        totalPrize += prize;
        
        await prisma.ticketDetail.update({
          where: { id: detail.id },
          data: { prize, status: 'WON' }
        });
      } else {
        await prisma.ticketDetail.update({
          where: { id: detail.id },
          data: { status: 'LOST' }
        });
      }
    }
    
    // Actualizar ticket
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        totalPrize,
        status: totalPrize > 0 ? 'WON' : 'LOST'
      }
    });
    
    // Acreditar premio al usuario
    if (totalPrize > 0) {
      await prisma.user.update({
        where: { id: ticket.userId },
        data: {
          balance: { increment: totalPrize }
        }
      });
    }
  }
}
```

#### 3.2 Tareas Fase 3

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 3.1.1 | Crear job totalize-draw.job.js | Alta | Fase 2 | 6h |
| 3.1.2 | Integrar job en execute-draw.job.js | Alta | 3.1.1 | 2h |
| 3.1.3 | Crear servicio de cálculo de premios | Alta | 3.1.1 | 4h |
| 3.2.1 | Actualizar página de tickets para mostrar premios | Alta | 3.1.3 | 4h |
| 3.2.2 | Crear notificaciones de premios (WebSocket) | Media | 3.1.3 | 4h |
| 3.2.3 | Crear historial de movimientos de saldo | Media | 3.1.3 | 4h |

---

### FASE 4: Sistema de Depósitos y Retiros (2 semanas)

#### 4.1 Endpoints de Depósitos

```javascript
// POST /api/player/deposits - Registrar depósito
// GET /api/player/deposits - Historial de depósitos
// GET /api/admin/deposits - Lista de depósitos pendientes
// PATCH /api/admin/deposits/:id/approve - Aprobar depósito
// PATCH /api/admin/deposits/:id/reject - Rechazar depósito
```

#### 4.2 Endpoints de Retiros

```javascript
// POST /api/player/withdrawals - Solicitar retiro
// GET /api/player/withdrawals - Historial de retiros
// DELETE /api/player/withdrawals/:id - Cancelar retiro pendiente
// GET /api/admin/withdrawals - Lista de retiros pendientes
// PATCH /api/admin/withdrawals/:id/process - Marcar en proceso
// PATCH /api/admin/withdrawals/:id/complete - Marcar completado
// PATCH /api/admin/withdrawals/:id/reject - Rechazar retiro
```

#### 4.3 Tareas Fase 4

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 4.1.1 | Crear servicio de depósitos | Alta | Fase 1 | 6h |
| 4.1.2 | Crear endpoints de depósitos (player) | Alta | 4.1.1 | 4h |
| 4.1.3 | Crear endpoints de depósitos (admin) | Alta | 4.1.1 | 4h |
| 4.1.4 | Crear página de depósitos (player) | Alta | 4.1.2 | 6h |
| 4.1.5 | Crear página de gestión de depósitos (admin) | Alta | 4.1.3 | 6h |
| 4.2.1 | Crear servicio de retiros (con bloqueo de saldo) | Alta | Fase 1 | 6h |
| 4.2.2 | Crear endpoints de retiros (player) | Alta | 4.2.1 | 4h |
| 4.2.3 | Crear endpoints de retiros (admin) | Alta | 4.2.1 | 4h |
| 4.2.4 | Crear página de retiros (player) | Alta | 4.2.2 | 6h |
| 4.2.5 | Crear página de gestión de retiros (admin) | Alta | 4.2.3 | 6h |
| 4.3.1 | Crear CRUD de cuentas Pago Móvil del usuario | Alta | Fase 1 | 4h |
| 4.3.2 | Crear página de gestión de cuentas (player) | Alta | 4.3.1 | 4h |

---

### FASE 5: Autenticación y Seguridad (1-2 semanas)

#### 5.1 Sistema de Verificación WhatsApp
```prisma
model PhoneVerification {
  id          String    @id @default(uuid())
  userId      String
  phone       String
  code        String    // Código de 6 dígitos
  expiresAt   DateTime
  verified    Boolean   @default(false)
  attempts    Int       @default(0)
  createdAt   DateTime  @default(now())
  
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([phone, code])
}
```

#### 5.2 Sistema de Recuperación de Contraseña
```prisma
model PasswordReset {
  id          String    @id @default(uuid())
  userId      String
  token       String    @unique
  expiresAt   DateTime
  used        Boolean   @default(false)
  createdAt   DateTime  @default(now())
  
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([token])
  @@index([userId])
}
```

#### 5.3 Sistema de Correo Saliente
```javascript
// Configuración de nodemailer o servicio de email
// Para: confirmación de registro, recuperación de contraseña, notificaciones
```

#### 5.4 Tareas Fase 5

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 5.1.1 | Crear modelo PhoneVerification | Alta | - | 1h |
| 5.1.2 | Crear servicio de verificación WhatsApp | Alta | 5.1.1 | 6h |
| 5.1.3 | Integrar con Baileys existente | Alta | 5.1.2 | 4h |
| 5.1.4 | Crear endpoints de verificación | Alta | 5.1.3 | 3h |
| 5.1.5 | Crear UI de verificación de teléfono | Alta | 5.1.4 | 4h |
| 5.2.1 | Crear modelo PasswordReset | Alta | - | 1h |
| 5.2.2 | Crear servicio de recuperación de contraseña | Alta | 5.2.1 | 4h |
| 5.2.3 | Crear endpoints de recuperación | Alta | 5.2.2 | 3h |
| 5.2.4 | Crear páginas de olvido/reset de contraseña | Alta | 5.2.3 | 4h |
| 5.3.1 | Configurar servicio de email (nodemailer) | Media | - | 4h |
| 5.3.2 | Crear plantillas de email | Media | 5.3.1 | 4h |
| 5.3.3 | Integrar emails en flujos (registro, reset) | Media | 5.3.2 | 4h |

---

### FASE 6: Panel de Monitoreo Admin (2 semanas)

#### 6.1 Dashboard de Monitoreo en Tiempo Real

```javascript
// Endpoints de monitoreo
GET /api/admin/monitor/draws/:drawId/tickets  // Tickets por sorteo
GET /api/admin/monitor/games/:gameId/live     // Jugadas en tiempo real por juego
GET /api/admin/monitor/summary                // Resumen general

// WebSocket events
'monitor:ticket-created'   // Nueva jugada
'monitor:draw-totalized'   // Sorteo totalizado
'monitor:deposit-pending'  // Nuevo depósito pendiente
'monitor:withdrawal-pending' // Nuevo retiro pendiente
```

#### 6.2 Filtros de Monitoreo
- Por juego
- Por sorteo
- Por fuente (taquilla interna vs proveedor externo)
- Por rango de fechas
- Por estado

#### 6.3 Tareas Fase 6

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 6.1.1 | Crear endpoints de monitoreo | Alta | Fase 2, 3 | 6h |
| 6.1.2 | Crear eventos WebSocket de monitoreo | Alta | 6.1.1 | 4h |
| 6.1.3 | Crear página de monitoreo en tiempo real | Alta | 6.1.2 | 8h |
| 6.2.1 | Implementar filtros por juego/sorteo | Alta | 6.1.3 | 4h |
| 6.2.2 | Implementar filtro por fuente (interno/externo) | Alta | 6.2.1 | 4h |
| 6.2.3 | Crear vista de detalle por sorteo | Alta | 6.1.3 | 4h |
| 6.3.1 | Crear dashboard de depósitos/retiros pendientes | Alta | Fase 4 | 6h |

---

### FASE 7: Reportes (1-2 semanas)

#### 7.1 Reportes de Jugadas

| Reporte | Descripción |
|---------|-------------|
| Ventas por Juego | Total vendido por juego en un período |
| Ventas por Sorteo | Detalle de ventas por cada sorteo |
| Ventas por Número | Números más jugados |
| Ventas por Usuario | Top jugadores |
| Ventas por Fuente | Comparativa taquilla interna vs proveedores |
| Premios Pagados | Total de premios por período |
| Rentabilidad | Ventas - Premios por juego/período |

#### 7.2 Reportes Financieros

| Reporte | Descripción |
|---------|-------------|
| Depósitos | Depósitos por estado y período |
| Retiros | Retiros por estado y período |
| Balance de Usuarios | Saldo total en el sistema |
| Movimientos | Historial de movimientos de saldo |

#### 7.3 Tareas Fase 7

| # | Tarea | Prioridad | Dependencia | Estimación |
|---|-------|-----------|-------------|------------|
| 7.1.1 | Crear servicio de reportes de jugadas | Alta | Fase 2, 3 | 6h |
| 7.1.2 | Crear endpoints de reportes | Alta | 7.1.1 | 4h |
| 7.1.3 | Crear página de reportes de ventas | Alta | 7.1.2 | 6h |
| 7.1.4 | Crear reporte de ventas por número | Media | 7.1.2 | 4h |
| 7.1.5 | Crear reporte de rentabilidad | Alta | 7.1.2 | 4h |
| 7.2.1 | Crear servicio de reportes financieros | Alta | Fase 4 | 4h |
| 7.2.2 | Crear página de reportes financieros | Alta | 7.2.1 | 6h |
| 7.3.1 | Implementar exportación a Excel/CSV | Media | 7.1.3, 7.2.2 | 4h |
| 7.3.2 | Implementar gráficos de tendencias | Baja | 7.1.3 | 6h |

---

## 📊 Cronograma Estimado

```
Semana 1-3:   FASE 1 - Fundamentos (Usuarios, Pago Móvil)
Semana 4-6:   FASE 2 - Sistema de Tickets
Semana 7-8:   FASE 3 - Totalización y Premios
Semana 9-10:  FASE 4 - Depósitos y Retiros
Semana 11-12: FASE 5 - Autenticación y Seguridad
Semana 13-14: FASE 6 - Panel de Monitoreo
Semana 15-16: FASE 7 - Reportes
```

**Total estimado: 14-16 semanas** (3.5-4 meses)

---

## 🔄 Diagrama de Flujos

### Flujo de Registro y Verificación
```
Usuario → Registro → Verificación WhatsApp → Cuenta Activa
                          ↓
                    Código por WhatsApp (Baileys)
```

### Flujo de Depósito
```
Usuario → Selecciona Pago Móvil del Sistema → Realiza Pago → Registra Depósito
                                                                    ↓
Admin ← Notificación ← Depósito Pendiente
  ↓
Valida → Aprueba/Rechaza → Saldo Acreditado/Notificación
```

### Flujo de Juego
```
Usuario → Selecciona Juego → Selecciona Sorteo(s) → Selecciona Número(s)
                                                            ↓
                                                    Confirma Jugada
                                                            ↓
                                                    Valida Saldo
                                                            ↓
                                                    Descuenta Saldo
                                                            ↓
                                                    Crea Ticket + Detalles
```

### Flujo de Totalización
```
Sorteo DRAWN → Job Totalización → Calcula Premios → Actualiza Tickets
                                                            ↓
                                                    Acredita Premios
                                                            ↓
                                                    Notifica Ganadores
```

### Flujo de Retiro
```
Usuario → Selecciona Cuenta Pago Móvil → Ingresa Monto → Solicita Retiro
                                                                ↓
                                                        Bloquea Saldo
                                                                ↓
Admin ← Notificación ← Retiro Pendiente
  ↓
Realiza Pago → Marca Completado → Descuenta Saldo Bloqueado
```

---

## 🛡️ Consideraciones de Seguridad

1. **Validación de saldo**: Siempre validar saldo disponible antes de crear tickets
2. **Bloqueo de saldo**: Usar transacciones para evitar condiciones de carrera
3. **Verificación de teléfono**: Obligatoria antes de permitir retiros
4. **Rate limiting**: En endpoints de juego y transacciones
5. **Auditoría**: Registrar todas las transacciones financieras
6. **Encriptación**: Datos sensibles de Pago Móvil

---

## 📝 Notas de Implementación

### Integración con Sistema Existente
- Los tickets internos usarán la misma lógica que `ExternalTicket` pero con modelo propio
- El job de totalización se integrará con `execute-draw.job.js`
- Se reutilizará la integración de WhatsApp (Baileys) para verificación

### Compatibilidad
- Mantener compatibilidad con proveedores externos (SRQ)
- Los reportes deben poder filtrar por fuente (interno/externo)
- El monitoreo debe mostrar ambas fuentes

### Escalabilidad
- Considerar Redis para caché de sorteos activos
- Considerar colas para procesamiento de premios masivos
- Índices optimizados para consultas de reportes

---

## ✅ Checklist de Entregables por Fase

### Fase 1
- [ ] Migración de base de datos
- [ ] Endpoint de registro público
- [ ] Página de registro
- [ ] CRUD de Pago Móvil del sistema
- [ ] Página admin de Pago Móvil

### Fase 2
- [ ] Modelos Ticket y TicketDetail
- [ ] Servicio de tickets
- [ ] Endpoints de tickets
- [ ] Página de juego
- [ ] Página de historial

### Fase 3
- [ ] Job de totalización
- [ ] Cálculo de premios
- [ ] Acreditación automática
- [ ] Notificaciones de premios

### Fase 4
- [ ] Sistema de depósitos completo
- [ ] Sistema de retiros completo
- [ ] Gestión de cuentas Pago Móvil del usuario
- [ ] Páginas admin de gestión

### Fase 5
- [ ] Verificación WhatsApp
- [ ] Recuperación de contraseña
- [ ] Sistema de email
- [ ] Cambio de contraseña mejorado

### Fase 6
- [ ] Dashboard de monitoreo
- [ ] Filtros y vistas
- [ ] WebSocket en tiempo real

### Fase 7
- [ ] Reportes de jugadas
- [ ] Reportes financieros
- [ ] Exportación
- [ ] Gráficos

---

*Documento generado el: 2024-12-20*
*Versión: 1.0*
