/**
 * Rutas para gestión de items de juegos
 */

import express from 'express';
import gameItemController from '../controllers/game-item.controller.js';

const router = express.Router();

// GET /api/items/:id
router.get('/:id', gameItemController.getItemById.bind(gameItemController));

// POST /api/items
router.post('/', gameItemController.createItem.bind(gameItemController));

// PUT /api/items/:id
router.put('/:id', gameItemController.updateItem.bind(gameItemController));

// DELETE /api/items/:id
router.delete('/:id', gameItemController.deleteItem.bind(gameItemController));

export default router;
