import express from 'express';
import whatsappOtpController from '../controllers/whatsapp-otp.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('PLAYER'));

router.post('/send', whatsappOtpController.sendOtp.bind(whatsappOtpController));
router.post('/verify', whatsappOtpController.verifyOtp.bind(whatsappOtpController));
router.put('/notifications', whatsappOtpController.toggleNotifications.bind(whatsappOtpController));

export default router;
