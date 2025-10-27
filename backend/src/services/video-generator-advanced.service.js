import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import sharp from 'sharp';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Servicio avanzado para generar videos atractivos de resultados de sorteos
 * Genera videos con animaciones, textos y transiciones
 */
class VideoGeneratorAdvancedService {
  constructor() {
    this.videosPath = path.join(process.cwd(), 'storage', 'videos');
    this.tempPath = path.join(process.cwd(), 'storage', 'temp');
    this.assetsPath = path.join(process.cwd(), 'storage', 'video-assets');
  }

  async initialize() {
    await fs.mkdir(this.videosPath, { recursive: true });
    await fs.mkdir(this.tempPath, { recursive: true });
    await fs.mkdir(this.assetsPath, { recursive: true });
    logger.info('Directorios de video avanzado inicializados');
  }

  /**
   * Genera frames con texto overlay usando sharp
   */
  async generateTextFrame(text, options = {}) {
    const {
      width = 1080,
      height = 1920,
      backgroundColor = '#1a1a1a',
      textColor = '#ffffff',
      fontSize = 80,
      fontWeight = 'bold',
      position = 'center'
    } = options;

    // Crear SVG con el texto
    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="${backgroundColor}"/>
        <text
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="${fontWeight}"
          fill="${textColor}"
        >
          ${this.escapeXml(text)}
        </text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    return buffer;
  }

  /**
   * Genera frame de intro con el nombre del juego
   */
  async generateIntroFrame(gameName, options = {}) {
    const {
      width = 1080,
      height = 1920,
      backgroundColor = '#2563eb', // Azul
    } = options;

    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1e40af;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grad1)"/>

        <!-- Título -->
        <text
          x="50%"
          y="45%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="120"
          font-weight="bold"
          fill="#ffffff"
        >
          ${this.escapeXml(gameName)}
        </text>

        <!-- Subtítulo -->
        <text
          x="50%"
          y="55%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="60"
          fill="#e0e7ff"
        >
          Resultado del Sorteo
        </text>
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Genera frame con countdown
   */
  async generateCountdownFrame(number, options = {}) {
    const {
      width = 1080,
      height = 1920,
      backgroundColor = '#dc2626', // Rojo
    } = options;

    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="${backgroundColor}"/>

        <!-- Número grande -->
        <text
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Arial, sans-serif"
          font-size="400"
          font-weight="bold"
          fill="#ffffff"
        >
          ${number}
        </text>
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Genera frame del resultado con el ganador destacado
   */
  async generateWinnerFrame(draw, options = {}) {
    const {
      width = 1080,
      height = 1920,
      backgroundColor = '#16a34a', // Verde
    } = options;

    const winnerNumber = draw.winnerItem.number;
    const winnerName = draw.winnerItem.name;
    const gameName = draw.game.name;

    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="grad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#16a34a;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#15803d;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grad2)"/>

        <!-- Etiqueta superior -->
        <text
          x="50%"
          y="25%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="70"
          font-weight="bold"
          fill="#dcfce7"
        >
          ¡GANADOR!
        </text>

        <!-- Número ganador -->
        <text
          x="50%"
          y="45%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="200"
          font-weight="bold"
          fill="#ffffff"
        >
          ${this.escapeXml(winnerNumber)}
        </text>

        <!-- Nombre del ganador -->
        <text
          x="50%"
          y="60%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="90"
          font-weight="bold"
          fill="#ffffff"
        >
          ${this.escapeXml(winnerName)}
        </text>

        <!-- Nombre del juego -->
        <text
          x="50%"
          y="75%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="50"
          fill="#dcfce7"
        >
          ${this.escapeXml(gameName)}
        </text>
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Genera frame de outro/cierre
   */
  async generateOutroFrame(options = {}) {
    const {
      width = 1080,
      height = 1920,
      backgroundColor = '#7c3aed', // Púrpura
    } = options;

    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="${backgroundColor}"/>

        <!-- Mensaje -->
        <text
          x="50%"
          y="45%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="80"
          font-weight="bold"
          fill="#ffffff"
        >
          ¡Gracias por Participar!
        </text>

        <!-- Call to action -->
        <text
          x="50%"
          y="55%"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="50"
          fill="#e9d5ff"
        >
          Próximo sorteo pronto
        </text>
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Combina la imagen base con overlay de texto
   */
  async addTextOverlay(baseImagePath, overlayText, options = {}) {
    const {
      position = 'top',
      fontSize = 80,
      textColor = '#ffffff',
      backgroundColor = 'rgba(0, 0, 0, 0.7)',
      padding = 40
    } = options;

    const image = sharp(baseImagePath);
    const metadata = await image.metadata();

    // Crear overlay de texto
    const textHeight = 200;
    const yPosition = position === 'top' ? 0 : metadata.height - textHeight;

    const textSvg = `
      <svg width="${metadata.width}" height="${textHeight}">
        <rect width="${metadata.width}" height="${textHeight}" fill="${backgroundColor}"/>
        <text
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="${textColor}"
        >
          ${this.escapeXml(overlayText)}
        </text>
      </svg>
    `;

    const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

    return await image
      .composite([{
        input: textBuffer,
        top: yPosition,
        left: 0
      }])
      .toBuffer();
  }

  /**
   * Genera video completo con secuencia animada
   */
  async generateAnimatedResultVideo(draw, drawId) {
    try {
      logger.info(`Generando video animado para sorteo ${drawId}...`);

      await this.initialize();

      const tempDir = path.join(this.tempPath, `draw-${drawId}`);
      await fs.mkdir(tempDir, { recursive: true });

      // Estructura del video:
      // 0-2s: Intro con nombre del juego
      // 2-5s: Countdown 3-2-1
      // 5-10s: Resultado con ganador (puede incluir imagen base)
      // 10-12s: Outro

      const frames = [];

      // Frame 1: Intro (2 segundos = 60 frames a 30fps)
      logger.info('Generando frame de intro...');
      const introBuffer = await this.generateIntroFrame(draw.game.name);
      const introPath = path.join(tempDir, 'intro.png');
      await fs.writeFile(introPath, introBuffer);
      frames.push({ path: introPath, duration: 2 });

      // Frames 2-4: Countdown (1 segundo cada uno)
      for (let i = 3; i >= 1; i--) {
        logger.info(`Generando frame de countdown: ${i}...`);
        const countBuffer = await this.generateCountdownFrame(i);
        const countPath = path.join(tempDir, `countdown-${i}.png`);
        await fs.writeFile(countPath, countBuffer);
        frames.push({ path: countPath, duration: 1 });
      }

      // Frame 5: Resultado con ganador (5 segundos)
      logger.info('Generando frame del ganador...');

      // Si hay imagen base del sorteo, usarla con overlay
      let resultPath;
      if (draw.imageUrl && await this.fileExists(draw.imageUrl)) {
        const withOverlay = await this.addTextOverlay(
          draw.imageUrl,
          `${draw.winnerItem.number} - ${draw.winnerItem.name}`,
          { position: 'bottom', fontSize: 100 }
        );
        resultPath = path.join(tempDir, 'result-with-overlay.png');
        await fs.writeFile(resultPath, withOverlay);
      } else {
        const resultBuffer = await this.generateWinnerFrame(draw);
        resultPath = path.join(tempDir, 'result.png');
        await fs.writeFile(resultPath, resultBuffer);
      }
      frames.push({ path: resultPath, duration: 5 });

      // Frame 6: Outro (2 segundos)
      logger.info('Generando frame de outro...');
      const outroBuffer = await this.generateOutroFrame();
      const outroPath = path.join(tempDir, 'outro.png');
      await fs.writeFile(outroPath, outroBuffer);
      frames.push({ path: outroPath, duration: 2 });

      // Crear archivo de lista para FFmpeg
      const listPath = path.join(tempDir, 'frames.txt');
      const listContent = frames
        .map(f => `file '${f.path}'\nduration ${f.duration}`)
        .join('\n') + `\nfile '${frames[frames.length - 1].path}'`; // Repetir último frame

      await fs.writeFile(listPath, listContent);

      // Generar video con FFmpeg
      const outputPath = path.join(this.videosPath, `draw-${drawId}.mp4`);

      logger.info('Compilando video con FFmpeg...');

      await this.compileVideo(listPath, outputPath);

      // Limpiar archivos temporales
      await fs.rm(tempDir, { recursive: true, force: true });

      logger.info(`✅ Video generado exitosamente: ${outputPath}`);

      return outputPath;

    } catch (error) {
      logger.error('❌ Error generando video animado:', error);
      throw error;
    }
  }

  /**
   * Compila el video usando FFmpeg
   */
  compileVideo(inputListPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputListPath)
        .inputOptions([
          '-f concat',
          '-safe 0'
        ])
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-preset fast',
          '-crf 23',
          '-vf scale=1080:1920',
          '-r 30',
          '-vsync cfr' // Constant frame rate - importante para respetar duraciones
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          logger.info('Comando FFmpeg:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.info(`Progreso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info('Video compilado exitosamente');
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error('Error en FFmpeg:', err.message);
          logger.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Verifica si un archivo existe
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
   * Escapa caracteres especiales XML
   */
  escapeXml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Obtiene URL pública del video
   */
  getPublicUrl(videoPath) {
    const filename = path.basename(videoPath);
    return `/api/videos/${filename}`;
  }
}

export default new VideoGeneratorAdvancedService();
