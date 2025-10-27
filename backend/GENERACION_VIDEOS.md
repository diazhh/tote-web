# Sistema de Generación de Videos

Sistema para generar videos verticales (TikTok/Reels) a partir de las imágenes de los sorteos.

## 📋 Requisitos

### 1. FFmpeg

El sistema requiere FFmpeg instalado en el servidor:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y ffmpeg

# CentOS/RHEL
sudo yum install -y ffmpeg

# macOS
brew install ffmpeg

# Verificar instalación
ffmpeg -version
```

### 2. Dependencias Node.js

Ya instaladas:
- `fluent-ffmpeg`: Wrapper de FFmpeg para Node.js

## 🎬 Tipos de Videos

### Video Simple
- **Duración**: 10 segundos (configurable)
- **Contenido**: Imagen estática del sorteo
- **Formato**: 1080x1920 (vertical para TikTok/Reels)
- **Audio**: Música de fondo opcional
- **Uso**: Rápido para publicaciones automáticas

### Video Animado
- **Duración**: 12 segundos
- **Contenido**: Intro (2s) → Countdown 3-2-1 (3s) → Resultado (5s) → Outro (2s)
- **Transiciones**: Fades entre cada sección
- **Formato**: 1080x1920 (vertical)
- **Audio**: Música de fondo
- **Uso**: Publicaciones especiales con mayor producción

## 📁 Estructura de Archivos

```
backend/
├── storage/
│   ├── video-assets/        # Assets para videos animados
│   │   ├── intro.png
│   │   ├── countdown-3.png
│   │   ├── countdown-2.png
│   │   ├── countdown-1.png
│   │   ├── outro.png
│   │   └── background-music.mp3
│   ├── videos/               # Videos generados
│   │   └── draw-{id}.mp4
│   └── temp/                 # Archivos temporales
└── src/
    ├── services/
    │   └── video-generator.service.js
    └── scripts/
        └── test-video-generation.js
```

## 🚀 Uso

### Desde el código

```javascript
import videoGeneratorService from './services/video-generator.service.js';

// Inicializar (crear directorios)
await videoGeneratorService.initialize();

// Generar video simple
const videoPath = await videoGeneratorService.generateSimpleVideo(
  imageUrl,    // URL de la imagen del sorteo
  drawId,      // ID del sorteo
  {
    duration: 10,      // Duración en segundos
    width: 1080,       // Ancho
    height: 1920,      // Alto (vertical)
    fps: 30,           // Frames por segundo
    quality: 23,       // CRF: 0-51 (menor = mejor calidad)
    audioPath: null    // Path opcional de música
  }
);

// Generar video animado (requiere assets)
const videoPath = await videoGeneratorService.generateAnimatedVideo(
  draw,    // Objeto del sorteo completo
  drawId   // ID del sorteo
);

// Obtener URL pública
const publicUrl = videoGeneratorService.getPublicUrl(videoPath);
// Retorna: /api/videos/draw-{id}.mp4
```

### Script de prueba

```bash
# Ejecutar script de prueba
npm run test:video

# O directamente con Node
node src/scripts/test-video-generation.js
```

El script generará un video por cada juego activo usando el sorteo más reciente.

## ⚙️ Configuración

### Opciones de Video Simple

| Opción | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `duration` | number | 10 | Duración en segundos |
| `width` | number | 1080 | Ancho del video |
| `height` | number | 1920 | Alto del video |
| `fps` | number | 30 | Frames por segundo |
| `quality` | number | 23 | Calidad CRF (0-51, menor = mejor) |
| `audioPath` | string | null | Path de música de fondo |

### Presets de FFmpeg

El servicio usa el preset `fast` por defecto. Opciones disponibles:

- `ultrafast`: Muy rápido, calidad baja
- `fast`: Rápido, calidad buena ✅ (usado por defecto)
- `medium`: Velocidad media, calidad muy buena
- `slow`: Lento, calidad excelente

## 🔄 Integración con el Sistema

### 1. Generación Automática

Actualizar `execute-draw.job.js` para generar videos:

```javascript
// Después de generar la imagen
if (updatedDraw.imageUrl) {
  try {
    const videoPath = await videoGeneratorService.generateSimpleVideo(
      updatedDraw.imageUrl,
      updatedDraw.id
    );

    await prisma.draw.update({
      where: { id: updatedDraw.id },
      data: {
        videoUrl: videoPath,
        videoGeneratedAt: new Date()
      }
    });

    logger.info(`✅ Video generado: ${videoPath}`);
  } catch (error) {
    logger.error('❌ Error generando video:', error);
    await prisma.draw.update({
      where: { id: updatedDraw.id },
      data: { videoError: error.message }
    });
  }
}
```

### 2. Endpoint para Servir Videos

Agregar a `server.js` o crear ruta específica:

```javascript
import express from 'express';
import path from 'path';

const router = express.Router();

// Servir videos
router.get('/videos/:filename', (req, res) => {
  const { filename } = req.params;
  const videoPath = path.join(__dirname, '..', 'storage', 'videos', filename);

  res.sendFile(videoPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Video no encontrado' });
    }
  });
});

export default router;
```

### 3. Publicación en Redes Sociales

Los videos se pueden publicar en:

#### TikTok
- **Formato**: Vertical 1080x1920 ✅
- **Duración**: 10-15 segundos ✅
- **API**: TikTok for Developers

#### Instagram Reels
- **Formato**: Vertical 1080x1920 ✅
- **Duración**: 15-90 segundos ✅
- **API**: Instagram Graph API

```javascript
// Publicar video en Instagram
await instagramService.publishVideo(
  instanceId,
  draw.videoUrl,
  caption
);
```

#### Facebook
- **Formato**: 1080x1920 ✅
- **API**: Facebook Graph API

## 🎨 Crear Assets para Videos Animados

Para usar `generateAnimatedVideo()`, necesitas crear los assets:

### Dimensiones Recomendadas

Todos los assets deben ser **1080x1920** (vertical):

1. **intro.png**: Pantalla de introducción con logo/branding
2. **countdown-3.png**: Número "3"
3. **countdown-2.png**: Número "2"
4. **countdown-1.png**: Número "1"
5. **outro.png**: Pantalla final con call-to-action
6. **background-music.mp3**: Música de 12-15 segundos

### Herramientas Recomendadas

- **Canva**: Templates para redes sociales
- **Figma**: Diseño personalizado
- **Adobe Express**: Animaciones simples
- **Freepik**: Recursos gratuitos

### Ubicación

Colocar los assets en:
```
backend/storage/video-assets/
```

## 🧹 Limpieza de Videos Antiguos

El servicio incluye un método para limpiar videos antiguos:

```javascript
// Eliminar videos de más de 7 días
await videoGeneratorService.cleanupOldVideos(7);
```

Puedes ejecutarlo como un job programado:

```javascript
// En jobs/cleanup-videos.job.js
import cron from 'node-cron';
import videoGeneratorService from '../services/video-generator.service.js';

class CleanupVideosJob {
  start() {
    // Ejecutar diariamente a las 3 AM
    cron.schedule('0 3 * * *', async () => {
      await videoGeneratorService.cleanupOldVideos(7);
    });
  }
}
```

## 📊 Monitoreo

### Logs

El servicio usa el logger del sistema:

```javascript
logger.info('🎬 Generando video...');
logger.info('✅ Video generado exitosamente');
logger.error('❌ Error generando video:', error);
```

### Base de Datos

Los videos se registran en el modelo `Draw`:

```prisma
model Draw {
  // ...
  videoUrl            String?
  videoGeneratedAt    DateTime?
  videoError          String?
  // ...
}
```

Consultar videos generados:

```javascript
const drawsWithVideos = await prisma.draw.findMany({
  where: {
    videoUrl: { not: null }
  },
  select: {
    id: true,
    scheduledAt: true,
    videoUrl: true,
    videoGeneratedAt: true
  }
});
```

## ⚠️ Troubleshooting

### FFmpeg no encontrado

```
Error: FFmpeg/avconv not found
```

**Solución**: Instalar FFmpeg (ver sección Requisitos)

### Error de permisos en directorios

```
Error: EACCES: permission denied
```

**Solución**: Dar permisos a los directorios:

```bash
chmod -R 755 storage/
```

### Video con calidad baja

**Solución**: Ajustar el parámetro `quality` (CRF):

```javascript
// Mejor calidad (más lento, archivo más grande)
quality: 18

// Calidad estándar (más rápido, archivo más pequeño)
quality: 23
```

### Video no se genera

1. Verificar que FFmpeg esté instalado
2. Verificar que la imagen exista y sea accesible
3. Revisar logs del sistema
4. Verificar permisos de escritura en `storage/videos/`

## 🔗 Referencias

- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
- [TikTok for Developers](https://developers.tiktok.com/)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [Facebook Graph API](https://developers.facebook.com/docs/graph-api/)

## 📝 Notas

- Los videos se generan de forma **asíncrona**
- El proceso puede tardar 5-30 segundos dependiendo del sistema
- Se recomienda usar **colas** (Bull, BullMQ) para producción
- Los videos se guardan con el formato: `draw-{drawId}.mp4`
- La URL pública es: `/api/videos/draw-{drawId}.mp4`
