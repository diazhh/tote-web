const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/initialize', authenticate, whatsappController.initialize);
router.get('/status', authenticate, whatsappController.getStatus);
router.get('/qr', authenticate, whatsappController.getQRCode);
router.get('/groups', authenticate, whatsappController.getGroups);
router.get('/groups/:groupId', authenticate, whatsappController.getGroupDetails);
router.get('/contacts/:contactId', authenticate, whatsappController.getContactInfo);
router.post('/send/text', authenticate, whatsappController.sendTextMessage);
router.post('/send/image', authenticate, whatsappController.sendImage);
router.post('/send/multiple', authenticate, whatsappController.sendToMultiple);
router.post('/logout', authenticate, whatsappController.logout);
router.post('/destroy', authenticate, whatsappController.destroy);

module.exports = router;
