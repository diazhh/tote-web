import express from 'express';
import rateLimit from 'express-rate-limit';
import portalController from '../controllers/portal.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireProvider } from '../middlewares/provider-scope.middleware.js';

const router = express.Router();

const portalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, espere un momento.' },
});

router.use(portalLimiter);
router.use(authenticate, requireProvider);

router.get('/me', portalController.getMe);
router.get('/tickets', portalController.listTickets);
router.get('/tickets/:id', portalController.getTicket);
router.get('/draws', portalController.listDraws);
router.get('/draws/:id', portalController.getDraw);

export default router;
