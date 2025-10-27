# Sistema de Planificaciones y Cron Jobs

## 📋 Resumen Ejecutivo

El sistema utiliza **node-cron** para ejecutar tareas programadas automáticamente. Los jobs se inician cuando arranca el servidor backend y se ejecutan según horarios configurados.

---

## 🤖 Jobs Implementados

### 1. **GenerateDailyDrawsJob** 
**Archivo:** `/backend/src/jobs/generate-daily-draws.job.js`

- **Horario:** Todos los días a las **00:05 AM**
- **Expresión Cron:** `5 0 * * *`
- **Función:** Generar todos los sorteos del día basándose en plantillas activas

**¿Qué hace?**
1. Obtiene el día de la semana actual (1=Lunes, 7=Domingo)
2. Busca todas las plantillas activas para ese día
3. Verifica si hay pausas configuradas para cada juego
4. Crea sorteos con estado `SCHEDULED` para cada hora definida en la plantilla
5. Evita duplicados (no crea si ya existe un sorteo para esa fecha/hora/juego)

**Ejemplo:**
```
Plantilla: "Triple A - Lunes a Viernes"
- Días: [1,2,3,4,5]
- Horarios: ["08:00", "10:00", "12:00", "14:00"]
→ Si hoy es Lunes, crea 4 sorteos programados
```

---

### 2. **CloseDrawJob**
**Archivo:** `/backend/src/jobs/close-draw.job.js`

- **Horario:** **Cada minuto**
- **Expresión Cron:** `* * * * *`
- **Función:** Cerrar sorteos 5 minutos antes de su hora programada

**¿Qué hace?**
1. Busca sorteos con estado `SCHEDULED` que se ejecutarán en los próximos 5 minutos
2. **ANTES DE CERRAR:** Importa tickets/ventas de APIs externas (SRQ)
3. Selecciona un número ganador aleatorio de los items activos
4. Cambia el estado a `CLOSED` y guarda el número preseleccionado
5. Emite eventos WebSocket para notificar a los clientes
6. Registra en audit log

**Importante:** 
- Este job también importa las ventas externas antes de cerrar
- El número preseleccionado puede cambiarse manualmente antes del sorteo

---

### 3. **ExecuteDrawJob**
**Archivo:** `/backend/src/jobs/execute-draw.job.js`

- **Horario:** **Cada minuto**
- **Expresión Cron:** `* * * * *`
- **Función:** Ejecutar sorteos en su hora programada

**¿Qué hace?**
1. Busca sorteos con estado `CLOSED` cuya hora programada ya pasó
2. Confirma el número ganador (usa el preseleccionado o el cambiado manualmente)
3. Cambia el estado a `DRAWN`
4. Crea registros de publicación pendientes para cada canal (Telegram, WhatsApp, Facebook, Instagram)
5. Emite eventos WebSocket
6. Registra en audit log

**Pendiente:**
- Generación de imagen del resultado
- Job de publicación automática a canales

---

### 4. **SyncApiPlanningJob**
**Archivo:** `/backend/src/jobs/sync-api-planning.job.js`

- **Horario:** Todos los días a las **6:00 AM**
- **Expresión Cron:** `0 6 * * *`
- **Función:** Sincronizar planificación con APIs externas (SRQ)

**¿Qué hace?**
1. Obtiene la planificación del día desde la API externa
2. Mapea los sorteos externos con los juegos locales
3. Crea o actualiza sorteos según la planificación externa

---

## ⚙️ Configuración

### Variables de Entorno

**Archivo:** `/backend/.env`

```bash
# Habilitar/deshabilitar jobs
ENABLE_JOBS="true"  # Cambiar a "false" para deshabilitar todos los jobs
```

### Inicio Automático

Los jobs se inician automáticamente cuando arranca el servidor backend:

**Archivo:** `/backend/src/index.js` (líneas 172-176)
```javascript
// Iniciar sistema de Jobs
if (process.env.ENABLE_JOBS !== 'false') {
  startAllJobs();
} else {
  logger.info('⚠️  Jobs deshabilitados (ENABLE_JOBS=false)');
}
```

---

## 🚀 Cómo Iniciar el Sistema

### Opción 1: Modo Desarrollo (con auto-reinicio)
```bash
cd backend
npm run dev
```

### Opción 2: Modo Producción
```bash
cd backend
npm start
```

### Verificar que los Jobs están activos

Al iniciar el servidor, deberías ver en los logs:
```
🚀 Iniciando sistema de Jobs...
✅ Job GenerateDailyDraws iniciado (00:05 AM diario)
✅ Job CloseDraws iniciado (cada minuto)
✅ Job ExecuteDraws iniciado (cada minuto)
✅ Job SyncApiPlanning iniciado (6:00 AM diario)
✅ Todos los Jobs iniciados correctamente
```

---

## 📊 Horarios de Ejecución

| Job | Frecuencia | Horario | Expresión Cron |
|-----|------------|---------|----------------|
| GenerateDailyDraws | Diario | 00:05 AM | `5 0 * * *` |
| CloseDraws | Cada minuto | Continuo | `* * * * *` |
| ExecuteDraws | Cada minuto | Continuo | `* * * * *` |
| SyncApiPlanning | Diario | 6:00 AM | `0 6 * * *` |

---

## 🔄 Flujo Completo Diario

### Configuración Previa (una sola vez):
1. Crear juegos en `/admin/configuracion` → Pestaña Juegos
2. Crear items (números/animales) → Pestaña Items
3. Crear plantillas con horarios → Pestaña Plantillas

### Operación Automática Diaria:

```
00:05 AM → GenerateDailyDrawsJob
           ├─ Crea sorteos del día según plantillas
           └─ Estado: SCHEDULED

06:00 AM → SyncApiPlanningJob
           └─ Sincroniza con API externa (SRQ)

Durante el día (cada minuto):

5 min antes → CloseDrawJob
              ├─ Importa ventas externas
              ├─ Preselecciona ganador aleatorio
              └─ Estado: SCHEDULED → CLOSED

Hora exacta → ExecuteDrawJob
              ├─ Confirma ganador
              ├─ Crea registros de publicación
              └─ Estado: CLOSED → DRAWN

(Pendiente) → PublishDrawJob
              └─ Publica a canales configurados
```

---

## 🛠️ Gestión Manual de Jobs

### Ejecutar un Job Manualmente

Puedes ejecutar jobs manualmente desde código o crear endpoints:

```javascript
import jobs from './jobs/index.js';

// Ejecutar generación de sorteos manualmente
await jobs.generateDailyDrawsJob.execute();

// Ejecutar cierre de sorteos manualmente
await jobs.closeDrawJob.execute();

// Ejecutar ejecución de sorteos manualmente
await jobs.executeDrawJob.execute();

// Ejecutar sincronización con API manualmente
await jobs.syncApiPlanningJob.execute();
```

### Detener Todos los Jobs

```javascript
import { stopAllJobs } from './jobs/index.js';

stopAllJobs();
```

---

## 📝 Logs y Monitoreo

### Ubicación de Logs
Los logs se guardan en: `/backend/logs/`

### Ver Logs en Tiempo Real
```bash
cd backend
tail -f logs/combined.log
```

### Logs Importantes

**Generación de sorteos:**
```
🔄 Iniciando generación de sorteos diarios...
✅ Sorteos generados: 24 creados, 0 saltados
```

**Cierre de sorteos:**
```
🔒 Cerrando 3 sorteo(s)...
🔒 Sorteo cerrado: Triple A - 08:00:00 | Preselección: 123 - Mariposa
```

**Ejecución de sorteos:**
```
🎲 Ejecutando 3 sorteo(s)...
🎲 Sorteo ejecutado: Triple A - 08:00:00 | Ganador: 123 - Mariposa
```

---

## ⚠️ Problemas Comunes

### Los jobs no se ejecutan

**Verificar:**
1. ¿Está `ENABLE_JOBS="true"` en el archivo `.env`?
2. ¿El servidor está corriendo?
3. ¿Hay errores en los logs?

**Solución:**
```bash
# Verificar variable de entorno
cat backend/.env | grep ENABLE_JOBS

# Reiniciar servidor
cd backend
npm run dev
```

### Los sorteos no se generan

**Verificar:**
1. ¿Hay plantillas activas para el día actual?
2. ¿Las plantillas tienen horarios configurados?
3. ¿El juego está pausado?

**Solución:**
- Revisar plantillas en `/admin/configuracion` → Pestaña Plantillas
- Verificar que `isActive = true`
- Verificar que el día actual está en `daysOfWeek`

### Los sorteos no se cierran

**Verificar:**
1. ¿El juego tiene items activos?
2. ¿El CloseDrawJob está corriendo?

**Solución:**
- Revisar items en `/admin/configuracion` → Pestaña Items
- Verificar logs del job

---

## 🔐 Seguridad

### Zona Horaria
El sistema usa la zona horaria del servidor. Asegúrate de configurarla correctamente:

```bash
# Ver zona horaria actual
timedatectl

# Cambiar zona horaria (ejemplo: Colombia)
sudo timedatectl set-timezone America/Bogota
```

### Backup de Base de Datos
Configura backups automáticos antes de las 00:05 AM para tener respaldo antes de generar sorteos:

```bash
# Ejemplo de cron del sistema (crontab -e)
0 0 * * * pg_dump tote_db > /backups/tote_$(date +\%Y\%m\%d).sql
```

---

## 📦 Dependencias

El sistema usa **node-cron** versión 3.0.3:

```json
"dependencies": {
  "node-cron": "^3.0.3"
}
```

No requiere configuración adicional de cron del sistema operativo.

---

## 🎯 Jobs Pendientes de Implementar

### PublishDrawJob (PENDIENTE)
- **Frecuencia:** Cada 30 segundos
- **Expresión Cron:** `*/30 * * * * *`
- **Función:** Publicar sorteos en canales configurados (Telegram, WhatsApp, Facebook, Instagram)

### RetryFailedPublicationsJob (PENDIENTE)
- **Frecuencia:** Cada 5 minutos
- **Expresión Cron:** `*/5 * * * *`
- **Función:** Reintentar publicaciones que fallaron

### CleanupOldDataJob (PENDIENTE)
- **Frecuencia:** Diario a las 2:00 AM
- **Expresión Cron:** `0 2 * * *`
- **Función:** Limpiar sorteos antiguos, logs y archivos

---

## 📚 Referencias

- **Documentación node-cron:** https://www.npmjs.com/package/node-cron
- **Cron Expression Generator:** https://crontab.guru/
- **Documentación completa del sistema:** Ver `/JOBS_SYSTEM.md`

---

## ✅ Checklist de Configuración

Para que el sistema funcione correctamente:

- [ ] Servidor backend corriendo (`npm run dev` o `npm start`)
- [ ] Variable `ENABLE_JOBS="true"` en `.env`
- [ ] Base de datos PostgreSQL conectada
- [ ] Al menos un juego creado
- [ ] Items activos para cada juego
- [ ] Al menos una plantilla activa con horarios
- [ ] Zona horaria del servidor configurada correctamente

---

**Última actualización:** 2025-10-02  
**Estado:** ✅ Sistema de jobs funcionando (4 de 7 jobs implementados)
