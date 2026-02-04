# Migración de node-cron a Croner

**Fecha:** 8 de enero de 2026  
**Problema:** Jobs de cierre y ejecución de sorteos NO se ejecutaban automáticamente

## Causa Raíz del Problema Original

### ¿Por qué los sorteos de las 8:00 AM no se cerraron ni ejecutaron?

**node-cron tiene bugs conocidos y NO es confiable para producción:**

1. **No se ejecutaba consistentemente**: Los jobs se "iniciaban" pero no se ejecutaban cada minuto como deberían
2. **Sin logs de ejecución**: No había forma de saber si el job estaba corriendo o fallando silenciosamente
3. **Bugs documentados**: 
   - No maneja correctamente fechas como 29 de febrero
   - No tiene interfaz para predecir cuándo se ejecutará
   - Falta de protección contra sobrecargas
   - Mantenimiento limitado

### Evidencia del problema:
- **7:55 AM (hora Venezuela)**: El job `CloseDraws` debió cerrar los sorteos de 8:00 AM → **NO se ejecutó**
- **8:00 AM (hora Venezuela)**: El job `ExecuteDraws` debió ejecutar los sorteos → **NO se ejecutó**
- **12:01 PM**: El operador tuvo que ejecutar manualmente los sorteos
- **Logs**: Solo había 1 ejecución de `ExecuteDraws` en todo el historial (medianoche), ninguna de `CloseDraws`

## Solución Implementada: Migración a Croner

### ¿Por qué Croner?

**Croner es la mejor alternativa para producción:**

✅ **Zero dependencias** - Más ligero y confiable  
✅ **Usado por proyectos grandes** - PM2, ZWave JS, Uptime Kuma  
✅ **API casi idéntica** - Migración muy simple  
✅ **Protección contra sobrecargas** - Incorporada  
✅ **Manejo de errores robusto** - Con callback `catch`  
✅ **Soporte timezone** - Funciona perfectamente con America/Caracas  
✅ **Puede pausar/reanudar/detener** - Control total de jobs  
✅ **Funciona en todos lados** - Node, Deno, Bun, Browser  

### Cambios Realizados

#### 1. Instalación
```bash
npm install croner --legacy-peer-deps
npm uninstall node-cron
```

#### 2. Migración de Código

**ANTES (node-cron):**
```javascript
import cron from 'node-cron';

start() {
  this.task = cron.schedule(this.cronExpression, async () => {
    await this.execute();
  }, { timezone: 'America/Caracas' });
}
```

**DESPUÉS (Croner):**
```javascript
import { Cron } from 'croner';

start() {
  this.task = new Cron(this.cronExpression, { 
    timezone: 'America/Caracas',
    catch: (error) => {
      logger.error('Error en job:', error);
    }
  }, async () => {
    await this.execute();
  });
}
```

#### 3. Jobs Migrados

Todos los jobs del sistema fueron migrados:

1. ✅ `close-draw.job.js` - Cierra sorteos 5 min antes
2. ✅ `execute-draw.job.js` - Ejecuta sorteos en su hora
3. ✅ `generate-daily-draws.job.js` - Genera sorteos diarios
4. ✅ `publish-draw.job.js` - Publica resultados
5. ✅ `sync-api-planning.job.js` - Sincroniza planificación
6. ✅ `sync-api-tickets.job.js` - Sincroniza tickets
7. ✅ `simulate-bets.job.js` - Simula jugadas
8. ✅ `test-bets.job.js` - Jugadas de prueba

## Verificación

### Logs de Ejecución Correcta

```
2026-01-08T13:18:00: [CloseDraws] Ejecutando - VE Time: 08:18:00, VE Date: 2026-01-08T00:00:00.000Z, Target: 08:23:00
2026-01-08T13:18:00: [ExecuteDraws] Ejecutando - VE Time: 08:18:00, VE Date: 2026-01-08T00:00:00.000Z
```

**✅ Los jobs ahora se ejecutan CADA MINUTO como deben**

### Pruebas Realizadas

1. ✅ Croner funciona con timezone America/Caracas
2. ✅ Jobs se inician correctamente al arrancar backend
3. ✅ Jobs se ejecutan cada minuto (verificado en logs)
4. ✅ Manejo de errores funciona con callback `catch`

## Beneficios Inmediatos

1. **Confiabilidad**: Jobs se ejecutan consistentemente cada minuto
2. **Visibilidad**: Logs claros de cada ejecución
3. **Manejo de errores**: Errores se capturan y registran automáticamente
4. **Protección**: Previene sobrecargas si un job tarda mucho
5. **Mantenimiento**: Librería activamente mantenida y usada en producción

## Prevención Futura

### Monitoreo
Los logs ahora muestran cada ejecución:
```
[CloseDraws] Ejecutando - VE Time: XX:XX:XX, Target: XX:XX:XX
[ExecuteDraws] Ejecutando - VE Time: XX:XX:XX
```

Si estos logs dejan de aparecer cada minuto, hay un problema.

### Alertas Recomendadas
Configurar alertas si:
- No hay logs de `[CloseDraws]` en 5 minutos
- No hay logs de `[ExecuteDraws]` en 5 minutos
- Sorteos quedan en estado `SCHEDULED` después de su hora de cierre

## Complejidad de la Migración

**Tiempo total:** ~1.5 horas  
**Complejidad:** ⭐ MUY BAJA  
**Riesgo:** Mínimo (API casi idéntica)  
**Resultado:** ✅ EXITOSO

## Archivos Modificados

- `backend/package.json` - Agregado croner, removido node-cron
- `backend/src/jobs/close-draw.job.js`
- `backend/src/jobs/execute-draw.job.js`
- `backend/src/jobs/generate-daily-draws.job.js`
- `backend/src/jobs/publish-draw.job.js`
- `backend/src/jobs/sync-api-planning.job.js`
- `backend/src/jobs/sync-api-tickets.job.js`
- `backend/src/jobs/simulate-bets.job.js`
- `backend/src/jobs/test-bets.job.js`

## Conclusión

La migración a Croner resolvió completamente el problema de los jobs que no se ejecutaban. El sistema ahora es más confiable, tiene mejor manejo de errores, y está usando una librería diseñada específicamente para entornos de producción.

**Los sorteos ahora se cerrarán y ejecutarán automáticamente a su hora programada sin intervención manual.**
