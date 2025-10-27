# Sistema de Generación de Videos - Implementación Completa

## ✅ Lo que se ha implementado

### 1. Servicio de Generación de Videos
**Archivo**: `src/services/video-generator.service.js`

Funcionalidades:
- ✅ `initialize()`: Crea directorios necesarios
- ✅ `generateSimpleVideo()`: Genera video simple de 10 segundos desde imagen estática
- ✅ `generateAnimatedVideo()`: Genera video animado con intro → countdown → resultado → outro
- ✅ `getPublicUrl()`: Obtiene URL pública del video
- ✅ `cleanupOldVideos()`: Limpia videos antiguos
- ✅ Soporte para formato vertical 1080x1920 (TikTok/Reels)
- ✅ Soporte para música de fondo
- ✅ Manejo de errores y logging completo
- ✅ Configuración flexible (duración, FPS, calidad, etc.)

### 2. Script de Prueba
**Archivo**: `src/scripts/test-video-generation.js`

Funcionalidades:
- ✅ Busca un sorteo ejecutado por cada juego
- ✅ Genera video simple para cada sorteo
- ✅ Actualiza la base de datos con `videoUrl` y `videoGeneratedAt`
- ✅ Genera resumen detallado con estadísticas
- ✅ Manejo de errores por juego

### 3. Script de Verificación
**Archivo**: `src/scripts/check-video-requirements.js`

Verifica:
- ✅ Instalación de FFmpeg
- ✅ Instalación de fluent-ffmpeg
- ✅ Existencia de directorios
- ✅ Assets para videos animados
- ✅ Permisos de escritura
- ✅ Espacio en disco
- ✅ Sorteos disponibles en BD

### 4. Esquema de Base de Datos
**Archivo**: `prisma/schema.prisma`

Campos agregados al modelo `Draw`:
```prisma
videoUrl            String?       // URL del video generado
videoGeneratedAt    DateTime?     // Cuando se generó el video
videoError          String?       // Error en generación de video
```

Migración aplicada: ✅ `20251027160451_add_video_fields_to_draw`

### 5. Scripts NPM
**Archivo**: `package.json`

Scripts agregados:
```json
"test:video": "node src/scripts/test-video-generation.js"
"check:ffmpeg": "node src/scripts/check-video-requirements.js"
```

### 6. Documentación
**Archivo**: `GENERACION_VIDEOS.md`

Incluye:
- ✅ Requisitos e instalación de FFmpeg
- ✅ Tipos de videos (simple vs animado)
- ✅ Estructura de archivos
- ✅ Ejemplos de uso
- ✅ Configuración detallada
- ✅ Integración con el sistema
- ✅ Publicación en redes sociales
- ✅ Guía para crear assets
- ✅ Limpieza de videos antiguos
- ✅ Troubleshooting

### 7. Dependencias
**Instaladas**:
- ✅ `fluent-ffmpeg@^2.1.3`: Wrapper de FFmpeg para Node.js

## ⚠️ Requisitos Pendientes

### 1. FFmpeg
**Estado**: ❌ NO instalado

**Instalar**:
```bash
# Ubuntu/Debian (WSL)
sudo apt-get update
sudo apt-get install -y ffmpeg

# Verificar
ffmpeg -version
```

Sin FFmpeg, el sistema NO puede generar videos.

### 2. Assets para Videos Animados (Opcional)
**Estado**: ❌ NO creados

Si quieres usar `generateAnimatedVideo()`, crear en `storage/video-assets/`:
- `intro.png` (1080x1920)
- `countdown-3.png` (1080x1920)
- `countdown-2.png` (1080x1920)
- `countdown-1.png` (1080x1920)
- `outro.png` (1080x1920)
- `background-music.mp3` (12-15 segundos)

**Nota**: Sin assets, el sistema usará automáticamente `generateSimpleVideo()` como fallback.

### 3. Sorteos con Imágenes
**Estado**: ⚠️ Existen sorteos pero sin imágenes

Los sorteos actuales tienen `imageUrl: null`. Necesitas:
1. Asegurarte que el job de generación de imágenes esté funcionando
2. Ejecutar sorteos que generen imágenes
3. O regenerar imágenes para sorteos existentes

## 🚀 Cómo Probar

### Paso 1: Instalar FFmpeg
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

### Paso 2: Verificar Requisitos
```bash
npm run check:ffmpeg
```

Deberías ver:
```
✅ SISTEMA LISTO PARA GENERAR VIDEOS
```

### Paso 3: Asegurar que Hay Sorteos con Imágenes

Opción A - Esperar a que se ejecuten sorteos:
```bash
# Los jobs automáticos generarán sorteos con imágenes
npm run dev
```

Opción B - Generar imagen manualmente para sorteos existentes:
```javascript
// Ejecutar en consola Node.js o crear script
import { generateDrawImage } from './src/services/imageService.js';
import { prisma } from './src/lib/prisma.js';

// Obtener sorteos publicados
const draws = await prisma.draw.findMany({
  where: { status: 'PUBLISHED' },
  include: { game: true, winnerItem: true },
  take: 3
});

// Generar imágenes
for (const draw of draws) {
  await generateDrawImage(draw.id);
}
```

### Paso 4: Ejecutar Prueba de Video
```bash
npm run test:video
```

Esto generará un video por cada juego activo.

## 🔄 Integración con el Sistema Existente

### Opción 1: Integrar en execute-draw.job.js

Modificar `src/jobs/execute-draw.job.js` después de generar la imagen:

```javascript
// Después de la línea 148 (después de generar imagen)
// Generar video del sorteo
if (updatedDraw.imageUrl) {
  try {
    const videoGeneratorService = await import('../services/video-generator.service.js');
    await videoGeneratorService.default.initialize();

    const videoPath = await videoGeneratorService.default.generateSimpleVideo(
      updatedDraw.imageUrl,
      updatedDraw.id,
      {
        duration: 10,
        width: 1080,
        height: 1920,
        fps: 30,
        quality: 23
      }
    );

    await prisma.draw.update({
      where: { id: updatedDraw.id },
      data: {
        videoUrl: videoPath,
        videoGeneratedAt: new Date()
      }
    });

    logger.info(`✅ Video generado para sorteo ${updatedDraw.id}`);
  } catch (videoError) {
    logger.error(`❌ Error generando video para sorteo ${updatedDraw.id}:`, videoError);
    await prisma.draw.update({
      where: { id: updatedDraw.id },
      data: { videoError: videoError.message }
    });
  }
}
```

### Opción 2: Crear Job Separado

Crear `src/jobs/generate-video.job.js`:

```javascript
import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import videoGeneratorService from '../services/video-generator.service.js';

class GenerateVideoJob {
  constructor() {
    this.cronExpression = '* * * * *'; // Cada minuto
    this.task = null;
  }

  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    });
    logger.info('✅ Job GenerateVideo iniciado');
  }

  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job GenerateVideo detenido');
    }
  }

  async execute() {
    try {
      // Buscar sorteos con imagen pero sin video
      const draws = await prisma.draw.findMany({
        where: {
          status: 'DRAWN',
          imageUrl: { not: null },
          videoUrl: null,
          videoError: null
        },
        take: 5 // Procesar máximo 5 por ejecución
      });

      if (draws.length === 0) return;

      logger.info(`🎬 Generando videos para ${draws.length} sorteo(s)...`);

      await videoGeneratorService.initialize();

      for (const draw of draws) {
        try {
          const videoPath = await videoGeneratorService.generateSimpleVideo(
            draw.imageUrl,
            draw.id,
            {
              duration: 10,
              width: 1080,
              height: 1920,
              fps: 30,
              quality: 23
            }
          );

          await prisma.draw.update({
            where: { id: draw.id },
            data: {
              videoUrl: videoPath,
              videoGeneratedAt: new Date()
            }
          });

          logger.info(`✅ Video generado: ${videoPath}`);
        } catch (error) {
          logger.error(`❌ Error generando video para sorteo ${draw.id}:`, error);
          await prisma.draw.update({
            where: { id: draw.id },
            data: { videoError: error.message }
          });
        }
      }
    } catch (error) {
      logger.error('❌ Error en GenerateVideoJob:', error);
    }
  }
}

export default new GenerateVideoJob();
```

Registrar en `src/jobs/index.js`:
```javascript
import generateVideoJob from './generate-video.job.js';

export function startAllJobs() {
  generateDailyDrawsJob.start();
  closeDrawJob.start();
  executeDrawJob.start();
  generateVideoJob.start();  // ← Agregar
  publishDrawJob.start();
  syncApiPlanningJob.start();
}
```

### Opción 3: Endpoint Manual

Crear endpoint en `src/routes/draws.js`:

```javascript
// POST /api/draws/:drawId/generate-video
router.post('/:drawId/generate-video', async (req, res) => {
  try {
    const { drawId } = req.params;

    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { game: true, winnerItem: true }
    });

    if (!draw) {
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    if (!draw.imageUrl) {
      return res.status(400).json({ error: 'El sorteo no tiene imagen' });
    }

    await videoGeneratorService.initialize();

    const videoPath = await videoGeneratorService.generateSimpleVideo(
      draw.imageUrl,
      draw.id
    );

    await prisma.draw.update({
      where: { id: drawId },
      data: {
        videoUrl: videoPath,
        videoGeneratedAt: new Date()
      }
    });

    res.json({
      success: true,
      videoUrl: videoGeneratorService.getPublicUrl(videoPath)
    });
  } catch (error) {
    logger.error('Error generando video:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 📊 Estado Actual del Sistema

```
✅ Código implementado:           100%
✅ Base de datos actualizada:     100%
✅ Scripts de prueba:             100%
✅ Documentación:                 100%
✅ Dependencias Node.js:          100%

⚠️  FFmpeg instalado:             0%
⚠️  Assets creados:               0% (opcional)
⚠️  Sorteos con imágenes:         0%
⚠️  Integración automática:       0% (pendiente elegir opción)
```

## 🎯 Próximos Pasos

1. **Instalar FFmpeg** (REQUERIDO)
   ```bash
   sudo apt-get update && sudo apt-get install -y ffmpeg
   ```

2. **Verificar sistema**
   ```bash
   npm run check:ffmpeg
   ```

3. **Generar imágenes para sorteos existentes** (si es necesario)

4. **Ejecutar prueba**
   ```bash
   npm run test:video
   ```

5. **Elegir método de integración** (Opción 1, 2 o 3)

6. **Crear endpoint para servir videos**
   - Agregar en `server.js` o `routes/api.js`:
   ```javascript
   app.use('/api/videos', express.static(path.join(__dirname, 'storage', 'videos')));
   ```

7. **Actualizar publicación en redes sociales** para usar videos en lugar de imágenes

## 💡 Recomendaciones

1. **Para Producción**: Usar la Opción 2 (Job separado) para no sobrecargar `execute-draw.job.js`

2. **Para Desarrollo**: Usar la Opción 3 (Endpoint manual) para generar videos bajo demanda

3. **Monitoreo**: Agregar métricas de:
   - Tiempo de generación de video
   - Tamaño de archivo generado
   - Tasa de éxito/fallo

4. **Optimización**:
   - Usar colas (Bull/BullMQ) para generación asíncrona
   - Implementar límite de videos generados por minuto
   - Considerar almacenamiento en CDN/S3 para videos

5. **Limpieza**: Programar limpieza automática de videos antiguos:
   ```javascript
   // En cron: diariamente a las 3 AM
   cron.schedule('0 3 * * *', async () => {
     await videoGeneratorService.cleanupOldVideos(7);
   });
   ```

## 📱 Publicación en Redes Sociales

Una vez que los videos estén generados, actualizar los servicios de publicación:

### Instagram Reels
Ya implementado en `src/services/instagram.service.js` con el método `publishVideo()`.

### TikTok
Pendiente implementación del servicio.

### WhatsApp
Puede enviar videos usando Baileys (similar a cómo envía imágenes).

### Telegram
Puede enviar videos con `sendVideo()` (agregar método al servicio).

### Facebook
Puede publicar videos con el Graph API (agregar método al servicio).

---

**¡El sistema de generación de videos está completamente implementado y listo para usar una vez que se instale FFmpeg!** 🎉
