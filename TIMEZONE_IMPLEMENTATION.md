# Implementación de Zona Horaria de Caracas

## Resumen

Se ha implementado el manejo correcto de la zona horaria de Caracas (America/Caracas, UTC-4) en todo el sistema, tanto en el frontend como en el backend.

## Problema Identificado

1. **Base de datos**: Las fechas se almacenan en UTC (estándar correcto)
2. **Plantillas**: Los horarios se guardan como strings sin información de zona horaria
3. **Frontend**: Las fechas se mostraban según la zona horaria del navegador del usuario
4. **Backend**: Los scripts generaban fechas sin considerar correctamente la zona horaria de Caracas
5. **Imágenes**: Las imágenes dinámicas mostraban fechas/horas sin conversión a zona horaria local

## Solución Implementada

### 1. Backend

#### Utilidad de Fechas (`/backend/src/lib/dateUtils.js`)
Se creó una librería centralizada con funciones para:
- `toCaracasTime()`: Convierte UTC a hora de Caracas
- `toUTC()`: Convierte hora de Caracas a UTC
- `formatCaracasTime()`: Formatea fechas en zona horaria de Caracas
- `nowInCaracas()`: Obtiene la fecha/hora actual en Caracas
- `getDayOfWeekInCaracas()`: Obtiene el día de la semana en Caracas
- `timeStringToCaracasDate()`: Convierte strings de hora a fechas UTC
- `createCaracasDate()`: Crea fechas en zona horaria de Caracas
- Y más funciones auxiliares

#### Archivos Actualizados

**Scripts:**
- `/backend/src/scripts/clean-and-regenerate-draws.js`
  - Usa `nowInCaracas()` para obtener la fecha actual
  - Usa `getDayOfWeekInCaracas()` para el día de la semana
  - Usa `timeStringToCaracasDate()` para convertir horarios de plantillas

**Jobs:**
- `/backend/src/jobs/generate-daily-draws.job.js`
  - Genera sorteos usando la zona horaria de Caracas
  - Convierte correctamente los horarios de las plantillas

**Generación de Imágenes:**
- `/backend/src/lib/imageGenerator.js`
  - Todas las funciones de generación de imágenes ahora usan `toCaracasTime()`
  - Las fechas y horas en las imágenes se muestran en hora de Caracas
  - Afecta a: Ruleta, Animalitos, Triple, Pirámide y Recomendaciones

### 2. Frontend

#### Utilidad de Fechas (`/frontend/lib/utils/dateUtils.js`)
Se creó una librería centralizada con funciones para:
- `toCaracasTime()`: Convierte UTC a hora de Caracas
- `formatCaracasDate()`: Formatea solo la fecha (dd/MM/yyyy)
- `formatCaracasTime()`: Formatea solo la hora (HH:mm)
- `formatCaracasDateTime()`: Formatea fecha y hora completa
- `todayInCaracas()`: Obtiene la fecha de hoy en formato YYYY-MM-DD
- `nowInCaracas()`: Obtiene la fecha/hora actual en Caracas
- Y más funciones auxiliares

#### Componentes Actualizados

**Páginas de Administración:**
- `/frontend/app/admin/page.js` (Dashboard)
  - Muestra próximos sorteos en hora de Caracas
  
- `/frontend/app/admin/sorteos/page.js` (Gestión de Sorteos)
  - Lista de sorteos con fechas/horas en Caracas
  - Filtro de fecha usa `todayInCaracas()`
  
- `/frontend/app/admin/usuarios/page.js` (Usuarios)
  - Fechas de creación en hora de Caracas
  
- `/frontend/app/admin/whatsapp/page.js` (WhatsApp)
  - Fechas de conexión en hora de Caracas

**Componentes:**
- `/frontend/components/admin/ChangeWinnerModal.js`
  - Muestra fecha/hora del sorteo en Caracas
  
- `/frontend/components/admin/DrawDetailModal.js`
  - Todas las fechas (cerrado, sorteado, publicado) en Caracas
  - Eliminadas funciones locales de formateo
  
- `/frontend/components/admin/WhatsAppInstanceManager.js`
  - Fechas de conexión y última actividad en Caracas

## Flujo de Datos

### Almacenamiento en Base de Datos
```
Hora Local Caracas → Conversión a UTC → Almacenamiento en PostgreSQL
Ejemplo: 08:00 VET → 12:00 UTC → Guardado en DB
```

### Lectura desde Base de Datos
```
Lectura desde PostgreSQL (UTC) → Conversión a Caracas → Visualización
Ejemplo: 12:00 UTC → 08:00 VET → Mostrado al usuario
```

### Generación de Imágenes
```
scheduledAt (UTC) → toCaracasTime() → Fecha/Hora en imagen
Ejemplo: 2025-10-04T12:00:00Z → 04/10/25 08:00 AM
```

## Dependencias Instaladas

### Frontend
- `date-fns-tz@^3.x` (ya existía `date-fns`)

### Backend
- `date-fns-tz@^3.x` (ya existía `date-fns`)

## Ventajas de esta Implementación

1. **Consistencia**: Todas las fechas se muestran en la misma zona horaria
2. **Precisión**: Los sorteos se generan exactamente a la hora correcta de Caracas
3. **Mantenibilidad**: Código centralizado en utilidades reutilizables
4. **Escalabilidad**: Fácil cambiar zona horaria si es necesario
5. **Corrección**: Las imágenes dinámicas muestran la hora correcta
6. **Estándar**: La BD sigue usando UTC (mejor práctica)

## Verificación

Para verificar que todo funciona correctamente:

1. **Frontend**: Las fechas en el panel de administración deben mostrarse en hora de Caracas
2. **Backend**: Los sorteos generados deben tener la hora correcta de Caracas
3. **Imágenes**: Las imágenes generadas deben mostrar fecha/hora de Caracas
4. **Landing**: Las fechas públicas deben mostrarse en hora de Caracas

## Notas Importantes

- La zona horaria de Caracas es `America/Caracas` (UTC-4)
- Todas las fechas en la base de datos siguen en UTC (no se modificó la BD)
- Los horarios en las plantillas (`DrawTemplate.drawTimes`) se interpretan como hora local de Caracas
- El cron del job de generación diaria sigue siendo `5 0 * * *` (00:05 AM hora del servidor)

## Próximos Pasos Recomendados

1. Verificar que el landing page también use las utilidades de fecha
2. Actualizar cualquier otro componente que muestre fechas
3. Considerar agregar tests unitarios para las funciones de fecha
4. Documentar el comportamiento en la documentación de API si existe
