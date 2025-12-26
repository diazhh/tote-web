import { prisma } from '../lib/prisma.js';
import { generateResultImage, generatePyramidImage, generateRecommendationsImage, OUTPUT_PATH } from '../lib/imageGenerator.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Generate image for a specific draw
 */
export async function generateDrawImage(drawId) {
  try {
    // Get draw data
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        game: true,
        winnerItem: true
      }
    });

    if (!draw) {
      throw new Error('Draw not found');
    }

    if (!draw.winnerItem) {
      throw new Error('Draw has no result yet');
    }

    // Map game slug to numeric ID for image generator
    // IMPORTANTE: Usar slug en lugar de type porque los types están invertidos en BD
    const gameSlugMap = {
      'lotoanimalito': 1,    // LOTOANIMALITO usa plantilla Ruleta
      'lottopantera': 2,     // LOTTOPANTERA usa plantilla Animalitos
      'triple-pantera': 3    // TRIPLE PANTERA usa plantilla Triple
    };
    
    const numericGameId = gameSlugMap[draw.game.slug];
    if (!numericGameId) {
      throw new Error(`Unknown game slug: ${draw.game.slug}`);
    }

    // Generate image - Pass drawDate and drawTime directly
    const imageData = await generateResultImage({
      result: draw.winnerItem.number,
      drawDate: draw.drawDate,
      drawTime: draw.drawTime,
      gameId: numericGameId
    });

    // Update draw with image filename and status
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        imageUrl: `/api/images/${imageData.filename}`,
        imageGenerated: true,
        imageGeneratedAt: new Date(),
        imageError: null
      }
    });

    return {
      success: true,
      filename: imageData.filename,
      url: `/api/images/${imageData.filename}`
    };
  } catch (error) {
    console.error('Error generating draw image:', error);
    
    // Update draw with error status
    try {
      await prisma.draw.update({
        where: { id: drawId },
        data: {
          imageGenerated: false,
          imageError: error.message
        }
      });
    } catch (updateError) {
      console.error('Error updating draw with image error:', updateError);
    }
    
    throw error;
  }
}

/**
 * Check if image exists for a draw
 */
export async function checkDrawImage(drawId) {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: { imageUrl: true }
    });

    if (!draw || !draw.imageUrl) {
      return { exists: false };
    }

    // Extract filename from URL
    const filename = path.basename(draw.imageUrl);
    const imagePath = path.join(OUTPUT_PATH, filename);

    try {
      await fs.access(imagePath);
      return {
        exists: true,
        url: draw.imageUrl
      };
    } catch (err) {
      return { exists: false };
    }
  } catch (error) {
    console.error('Error checking draw image:', error);
    return { exists: false };
  }
}

/**
 * Regenerate image for a draw
 */
export async function regenerateDrawImage(drawId) {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: { imageUrl: true }
    });

    // Delete old image if exists
    if (draw && draw.imageUrl) {
      const filename = path.basename(draw.imageUrl);
      const imagePath = path.join(OUTPUT_PATH, filename);
      try {
        await fs.unlink(imagePath);
      } catch (err) {
        // Image doesn't exist, continue
      }
    }

    // Generate new image
    return await generateDrawImage(drawId);
  } catch (error) {
    console.error('Error regenerating draw image:', error);
    throw error;
  }
}

/**
 * Generate images for all draws of a specific date
 */
export async function generateDailyImages(date) {
  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const draws = await prisma.draw.findMany({
      where: {
        drawDate: {
          gte: startDate,
          lte: endDate
        },
        result: {
          not: null
        }
      }
    });

    const results = [];
    for (const draw of draws) {
      try {
        const result = await generateDrawImage(draw.id);
        results.push({
          drawId: draw.id,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          drawId: draw.id,
          success: false,
          error: error.message
        });
      }
    }

    return {
      total: draws.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  } catch (error) {
    console.error('Error generating daily images:', error);
    throw error;
  }
}

/**
 * Get image path for serving
 */
export async function getImagePath(filename) {
  const imagePath = path.join(OUTPUT_PATH, filename);
  
  try {
    await fs.access(imagePath);
    return imagePath;
  } catch (err) {
    throw new Error('Image not found');
  }
}

/**
 * Generate pyramid image for a specific date
 */
export async function generatePyramidForDate(date) {
  try {
    const imageData = await generatePyramidImage(new Date(date));
    
    return {
      success: true,
      filename: imageData.filename,
      url: `/api/images/${imageData.filename}`
    };
  } catch (error) {
    console.error('Error generating pyramid image:', error);
    throw error;
  }
}

/**
 * Generate recommendations image for a game and date
 */
export async function generateRecommendationsForDate(gameId, date) {
  try {
    const imageData = await generateRecommendationsImage(gameId, new Date(date));
    
    return {
      success: true,
      filename: imageData.filename,
      url: `/api/images/${imageData.filename}`
    };
  } catch (error) {
    console.error('Error generating recommendations image:', error);
    throw error;
  }
}
