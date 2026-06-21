// backend/src/routes/telegram-miniapp.routes.js
import express from 'express';
import { authMiniApp } from '../controllers/telegram-miniapp.controller.js';

const router = express.Router();
// Ruta pública: su seguridad es el HMAC del initData (no authenticate).
router.post('/auth', authMiniApp);
export default router;
