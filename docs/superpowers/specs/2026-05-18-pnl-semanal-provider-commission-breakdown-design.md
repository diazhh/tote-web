# P&L Semanal — Desglose de Comisión por Proveedor

**Fecha:** 2026-05-18
**Página afectada:** `/admin/reportes/pnl-semanal`
**Objetivo:** Cuando se selecciona un proveedor en el reporte de P&L semanal, mostrar de forma clara qué tipo(s) de comisión tiene configurado, los porcentajes vigentes, y cuánto dinero corresponde a esa comisión en el periodo seleccionado, desglosado por juego.

## 1. Problema

Hoy la página muestra una sola línea **"Comisiones"** en el estado de resultados sin ninguna pista de cómo se compone. Un proveedor puede tener:

- Distintas fórmulas por juego (`SALES_AND_UTILITY_PCT` en algunos, `UTILITY_PCT` en otros).
- Distintos porcentajes por juego (TRIPLE PANTERA suele tener una tasa de ventas más alta).
- Componentes separados (ventas vs utilidad) que conviene auditar por separado.

Para auditar y liquidar con el proveedor se necesita ver el desglose completo, no solo el total.

## 2. Alcance

**Dentro:** Nueva tarjeta de desglose en la página de P&L semanal, que aparece **solo cuando hay un proveedor seleccionado**.

**Fuera:**
- Cambios en la vista "Todos" (no se toca).
- Modificar fórmulas de cálculo (se reusa `commission.service.js`).
- Tocar la página `/admin/comisiones` (esa ya tiene su propio detalle).
- Exportar el desglose en Excel/PDF (puede ser una fase posterior).

## 3. Diseño de UI

### 3.1 Ubicación

Nueva tarjeta colocada **entre** la tarjeta "Estado de resultados" y la fila de botones drill-down/export. No se renderiza si `apiSystemId` está vacío.

### 3.2 Estructura de la tarjeta

**Header:**
```
Desglose de comisión — <Nombre Proveedor>
ISO 2026-W21 · 18 – 24 de mayo 2026
```

**Sub-bloque A — Configuración vigente** (lista compacta):

Agrupa los juegos con la misma fórmula+rates en una sola línea para no repetir.

Ejemplo SRQ:
```
Configuración vigente:
• LOTOANIMALITO, LOTTOPANTERA, TERMINAL PANTERA → 16% sobre ventas + 30% sobre utilidad (desde 2025-12-20)
• TRIPLE PANTERA → 25% sobre ventas + 30% sobre utilidad (desde 2025-12-20)
```

Ejemplo virtuales:
```
Configuración vigente:
• TODOS LOS JUEGOS → 70% sobre utilidad (desde 2026-04-07)
```

**Sub-bloque B — Tabla por juego:**

| Columna | Tipo | Notas |
|---|---|---|
| Juego | string | Nombre del juego |
| Ventas | money | Suma `totalSales` del DrawFinancialProvider en la semana |
| Premios | money | Suma `totalPrize` del DrawFinancialProvider en la semana (color rojo) |
| Bruto | money | Ventas − Premios. Negativo en rojo. |
| %V | percent | `salesRate` del config vigente. `—` si la fórmula no usa salesRate. |
| Com. ventas | money | Ventas × %V (Decimal). `—` si no aplica. |
| %U | percent | `utilityRate`. `—` si no aplica. |
| Com. utilidad | money | Bruto × %U (Decimal). Puede ser negativo si Bruto<0; **no se clampa**. `—` si no aplica. |
| **Comisión proveedor** | money | Com. ventas + Com. utilidad. Coincide con `ProviderCommissionLedger.amount`. Color: rojo. Bold. |
| **Neto a casa** | money | Bruto − Comisión proveedor. Verde si ≥0, rojo si <0. Bold. |

**Fila TOTAL** al final, sumando solo columnas numéricas (no %).

**Sub-bloque C — Avisos** (solo si aplican):

- ⚠️ "Sin config vigente para: <juegos>" — si el proveedor tiene ventas en juegos sin `ProviderCommissionConfig` efectivo (el sistema omite silenciosamente, vale alertarlo en UI).
- ⚠️ "Utilidad negativa en <juego>: la fórmula mixta redujo la comisión" — si algún juego tiene Bruto<0 y la fórmula incluye `utilityRate`.

### 3.3 Fórmulas TIERED

Para `TIERED` (no usado hoy en prod pero soportado por la fórmula), las columnas `%V` y `%U` se rellenan así:
- `%V` muestra el tier efectivo de la semana ("3% — tramo [0, 5000)") y `Com. ventas` muestra el monto. `%U` y `Com. utilidad` = `—`.
- En el aviso del sub-bloque C agregar "Tier semanal aplicado: <bracket>" si hay TIERED.

### 3.4 Empty states

- Proveedor seleccionado **sin actividad en la semana**: ocultar la tarjeta entera y mostrar el empty state existente ("Sin actividad esta semana") como hoy.
- Proveedor seleccionado **sin ningún config vigente**: render del sub-bloque A con "Sin configuración de comisión vigente" + tabla con sus ventas/premios/bruto y `—` en todas las columnas de comisión. Sub-bloque C con el aviso correspondiente.

## 4. Diseño de Backend

### 4.1 Endpoint nuevo

```
GET /api/reportes/pnl/semanal/provider-breakdown
    ?isoYear=2026
    &isoWeek=21
    &apiSystemId=<uuid>
```

**Auth:** Mismo middleware que el resto de `/api/reportes/pnl/*` (admin only).

**Validación:**
- `isoYear`: int 2020-2099
- `isoWeek`: int 1-53
- `apiSystemId`: UUID requerido

**Respuesta:**
```json
{
  "isoYear": 2026,
  "isoWeek": 21,
  "weekStart": "2026-05-18",
  "weekEnd": "2026-05-24",
  "apiSystemId": "uuid",
  "apiSystemName": "SRQ",
  "configs": [
    {
      "gameIds": ["uuid1", "uuid2", "uuid3"],
      "gameNames": ["LOTOANIMALITO", "LOTTOPANTERA", "TERMINAL PANTERA"],
      "formulaType": "SALES_AND_UTILITY_PCT",
      "salesRate": "16.00",
      "utilityRate": "30.00",
      "tiers": [],
      "effectiveFrom": "2025-12-20"
    }
  ],
  "byGame": [
    {
      "gameId": "uuid",
      "gameName": "LOTOANIMALITO",
      "sales": "15154.99",
      "prizes": "8100.00",
      "gross": "7054.99",
      "formulaType": "SALES_AND_UTILITY_PCT",
      "salesRate": "16.00",
      "salesCommission": "2424.80",
      "utilityRate": "30.00",
      "utilityCommission": "2116.50",
      "totalCommission": "4541.30",
      "netToHouse": "2513.69",
      "configMissing": false,
      "tierLabel": null
    }
  ],
  "totals": {
    "sales": "132761.99",
    "prizes": "74316.00",
    "gross": "58445.99",
    "salesCommission": "25451.20",
    "utilityCommission": "17533.70",
    "totalCommission": "42984.90",
    "netToHouse": "15461.09"
  },
  "warnings": [
    "Sin config vigente para: <juegoX>",
    "Utilidad negativa en TERMINAL PANTERA: el componente de utilidad redujo la comisión"
  ]
}
```

Todos los montos son strings (precisión Decimal, frontend los convierte solo para render).

### 4.2 Implementación

Archivo nuevo: `backend/src/services/pnl-provider-breakdown.service.js`

Función exportada: `getProviderBreakdownForWeek({ apiSystemId, isoYear, isoWeek })`.

Pasos:
1. Calcular `weekStart`/`weekEnd` (lunes 00:00 — domingo 23:59:59 en `America/Caracas`). Reusar helper de `pnl-report.service.js` si existe.
2. Cargar `ApiSystem.name`.
3. Query agregada por `gameId`:
   ```
   SELECT dfp.gameId, g.name,
          SUM(dfp.totalSales) sales,
          SUM(dfp.totalPrize) prizes
   FROM DrawFinancialProvider dfp
   JOIN Draw d ON d.id = dfp.drawId
   JOIN Game g ON g.id = d.gameId
   WHERE dfp.apiSystemId = :apiSystemId
     AND d.drawnAt >= :weekStart AND d.drawnAt <= :weekEnd
   GROUP BY dfp.gameId, g.name
   ORDER BY g.name
   ```
4. Para cada `gameId`: llamar `findEffectiveConfig(apiSystemId, weekEnd, gameId)` y aplicar la fórmula con Decimal:
   - `SALES_PCT`: `salesCommission = sales × salesRate / 100`, `utilityCommission = null`
   - `UTILITY_PCT`: `utilityCommission = (sales − prizes) × utilityRate / 100`, `salesCommission = null`
   - `SALES_AND_UTILITY_PCT`: ambos
   - `TIERED`: `salesCommission = sales × tierRate / 100`, `tierLabel = "X% — tramo [min, max)"`, sin `utilityCommission`. Calcular `cumulativeWeeklySales` con `getCumulativeWeeklySales` ya existente.
5. **Reconciliación de seguridad**: comparar `totalCommission` calculado vs `SUM(ProviderCommissionLedger.amount)` para esos sorteos. Si difieren en >1 céntimo, agregar warning "Discrepancia con ledger: …" (no bloquea respuesta — el cálculo desde DrawFinancialProvider es la fuente de verdad UI).
6. Agrupar configs idénticas (mismo `formulaType` + `salesRate` + `utilityRate` + `effectiveFrom`) en el array `configs`.
7. Agregar warnings cuando `configMissing=true` o cuando hay `gross<0` con `utilityRate>0`.

### 4.3 Rutas y controller

Archivo: `backend/src/routes/pnl-report.routes.js` — agregar línea:
```js
router.get('/semanal/provider-breakdown', pnlController.getProviderBreakdown.bind(pnlController));
```

Controller: `backend/src/controllers/pnl-report.controller.js` — método nuevo `getProviderBreakdown` que valida params (Joi/Zod ya usado en el archivo), llama al service, retorna JSON.

### 4.4 Cliente API frontend

Archivo: `frontend/lib/api/pnl.js` — agregar:
```js
async getProviderBreakdown({ isoYear, isoWeek, apiSystemId }) {
  const res = await axios.get('/reportes/pnl/semanal/provider-breakdown', {
    params: { isoYear, isoWeek, apiSystemId }
  });
  return res.data;
}
```

## 5. Diseño de Frontend (componente)

### 5.1 Estructura

Componente nuevo: `frontend/components/admin/reportes/ProviderCommissionBreakdown.jsx`

Props: `{ isoYear, isoWeek, apiSystemId, apiSystemName }`.

Internamente:
- `useEffect` que llama `pnlAPI.getProviderBreakdown(...)` cuando cambian las props.
- Estados: `loading`, `data`, `error`.
- Render del header, sub-bloques A, B, C.
- Sin lógica de cálculo — todo viene del backend, el componente solo formatea (`fmtMoney`, `fmtPct`).

### 5.2 Integración en `pnl-semanal/page.js`

```jsx
{providerFiltered && pnl && !isEmpty && (
  <ProviderCommissionBreakdown
    isoYear={isoYear}
    isoWeek={isoWeek}
    apiSystemId={apiSystemId}
    apiSystemName={providers.find(p => p.id === apiSystemId)?.name}
  />
)}
```

Colocado entre el card del "Estado de resultados" y el card de drill-down.

### 5.3 Formato visual

- Reusar tokens del diseño existente (Tailwind, mismos border/shadow que los otros cards).
- Tabla con `divide-y divide-gray-50`, header `bg-gray-50`, hover row `hover:bg-gray-50/40`.
- Columnas numéricas alineadas a la derecha; "Juego" a la izquierda.
- Fila TOTAL con `bg-blue-50/40 border-t-2 border-blue-200 font-bold`.
- Comisión proveedor: `text-red-700 font-medium`.
- Neto a casa: `text-green-700 font-medium` si ≥0, `text-red-700` si <0.
- Warnings: bloque con `bg-amber-50 border border-amber-200 text-amber-800` debajo de la tabla.

## 6. Estrategia de testing

- **Backend unit** (`pnl-provider-breakdown.service.test.js`): casos sintéticos para cada `formulaType`, incluyendo `gross<0`, sin config, agrupación de configs idénticas, TIERED con tier label.
- **Backend integration**: query con fixtures de DrawFinancialProvider + ProviderCommissionConfig + ProviderCommissionLedger, verificar que `totalCommission` cuadra con SUM del ledger.
- **Frontend**: testing manual contra prod data (semana actual) — la verificación que ya hicimos hoy (todos los proveedores cuadran al céntimo) sirve de oracle.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Decimal precision drift entre service y ledger | Service usa el MISMO `computeCommission` que el worker; warning si discrepancia >0.01 |
| Configs cambian a mitad de semana | Service usa `findEffectiveConfig(weekEnd, gameId)` — política append-only ya lo resuelve |
| Proveedor sin sorteos en la semana | Hide del card entero (no se renderiza si pnl está empty) |
| Game sin config vigente | Render fila con `—` en columnas de comisión + warning explícito |
| Carga lenta (query por sorteo × juego) | Una sola query agregada por GROUP BY gameId; ~13 filas máx por proveedor → <100ms |

## 8. Migración / Rollout

- Sin migración de DB.
- Endpoint nuevo es aditivo, no rompe nada existente.
- Componente nuevo en frontend; cambio mínimo en `page.js` (un render condicional).
- Deploy normal por pm2 restart.

## 9. Open questions

Ninguna pendiente — todas las decisiones de diseño aclaradas en brainstorm.
