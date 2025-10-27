import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Servicio para generar videos de sorteos
 * Usa FFmpeg para convertir imágenes en videos verticales para TikTok/Reels
 */
class VideoGeneratorService {
  constructor() {
    this.projectRoot = path.join(__dirname, '..', '..');
    this.assetsPath = path.join(this.projectRoot, 'storage', 'video-assets');
    this.outputPath = path.join(this.projectRoot, 'storage', 'videos');
    this.tempPath = path.join(this.projectRoot, 'storage', 'temp');
  }

  /**
   * Inicializar directorios necesarios
   */
  async initialize() {
    try {
      await fs.mkdir(this.assetsPath, { recursive: true });
      await fs.mkdir(this.outputPath, { recursive: true });
      await fs.mkdir(this.tempPath, { recursive: true });

      logger.info('Directorios de video inicializados');
    } catch (error) {
      logger.error('Error inicializando directorios:', error);
      throw error;
    }
  }

  /**
   * Generar video simple desde una imagen
   * Ideal para empezar: imagen estática + duración fija
   *
   * @param {string} imageUrl - URL o path de la imagen
   * @param {string} drawId - ID del sorteo
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<string>} - Path del video generado
   */
  async generateSimpleVideo(imageUrl, drawId, options = {}) {
    const {
      duration = 10,           // Duración en segundos
      width = 1080,            // Ancho (vertical)
      height = 1920,           // Alto (vertical para TikTok/Reels)
      fps = 30,                // Frames por segundo
      quality = 23,            // CRF (0-51, menor = mejor calidad)
      audioPath = null         // Path de música de fondo (opcional)
    } = options;

    const outputFile = path.join(this.outputPath, `draw-${drawId}.mp4`);

    logger.info(`Generando video simple para sorteo ${drawId}...`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Input de imagen (loop)
      command
        .input(imageUrl)
        .inputOptions(['-loop 1', `-t ${duration}`]);

      // Si hay audio, agregarlo
      if (audioPath) {
        command.input(audioPath);
      }

      // Filtros de video
      command.videoFilters([
        // Escalar manteniendo aspect ratio
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        // Centrar con padding negro
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        // Asegurar aspect ratio 1:1 de píxeles
        'setsar=1'
      ]);

      // Opciones de salida
      const outputOptions = [
        '-c:v libx264',           // Codec de video
        '-preset fast',            // Preset de encoding (ultrafast, fast, medium, slow)
        `-crf ${quality}`,         // Calidad
        '-pix_fmt yuv420p',        // Formato de píxel (compatible con la mayoría de players)
        `-r ${fps}`                // FPS
      ];

      // Si hay audio
      if (audioPath) {
        outputOptions.push(
          '-c:a aac',               // Codec de audio
          '-b:a 128k',              // Bitrate de audio
          '-shortest'               // Terminar cuando acabe el input más corto
        );
      }

      command.outputOptions(outputOptions);

      // Output
      command.output(outputFile);

      // Event handlers
      command
        .on('start', (commandLine) => {
          logger.info('FFmpeg iniciado:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.info(`Progreso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info(`✅ Video generado exitosamente: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error('❌ Error generando video:', err.message);
          logger.error('FFmpeg stderr:', stderr);
          reject(err);
        });

      // Ejecutar
      command.run();
    });
  }

  /**
   * Generar video con animación completa
   * Incluye: intro → countdown → resultado → outro
   *
   * @param {Object} draw - Objeto del sorteo con imagen y datos
   * @param {string} drawId - ID del sorteo
   * @returns {Promise<string>} - Path del video generado
   */
  async generateAnimatedVideo(draw, drawId) {
    const outputFile = path.join(this.outputPath, `draw-${drawId}-animated.mp4`);

    logger.info(`Generando video animado para sorteo ${drawId}...`);

    // Verificar que existan los assets
    const introPath = path.join(this.assetsPath, 'intro.png');
    const countdown3Path = path.join(this.assetsPath, 'countdown-3.png');
    const countdown2Path = path.join(this.assetsPath, 'countdown-2.png');
    const countdown1Path = path.join(this.assetsPath, 'countdown-1.png');
    const outroPath = path.join(this.assetsPath, 'outro.png');
    const musicPath = path.join(this.assetsPath, 'background-music.mp3');

    // Verificar existencia de assets (opcional)
    const assetsExist = await this.checkAssets([
      introPath,
      countdown3Path,
      countdown2Path,
      countdown1Path,
      outroPath
    ]);

    if (!assetsExist) {
      logger.warn('Assets no encontrados, generando video simple en su lugar');
      return this.generateSimpleVideo(draw.imageUrl, drawId, {
        audioPath: await this.fileExists(musicPath) ? musicPath : null
      });
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Inputs
      command
        .input(introPath).inputOptions(['-loop 1', '-t 2'])          // 2 seg
        .input(countdown3Path).inputOptions(['-loop 1', '-t 1'])     // 1 seg
        .input(countdown2Path).inputOptions(['-loop 1', '-t 1'])     // 1 seg
        .input(countdown1Path).inputOptions(['-loop 1', '-t 1'])     // 1 seg
        .input(draw.imageUrl).inputOptions(['-loop 1', '-t 5'])      // 5 seg
        .input(outroPath).inputOptions(['-loop 1', '-t 2']);         // 2 seg

      // Audio (si existe)
      const hasMusicPromise = this.fileExists(musicPath);
      hasMusicPromise.then(hasMusic => {
        if (hasMusic) {
          command.input(musicPath);
        }
      });

      // Filtro complejo
      command.complexFilter([
        // Escalar y agregar fades a cada clip
        '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=1.5:d=0.5[v0]',
        '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=0.7:d=0.3[v1]',
        '[2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=0.7:d=0.3[v2]',
        '[3:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st=0.7:d=0.3[v3]',
        '[4:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=4.5:d=0.5[v4]',
        '[5:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=1.5:d=0.5[v5]',

        // Concatenar todos los clips
        '[v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0[vout]'
      ]);

      // Output options
      const outputOptions = [
        '-map [vout]',
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-t 12',
        '-r 30'
      ];

      // Si hay música, mapear audio
      hasMusicPromise.then(hasMusic => {
        if (hasMusic) {
          outputOptions.push('-map 6:a', '-c:a aac', '-b:a 128k', '-shortest');
        }
      });

      command.outputOptions(outputOptions);
      command.output(outputFile);

      // Events
      command
        .on('start', (commandLine) => {
          logger.info('FFmpeg iniciado (animado):', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.info(`Progreso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info(`✅ Video animado generado: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error('❌ Error generando video animado:', err.message);
          logger.error('FFmpeg stderr:', stderr);
          reject(err);
        });

      command.run();
    });
  }

  /**
   * Verificar si un archivo existe
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verificar si todos los assets existen
   */
  async checkAssets(assetPaths) {
    try {
      const checks = await Promise.all(
        assetPaths.map(p => this.fileExists(p))
      );
      return checks.every(exists => exists);
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener URL pública del video
   */
  getPublicUrl(videoPath) {
    // Asumiendo que los videos se sirven desde /api/videos/:filename
    const filename = path.basename(videoPath);
    return `/api/videos/${filename}`;
  }

  /**
   * Limpiar videos antiguos
   */
  async cleanupOldVideos(daysOld = 7) {
    try {
      const files = await fs.readdir(this.outputPath);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.outputPath, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          logger.info(`Video antiguo eliminado: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Error limpiando videos antiguos:', error);
    }
  }
}

export default new VideoGeneratorService();
