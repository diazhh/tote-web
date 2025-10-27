import express from 'express';
import * as imageController from '../controllers/imageController.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Serve image file (public)
router.get('/:filename', imageController.serveImage);

// Check if image exists for a draw
router.get('/check/:drawId', authenticate, imageController.checkImage);

// Generate image for a draw
router.post('/generate/:drawId', authenticate, imageController.generateImage);

// Regenerate image for a draw
router.post('/regenerate/:drawId', authenticate, imageController.regenerateImage);

// Generate images for all draws of a specific date
router.post('/generate-daily/:date', authenticate, imageController.generateDailyImages);

// Generate pyramid image for a date
router.post('/pyramid/:date', authenticate, imageController.generatePyramid);

// Generate recommendations image for a game and date
router.post('/recommendations/:gameId/:date', authenticate, imageController.generateRecommendations);

export default router;
