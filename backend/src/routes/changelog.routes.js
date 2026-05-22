import { Router } from 'express';
import changelogController from '../controllers/changelog.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Lectura: cualquier staff del back-office.
const STAFF_ROLES = ['ADMIN', 'OPERATOR', 'TAQUILLA_ADMIN'];
router.get('/',              authorize(...STAFF_ROLES), changelogController.list.bind(changelogController));
router.get('/unread-count',  authorize(...STAFF_ROLES), changelogController.unreadCount.bind(changelogController));

// Escritura: solo ADMIN.
router.post('/',         authorize('ADMIN'), changelogController.create.bind(changelogController));
router.patch('/:id',     authorize('ADMIN'), changelogController.update.bind(changelogController));
router.delete('/:id',    authorize('ADMIN'), changelogController.remove.bind(changelogController));

export default router;
