import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(__dirname, '../../storage');
const TEST_PATH = path.join(STORAGE_PATH, 'test');

/**
 * Generar imagen negra de prueba
 */
export async function generateBlackTestImage(width = 1080, height = 1080) {
  try {
    // Asegurar que el directorio existe
    await fs.mkdir(TEST_PATH, { recursive: true });

    const filename = `test-black-${Date.now()}.png`;
    const filepath = path.join(TEST_PATH, filename);

    // Crear imagen negra con texto
    const svgImage = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#000000"/>
        <text x="50%" y="45%" font-family="Arial" font-size="48" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">
          IMAGEN DE PRUEBA
        </text>
        <text x="50%" y="55%" font-family="Arial" font-size="32" fill="#CCCCCC" text-anchor="middle" dominant-baseline="middle">
          ${new Date().toLocaleString('es-VE')}
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svgImage))
      .png()
      .toFile(filepath);

    return {
      success: true,
      filepath,
      filename,
      url: `/storage/test/${filename}`,
      publicUrl: `/api/public/images/test/${filename}`
    };
  } catch (error) {
    throw new Error(`Error al generar imagen de prueba: ${error.message}`);
  }
}

/**
 * Generar imagen de prueba con texto personalizado
 */
export async function generateCustomTestImage(text, width = 1080, height = 1080, bgColor = '#000000', textColor = '#FFFFFF') {
  try {
    await fs.mkdir(TEST_PATH, { recursive: true });

    const filename = `test-custom-${Date.now()}.png`;
    const filepath = path.join(TEST_PATH, filename);

    const svgImage = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="${bgColor}"/>
        <text x="50%" y="50%" font-family="Arial" font-size="48" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">
          ${text}
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svgImage))
      .png()
      .toFile(filepath);

    return {
      success: true,
      filepath,
      filename,
      url: `/storage/test/${filename}`,
      publicUrl: `/api/public/images/test/${filename}`
    };
  } catch (error) {
    throw new Error(`Error al generar imagen personalizada: ${error.message}`);
  }
}

export default {
  generateBlackTestImage,
  generateCustomTestImage
};
