import express from 'express';
import pageVisitController from '../controllers/page-visit.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/track', optionalAuth, pageVisitController.trackVisit);

router.patch('/:visitId/duration', pageVisitController.updateVisitDuration);

router.get('/stats', authenticate, pageVisitController.getVisitStats);

router.get('/date-range', authenticate, pageVisitController.getVisitsByDateRange);

export default router;
