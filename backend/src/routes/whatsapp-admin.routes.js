import express from 'express';
import { 
  getWhatsAppStatus,
  getWhatsAppQR,
  getWhatsAppGroups,
  initializeWhatsApp,
  logoutWhatsApp,
  destroyWhatsApp,
  sendTestMessage
} from '../controllers/whatsapp-admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/status', authenticate, getWhatsAppStatus);
router.get('/qr', authenticate, getWhatsAppQR);
router.get('/groups', authenticate, getWhatsAppGroups);
router.post('/initialize', authenticate, initializeWhatsApp);
router.post('/logout', authenticate, logoutWhatsApp);
router.post('/destroy', authenticate, destroyWhatsApp);
router.post('/test', authenticate, sendTestMessage);
router.post('/send-test', authenticate, sendTestMessage);

export default router;
