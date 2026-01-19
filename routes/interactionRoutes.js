<<<<<<< HEAD
import express from 'express';
import { toggleFollow, toggleBookmark } from '../controllers/interactionController.js'; // Note provided path in previous step
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.put('/follow/:id', protect, toggleFollow);
router.put('/bookmark/:id', protect, toggleBookmark);

export default router;
=======
import express from 'express';
import { toggleFollow, toggleBookmark } from '../controllers/interactionController.js'; // Note provided path in previous step
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.put('/follow/:id', protect, toggleFollow);
router.put('/bookmark/:id', protect, toggleBookmark);

export default router;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
