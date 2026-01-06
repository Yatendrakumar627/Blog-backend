import User from '../models/User.js';
import Blog from '../models/Blog.js';
import Comment from '../models/Comment.js';
import Notification from '../models/Notification.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { createNotification } from './notificationController.js';
import { cloudinary } from '../config/cloudinary.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

export const checkUsernameAvailability = async (req, res) => {
    try {
        const { username } = req.params;

        if (!username || username.length < 3) {
            return res.json({ available: false, message: 'Username must be at least 3 characters' });
        }

        if (username.length > 20) {
            return res.json({ available: false, message: 'Username must be less than 20 characters' });
        }

        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
            return res.json({ available: false, message: 'Username can only contain letters, numbers, and underscores' });
        }

        if (/^[0-9]/.test(username)) {
            return res.json({ available: false, message: 'Username cannot start with a number' });
        }

        const existingUser = await User.findOne({ username });
        res.json({
            available: !existingUser,
            message: existingUser ? 'Username is already taken' : 'Username is available'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const checkEmailAvailability = async (req, res) => {
    try {
        const { email } = req.params;
        if (!email) {
            return res.status(400).json({ exists: false, message: 'Email is required' });
        }
        const existingUser = await User.findOne({ email });
        res.json({
            exists: !!existingUser,
            message: existingUser ? 'Email is registered' : 'Email is not registered'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const registerUser = async (req, res) => {
    const { username, email, password, displayName } = req.body;

    try {
        // Check if user exists by email
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // Check if username exists
        const usernameExists = await User.findOne({ username });
        if (usernameExists) {
            return res.status(400).json({ message: 'Username is already taken' });
        }

        // Validate username format
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscores' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ message: 'Username must be between 3 and 20 characters' });
        }

        if (/^[0-9]/.test(username)) {
            return res.status(400).json({ message: 'Username cannot start with a number' });
        }

        // Validate display name if provided
        if (displayName && displayName.length > 50) {
            return res.status(400).json({ message: 'Display name must be less than 50 characters' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            username,
            email,
            password: hashedPassword,
            displayName: displayName || '',
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                bookmarks: user.bookmarks,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            if (field === 'username') {
                return res.status(400).json({ message: 'Username is already taken' });
            } else if (field === 'email') {
                return res.status(400).json({ message: 'Email is already registered' });
            }
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: messages.join(', ') });
        }

        res.status(500).json({ message: error.message });
    }
};

export const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: 'create the account' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'wrong user/password' });
        }

        res.json({
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            profilePic: user.profilePic,
            coverPic: user.coverPic,
            bookmarks: user.bookmarks,
            notificationSettings: user.notificationSettings,
            privacySettings: user.privacySettings,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getProfile = async (req, res) => {
    // Middleware should attach user to req
    const user = await User.findById(req.user._id);

    if (user) {
        const connectedUsers = req.app.get('connectedUsers');
        const isOnline = connectedUsers && connectedUsers.has(user._id.toString());

        const totalPosts = await Blog.countDocuments({ author: user._id });

        res.json({
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            bio: user.bio,
            profilePic: user.profilePic,
            coverPic: user.coverPic,
            followers: user.followers,
            following: user.following,
            bookmarks: user.bookmarks,
            totalPosts,
            notificationSettings: user.notificationSettings,
            privacySettings: user.privacySettings,
            isOnline: isOnline && (user.privacySettings?.showOnlineStatus !== false)
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

export const followUser = async (req, res) => {
    try {
        let userToFollow;

        // Check if the parameter is a valid ObjectId or username
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            // It's an ObjectId, find by ID
            userToFollow = await User.findById(req.params.id);
        } else {
            // It's a username, find by username
            userToFollow = await User.findOne({ username: req.params.id });
        }

        const currentUser = await User.findById(req.user._id);

        if (!userToFollow || !currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (userToFollow._id.toString() === currentUser._id.toString()) {
            return res.status(400).json({ message: 'You cannot follow yourself' });
        }

        const isFollowing = userToFollow.followers.some(
            (id) => id.toString() === currentUser._id.toString()
        );

        const io = req.app.get('io');

        if (!isFollowing) {
            // Update both users
            await User.findByIdAndUpdate(userToFollow._id, { $addToSet: { followers: currentUser._id } });
            await User.findByIdAndUpdate(currentUser._id, { $addToSet: { following: userToFollow._id } });

            // Create notification
            await createNotification(userToFollow._id, currentUser._id, 'follow', null, io);

            res.status(200).json({ message: 'User followed', followers: [...userToFollow.followers, currentUser._id] });
        } else {
            res.status(400).json({ message: 'You already follow this user' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const unfollowUser = async (req, res) => {
    try {
        let userToUnfollow;

        // Check if the parameter is a valid ObjectId or username
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            // It's an ObjectId, find by ID
            userToUnfollow = await User.findById(req.params.id);
        } else {
            // It's a username, find by username
            userToUnfollow = await User.findOne({ username: req.params.id });
        }

        const currentUser = await User.findById(req.user._id);

        if (!userToUnfollow || !currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isFollowing = userToUnfollow.followers.some(
            (id) => id.toString() === currentUser._id.toString()
        );

        if (isFollowing) {
            await User.findByIdAndUpdate(userToUnfollow._id, { $pull: { followers: currentUser._id } });
            await User.findByIdAndUpdate(currentUser._id, { $pull: { following: userToUnfollow._id } });
            res.status(200).json({
                message: 'User unfollowed',
                followers: userToUnfollow.followers.filter(id => id.toString() !== currentUser._id.toString())
            });
        } else {
            res.status(400).json({ message: 'You do not follow this user' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getProfileUser = async (req, res) => {
    try {
        // Check if the parameter looks like a valid ObjectId
        let user;

        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            // Try to find user by ID first
            user = await User.findById(req.params.id);
        }

        // If not found by ID or not a valid ObjectId, try finding by username
        if (!user) {
            user = await User.findOne({ username: req.params.id });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const currentUserId = req.user?._id?.toString();
        const isOwnProfile = currentUserId === user._id.toString();
        const privacy = user.privacySettings || {};

        // Check Profile Visibility - but allow basic info for logged-in users
        if (!isOwnProfile && privacy.profileVisibility === 'private') {
            // For private profiles, return very limited info
            const connectedUsers = req.app.get('connectedUsers');
            const isOnline = connectedUsers && connectedUsers.has(user._id.toString());
            
            return res.json({
                _id: user._id,
                username: user.username,
                displayName: user.displayName,
                profilePic: user.profilePic,
                coverPic: user.coverPic,
                bio: user.bio || '',
                isOnline: isOnline && (privacy.showOnlineStatus !== false),
                privacySettings: {
                    profileVisibility: 'private',
                    allowMessages: privacy.allowMessages,
                    showEmail: privacy.showEmail,
                    showOnlineStatus: privacy.showOnlineStatus
                },
                followers: [],
                following: [],
                createdAt: user.createdAt,
                totalPosts: await Blog.countDocuments({ author: user._id })
            });
        }

        if (!isOwnProfile && privacy.profileVisibility === 'friends') {
            const isFriend = user.followers.some(id => id.toString() === currentUserId) &&
                user.following.some(id => id.toString() === currentUserId);
            if (!isFriend) {
                // For friends-only profiles, return limited info
                const connectedUsers = req.app.get('connectedUsers');
                const isOnline = connectedUsers && connectedUsers.has(user._id.toString());
                
                return res.json({
                    _id: user._id,
                    username: user.username,
                    displayName: user.displayName,
                    profilePic: user.profilePic,
                    coverPic: user.coverPic,
                    bio: user.bio || '',
                    isOnline: isOnline && (privacy.showOnlineStatus !== false),
                    privacySettings: {
                        profileVisibility: 'friends',
                        allowMessages: privacy.allowMessages,
                        showEmail: privacy.showEmail,
                        showOnlineStatus: privacy.showOnlineStatus
                    },
                    followers: [],
                    following: [],
                    createdAt: user.createdAt,
                    totalPosts: await Blog.countDocuments({ author: user._id })
                });
            }
        }

        // For public profiles or own profile, return full info
        const connectedUsers = req.app.get('connectedUsers');
        const isOnline = connectedUsers && connectedUsers.has(user._id.toString());
        const totalPosts = await Blog.countDocuments({ author: user._id });

        res.json({
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            email: (isOwnProfile || privacy.showEmail) ? user.email : undefined,
            bio: user.bio,
            profilePic: user.profilePic,
            coverPic: user.coverPic,
            followers: user.followers,
            following: user.following,
            createdAt: user.createdAt,
            totalPosts,
            privacySettings: user.privacySettings,
            isOnline: isOnline && (privacy.showOnlineStatus !== false)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getPublicUser = async (req, res) => {
    try {
        // Check if the parameter looks like a valid ObjectId
        let user;

        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            // Try to find user by ID first
            user = await User.findById(req.params.id);
        }

        // If not found by ID or not a valid ObjectId, try finding by username
        if (!user) {
            user = await User.findOne({ username: req.params.id });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const connectedUsers = req.app.get('connectedUsers');
        const isOnline = connectedUsers && connectedUsers.has(user._id.toString());

        // Return only public information, no privacy restrictions
        res.json({
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            profilePic: user.profilePic,
            coverPic: user.coverPic,
            bio: user.bio,
            isOnline: isOnline && (user.privacySettings?.showOnlineStatus !== false)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getUserById = async (req, res) => {
    try {
        // Check if the parameter looks like a valid ObjectId
        let user;

        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            // Try to find user by ID first
            user = await User.findById(req.params.id);
        }

        // If not found by ID or not a valid ObjectId, try finding by username
        if (!user) {
            user = await User.findOne({ username: req.params.id });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const currentUserId = req.user?._id?.toString();
        const isOwnProfile = currentUserId === user._id.toString();
        const privacy = user.privacySettings || {};

        // Check Profile Visibility
        if (!isOwnProfile && privacy.profileVisibility === 'private') {
            return res.status(403).json({ message: 'This profile is private' });
        }

        if (!isOwnProfile && privacy.profileVisibility === 'friends') {
            const isFriend = user.followers.some(id => id.toString() === currentUserId) &&
                user.following.some(id => id.toString() === currentUserId);
            if (!isFriend) {
                return res.status(403).json({ message: 'This profile is only visible to friends' });
            }
        }

        const connectedUsers = req.app.get('connectedUsers');
        const isOnline = connectedUsers && connectedUsers.has(user._id.toString());
        const totalPosts = await Blog.countDocuments({ author: user._id });

        res.json({
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            email: (isOwnProfile || privacy.showEmail) ? user.email : undefined,
            bio: user.bio,
            profilePic: user.profilePic,
            coverPic: user.coverPic,
            followers: user.followers,
            following: user.following,
            createdAt: user.createdAt,
            totalPosts,
            privacySettings: user.privacySettings,
            isOnline: isOnline && (privacy.showOnlineStatus !== false)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const searchUsers = async (req, res) => {
    try {
        const keyword = req.query.q || req.query.search;

        const filter = {
            'privacySettings.profileVisibility': { $ne: 'private' }
        };

        if (keyword) {
            filter.$or = [
                { username: { $regex: keyword, $options: 'i' } },
                { displayName: { $regex: keyword, $options: 'i' } },
            ];
        }

        // If user is logged in, exclude them from results
        if (req.user) {
            filter._id = { $ne: req.user._id };
        }

        const users = await User.find(filter)
            .select('username displayName profilePic bio followers following privacySettings')
            .limit(keyword ? 20 : 10)
            .lean();

        const connectedUsers = req.app.get('connectedUsers');
        const usersWithStatus = users.map(u => ({
            ...u,
            isOnline: connectedUsers && connectedUsers.has(u._id.toString()) && (u.privacySettings?.showOnlineStatus !== false),
            // Privacy: don't leak settings object if not needed, or just exclude it for cleaner response
            privacySettings: undefined
        }));

        res.json(usersWithStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getUserNetwork = async (req, res) => {
    try {
        let user;

        // Check if the parameter is a valid ObjectId or username
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            // It's an ObjectId, find by ID
            user = await User.findById(req.params.id)
                .populate('followers', 'username displayName profilePic bio privacySettings')
                .populate('following', 'username displayName profilePic bio privacySettings');
        } else {
            // It's a username, find by username
            user = await User.findOne({ username: req.params.id })
                .populate('followers', 'username displayName profilePic bio privacySettings')
                .populate('following', 'username displayName profilePic bio privacySettings');
        }

        if (!user) return res.status(404).json({ message: 'User not found' });

        const currentUserId = req.user?._id?.toString();
        const isOwnProfile = currentUserId === user._id.toString();
        const privacy = user.privacySettings || {};

        // Check Profile Visibility
        if (!isOwnProfile && privacy.profileVisibility === 'private') {
            return res.status(403).json({ message: 'This profile is private' });
        }

        if (!isOwnProfile && privacy.profileVisibility === 'friends') {
            const isFriend = user.followers.some(id => id._id.toString() === currentUserId) &&
                user.following.some(id => id._id.toString() === currentUserId);
            if (!isFriend) {
                return res.status(403).json({ message: 'This profile is only visible to friends' });
            }
        }

        // Filter out private followers/following from the response unless own profile
        const filterPrivate = (userList) => userList.filter(u =>
            u._id.toString() === currentUserId ||
            u.privacySettings?.profileVisibility !== 'private'
        );

        res.json({
            followers: isOwnProfile ? user.followers : filterPrivate(user.followers),
            following: isOwnProfile ? user.following : filterPrivate(user.following),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            // Handle username update with validation
            if (req.body.username && req.body.username !== user.username) {
                const usernameRegex = /^[a-zA-Z0-9_]+$/;
                if (!usernameRegex.test(req.body.username)) {
                    return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscores' });
                }

                if (req.body.username.length < 3 || req.body.username.length > 20) {
                    return res.status(400).json({ message: 'Username must be between 3 and 20 characters' });
                }

                if (/^[0-9]/.test(req.body.username)) {
                    return res.status(400).json({ message: 'Username cannot start with a number' });
                }

                // Check if username is already taken
                const existingUser = await User.findOne({ username: req.body.username });
                if (existingUser) {
                    return res.status(400).json({ message: 'Username is already taken' });
                }

                user.username = req.body.username;
            }

            // Handle display name update
            if (req.body.displayName !== undefined) {
                if (req.body.displayName && req.body.displayName.length > 50) {
                    return res.status(400).json({ message: 'Display name must be less than 50 characters' });
                }
                user.displayName = req.body.displayName;
            }

            user.bio = req.body.bio || user.bio;

            // Track changes for cleanup
            const oldProfilePic = user.profilePic;
            const oldCoverPic = user.coverPic;
            let profilePicChanged = false;
            let coverPicChanged = false;

            // Handle file upload
            if (req.files) {
                if (req.files['image']) {
                    user.profilePic = req.files['image'][0].path;
                    profilePicChanged = true;
                }
                if (req.files['coverImage']) {
                    user.coverPic = req.files['coverImage'][0].path;
                    coverPicChanged = true;
                }
            }

            // Handle profile image URL (fallback if no file)
            if (req.body.profilePic && (!req.files || !req.files['image'])) {
                // If explicitly cleared or changed
                if (req.body.profilePic !== oldProfilePic) {
                    user.profilePic = req.body.profilePic;
                    profilePicChanged = true;
                }
            }
            // Handle cover image URL
            if (req.body.coverPic && (!req.files || !req.files['coverImage'])) {
                if (req.body.coverPic !== oldCoverPic) {
                    user.coverPic = req.body.coverPic;
                    coverPicChanged = true;
                }
            }

            // Cleanup old images from Cloudinary
            if (profilePicChanged && oldProfilePic) {
                const publicId = getPublicIdFromUrl(oldProfilePic);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                    } catch (err) {
                        console.error('Failed to delete old profile pic:', err);
                    }
                }
            }

            if (coverPicChanged && oldCoverPic) {
                const publicId = getPublicIdFromUrl(oldCoverPic);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                    } catch (err) {
                        console.error('Failed to delete old cover pic:', err);
                    }
                }
            }

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                username: updatedUser.username,
                displayName: updatedUser.displayName,
                email: updatedUser.email,
                profilePic: updatedUser.profilePic,
                coverPic: updatedUser.coverPic,
                bio: updatedUser.bio,
                followers: updatedUser.followers,
                following: updatedUser.following,
                bookmarks: updatedUser.bookmarks,
                token: generateToken(updatedUser._id),
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
            if (error.keyPattern?.username) {
                return res.status(400).json({ message: 'Username is already taken' });
            }
        }
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update notification settings
// @route   PUT /api/auth/notifications
// @access  Private
export const updateNotificationSettings = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            user.notificationSettings = {
                emailNotifications: req.body.emailNotifications !== undefined ? req.body.emailNotifications : user.notificationSettings?.emailNotifications,
                pushNotifications: req.body.pushNotifications !== undefined ? req.body.pushNotifications : user.notificationSettings?.pushNotifications,
                commentNotifications: req.body.commentNotifications !== undefined ? req.body.commentNotifications : user.notificationSettings?.commentNotifications,
                likeNotifications: req.body.likeNotifications !== undefined ? req.body.likeNotifications : user.notificationSettings?.likeNotifications,
                followNotifications: req.body.followNotifications !== undefined ? req.body.followNotifications : user.notificationSettings?.followNotifications,
            };

            const updatedUser = await user.save();

            res.json({
                message: 'Notification settings updated successfully',
                notificationSettings: updatedUser.notificationSettings
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update privacy settings
// @route   PUT /api/auth/privacy
// @access  Private
export const updatePrivacySettings = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            user.privacySettings = {
                profileVisibility: req.body.profileVisibility || user.privacySettings?.profileVisibility,
                showEmail: req.body.showEmail !== undefined ? req.body.showEmail : user.privacySettings?.showEmail,
                allowMessages: req.body.allowMessages !== undefined ? req.body.allowMessages : user.privacySettings?.allowMessages,
                showOnlineStatus: req.body.showOnlineStatus !== undefined ? req.body.showOnlineStatus : user.privacySettings?.showOnlineStatus,
            };

            const updatedUser = await user.save();

            res.json({
                message: 'Privacy settings updated successfully',
                privacySettings: updatedUser.privacySettings
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user email
// @route   PUT /api/auth/email
// @access  Private
export const updateEmail = async (req, res) => {
    try {
        const { currentPassword, newEmail } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Validate new email
        if (!newEmail || !newEmail.includes('@')) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        if (newEmail === user.email) {
            return res.status(400).json({ message: 'New email must be different from current email' });
        }

        // Check if new email is already taken
        const existingUser = await User.findOne({ email: newEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'Email is already in use' });
        }

        // Update email
        user.email = newEmail;
        const updatedUser = await user.save();

        res.json({
            message: 'Email updated successfully',
            email: updatedUser.email
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Change password
// @route   PUT /api/auth/password
// @access  Private
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Validate new password
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters long' });
        }

        // Update password
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete user account
// @route   DELETE /api/auth/profile
// @access  Private
export const deleteAccount = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 1. Delete all posts by this user
        const userBlogs = await Blog.find({ author: user._id });

        // Delete post images from Cloudinary
        const blogImageDeletionPromises = userBlogs
            .filter(blog => blog.mediaUrl && blog.mediaUrl.includes('cloudinary'))
            .map(blog => {
                const publicId = getPublicIdFromUrl(blog.mediaUrl);
                if (publicId) {
                    return cloudinary.uploader.destroy(publicId);
                }
                return Promise.resolve();
            });

        await Promise.all(blogImageDeletionPromises);

        // Delete blogs from DB
        await Blog.deleteMany({ author: user._id });

        // 2. Delete Profile Picture from Cloudinary
        if (user.profilePic && user.profilePic.includes('cloudinary')) {
            const profilePicId = getPublicIdFromUrl(user.profilePic);
            if (profilePicId) {
                await cloudinary.uploader.destroy(profilePicId);
            }
        }

        // 3. Delete Comments by user
        await Comment.deleteMany({ author: user._id });

        // 4. Delete Notifications (sent to or by the user)
        // Cleanup notifications where user is recipient or sender
        await Notification.deleteMany({ $or: [{ recipient: user._id }, { sender: user._id }] });

        // 5. Remove user from followers/following lists of others
        // Remove user from other users' followers list
        await User.updateMany(
            { followers: user._id },
            { $pull: { followers: user._id } }
        );
        // Remove user from other users' following list
        await User.updateMany(
            { following: user._id },
            { $pull: { following: user._id } }
        );

        // 6. Delete Conversations and Messages
        // Delete all conversations where user was a participant
        await Conversation.deleteMany({ 
            participants: { $in: [user._id] } 
        });

        // Delete all messages sent by or to the user
        await Message.deleteMany({ 
            $or: [{ sender: user._id }, { recipient: user._id }] 
        });

        // 7. Delete User
        await User.findByIdAndDelete(user._id);

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Helper to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
    try {
        if (!url || !url.includes('cloudinary')) return null;

        // Regex to match the path after /upload/v<version>/ or just /upload/
        // Matches: .../upload/v1234/folder/image.jpg -> folder/image
        // Matches: .../upload/folder/image.jpg -> folder/image
        // Cloudinary Public IDs typically include the folder structure but NO file extension

        const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/;
        const match = url.match(regex);
        return match ? match[1] : null;

    } catch (error) {
        console.error('Error extracting public ID:', error);
        return null;
    }
};
