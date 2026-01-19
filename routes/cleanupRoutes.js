import express from 'express';
import { permanentCleanup, getCleanupStats } from '../controllers/cleanupController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All cleanup routes require admin privileges
router.use(protect);
router.use(authorize('admin'));

// GET /api/cleanup/stats - Get cleanup statistics
router.get('/stats', getCleanupStats);

// POST /api/cleanup/permanent - Trigger permanent cleanup
router.post('/permanent', permanentCleanup);

export default router;
