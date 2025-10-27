import * as imageService from '../services/imageService.js';

/**
 * Generate image for a specific draw
 */
export async function generateImage(req, res) {
  try {
    const { drawId } = req.params;
    
    const result = await imageService.generateDrawImage(drawId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in generateImage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Check if image exists for a draw
 */
export async function checkImage(req, res) {
  try {
    const { drawId } = req.params;
    
    const result = await imageService.checkDrawImage(drawId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in checkImage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Regenerate image for a draw
 */
export async function regenerateImage(req, res) {
  try {
    const { drawId } = req.params;
    
    const result = await imageService.regenerateDrawImage(drawId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in regenerateImage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate images for all draws of a specific date
 */
export async function generateDailyImages(req, res) {
  try {
    const { date } = req.params;
    
    const result = await imageService.generateDailyImages(new Date(date));
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in generateDailyImages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Serve image file
 */
export async function serveImage(req, res) {
  try {
    const { filename } = req.params;
    
    const imagePath = await imageService.getImagePath(filename);
    
    // Set cache control headers to prevent caching of 404s
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.sendFile(imagePath);
  } catch (error) {
    console.error('Error in serveImage:', error);
    
    // Set headers to prevent caching of 404 responses
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.status(404).json({
      success: false,
      error: 'Image not found'
    });
  }
}

/**
 * Generate pyramid image for a date
 */
export async function generatePyramid(req, res) {
  try {
    const { date } = req.params;
    
    const result = await imageService.generatePyramidForDate(date);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in generatePyramid:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generate recommendations image for a game and date
 */
export async function generateRecommendations(req, res) {
  try {
    const { gameId, date } = req.params;
    
    const result = await imageService.generateRecommendationsForDate(parseInt(gameId), date);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in generateRecommendations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
