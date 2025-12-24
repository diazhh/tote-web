import sharp from 'sharp';

class TestImageGeneratorService {
  /**
   * Genera una imagen negra 1080x1080 con texto de prueba
   * @returns {Promise<Buffer>} Buffer de la imagen PNG
   */
  async generateTestImage() {
    const width = 1080;
    const height = 1080;

    // SVG con texto centrado
    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#000000"/>
        <text
          x="50%"
          y="45%"
          font-family="Arial, sans-serif"
          font-size="60"
          font-weight="bold"
          fill="#FFFFFF"
          text-anchor="middle"
          dominant-baseline="middle">
          PRUEBA DE ENVÍO
        </text>
        <text
          x="50%"
          y="55%"
          font-family="Arial, sans-serif"
          font-size="30"
          fill="#CCCCCC"
          text-anchor="middle"
          dominant-baseline="middle">
          ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
        </text>
      </svg>
    `;

    try {
      const imageBuffer = await sharp(Buffer.from(svg))
        .png()
        .toBuffer();

      return imageBuffer;
    } catch (error) {
      console.error('Error generando imagen de prueba:', error);
      throw new Error('No se pudo generar la imagen de prueba');
    }
  }

  /**
   * Genera y guarda imagen de prueba en disco
   * @param {string} outputPath - Ruta donde guardar
   * @returns {Promise<string>} Ruta del archivo guardado
   */
  async generateAndSaveTestImage(outputPath) {
    const imageBuffer = await this.generateTestImage();
    await sharp(imageBuffer).toFile(outputPath);
    return outputPath;
  }

  /**
   * Genera imagen de prueba en base64
   * @returns {Promise<string>} Imagen en base64
   */
  async generateTestImageBase64() {
    const imageBuffer = await this.generateTestImage();
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }
}

export default new TestImageGeneratorService();
