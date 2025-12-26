import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/public/images/test/:filename
 * Servir imágenes de prueba públicamente
 */
router.get('/test/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validar filename para evitar path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }

    const imagePath = path.join(__dirname, '../../storage/test', filename);
    
    // Verificar que el archivo existe
    try {
      await fs.access(imagePath);
    } catch (error) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // Determinar tipo de contenido
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // Configurar headers para cache
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 horas
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Enviar archivo
    res.sendFile(imagePath);
    
  } catch (error) {
    logger.error('Error sirviendo imagen de prueba:', error);
    res.status(500).json({ error: 'Error al servir imagen' });
  }
});

/**
 * GET /api/public/images/draw/:drawId
 * Servir imagen de sorteo públicamente
 */
router.get('/draw/:drawId', async (req, res) => {
  try {
    const { drawId } = req.params;
    
    // Buscar sorteo en la base de datos
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: {
        id: true,
        imageUrl: true,
        imageGenerated: true,
        game: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });

    if (!draw) {
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    if (!draw.imageGenerated || !draw.imageUrl) {
      return res.status(404).json({ error: 'Imagen no generada para este sorteo' });
    }

    // Extraer filename de la URL
    // imageUrl puede ser algo como: /storage/results/lotoanimalito-2024-12-25-08-00.png
    const filename = path.basename(draw.imageUrl);
    const imagePath = path.join(__dirname, '../../storage/results', filename);
    
    // Verificar que el archivo existe
    try {
      await fs.access(imagePath);
    } catch (error) {
      logger.error(`Imagen no encontrada en disco: ${imagePath}`);
      return res.status(404).json({ error: 'Archivo de imagen no encontrado' });
    }

    // Determinar tipo de contenido
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // Configurar headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hora
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Draw-Id', draw.id);
    res.setHeader('X-Game-Name', draw.game.name);
    
    // Enviar archivo
    res.sendFile(imagePath);
    
  } catch (error) {
    logger.error('Error sirviendo imagen de sorteo:', error);
    res.status(500).json({ error: 'Error al servir imagen' });
  }
});

/**
 * GET /api/public/images/info/draw/:drawId
 * Obtener información de la imagen del sorteo (sin descargar)
 */
router.get('/info/draw/:drawId', async (req, res) => {
  try {
    const { drawId } = req.params;
    
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: {
        id: true,
        imageUrl: true,
        imageGenerated: true,
        imageGeneratedAt: true,
        drawDate: true,
        drawTime: true,
        game: {
          select: {
            name: true,
            slug: true
          }
        },
        winnerItem: {
          select: {
            number: true,
            name: true
          }
        }
      }
    });

    if (!draw) {
      return res.status(404).json({ error: 'Sorteo no encontrado' });
    }

    res.json({
      success: true,
      data: {
        drawId: draw.id,
        game: draw.game.name,
        gameSlug: draw.game.slug,
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
        winner: draw.winnerItem ? {
          number: draw.winnerItem.number,
          name: draw.winnerItem.name
        } : null,
        image: {
          generated: draw.imageGenerated,
          generatedAt: draw.imageGeneratedAt,
          url: draw.imageUrl,
          publicUrl: draw.imageGenerated ? `/api/public/images/draw/${draw.id}` : null
        }
      }
    });
    
  } catch (error) {
    logger.error('Error obteniendo info de imagen:', error);
    res.status(500).json({ error: 'Error al obtener información' });
  }
});

export default router;
