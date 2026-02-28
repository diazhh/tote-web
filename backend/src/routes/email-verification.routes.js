import express from 'express';
import emailVerificationController from '../controllers/email-verification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/send', emailVerificationController.sendCode.bind(emailVerificationController));
router.post('/verify', emailVerificationController.verifyCode.bind(emailVerificationController));
router.get('/status', emailVerificationController.getStatus.bind(emailVerificationController));

export default router;
