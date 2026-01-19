<<<<<<< HEAD
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getNotifications, markRead, markAllRead } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/read-all', protect, markAllRead);
router.put('/:id/read', protect, markRead);

export default router;
=======
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getNotifications, markRead, markAllRead } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/read-all', protect, markAllRead);
router.put('/:id/read', protect, markRead);

export default router;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
