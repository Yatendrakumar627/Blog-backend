<<<<<<< HEAD
import express from 'express';
import {
    createBlog,
    getBlogs,
    getBlogById,
    likeBlog,
    commentBlog,
    getComments,
    deleteBlog,
    updateBlog
} from '../controllers/blogController.js';
import { protect, optionalProtect } from '../middleware/authMiddleware.js';
import upload from '../config/cloudinary.js';

const router = express.Router();

router.route('/')
    .post(protect, (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err) {
                console.error('Multer/Cloudinary Error:', err);
                return res.status(500).json({ message: 'Image upload failed', error: err.message });
            }
            next();
        });
    }, createBlog)
    .get(protect, getBlogs);

router.route('/:id')
    .get(protect, getBlogById)
    .delete(protect, deleteBlog)
    .put(protect, (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err) {
                console.error('Multer/Update Error:', err);
                return res.status(500).json({ message: 'Image upload failed', error: err.message });
            }
            next();
        });
    }, updateBlog);

router.put('/:id/like', protect, likeBlog);
router.post('/:id/comment', protect, commentBlog);
router.get('/:id/comments', protect, getComments);

export default router;
=======
import express from 'express';
import {
    createBlog,
    getBlogs,
    getBlogById,
    likeBlog,
    commentBlog,
    getComments,
    deleteBlog,
    updateBlog
} from '../controllers/blogController.js';
import { protect, optionalProtect } from '../middleware/authMiddleware.js';
import upload from '../config/cloudinary.js';

const router = express.Router();

router.route('/')
    .post(protect, (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err) {
                console.error('Multer/Cloudinary Error:', err);
                return res.status(500).json({ message: 'Image upload failed', error: err.message });
            }
            next();
        });
    }, createBlog)
    .get(protect, getBlogs);

router.route('/:id')
    .get(protect, getBlogById)
    .delete(protect, deleteBlog)
    .put(protect, (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err) {
                console.error('Multer/Update Error:', err);
                return res.status(500).json({ message: 'Image upload failed', error: err.message });
            }
            next();
        });
    }, updateBlog);

router.put('/:id/like', protect, likeBlog);
router.post('/:id/comment', protect, commentBlog);
router.get('/:id/comments', protect, getComments);

export default router;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
