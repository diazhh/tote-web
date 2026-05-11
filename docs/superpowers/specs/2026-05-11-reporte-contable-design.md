# Reporte Contable — Diseño

**Fecha:** 2026-05-11
**Estado:** Aprobado (pendiente revisión escrita)
**Autor:** Claude + diazhh

## Contexto

Tote-web tiene un reporte operativo en `/admin/reportes` ("Reportes de Sorteos") que muestra una fila por sorteo, con desglose por juego, por fuente y modal por número. Es útil para operaciones pero no para contabilidad: el contador necesita ver una fila por día por juego con ventas, premios, utilidad y conteo de tickets, y poder exportar a Excel.

Este spec define un **nuevo reporte contable** independiente, sin modificar el existente.

## Alcance

### Incluye
- Nueva ruta `/admin/reportes-contable` (frontend) y endpoints nuevos en `/monitor/reporte-contable*` (backend)
- Agregación por par `(drawDate, gameId)`
- Filtros: rango de fechas (`dateFrom`, `dateTo`) y juego opcional (`gameId`)
- Métricas por fila: Ventas, Premios, Utilidad (= Ventas − Premios), Tickets
- Cards de totales del rango
- Descarga Excel `.xlsx`
- Ítem nuevo en sidebar admin

### No incluye (YAGNI)
- Filtro por fuente/proveedor — un reporte contable es consolidado por construcción
- Modal de desglose por número
- Exportación PDF
- Gráficos
- Modificación del reporte operativo existente

## Reglas de negocio

### "Venta válida"
Tickets con `status != 'CANCELLED'`, cualquier estado de sorteo (incluye `SCHEDULED`, `CLOSED`, `DRAWN`, `PUBLISHED`). Mismo criterio que el reporte operativo actual.

### Cálculo de premios
Idéntico al reporte actual (`monitor.service.js:512–541`):
- Suma de `Ticket.totalPrize` de tickets no-tripleta del sorteo
- Más premios de tripletas externas (`source = 'EXTERNAL_API'` y `providerData.type = 'TRIPLETA'`) atribuidos al sorteo donde su condición se completó (`prizeDrawId`)

### Agrupación por día
Por `Draw.drawDate` (no por `Ticket.createdAt`). El día contable es el día del sorteo.

### Utilidad
`utility = totalSales - totalPrize`. Puede ser negativa.

## Backend

### Archivos

**Nuevo:** `backend/src/services/accounting-report.service.js`
- Exporta `getAccountingReport({ dateFrom, dateTo, gameId })` → JSON
- Exporta `buildAccountingExcel({ dateFrom, dateTo, gameId })` → Buffer .xlsx

**Modificado:** `backend/src/controllers/monitor.controller.js`
- Agrega `getAccountingReport(req, res)` → JSON
- Agrega `downloadAccountingExcel(req, res)` → stream .xlsx con `Content-Disposition: attachment`

**Modificado:** `backend/src/routes/monitor.routes.js`
- `GET /monitor/reporte-contable`
- `GET /monitor/reporte-contable/excel`

**Modificado:** `backend/package.json` — dependencia `exceljs` (no instalada actualmente)

### Lógica del service

```
1. Validar inputs:
   - dateFrom y dateTo requeridos, formato YYYY-MM-DD
   - dateFrom <= dateTo
   - (dateTo - dateFrom) <= 365 días
   - gameId, si presente, validado contra DB
2. Query draws en el rango:
   - where.drawDate = { gte: dateFrom, lte: dateTo }
   - where.gameId si filtra
   - include: game, tickets where status != 'CANCELLED'
3. Cargar premios de tripletas externas atribuidas por prizeDrawId
   (idéntico al monitor.service.js actual)
4. Por cada draw, calcular totalSales, totalPrize, utility, ticketCount
5. Agregar en Map con key `${YYYY-MM-DD}|${gameId}`:
   - date, gameId, game (nombre)
   - totalSales, totalPrize, utility, ticketCount (sumas)
6. Convertir a array ordenado por (date asc, game asc)
7. Calcular totals globales
8. Retornar { dateFrom, dateTo, gameId, rows, totals }
```

### Forma de respuesta JSON

```json
{
  "dateFrom": "2026-03-01",
  "dateTo":   "2026-03-07",
  "gameId":   null,
  "rows": [
    {
      "date":        "2026-03-01",
      "gameId":      "d953f80c-...",
      "game":        "LOTOANIMALITO",
      "totalSales":  12345.00,
      "totalPrize":   3000.00,
      "utility":      9345.00,
      "ticketCount": 87
    }
  ],
  "totals": {
    "totalSales":   0,
    "totalPrize":   0,
    "utility":      0,
    "ticketCount":  0
  }
}
```

### Excel

Una hoja única "Reporte Contable" con:
- Encabezado: rango de fechas y juego filtrado (si aplica)
- Tabla con columnas: Fecha · Juego · Ventas · Premios · Utilidad · Tickets
- Una fila por (fecha, juego), ordenada por fecha asc luego juego asc
- Fila TOTAL al final con fórmulas `=SUM(...)` (no valores hardcoded), para que el contador pueda auditar
- Formato de moneda en columnas monetarias, número entero en Tickets
- Anchos de columna razonables; primera fila con `bold` y fondo gris claro

Nombre de archivo descargado: `reporte-contable-{dateFrom}-{dateTo}.xlsx`

### Validación y errores
- `400` si faltan `dateFrom`/`dateTo`, mal formato, rango invertido o > 365 días
- `400` si `gameId` no existe
- `500` en cualquier error inesperado, logueado por Winston

## Frontend

### Archivos

**Nuevo:** `frontend/app/admin/reportes-contable/page.js` — page React

**Modificado:** `frontend/lib/api/monitor.js`
- `getAccountingReport({ dateFrom, dateTo, gameId })` → `fetch` JSON
- `downloadAccountingExcel({ dateFrom, dateTo, gameId })` → `fetch` blob y trigger download

**Modificado:** `frontend/app/admin/layout.js`
- Agregar entrada `{ name: 'Reporte Contable', href: '/admin/reportes-contable', icon: FileText, adminOnly: true }` justo después de la entrada `Reportes` (línea 67 al momento de escribir este spec)

### UI

**Header:** título "Reporte Contable" + subtítulo "Ventas, premios y utilidad por día y juego" + botones Descargar Excel y Actualizar.

**Filtros (sticky bar):** Desde · Hasta · Juego (dropdown con "Todos los juegos"). Defaults: `dateFrom = dateTo = todayInCaracas()`.

**Cards resumen (4):** Ventas Totales · Premios Pagados · Utilidad · Tickets. Idéntico estilo al reporte actual.

**Tabla principal:**
- Columnas: Fecha · Juego · Ventas · Premios · Utilidad · Tickets
- Orden por defecto: fecha asc, juego asc
- Toggle de orden por fecha (asc/desc)
- Paginación cliente, 50 filas por página
- Utilidad en verde si ≥ 0, rojo si < 0 (mismo patrón del reporte actual)
- Empty state: "No hay datos para los filtros seleccionados"
- Loading spinner mientras `getAccountingReport` resuelve

### Estado y carga
- `useEffect` inicial: cargar lista de juegos para el dropdown (reutilizar el fetch `/games` del page actual)
- `useEffect` reactivo a `filters`: llamar `getAccountingReport` (auto-refetch al cambiar filtros)
- Botón "Descargar Excel" hace `fetch` blob con los filtros vigentes y dispara descarga; muestra spinner mientras carga

## Cambios en el código existente
- Sólo se agregan rutas, no se modifican las existentes
- Sólo se agregan dependencias (`exceljs`), no se cambian versiones
- Sidebar admin gana un link nuevo (cambio mínimo)

## Plan de despliegue
1. Implementación + tests en local
2. Confirmación del usuario
3. Deploy a VPS 94: `rsync` + `pm2 restart tote-backend && pm2 restart tote-frontend` (frontend sólo si build local ok — ver memoria `feedback_frontend_build`)
4. Verificación: abrir `/admin/reportes-contable` en prod, descargar Excel, comparar totales contra un día conocido del reporte operativo

## Testing

### Backend (Jest)
- `getAccountingReport` con rango de 1 día → 1 fila por juego con sorteos
- Rango de 3 días → 3×N filas (N = juegos con actividad)
- Filtro `gameId` → sólo filas de ese juego
- Tickets `CANCELLED` excluidos del cálculo
- Premios de tripletas atribuidos correctamente al `prizeDrawId`
- Validaciones: rango invertido, rango > 365 días, `gameId` inexistente
- Excel: buffer no vacío, encabezados correctos, fórmula `SUM` en fila total

### Manual (local con seed de prod)
- Cargar el seed `backend/src/scripts/seed-prod-results.sql` (rango 2026-03-01 a 2026-03-06)
- Verificar que la suma del reporte contable para `2026-03-01` cuadra con la suma del reporte operativo para el mismo día
- Descargar Excel, abrirlo, verificar fórmula TOTAL y formatos

## Riesgos y consideraciones

- **Status de draws en prod:** producción usa `PUBLISHED` para sorteos completados; local usa `DRAWN`. La query no filtra por status (incluye todos los no-cancelados), así que esto no afecta. El reporte muestra el día completo incluyendo sorteos en curso.
- **Volumen:** ~2648 sorteos en rango anual de prod. Una query con 365 días puede traer ~365 × 7 = 2555 sorteos con sus tickets. El reporte actual ya soporta este patrón sin paginación server-side. Mantenemos el patrón y limitamos el rango a 365 días.
- **Exceljs no instalado:** agregar como dep nueva. Tamaño ~700KB unpacked, aceptable.
- **prizeDrawId en tripletas:** tickets de tripletas externas pueden tener `prizeDrawId` apuntando a un sorteo fuera del rango filtrado; el cálculo actual del reporte operativo ya maneja este caso correctamente y se replica tal cual.

## Open questions

Ninguna pendiente. Todas las decisiones se cerraron en el brainstorming.
