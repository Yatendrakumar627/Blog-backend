<<<<<<< HEAD
import express from 'express';
import { addComment, getComments, deleteComment } from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, addComment);
router.get('/:blogId', protect, getComments);
router.delete('/:commentId', protect, deleteComment);

export default router;
=======
import express from 'express';
import { addComment, getComments, deleteComment } from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, addComment);
router.get('/:blogId', protect, getComments);
router.delete('/:commentId', protect, deleteComment);

export default router;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
