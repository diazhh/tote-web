import express from 'express';
import pagoMovilAccountController from '../controllers/pago-movil-account.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', pagoMovilAccountController.create.bind(pagoMovilAccountController));
router.get('/my-accounts', pagoMovilAccountController.getMyAccounts.bind(pagoMovilAccountController));
router.get('/default', pagoMovilAccountController.getDefault.bind(pagoMovilAccountController));
router.get('/:id', pagoMovilAccountController.getById.bind(pagoMovilAccountController));
router.put('/:id', pagoMovilAccountController.update.bind(pagoMovilAccountController));
router.delete('/:id', pagoMovilAccountController.delete.bind(pagoMovilAccountController));
router.post('/:id/set-default', pagoMovilAccountController.setDefault.bind(pagoMovilAccountController));

export default router;
