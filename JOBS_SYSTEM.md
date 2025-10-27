# Sistema de Jobs - Sistema Totalizador de Loterías

## Visión General

El sistema utiliza **node-cron** para ejecutar tareas programadas que automatizan el flujo de los sorteos.

---

## Jobs Principales

### 1. GenerateDailyDrawsJob

**Frecuencia**: Diario a las 00:05 AM  
**Cron**: `5 0 * * *`

**Función**: Generar todos los sorteos del día basándose en plantillas activas

**Lógica**:
```typescript
1. Obtener fecha del día actual
2. Calcular día de la semana (1-7, donde 1=Lunes)
3. Buscar todas las plantillas activas que incluyan este día
4. Para cada plantilla:
   a. Verificar si hay pausas activas para ese juego en esta fecha
   b. Si no hay pausas:
      - Para cada hora en drawTimes:
        * Crear registro Draw con:
          - gameId
          - templateId
          - scheduledAt = fecha + hora
          - status = "SCHEDULED"
5. Registrar en audit log
6. Emitir evento WebSocket "draws:generated"
```

**Ejemplo**:
```typescript
// Plantilla: "Triple A - Lunes a Viernes"
// daysOfWeek: [1,2,3,4,5]
// drawTimes: ["08:00", "09:00", "10:00", "11:00"]
// Si hoy es Lunes (1), se crearán 4 sorteos
```

**Consideraciones**:
- Verificar que no existan sorteos ya creados para esa fecha/hora/juego
- Manejar zonas horarias correctamente
- Log de errores si falla

---

### 2. CloseDrawJob

**Frecuencia**: Cada minuto  
**Cron**: `* * * * *`

**Función**: Cerrar sorteos 5 minutos antes de su hora programada y preseleccionar número ganador

**Lógica**:
```typescript
1. Calcular timestamp: ahora + 5 minutos
2. Buscar sorteos con:
   - status = "SCHEDULED"
   - scheduledAt entre ahora y ahora + 5 minutos
3. Para cada sorteo encontrado:
   a. Obtener todos los GameItems activos del juego
   b. Seleccionar uno aleatoriamente (Math.random)
   c. Actualizar sorteo:
      - status = "CLOSED"
      - preselectedItemId = item seleccionado
      - closedAt = timestamp actual
   d. Notificar a administradores via Telegram:
      - "🔒 Sorteo CERRADO: [Juego] - [Hora]"
      - "Número preseleccionado: [número] - [nombre]"
      - "Para cambiarlo: /cambiar [drawId] [nuevo_número]"
   e. Emitir evento WebSocket "draw:closed"
   f. Registrar en audit log
```

**Ejemplo de notificación Telegram**:
```
🔒 SORTEO CERRADO
Triple A - 08:00 AM
Preselección: 123 - Mariposa
Faltan 5 minutos para el sorteo

Para cambiar: /cambiar abc-123 456
```

**Consideraciones**:
- Solo procesar sorteos que no hayan sido cerrados previamente
- Manejar errores de selección aleatoria
- Retry en caso de fallo de notificación Telegram

---

### 3. ExecuteDrawJob

**Frecuencia**: Cada minuto  
**Cron**: `* * * * *`

**Función**: Ejecutar sorteos en su hora programada, confirmar ganador y generar imagen

**Lógica**:
```typescript
1. Obtener timestamp actual
2. Buscar sorteos con:
   - status = "CLOSED"
   - scheduledAt <= timestamp actual
3. Para cada sorteo encontrado:
   a. Confirmar ganador final:
      - winnerItemId = preselectedItemId
      - (si fue cambiado manualmente, ya estará actualizado)
   b. Actualizar sorteo:
      - status = "DRAWN"
      - drawnAt = timestamp actual
   c. Generar imagen del ganador:
      - Llamar a ImageGeneratorService
      - Guardar imagen en storage
      - Actualizar sorteo.imageUrl
   d. Crear registros DrawPublication:
      - Para cada canal activo en ChannelConfig
      - status = "PENDING"
   e. Actualizar sorteo:
      - status = "PUBLISHED" (marcado para publicación)
   f. Emitir evento WebSocket "draw:winner-selected"
   g. Registrar en audit log
```

**Flujo de generación de imagen**:
```typescript
1. Obtener configuración de imagen del juego (game.config.imageTemplate)
2. Cargar template base
3. Componer capas:
   - Fondo
   - Logo/marca de agua
   - Nombre del juego
   - Hora y fecha
   - Número ganador (grande)
   - Nombre del número
4. Generar PNG con Sharp
5. Guardar en: /storage/images/draws/{gameSlug}/{year}/{month}/{drawId}.png
6. Retornar URL relativa
```

**Consideraciones**:
- Manejar errores de generación de imagen (usar imagen default)
- Verificar espacio en disco antes de guardar
- Timeout en generación de imagen (max 10 segundos)

---

### 4. PublishDrawJob

**Frecuencia**: Cada 30 segundos  
**Cron**: `*/30 * * * * *` (segundos)

**Función**: Publicar sorteos ejecutados en los diferentes canales

**Lógica**:
```typescript
1. Buscar DrawPublication con:
   - status = "PENDING"
   - Ordenar por createdAt ASC
   - Limit: 10 (procesar en lotes)
2. Para cada publicación:
   a. Obtener configuración del canal (ChannelConfig)
   b. Cargar imagen del sorteo
   c. Preparar texto del mensaje:
      - Nombre del juego
      - Hora del sorteo
      - Número ganador
      - Nombre del número
   d. Según el tipo de canal, llamar al publisher correspondiente:
      - TelegramPublisher
      - WhatsAppPublisher
      - FacebookPublisher
      - InstagramPublisher
      - TikTokPublisher
   e. Si éxito:
      - Actualizar publicación:
        * status = "SENT"
        * sentAt = timestamp
        * externalId = ID del mensaje en el canal
   f. Si fallo:
      - Actualizar publicación:
        * status = "FAILED"
        * error = mensaje de error
        * retries += 1
   g. Emitir evento WebSocket según resultado
```

**Formato de mensaje**:
```
🎰 RESULTADO SORTEO 🎰

🎲 Triple A
⏰ 08:00 AM - 01/10/2025

🏆 GANADOR: 123
✨ Mariposa

🔗 www.loteria.com
```

**Consideraciones**:
- Rate limiting por canal (no enviar más de X mensajes por minuto)
- Timeout por publicación (max 30 segundos)
- No reintentar inmediatamente, dejar para RetryFailedPublicationsJob

---

### 5. RetryFailedPublicationsJob

**Frecuencia**: Cada 5 minutos  
**Cron**: `*/5 * * * *`

**Función**: Reintentar publicaciones que fallaron

**Lógica**:
```typescript
1. Buscar DrawPublication con:
   - status = "FAILED"
   - retries < 3
   - updatedAt < (ahora - 5 minutos)
2. Para cada publicación:
   a. Resetear status a "PENDING"
   b. Incrementar retries
   c. Dejar que PublishDrawJob la procese
3. Si retries >= 3:
   - Marcar como "SKIPPED"
   - Enviar alerta a administradores
   - Registrar en logs
```

**Consideraciones**:
- Backoff exponencial entre reintentos (5min, 10min, 15min)
- Después de 3 intentos, notificar a admins vía Telegram

---

### 6. CleanupOldDataJob

**Frecuencia**: Diario a las 02:00 AM  
**Cron**: `0 2 * * *`

**Función**: Limpiar datos antiguos del sistema

**Lógica**:
```typescript
1. Limpiar sorteos antiguos:
   - Buscar sorteos con status = "PUBLISHED" o "CANCELLED"
   - scheduledAt < (ahora - 90 días)
   - Actualizar: archivar o eliminar según política

2. Limpiar audit logs antiguos:
   - Buscar logs con createdAt < (ahora - 180 días)
   - Eliminar o archivar

3. Limpiar imágenes antiguas:
   - Buscar imágenes en filesystem > 90 días
   - Verificar si están referenciadas en BD
   - Eliminar si no están referenciadas

4. Reportar estadísticas:
   - Cantidad de registros limpiados
   - Espacio liberado
   - Log en archivo
```

**Consideraciones**:
- Ejecutar en horas de bajo tráfico
- Hacer backup antes de eliminar
- Mantener logs de lo eliminado

---

## Gestión de Jobs

### Configuración Centralizada

```typescript
// src/jobs/config.ts
export const JOB_SCHEDULES = {
  GENERATE_DAILY_DRAWS: '5 0 * * *',      // 00:05 AM
  CLOSE_DRAWS: '* * * * *',               // Cada minuto
  EXECUTE_DRAWS: '* * * * *',             // Cada minuto
  PUBLISH_DRAWS: '*/30 * * * * *',        // Cada 30 segundos
  RETRY_FAILED_PUBLICATIONS: '*/5 * * * *', // Cada 5 minutos
  CLEANUP_OLD_DATA: '0 2 * * *'           // 02:00 AM
};

export const JOB_CONFIG = {
  CLOSE_DRAW_MINUTES_BEFORE: 5,
  MAX_PUBLICATION_RETRIES: 3,
  PUBLICATION_BATCH_SIZE: 10,
  OLD_DATA_RETENTION_DAYS: 90,
  AUDIT_LOG_RETENTION_DAYS: 180
};
```

---

### Estructura de Job

```typescript
// src/jobs/BaseJob.ts
export abstract class BaseJob {
  protected name: string;
  protected schedule: string;
  protected task: cron.ScheduledTask | null = null;
  
  constructor(name: string, schedule: string) {
    this.name = name;
    this.schedule = schedule;
  }
  
  abstract execute(): Promise<void>;
  
  start() {
    this.task = cron.schedule(this.schedule, async () => {
      const startTime = Date.now();
      logger.info(`[${this.name}] Started`);
      
      try {
        await this.execute();
        const duration = Date.now() - startTime;
        logger.info(`[${this.name}] Completed in ${duration}ms`);
      } catch (error) {
        logger.error(`[${this.name}] Error:`, error);
        // Enviar alerta a administradores
      }
    });
    
    logger.info(`[${this.name}] Scheduled: ${this.schedule}`);
  }
  
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info(`[${this.name}] Stopped`);
    }
  }
}
```

---

### Ejemplo de Job Implementado

```typescript
// src/jobs/CloseDrawJob.ts
import { BaseJob } from './BaseJob';
import { prisma } from '../config/database';
import { TelegramService } from '../services/TelegramService';
import { WebSocketService } from '../services/WebSocketService';

export class CloseDrawJob extends BaseJob {
  constructor() {
    super('CloseDrawJob', JOB_SCHEDULES.CLOSE_DRAWS);
  }
  
  async execute(): Promise<void> {
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    const now = new Date();
    
    const drawsToClose = await prisma.draw.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: now,
          lte: fiveMinutesFromNow
        }
      },
      include: {
        game: {
          include: {
            items: {
              where: { isActive: true }
            }
          }
        }
      }
    });
    
    for (const draw of drawsToClose) {
      // Seleccionar número aleatorio
      const items = draw.game.items;
      const randomItem = items[Math.floor(Math.random() * items.length)];
      
      // Actualizar sorteo
      const updatedDraw = await prisma.draw.update({
        where: { id: draw.id },
        data: {
          status: 'CLOSED',
          preselectedItemId: randomItem.id,
          closedAt: new Date()
        },
        include: {
          game: true,
          preselectedItem: true
        }
      });
      
      // Notificar a administradores
      await TelegramService.notifyAdmins(
        `🔒 SORTEO CERRADO\n` +
        `${updatedDraw.game.name} - ${format(updatedDraw.scheduledAt, 'HH:mm')}\n` +
        `Preselección: ${updatedDraw.preselectedItem.number} - ${updatedDraw.preselectedItem.name}\n` +
        `\nPara cambiar: /cambiar ${draw.id} [número]`
      );
      
      // Emitir WebSocket
      WebSocketService.emit('draw:closed', {
        drawId: updatedDraw.id,
        gameId: updatedDraw.gameId,
        preselectedItem: updatedDraw.preselectedItem
      });
      
      logger.info(`Draw ${draw.id} closed. Preselected: ${randomItem.number}`);
    }
    
    if (drawsToClose.length > 0) {
      logger.info(`Closed ${drawsToClose.length} draws`);
    }
  }
}
```

---

### Inicialización de Jobs

```typescript
// src/jobs/index.ts
import { GenerateDailyDrawsJob } from './GenerateDailyDrawsJob';
import { CloseDrawJob } from './CloseDrawJob';
import { ExecuteDrawJob } from './ExecuteDrawJob';
import { PublishDrawJob } from './PublishDrawJob';
import { RetryFailedPublicationsJob } from './RetryFailedPublicationsJob';
import { CleanupOldDataJob } from './CleanupOldDataJob';

export class JobManager {
  private jobs: BaseJob[] = [];
  
  initialize() {
    this.jobs = [
      new GenerateDailyDrawsJob(),
      new CloseDrawJob(),
      new ExecuteDrawJob(),
      new PublishDrawJob(),
      new RetryFailedPublicationsJob(),
      new CleanupOldDataJob()
    ];
    
    this.jobs.forEach(job => job.start());
    logger.info(`Initialized ${this.jobs.length} jobs`);
  }
  
  shutdown() {
    this.jobs.forEach(job => job.stop());
    logger.info('All jobs stopped');
  }
}

// En server.ts
const jobManager = new JobManager();
jobManager.initialize();

process.on('SIGTERM', () => {
  jobManager.shutdown();
  process.exit(0);
});
```

---

## Monitoreo de Jobs

### Métricas a Rastrear

1. **Ejecuciones**:
   - Cantidad de ejecuciones por día
   - Duración promedio
   - Tasa de éxito/fallo

2. **Sorteos**:
   - Sorteos generados por día
   - Sorteos cerrados a tiempo
   - Sorteos ejecutados a tiempo
   - Latencia entre hora programada y ejecución real

3. **Publicaciones**:
   - Tasa de éxito por canal
   - Tiempo promedio de publicación
   - Reintentos necesarios

### Dashboard de Monitoreo

```typescript
// GET /api/jobs/status
{
  "jobs": [
    {
      "name": "CloseDrawJob",
      "lastRun": "2025-10-01T07:55:00Z",
      "nextRun": "2025-10-01T07:56:00Z",
      "status": "running",
      "lastDuration": 245,
      "successRate": 99.8
    }
  ]
}
```

---

## Alertas

### Condiciones de Alerta

1. **Job no se ejecuta**: Si pasa más de 2x su frecuencia esperada
2. **Alto ratio de fallos**: Si > 10% de ejecuciones fallan
3. **Latencia alta**: Si ejecución tarda > 5 minutos
4. **Sorteo no cerrado**: Si sorteo no se cierra 5 min antes
5. **Sorteo no ejecutado**: Si sorteo no se ejecuta a su hora
6. **Publicación falla 3 veces**: Después de 3 reintentos

### Canales de Alerta

- Telegram (administradores)
- Email (opcional)
- Logs (siempre)
