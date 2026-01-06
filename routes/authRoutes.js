import express from 'express';
import { registerUser, loginUser, getProfile, followUser, unfollowUser, getUserById, getPublicUser, getProfileUser, searchUsers, getUserNetwork, updateProfile, checkUsernameAvailability, checkEmailAvailability, deleteAccount, updateNotificationSettings, updatePrivacySettings, changePassword, updateEmail } from '../controllers/authController.js';
import { protect, optionalProtect } from '../middleware/authMiddleware.js';
import upload from '../config/cloudinary.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/check-username/:username', checkUsernameAvailability);
router.get('/check-email/:email', checkEmailAvailability);
router.put('/:id/follow', protect, followUser);
router.put('/:id/unfollow', protect, unfollowUser);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), updateProfile);
router.put('/notifications', protect, updateNotificationSettings);
router.put('/privacy', protect, updatePrivacySettings);
router.put('/password', protect, changePassword);
router.put('/email', protect, updateEmail);
router.delete('/profile', protect, deleteAccount);
router.put('/profile-url', protect, updateProfile);
router.get('/search', optionalProtect, searchUsers);
router.get('/search/users', optionalProtect, searchUsers); // Alternative endpoint for mentions
router.get('/public/:id', optionalProtect, getPublicUser);
router.get('/profile-view/:id', protect, getProfileUser);
router.get('/:id/network', protect, getUserNetwork);
router.get('/:id', optionalProtect, getUserById);

export default router;
