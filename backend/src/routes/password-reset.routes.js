import express from 'express';
import passwordResetController from '../controllers/password-reset.controller.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/request', passwordResetController.requestReset.bind(passwordResetController));
router.post('/reset', passwordResetController.resetPassword.bind(passwordResetController));
router.get('/validate', passwordResetController.validateToken.bind(passwordResetController));

export default router;
