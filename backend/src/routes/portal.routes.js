import express from 'express';
import portalController from '../controllers/portal.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireProvider } from '../middlewares/provider-scope.middleware.js';

const router = express.Router();

router.use(authenticate, requireProvider);

router.get('/me', portalController.getMe);
router.get('/tickets', portalController.listTickets);
router.get('/tickets/:id', portalController.getTicket);
router.get('/draws', portalController.listDraws);
router.get('/draws/:id', portalController.getDraw);

export default router;
