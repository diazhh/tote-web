import express from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Rutas públicas
router.post('/login', authController.login.bind(authController));

// Rutas protegidas
router.get('/me', authenticate, authController.me.bind(authController));
router.post('/change-password', authenticate, authController.changePassword.bind(authController));
router.patch('/profile', authenticate, authController.updateProfile.bind(authController));

// Rutas de administración
router.post('/register', authenticate, authorize('ADMIN'), authController.register.bind(authController));
router.get('/users', authenticate, authorize('ADMIN'), authController.listUsers.bind(authController));
router.patch('/users/:id', authenticate, authorize('ADMIN'), authController.updateUser.bind(authController));

export default router;
