# Migración scheduledAt → drawDate/drawTime - Resumen Completo

**Fecha:** 25 de diciembre de 2024  
**Estado:** ✅ COMPLETADO - Backend migrado, Frontend requiere actualización

---

## 📋 Resumen Ejecutivo

Se completó la migración del campo `scheduledAt` (DateTime) a los campos `drawDate` (Date) y `drawTime` (String) en todo el backend del sistema de lotería. Esta migración asegura el correcto manejo de la zona horaria de Venezuela (America/Caracas, UTC-4).

### Cambios Principales:
- ❌ **ELIMINADO:** `scheduledAt` (DateTime combinado)
- ✅ **USAR:** `drawDate` (Date UTC) + `drawTime` (String "HH:MM:SS")

---

## 🎯 Archivos Migrados (Backend)

### ✅ Servicios ACTIVOS Migrados

#### 📄 1. pdf-report.service.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 8 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 33-34: Reemplazado `scheduledAt` por `drawDate` y `drawTime` en parámetros
- Línea 45-46: Actualizado formato de fecha usando `drawDate` y conversión de `drawTime`
- Línea 100-106: Modificado `drawHeader()` para usar `drawDate` y `drawTime`, con formato de hora AM/PM
- Línea 553-554: Actualizado llamada a `generateDrawClosingReport()` con nuevos parámetros

---

#### 📄 2. message-template.service.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 7 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 29-30: Actualizada documentación de variables disponibles
- Línea 50-53: Cambiado de `scheduledAt` a `drawDate` para parseo de fecha
- Línea 76-85: Modificado formateo de hora para usar `drawTime` directamente (ya está en hora Venezuela)
- Línea 99-100: Actualizado retorno de datos con `drawDate` y `drawTime`
- Línea 156-157: Corregido datos de prueba en `validateTemplate()`

---

#### 📄 3. prewinner-selection.service.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 7 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 153-154: Actualizado llamada a `generateDrawClosingReport()` con `drawDate` y `drawTime`
- Línea 175-176: Actualizado llamada a `notifyPrewinnerSelected()` con nuevos campos
- Línea 234-248: Modificado `getUsedItemsToday()` para usar `drawDate` directamente
- Línea 263-277: Modificado `getUsedCentenasToday()` para usar `drawDate` directamente
- Línea 333-344: Actualizado `selectPrewinnersForClosingDraws()` para usar hora Venezuela con `drawDate` y `drawTime`
- Línea 369-370, 378-379: Actualizado resultados con `drawDate` y `drawTime`

---

#### 📄 4. srq.service.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 6 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 106-116: Modificado query de sorteos existentes para usar `drawDate`
- Línea 170-176: Actualizado creación de sorteos con `drawDate` y `drawTime` (sin `scheduledAt`)
- Línea 427-439: Modificado `syncUpcomingTickets()` para usar `drawDate` y `drawTime` con hora Venezuela
- Línea 502-510: Marcado `buildScheduledAt()` como DEPRECATED

---

#### 📄 5. draw-analysis.service.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 5 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 73-83: Actualizado query de tripletas activas construyendo datetime desde `drawDate` y `drawTime`
- Línea 159-160: Cambiado retorno de `drawDate` y `drawTime` en lugar de `scheduledAt`
- Línea 219-231: Modificado query de sorteos ejecutados para usar `drawDate` y `drawTime` con OR
- Línea 307-308: Actualizado `getQuickAnalysis()` con nuevos campos

---

#### 📄 6. srq-tripleta.service.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 5 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 164-180: Modificado query de sorteos futuros para usar `drawDate` y `drawTime` con hora Venezuela
- Línea 189-193: Actualizado cálculo de `expiresAt` desde `drawDate` y `drawTime`
- Línea 327-346: Modificado `syncUpcomingTripletaTickets()` para usar hora Venezuela

---

#### 📄 7. test-bets.job.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 1 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 94-104: Actualizado query de sorteos abiertos para usar `drawDate` y `drawTime` con hora Venezuela

---

#### 📄 8. generate-daily-draws.job.js
**Estado:** ✅ ACTIVO - MIGRADO  
**Referencias scheduledAt:** 3 → 0  
**Acción:** CORREGIDO

**Cambios realizados:**
- Línea 88-113: Eliminado cálculo de `scheduledAt`, ahora solo usa `drawDate` y `drawTime`
- Creación de sorteos simplificada sin campo `scheduledAt`

---

### ✅ Servicios Sin Referencias

Los siguientes servicios NO tenían referencias a `scheduledAt`:
- ✅ `monitor.service.js` - Ya usa `drawDate` y `drawTime`
- ✅ `prewinner-optimizer.service.js` - Ya usa `drawDate` y `drawTime`
- ✅ `public.controller.js` - Ya usa `drawDate` y `drawTime`
- ✅ `admin-notification.service.js` - Sin referencias
- ✅ `tripleta.service.js` - Sin referencias
- ✅ `bet-simulator.service.js` - Sin referencias

---

## ⚠️ Frontend - Requiere Actualización

### Archivos Frontend con scheduledAt (17 archivos, 34 referencias)

**IMPORTANTE:** El frontend aún usa `scheduledAt` pero el backend ahora retorna `drawDate` y `drawTime`. 

#### Archivos Prioritarios:
1. `frontend/components/draws/NextDrawCountdown.js` (2 refs)
2. `frontend/app/page.js` (3 refs)
3. `frontend/app/admin/sorteos/page.js` (3 refs)
4. `frontend/app/admin/analisis-sorteo/page.js` (4 refs)
5. `frontend/components/admin/DrawDetailModal.js` (4 refs)

#### Estrategia de Migración Frontend:
1. **Opción A (Recomendada):** Actualizar backend para incluir `scheduledAt` calculado en respuestas API como campo virtual
2. **Opción B:** Actualizar todos los componentes frontend para construir datetime desde `drawDate` + `drawTime`

**Nota:** El usuario indicó que NO debe modificarse el frontend a menos que se solicite explícitamente.

---

## 🗑️ Scripts LEGACY - Marcados para Revisión

Los siguientes scripts contienen referencias a `scheduledAt` pero son scripts de utilidad/migración:

### Scripts de Migración/Testing (LEGACY):
- `backend/scripts/migrate-legacy.js` (7 refs)
- `backend/scripts/verify-sync.js` (7 refs)
- `backend/scripts/clean-and-regenerate-draws.js` (5 refs)
- `backend/scripts/generate-demo-videos.js` (4 refs)
- `backend/scripts/generate-today-draws.js` (4 refs)
- `backend/scripts/migrate-api-mappings.js` (4 refs)
- `backend/scripts/test-image-generation.js` (4 refs)
- `backend/check-next-draws.js` (4 refs)
- `backend/sync-from-mysql-and-srq.js` (4 refs)
- `backend/check-draws-today.js` (3 refs)
- `backend/scripts/reset-today-draws.js` (3 refs)
- `backend/scripts/test-prewinner-selection.js` (3 refs)
- `backend/test-srq-api.js` (3 refs)
- `backend/test-sync-today.js` (3 refs)
- `backend/test-publication-lotoanimalito.js` (2 refs)
- Y otros scripts de testing...

**Recomendación:** Estos scripts deben actualizarse solo si se usan activamente. Muchos parecen ser scripts de desarrollo/testing antiguos.

---

## 📊 Estadísticas de Migración

### Backend (Código Activo)
- **Total archivos migrados:** 8
- **Total referencias eliminadas:** 42
- **Servicios:** 6 archivos
- **Jobs:** 2 archivos
- **Estado:** ✅ 100% COMPLETADO

### Frontend
- **Total archivos con scheduledAt:** 17
- **Total referencias:** 34
- **Estado:** ⚠️ PENDIENTE (por decisión del usuario)

### Scripts Legacy
- **Total archivos:** ~30
- **Total referencias:** ~100+
- **Estado:** 📋 MARCADO PARA REVISIÓN

---

## ✅ Validación

### Queries Correctos Ahora:

```javascript
// ✅ CORRECTO - Filtrar sorteos de hoy
const { getVenezuelaDateAsUTC } = await import('../lib/dateUtils.js');
const todayVenezuela = getVenezuelaDateAsUTC();

const draws = await prisma.draw.findMany({
  where: {
    drawDate: todayVenezuela
  }
});
```

```javascript
// ✅ CORRECTO - Buscar próximo sorteo
const { getVenezuelaDateAsUTC, getVenezuelaTimeString } = await import('../lib/dateUtils.js');
const todayVenezuela = getVenezuelaDateAsUTC();
const currentTime = getVenezuelaTimeString();

const nextDraw = await prisma.draw.findFirst({
  where: {
    OR: [
      { drawDate: todayVenezuela, drawTime: { gt: currentTime } },
      { drawDate: { gt: todayVenezuela } }
    ]
  },
  orderBy: [
    { drawDate: 'asc' },
    { drawTime: 'asc' }
  ]
});
```

```javascript
// ✅ CORRECTO - Mostrar hora en logs/mensajes
// drawTime ya está en hora Venezuela
console.log(`Sorteo: ${draw.drawTime}`); // "16:00:00"

// O formateado a 12h:
const [hours, mins] = draw.drawTime.split(':');
const hour = parseInt(hours, 10);
const ampm = hour >= 12 ? 'PM' : 'AM';
const displayHour = hour % 12 || 12;
const formatted = `${displayHour}:${mins} ${ampm}`; // "4:00 PM"
```

---

## 🔧 Funciones Disponibles

### Backend: `backend/src/lib/dateUtils.js`
```javascript
import { 
  getVenezuelaDateString,    // Retorna "YYYY-MM-DD"
  getVenezuelaTimeString,    // Retorna "HH:MM:SS"
  getVenezuelaDateAsUTC,     // Retorna Date UTC para DB
  getVenezuelaDayOfWeek,     // Retorna 1-7 (Lun-Dom)
  addMinutesToTime           // Suma minutos a "HH:MM:SS"
} from '../lib/dateUtils.js';
```

### Frontend: `frontend/lib/utils/dateUtils.js`
```javascript
import { 
  getVenezuelaDateString,
  getVenezuelaTimeString,
  formatDrawTimeToAMPM      // Convierte "08:00" a "8:00 AM"
} from '@/lib/utils/dateUtils';
```

---

## 🚀 Próximos Pasos

1. ✅ **Backend migrado y listo**
2. ⚠️ **Frontend:** Decidir estrategia (campo virtual vs migración completa)
3. 📋 **Scripts legacy:** Revisar cuáles se usan activamente y migrar
4. ✅ **PM2 Backend:** Reiniciar para aplicar cambios

---

## 📝 Notas Importantes

- **Zona Horaria:** Todo el sistema maneja hora de Venezuela (America/Caracas, UTC-4)
- **drawDate:** Se almacena como Date UTC pero representa la fecha en Venezuela
- **drawTime:** Se almacena como String "HH:MM:SS" en hora Venezuela directa
- **No hay conversiones:** Las horas se manejan directamente en hora Venezuela
- **Comparaciones:** Se comparan strings de hora directamente ("08:00" < "16:00")

---

## ✅ Conclusión

La migración del backend está **100% completa**. Todos los servicios activos, jobs y controladores ahora usan correctamente `drawDate` y `drawTime` en lugar de `scheduledAt`. El sistema maneja correctamente la zona horaria de Venezuela sin conversiones complejas.

**Estado Final:**
- ✅ Backend: MIGRADO
- ⚠️ Frontend: PENDIENTE (decisión del usuario)
- 📋 Scripts Legacy: MARCADOS PARA REVISIÓN
