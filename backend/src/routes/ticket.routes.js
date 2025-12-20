import express from 'express';
import ticketController from '../controllers/ticket.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', ticketController.create.bind(ticketController));
router.get('/my-tickets', ticketController.getMyTickets.bind(ticketController));
router.get('/:id', ticketController.getById.bind(ticketController));
router.delete('/:id', ticketController.cancel.bind(ticketController));

router.use(authorize('ADMIN'));

router.get('/', ticketController.getAll.bind(ticketController));
router.get('/by-draw/:drawId', ticketController.getByDraw.bind(ticketController));
router.get('/stats/:drawId', ticketController.getStatsByDraw.bind(ticketController));

export default router;
