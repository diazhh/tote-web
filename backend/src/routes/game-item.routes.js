/**
 * Rutas para gestión de items de juegos
 */

import express from 'express';
import gameItemController from '../controllers/game-item.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas de items son admin (lecturas públicas pasan por /api/games/:id/items)
router.use(authenticate, authorize('ADMIN'));

router.get('/:id', gameItemController.getItemById.bind(gameItemController));
router.post('/', gameItemController.createItem.bind(gameItemController));
router.put('/:id', gameItemController.updateItem.bind(gameItemController));
router.delete('/:id', gameItemController.deleteItem.bind(gameItemController));

export default router;
