# Contabilidad v2 — Cuentas, Saldo Inicial, Flujo de Caja y UX Mobile

**Fecha:** 2026-05-16
**Autor:** diazhh
**Estado:** Diseño aprobado (pendiente revisión final del spec)

---

## 1. Contexto

El módulo `/admin/contabilidad` ya existe (milestone v1.3 financial layer, 2026-05-15) y resuelve bien los asientos básicos: tipos INCOME/EXPENSE/PAYMENT, fechas independientes del `createdAt`, adjuntos PDF/JPG/PNG, reversales, AuditLog, conversión USD↔BsF con tasas históricas.

Lo que falta para que sea utilizable como contabilidad real de la empresa:

1. **Saldo inicial al arrancar la contabilidad** — hoy no existe. Sin punto de partida los saldos acumulados son inservibles.
2. **Cuentas/billeteras separadas** — todo se trata como un único bolsillo. La realidad operativa tiene caja en BsF, Zelle USD, cuenta Mercantil, pago móvil, etc.
3. **Flujo de caja semanal/mensual** — el `pnl-semanal` actual reporta utilidad por proveedor (ingreso bruto − comisiones − premios), no movimiento de dinero. Faltaba la pregunta "esta semana ¿cuánto entró, cuánto salió, en qué quedamos?".
4. **Subir foto al crear asiento** — backend listo, pero el frontend solo permite subir adjuntos *después* de crear el asiento. UX inconsistente.
5. **Mobile** — formularios responsive (grid-cols-1 md:grid-cols-2), pero tablas hacen scroll horizontal incómodo, no hay vista de cards en móvil, faltan inputs grandes para celular.
6. **Españolización** — etiquetas de tipo todavía dicen `INCOME / EXPENSE / PAYMENT` en la UI.

## 2. Decisiones tomadas (brainstorm 2026-05-16)

| Decisión | Elección | Razón |
|---|---|---|
| Alcance | Todo en un milestone | Las 5 mejoras están acopladas — separar implicaba retoques dobles a los mismos componentes. |
| Cuentas | Múltiples cuentas con moneda fija | Espejo de la realidad operativa; estándar contable. |
| Asientos legacy | Migrar a cuenta "Sin clasificar" | Cero downtime, cero pérdida; admin reasigna a su ritmo. |
| Transferencias | Tipo TRANSFER dedicado | Permite mover dinero entre cuentas sin inflar P&L. |
| Reporte semanal | Dinámico, no cierre confirmable | Los asientos retrofechados se reflejan automáticamente. |
| Semana | ISO 8601 (lunes–domingo) | Coherente con `ProviderWeeklySettlement` existente. |
| Vistas | Diario, semanal, mensual, rango libre + Excel/PDF | Cobertura completa sin sobre-ingeniería. |
| Saldos por cuenta | Siempre visibles en home del módulo | Equivale a "abrir la billetera" — primera pregunta del operador. |

## 3. Modelo de datos

### 3.1 Nuevos modelos

```prisma
model Account {
  id              String              @id @default(uuid())
  name            String
  currency        AccountingCurrency  // enum existente: BsF | USD
  openingBalance  Decimal             @db.Decimal(18, 8)   // IMMUTABLE post-create
  openingDate     DateTime            @db.Date              // IMMUTABLE post-create
  isActive        Boolean             @default(true)
  sortOrder       Int                 @default(0)
  createdById     String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  createdBy       User                @relation(fields: [createdById], references: [id])
  entries         AccountingEntry[]
  transfersOut    Transfer[]          @relation("TransferFrom")
  transfersIn     Transfer[]          @relation("TransferTo")

  @@index([isActive, sortOrder])
}

model Transfer {
  id              String   @id @default(uuid())
  transferDate    DateTime @db.Date
  fromAccountId   String
  toAccountId     String
  amountFrom      Decimal  @db.Decimal(18, 8)  // débito a fromAccount (en su moneda)
  amountTo        Decimal  @db.Decimal(18, 8)  // crédito a toAccount (en su moneda)
  exchangeRateId  String?                       // requerido si las monedas difieren; LOCKED at create
  description     String
  createdById     String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Reversal — self-relation (mismo patrón que AccountingEntry)
  reversesId      String?  @unique
  reversedById    String?  @unique
  reversalReason  String?

  sequentialNo    Int      @unique @default(autoincrement())

  fromAccount     Account                 @relation("TransferFrom", fields: [fromAccountId], references: [id])
  toAccount       Account                 @relation("TransferTo",   fields: [toAccountId],   references: [id])
  exchangeRate    ExchangeRate?           @relation(fields: [exchangeRateId], references: [id])
  createdBy       User                    @relation(fields: [createdById], references: [id])
  attachments     TransferAttachment[]

  reverses        Transfer? @relation("TransferReversal", fields: [reversesId], references: [id])
  reversedBy      Transfer? @relation("TransferReversal")

  @@index([transferDate])
  @@index([fromAccountId, transferDate])
  @@index([toAccountId, transferDate])
}

model TransferAttachment {
  id            String   @id @default(uuid())
  transferId    String
  filename      String
  originalName  String
  mimeType      String
  sizeBytes     Int
  uploadedById  String
  uploadedAt    DateTime @default(now())

  transfer      Transfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  uploadedBy    User     @relation(fields: [uploadedById], references: [id])

  @@index([transferId])
}
```

### 3.2 Modificación a `AccountingEntry`

```prisma
model AccountingEntry {
  // ... campos existentes ...
  accountId  String?  // NULLABLE en BD para retrocompatibilidad; requerido en servicio
  account    Account? @relation(fields: [accountId], references: [id])

  @@index([accountId, entryDate])
}
```

### 3.3 Reglas e invariantes

- **Moneda obligada**: en un asiento, la moneda efectiva (`originalCurrency` si difiere, sino BsF nativo) debe ser **igual** a la `currency` de su `Account`. Si el operador quiere registrar un ingreso USD en una cuenta BsF, debe convertir primero (tasa del día, F-6, igual que hoy).
- **Inmutabilidad reforzada (FIN-LEDGER-09 extendida)**: `accountId` se agrega a la lista LOCKED. Para mover un asiento de cuenta → reversal + recreación. Idem `Account.openingBalance` y `Account.openingDate`.
- **Soft-delete de cuenta**: una cuenta solo puede desactivarse si su saldo actual es exactamente cero. Si no, error en español: "No se puede desactivar la cuenta — saldo actual: X."
- **Transferencia entre monedas distintas**: requiere `exchangeRateId` válido para `transferDate`. `amountTo = amountFrom × rateBsPerUsd` (BsF→USD usa la inversa). Si no hay tasa para esa fecha → 400 "No hay tasa de cambio para {date} — ingresa una tasa primero." (mismo wording que F-6).
- **Transferencias y P&L**: las transferencias **no aparecen** en el cálculo de "Neto del período" consolidado (mueven, no crean/destruyen valor). Sí aparecen como sección separada "Transferencias internas" en los reportes, y sí afectan los saldos por cuenta.
- **Reversal de transferencia**: crea una transferencia inversa (from↔to invertidos, mismos montos). El registro original queda flageado con `reversedById`. Igual que el patrón existente para asientos.

## 4. UI

### 4.1 Home rediseñado (`/admin/contabilidad`)

Deja de redirigir a `/asientos`. Pasa a ser un dashboard de caja:

```
┌───────────────────────────────────────────────────┐
│ Contabilidad                            [+ Nuevo] │  ← FAB en móvil
├───────────────────────────────────────────────────┤
│ SALDOS ACTUALES                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Caja BsF │ │  Zelle   │ │ Mercantil│ …scroll-x │
│  │ 12.450,30│ │  280 USD │ │ 8.100 BsF│           │
│  └──────────┘ └──────────┘ └──────────┘           │
├───────────────────────────────────────────────────┤
│ HOY · 16 may                                       │
│   Ingresos: 1.200 BsF    Gastos: 350 BsF          │
│   Neto:     +850 BsF                              │
├───────────────────────────────────────────────────┤
│ ESTA SEMANA (W20 · 11–17 may)                     │
│   Entradas: 8.450 BsF                             │
│   Salidas:  3.200 BsF                             │
│   Neto:     +5.250 BsF                            │
│   [Ver detalle →]                                 │
├───────────────────────────────────────────────────┤
│ Tabs: Asientos · Transferencias · Pagos · Tasas · │
│       Categorías · Cuentas · Reportes             │  ← scroll-x en móvil
└───────────────────────────────────────────────────┘
```

### 4.2 Convenciones responsive

- **Tablas → cards en `<md`**: cada movimiento se muestra como card apilada (fecha + monto grande + categoría + cuenta + badge tipo). En `md+` se mantiene la tabla.
- **Filtros colapsables**: en móvil, todos los filtros viven dentro de un `<details>` con label "Filtros" y un contador de filtros activos.
- **Inputs grandes**: `min-h-11`, una columna en móvil, etiquetas claras.
- **Tabs**: `overflow-x-auto` + `whitespace-nowrap` para scroll horizontal cuando no caben.
- **FAB**: botón flotante `+` (esquina inferior derecha, solo `md:hidden`) para "Nuevo asiento" — atajo al action más común.

### 4.3 Españolización

| Hoy | Después |
|---|---|
| Badge `INCOME` (AccountingEntry) | `Ingreso` (verde) |
| Badge `EXPENSE` (AccountingEntry) | `Gasto` (rojo) |
| Badge `PAYMENT` (AccountingEntry) | `Pago` (azul) |
| Badge `TRANSFER` (sólo modelo Transfer) | `Transferencia` (morado) |

Nota: `TRANSFER` no es un tipo de `AccountingEntry` — es su propio modelo. El badge morado aparece en la lista combinada de movimientos (asientos + transferencias) que muestra el dashboard y la vista por cuenta.
| `<option value="INCOME">INCOME</option>` | `<option value="INCOME">Ingreso</option>` |
| etc. | El valor del enum sigue siendo el mismo en el backend; solo cambia el render. |

### 4.4 Formulario "Nuevo asiento"

```
┌───────────────────────────────────────────────────┐
│ Nuevo asiento                            [Volver] │
├───────────────────────────────────────────────────┤
│ Tipo:    [ Ingreso ▼ ]   Fecha: [ 16/05/2026 ]    │
│ Cuenta:  [ Caja BsF (BsF) ▼ ]                     │
│ Categoría: [ Pago de jugada SRQ ▼ ]               │
│ Monto BsF:  [ 1.250,00 ]                          │
│ Descripción: [ … ]                                │
│                                                   │
│ Recibo / comprobante (opcional):                  │
│ ┌────────────────────────────────────────┐        │
│ │ 📷 Tomar foto  │  📁 Elegir archivo    │        │
│ └────────────────────────────────────────┘        │
│ ↑ "Tomar foto" → <input accept="image/*"          │
│                          capture="environment">   │
│                                                   │
│ [ Cancelar ]              [ Crear asiento ]       │
└───────────────────────────────────────────────────┘
```

**Comportamiento del upload integrado**:
- Acepta `image/*,application/pdf`, máximo 5MB.
- En móvil: dos botones grandes. "Tomar foto" usa `capture="environment"` para abrir la cámara directo.
- Tras seleccionar: thumbnail (si imagen) o nombre+tamaño (si PDF), botón "Quitar".
- 1 archivo al crear (consistente con `multer.limits.files = 1`). Más archivos → desde el detalle del asiento (no cambia).

**Flujo de submit con adjunto**:
1. `POST /api/contabilidad/asientos` → recibe `{ id }`.
2. Si hay archivo: `POST /api/contabilidad/asientos/:id/attachments` con el blob.
3. Navega a `/admin/contabilidad/asientos/:id`.
4. Si el paso 2 falla, toast en español: "Asiento creado, pero falló subir el recibo. Súbelo desde el detalle." El asiento queda creado (no se rollbackea — sería confuso).

### 4.5 "Nueva transferencia"

Mismo shape que el formulario de asiento, con:
- Dos selects de cuenta: "Desde" y "Hacia" (excluyentes).
- Monto en la moneda de la cuenta origen.
- Si las monedas difieren: muestra el monto convertido a destino con la tasa del día (live preview, como F-6).
- Descripción y comprobante (mismo widget).

### 4.6 Pantalla `/admin/contabilidad/reportes`

```
┌───────────────────────────────────────────────────┐
│ Reportes de flujo de caja                         │
├───────────────────────────────────────────────────┤
│ Vista:  [ Semanal ] [ Mensual ] [ Diario ] [Rango]│
│ Período: ◀  Semana W20 · 11–17 mayo 2026  ▶       │
│ Cuenta:  [ Todas las cuentas ▼ ]                  │
├───────────────────────────────────────────────────┤
│ Saldo inicial (10/05):                            │
│   BsF: 32.450,30      USD: 1.250,00               │
│                                                   │
│ Entradas:             BsF: +12.300    USD: +85    │
│   Por categoría:                                  │
│     Jugadas SRQ ............... 8.500 BsF         │
│     Jugadas Maxplay ........... 3.800 BsF         │
│     Pago Zelle cliente ........    85 USD         │
│                                                   │
│ Salidas:              BsF: −5.200     USD: −0     │
│   Por categoría:                                  │
│     Pago premios .............. 2.400 BsF         │
│     Pago servicio internet ....   180 BsF         │
│     Pago a proveedor SRQ ...... 2.620 BsF         │
│                                                   │
│ Neto del período:     BsF: +7.100     USD: +85    │
│ Saldo final (17/05):  BsF: 39.550,30  USD: 1.335  │
├───────────────────────────────────────────────────┤
│ Transferencias internas (no afectan saldo total): │
│   Caja → Mercantil: 1.000 BsF (14/05)             │
│                                                   │
│ [ Descargar Excel ] [ Descargar PDF ]             │
└───────────────────────────────────────────────────┘
```

**Comportamiento**:
- `Semanal`: navegación por ISO weeks (lunes–domingo). Default: semana actual.
- `Mensual`: navegación por meses calendario. Default: mes actual.
- `Diario`: date-picker; default hoy.
- `Rango`: dos date-pickers.
- `Cuenta = Todas`: vista consolidada, transferencias suman cero al neto.
- `Cuenta = X`: vista de la cuenta X, las transferencias **sí** entran/salen como movimientos individuales.
- Móvil: entradas/salidas se apilan; breakdowns por categoría son `<details>` colapsables.

## 5. Cálculo (motor `cash-flow.service.js`)

```
saldo_inicial_periodo  = Σ(account.openingBalance para cuentas activas, mismo signo de moneda)
                       + Σ(AccountingEntry.amountBsF · sign(type) WHERE entryDate < from)
                       + Σ(Transfer netos sobre account WHERE transferDate < from)
                                          // sólo cuando se filtra por accountId

entradas_periodo       = Σ(AccountingEntry.amountBsF WHERE type='INCOME'              AND entryDate ∈ [from, to])
salidas_periodo        = Σ(AccountingEntry.amountBsF WHERE type IN ('EXPENSE','PAYMENT') AND entryDate ∈ [from, to])
neto_periodo           = entradas − salidas
saldo_final_periodo    = saldo_inicial_periodo + neto_periodo

donde sign(INCOME) = +1, sign(EXPENSE) = −1, sign(PAYMENT) = −1
```

**Por moneda**: BsF y USD se reportan **siempre por separado**. Nunca se mezclan en una cifra. Para asientos en cuenta USD que tienen `amountBsF` calculado, se usa el `exchangeRate` histórico del propio asiento (F-7 — no reconversión).

**Asientos reversados**: excluidos por defecto en el cálculo (su efecto neto es 0 cuando se incluyen tanto el original como el reversal — pero excluirlos evita doble-conteo y simplifica el debug). El admin puede pedir verlos con `?includeReversed=true`.

## 6. Endpoints

### Nuevos

```
# Cuentas
GET    /api/contabilidad/cuentas                          list (con saldo actual calculado)
GET    /api/contabilidad/cuentas/:id                      detalle + últimos N movimientos
POST   /api/contabilidad/cuentas                          crear (name, currency, openingBalance, openingDate)
PATCH  /api/contabilidad/cuentas/:id                      editar { name, isActive, sortOrder } — openingBalance/Date IMMUTABLE
PATCH  /api/contabilidad/cuentas/:id/deactivate           soft-delete (rechaza si saldo ≠ 0)
PATCH  /api/contabilidad/cuentas/:id/reactivate

# Transferencias
POST   /api/contabilidad/transferencias                   crear
GET    /api/contabilidad/transferencias                   list (filtros: from, to, accountId, includeReversed)
GET    /api/contabilidad/transferencias/:id               detalle + adjuntos + AuditLog
POST   /api/contabilidad/transferencias/:id/reverse       reversar (motivo requerido)
POST   /api/contabilidad/transferencias/:id/attachments   subir comprobante (mismo multer)
GET    /api/contabilidad/transferencias/:id/attachments/:attId   descarga auth-gated
DELETE /api/contabilidad/transferencias/:id/attachments/:attId

# Flujo de caja
GET    /api/contabilidad/flujo-caja?from&to&accountId&includeReversed   JSON
GET    /api/contabilidad/flujo-caja/excel?...                            Excel
GET    /api/contabilidad/flujo-caja/pdf?...                              PDF
```

### Modificados

- `POST /asientos`: ahora valida `accountId` presente + moneda coherente con la cuenta. Errores en español.
- `GET /asientos`: acepta filtro `accountId`. Devuelve `account: { id, name, currency }` embebido.
- `PATCH /asientos/:id`: rechaza `accountId` en el body (IMMUTABLE).

## 7. Servicios

- **`account.service.js`** — CRUD + cálculo de saldo actual = `openingBalance + Σ entries_signed_after_openingDate + Σ transfers_net_after_openingDate`.
- **`transfer.service.js`** — CRUD + reversal (genera transferencia inversa) + delegación a `attachment.service.js` para adjuntos.
- **`cash-flow.service.js`** — motor de reportes + builders Excel (`exceljs`) y PDF (`pdfkit`), patrón heredado de `pnl-report.service.js`.

## 8. Tests (Jest)

| Archivo | Cobertura |
|---|---|
| `account.service.test.js` | saldo actual con/sin movimientos; rechazo de deactivate con saldo ≠ 0; openingBalance/openingDate IMMUTABLE; respeto a moneda fija. |
| `transfer.service.test.js` | creación BsF→BsF; creación con conversión USD↔BsF (tasa requerida); reversal genera inversa; rechazo si tasa falta. |
| `cash-flow.service.test.js` | saldo inicial con asientos previos; entradas/salidas por período; transferencias NO afectan neto consolidado; transferencias SÍ afectan saldo por cuenta; F-7 (sin reconversión). |
| `cash-flow-integration.test.js` | E2E: seed cuentas + asientos + transferencias; pedir reporte semanal/mensual; verificar Excel/PDF salen no-vacíos con celdas correctas. |
| Existentes (`contabilidad.integration.test.js`, `pnl-report.test.js`) | actualizar para que el seed incluya `accountId`. |

## 9. Migración

```sql
BEGIN;

-- (Prisma migration genera CREATE TABLE Account, Transfer, TransferAttachment + FKs)

-- Cuenta default
-- El createdById se resuelve en el script de migración como:
--   SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" LIMIT 1
-- (el primer admin activo). Si no hay ningún admin, la migración falla con
-- mensaje explícito — no se crea cuenta huérfana.
INSERT INTO "Account" (
  id, name, currency, "openingBalance", "openingDate",
  "isActive", "sortOrder", "createdById", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Sin clasificar', 'BsF', 0, '2025-01-01',
  true, 999,
  (SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" LIMIT 1),
  NOW(), NOW()
);

-- Backfill
ALTER TABLE "AccountingEntry" ADD COLUMN "accountId" TEXT;
UPDATE "AccountingEntry" SET "accountId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "AccountingEntry"
  ADD CONSTRAINT "AccountingEntry_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"(id);
CREATE INDEX "AccountingEntry_accountId_entryDate_idx"
  ON "AccountingEntry" ("accountId", "entryDate");

COMMIT;
```

`accountId` queda **nullable en BD** (defensa retrocompatible) pero **requerido en el servicio** para creates nuevos.

## 10. Plan de despliegue

1. Ventana de baja actividad. Migración de schema (transaccional, segundos).
2. Backend deploy: endpoints nuevos disponibles, validaciones nuevas activas.
3. Frontend deploy: home convertido en dashboard, nuevas pantallas (cuentas, transferencias, reportes), españolización completa, vistas mobile.
4. Admin entra a `/admin/contabilidad/cuentas`, crea sus cuentas reales con saldos iniciales y, opcionalmente, va reasignando asientos viejos desde "Sin clasificar".

## 11. Archivos a tocar (resumen)

**Backend**
- `backend/prisma/schema.prisma` — modelos nuevos + campo en AccountingEntry
- `backend/prisma/migrations/<ts>_contabilidad_cuentas_flujo/` — migración
- `backend/src/services/account.service.js` — NUEVO
- `backend/src/services/transfer.service.js` — NUEVO
- `backend/src/services/cash-flow.service.js` — NUEVO
- `backend/src/services/accounting-entry.service.js` — añadir validación de cuenta/moneda
- `backend/src/controllers/account.controller.js`, `transfer.controller.js`, `cash-flow.controller.js` — NUEVOS
- `backend/src/routes/contabilidad.routes.js` — añadir rutas
- `backend/src/__tests__/account.service.test.js`, `transfer.service.test.js`, `cash-flow.service.test.js`, `cash-flow-integration.test.js` — NUEVOS

**Frontend**
- `frontend/lib/api/contabilidad.js` — extender con cuentas, transferencias, flujo-caja
- `frontend/app/admin/contabilidad/page.js` — convertir en dashboard
- `frontend/app/admin/contabilidad/asientos/page.js` — vista cards mobile, filtros colapsables, filtro de cuenta, badges en español
- `frontend/app/admin/contabilidad/asientos/nueva/page.js` — selector de cuenta, upload integrado (con captura), tipos en español
- `frontend/app/admin/contabilidad/asientos/[id]/page.js` — mostrar cuenta, badges en español
- `frontend/app/admin/contabilidad/cuentas/page.js`, `nueva/page.js`, `[id]/page.js` — NUEVOS
- `frontend/app/admin/contabilidad/transferencias/page.js`, `nueva/page.js`, `[id]/page.js` — NUEVOS
- `frontend/app/admin/contabilidad/reportes/page.js` — NUEVO
- `frontend/app/admin/contabilidad/pagos/page.js` — pequeño retoque mobile + español
- `frontend/app/admin/contabilidad/categorias/page.js`, `tasas/page.js` — pulir mobile

## 12. Out of scope

- Conciliación bancaria automática contra estados de cuenta.
- Categorías jerárquicas (sólo plana, como hoy).
- Multi-currency dentro de una misma cuenta.
- Cierre semanal confirmable (sólo dinámico).
- Edición de `accountId` post-creación (sólo via reversal + recreación).
- Asientos recurrentes (ej: renta mensual).
- Upload multi-archivo en el mismo POST (sigue siendo 1 al crear; más desde el detalle).

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Asientos viejos asignados a "Sin clasificar" inflan/desinflan ese saldo y confunden | El admin ve claramente la cuenta como "Sin clasificar" — es señal explícita de "necesito reasignar". Saldo inicial 0 + reportes diferenciables. |
| Saldo actual de cuenta requiere Σ sobre todos los movimientos → lento con miles de asientos | Cálculo en SQL agregado (SUM por type), índice ya creado en `(accountId, entryDate)`. Si crece mucho, futura optimización con materialized view; por ahora sobra. |
| Inconsistencia de moneda asiento↔cuenta si alguien usa la API directamente | Validación en `accounting-entry.service.js` — el controller delega, todas las rutas pasan por ahí. |
| Pérdida del upload al crear (network failure entre POST asiento y POST attachment) | Toast claro indicando que el asiento se creó pero el adjunto falló; opción de reintentar desde el detalle. No se rollbackea el asiento. |
| Reversal de transferencia genera doble flujo en reportes por accountId | Ya filtrado: cálculos consolidados excluyen reversados; cálculos por cuenta los excluyen también salvo `includeReversed=true`. |
