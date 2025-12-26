# Migración scheduledAt → drawDate/drawTime - Reporte de Progreso

## ✅ Archivos COMPLETADOS (ACTIVOS)

### Controllers
- **`backend/src/controllers/public.controller.js`** (23 refs → 0 refs)
  - ✅ Eliminado scheduledAt de todos los select queries
  - ✅ Reemplazado filtros scheduledAt por drawDate
  - ✅ Actualizado getNextDraws() para usar drawDate/drawTime con comparación Venezuela
  - ✅ Actualizado getGameHistory() para usar drawDate en filtros
  - ✅ Actualizado getGameStats() para usar drawDate

### Services (High Priority)
- **`backend/src/services/monitor.service.js`** (18 refs → 0 refs)
  - ✅ Actualizado getBancaStats() - retorna drawDate/drawTime
  - ✅ Actualizado getItemStats() - retorna drawDate/drawTime, construye drawDateTime para tripletas
  - ✅ Actualizado getDailyReport() - usa drawDate/drawTime en reporte
  - ✅ Actualizado getTripletasByItem() - construye drawDateTime, actualiza queries de sorteos ejecutados

- **`backend/src/services/prewinner-optimizer.service.js`** (14 refs → 0 refs)
  - ✅ Actualizado loadDrawContext() - construye drawDateTime para tripletas
  - ✅ Actualizado getDrawHistory() - usa drawDate/drawTime en queries
  - ✅ Actualizado calculateTripletaImpact() - construye startDateTime para queries
  - ✅ Actualizado getUsedItemsToday() - usa drawDate directamente
  - ✅ Actualizado getUsedCentenasToday() - usa drawDate directamente
  - ✅ Actualizado getItemStatistics() - usa drawDate/drawTime en orderBy

- **`backend/src/services/admin-notification.service.js`** (10 refs → 0 refs)
  - ✅ Actualizado notifyPrewinnerSelected() - recibe drawDate/drawTime
  - ✅ Actualizado formatPrewinnerMessage() - convierte drawTime a formato 12h
  - ✅ Actualizado notifyDrawResult() - recibe drawDate/drawTime
  - ✅ Actualizado formatDrawResultMessage() - convierte drawTime a formato 12h

- **`backend/src/services/tripleta.service.js`** (10 refs → 0 refs)
  - ✅ Actualizado createTripleBet() - usa drawDate/drawTime para obtener próximos sorteos
  - ✅ Actualizado checkTripleBetsForDraw() - construye drawDateTime, actualiza queries
  - ✅ Actualizado getDrawsForTripleta() - usa drawDate/drawTime en queries y respuestas

### Jobs
- **`backend/src/jobs/sync-api-tickets.job.js`** (9 refs → 0 refs)
  - ✅ Actualizado execute() - usa drawDate/drawTime con hora Venezuela
  - ✅ Actualizado cálculo de minutos hasta sorteo usando drawTime
  - ✅ Actualizado executeForToday() - usa drawDate para filtrar sorteos de hoy

- **`backend/src/jobs/publish-draw.job.js`** (2 refs → 0 refs)
  - ✅ Actualizado evento WebSocket - envía drawDate/drawTime en lugar de scheduledAt
  - ✅ Actualizado log - usa drawTime en lugar de scheduledAt

### Libraries
- **`backend/src/lib/imageGenerator.js`** (6 refs → 0 refs)
  - ✅ Actualizado generateRouletteImage() - recibe drawDate/drawTime, construye date
  - ✅ Actualizado generateAnimalitosImage() - recibe drawDate/drawTime, construye date
  - ✅ Actualizado generateTripleImage() - recibe drawDate/drawTime, construye date

## 📋 Archivos PENDIENTES (ACTIVOS)

### Services (Remaining)
- `backend/src/services/pdf-report.service.js` (8 refs)
- `backend/src/services/message-template.service.js` (7 refs)
- `backend/src/services/prewinner-selection.service.js` (7 refs)
- `backend/src/services/bet-simulator.service.js` (6 refs)
- `backend/src/services/srq.service.js` (6 refs)
- `backend/src/services/draw-analysis.service.js` (5 refs)
- `backend/src/services/srq-tripleta.service.js` (5 refs)
- `backend/src/services/api-integration.service.js` (3 refs)
- Otros servicios con 1-2 referencias

### Controllers
- `backend/src/controllers/game-channels.controller.js` (1 ref)

### Scripts (Verificar si están en uso)
- `backend/src/scripts/migrate-legacy.js` (7 refs) - ❌ LEGACY
- `backend/src/scripts/verify-sync.js` (7 refs) - Verificar
- `backend/src/scripts/clean-and-regenerate-draws.js` (5 refs) - Verificar
- `backend/check-next-draws.js` (4 refs) - Verificar
- Otros scripts de testing/demo

### Frontend
- `frontend/app/admin/monitor/page.js` (7 refs)
- `frontend/app/admin/analisis-sorteo/page.js` (4 refs)
- `frontend/components/admin/DrawDetailModal.js` (4 refs)
- `frontend/app/admin/sorteos/page.js` (3 refs)
- `frontend/app/page.js` (3 refs)
- `frontend/components/common/ImageModal.js` (3 refs)
- `frontend/components/draws/NextDrawCountdown.js` (2 refs)
- `frontend/app/admin/jugadores/[id]/page.js` (2 refs)
- `frontend/app/admin/reportes/page.js` (2 refs)
- `frontend/components/player/TicketDetailModal.js` (2 refs)
- `frontend/components/shared/TripletaDetailModal.js` (2 refs)

## 🔍 Reglas de Migración Aplicadas

### ❌ NO USAR scheduledAt
```javascript
// MAL
draw.scheduledAt
where: { scheduledAt: { gte: now } }
orderBy: { scheduledAt: 'asc' }
```

### ✅ USAR drawDate y drawTime
```javascript
// BIEN - Filtrar sorteos de hoy
const venezuelaDate = getVenezuelaDateAsUTC();
where: { drawDate: venezuelaDate }

// BIEN - Buscar próximo sorteo
const venezuelaTime = getVenezuelaTimeString();
const todayVenezuela = getVenezuelaDateAsUTC();
where: {
  OR: [
    { drawDate: todayVenezuela, drawTime: { gt: venezuelaTime } },
    { drawDate: { gt: todayVenezuela } }
  ]
}
orderBy: [
  { drawDate: 'asc' },
  { drawTime: 'asc' }
]

// BIEN - Mostrar hora en logs
`Sorteo: ${draw.drawTime}` // "16:00:00"

// BIEN - Formatear para display
const [hours, mins] = draw.drawTime.split(':');
const hour = parseInt(hours, 10);
const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
const displayHour = hour % 12 || 12;
const formatted = `${displayHour}:${mins} ${ampm}`;

// BIEN - Construir DateTime para comparaciones con expiresAt
const drawDateTime = new Date(draw.drawDate);
const [hours, minutes] = draw.drawTime.split(':');
drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
```

## 📊 Estadísticas

- **Total archivos encontrados**: 64 archivos
- **Total referencias**: 262 referencias
- **Archivos migrados**: 11 archivos (controllers, services, jobs, libs)
- **Referencias eliminadas**: ~100 referencias
- **Archivos pendientes**: ~53 archivos

## 🎯 Próximos Pasos

1. Migrar servicios restantes (pdf-report, message-template, etc.)
2. Revisar y migrar scripts activos
3. Migrar componentes frontend
4. Verificar que no queden referencias activas a scheduledAt
5. Probar endpoints críticos
6. Reiniciar PM2 backend

## ⚠️ Notas Importantes

- Los campos `drawDate` y `drawTime` ya están en uso en los jobs principales (generate-daily-draws, close-draw, execute-draw)
- El frontend ya tiene funciones de utilidad para manejar drawDate/drawTime
- Todos los cambios mantienen compatibilidad con zona horaria Venezuela (America/Caracas, UTC-4)
