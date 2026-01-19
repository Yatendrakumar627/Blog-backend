<<<<<<< HEAD
import Blog from '../models/Blog.js';
import Comment from '../models/Comment.js';
import { createNotification } from './notificationController.js';
import Interaction from '../models/Interaction.js';
import User from '../models/User.js';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';

import { getCache, setCache, delCache } from '../config/redis.js';

// @desc    Create a new blog
// @route   POST /api/blogs
// @access  Private
export const createBlog = async (req, res) => {
    try {
        console.log('Request body:', req.body);
        console.log('Request file:', req.file);

        const { content, tags, mood, displayMode, isAnonymous, mediaUrl: bodyMediaUrl, backgroundImage: bodyBackgroundImage } = req.body;

        // Priority: 1. Multer File Path (Cloudinary URL), 2. Explicitly sent URL
        let mediaUrl = '';
        if (req.file) {
            mediaUrl = req.file.path;
        } else if (bodyMediaUrl) {
            mediaUrl = bodyMediaUrl;
        }

        const blog = new Blog({
            author: req.user._id,
            content,
            mediaUrl,
            backgroundImage: bodyBackgroundImage || '',
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            mood: mood || 'Thoughtful',
            displayMode: displayMode || 'Standard',
            isAnonymous: isAnonymous === 'true' || isAnonymous === true,
        });

        const createdBlog = await blog.save();
        await createdBlog.populate('author', 'username displayName profilePic privacySettings');

        const blogObj = createdBlog.toObject();
        if (blogObj.author) {
            blogObj.author.isOnline = true;
        }

        // Invalidate feed cache
        await delCache('blogs:feed:*');

        res.status(201).json(blogObj);
    } catch (error) {
        console.error('FULL BLOG ERROR:', error);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
};

// @desc    Get all blogs
// @route   GET /api/blogs
// @access  Public
export const getBlogs = async (req, res) => {
    try {
        const { mood, author, type, search, page = 1, limit = 10 } = req.query;

        // Generate cache key based on query params
        const cacheKey = `blogs:feed:${JSON.stringify(req.query)}`;

        // Check cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            // Apply real-time online status to cached data if possible, or accept slight staleness
            // For checking online status accurately, we might need to re-process cached data slightly
            // But for performance, returning cached data directly is best.
            // Let's quickly re-attach online status from current connected users
            const connectedUsers = req.app.get('connectedUsers') || new Map();
            if (connectedUsers && cachedData.blogs) {
                cachedData.blogs.forEach(blog => {
                    if (blog.author && typeof blog.author === 'object') {
                        const isSocketConnected = connectedUsers.has(blog.author._id.toString());
                        // cached data might not have privacySettings fully up to date if user changed it recently, 
                        // but we can check if it's there. 
                        // `blog.author` in cache comes from `toObject()`.
                        const isOnline = isSocketConnected && (blog.author.privacySettings?.showOnlineStatus !== false);
                        blog.author.isOnline = isOnline;
                    }
                });
            }
            return res.json(cachedData);
        }

        let filter = {};

        if (mood) filter.mood = mood;

        // Handle author parameter - support both username and ObjectId
        if (author) {
            if (mongoose.Types.ObjectId.isValid(author)) {
                filter.author = author;
            } else {
                // Find user by username and use their ObjectId
                const user = await User.findOne({ username: author });
                if (user) {
                    filter.author = user._id;
                }
            }
        }

        if (req.query.likedBy) {
            if (mongoose.Types.ObjectId.isValid(req.query.likedBy)) {
                filter.likes = req.query.likedBy;
            } else {
                const user = await User.findOne({ username: req.query.likedBy });
                if (user) {
                    filter.likes = user._id;
                }
            }
        }

        if (req.query.savedBy) {
            let userId = req.query.savedBy;
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                const user = await User.findOne({ username: userId });
                if (user) userId = user._id;
                else userId = null;
            }

            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    filter._id = { $in: user.bookmarks };
                }
            }
        }

        if (search) {
            // Find users with matching username
            const matchingUsers = await User.find({ username: { $regex: search, $options: 'i' } }).select('_id');
            const matchingUserIds = matchingUsers.map(user => user._id);

            filter.$or = [
                { content: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } },
                { author: { $in: matchingUserIds } }
            ];
        }

        // Date Filtering
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) {
                // Trust frontend timestamp
                filter.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                // Trust frontend timestamp
                filter.createdAt.$lte = new Date(req.query.endDate);
            }
        }

        // "Following" Feed Logic
        if (type === 'following' && req.user) {
            // Since req.user is attached by middleware, we can use it. But req.user might not have 'following' populated depending on how it was fetched.
            // Safe bet: fetch updated user following list
            const currentUser = await User.findById(req.user._id);
            if (currentUser) {
                filter.author = { $in: currentUser.following };
            }
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const blogs = await Blog.find(filter)
            .populate('author', 'username displayName profilePic privacySettings')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await Blog.countDocuments(filter);

        const connectedUsers = req.app.get('connectedUsers') || new Map();

        // Enhance blogs with online status and comment counts
        const blogsWithStatus = await Promise.all(blogs.map(async (blog) => {
            if (blog.author && typeof blog.author === 'object') {
                const isSocketConnected = connectedUsers.has(blog.author._id.toString());
                const isOnline = isSocketConnected && (blog.author.privacySettings?.showOnlineStatus !== false);
                blog.author.isOnline = isOnline;
            }

            // Get comment count efficiently
            const commentsCount = await Comment.countDocuments({ blog: blog._id });
            blog.commentsCount = commentsCount;

            return blog;
        }));

        const responseData = {
            blogs: blogsWithStatus,
            hasMore: skip + limitNum < total,
            total,
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum)
        };

        // Set Cache (Duration: 60 seconds)
        await setCache(cacheKey, responseData, 60);

        res.json(responseData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get blog by ID
// @route   GET /api/blogs/:id
// @access  Public
export const getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id).populate('author', 'username displayName profilePic privacySettings').lean();
        if (blog) {
            const connectedUsers = req.app.get('connectedUsers') || new Map();
            if (blog.author && typeof blog.author === 'object') {
                const isSocketConnected = connectedUsers.has(blog.author._id.toString());
                const isOnline = isSocketConnected && (blog.author.privacySettings?.showOnlineStatus !== false);
                blog.author.isOnline = isOnline;
            }

            // Add comment count
            const commentsCount = await Comment.countDocuments({ blog: blog._id });
            blog.commentsCount = commentsCount;

            res.json(blog);
        } else {
            res.status(404).json({ message: 'Blog not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Like a blog
// @route   PUT /api/blogs/:id/like
// @access  Private
export const likeBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        const io = req.app.get('io');
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        if (blog.likes.includes(req.user._id)) {
            // Unlike
            blog.likes = blog.likes.filter((id) => id.toString() !== req.user._id.toString());
        } else {
            // Like
            blog.likes.push(req.user._id);
            await createNotification(blog.author, req.user._id, 'like', blog._id, io);
        }
        await blog.save();

        // Invalidate feed cache as likes count changed
        // Note: For high performance, we might skip this and let it update on 60s TTL, 
        // but for correctness/UX we invalidate.
        await delCache('blogs:feed:*');

        res.json(blog.likes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Comment on a blog
// @route   POST /api/blogs/:id/comment
// @access  Private
export const commentBlog = async (req, res) => {
    try {
        const { text } = req.body;
        const interaction = await Interaction.create({
            blog: req.params.id,
            user: req.user._id,
            type: 'comment',
            text,
        });

        // Populate user info for immediate display
        const fullInteraction = await Interaction.findById(interaction._id).populate('user', 'username profilePic');

        res.status(201).json(fullInteraction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get comments for a blog
// @route   GET /api/blogs/:id/comments
// @access  Public
export const getComments = async (req, res) => {
    try {
        const comments = await Interaction.find({ blog: req.params.id, type: 'comment' })
            .populate('user', 'username profilePic')
            .sort({ createdAt: 1 });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a blog
// @route   DELETE /api/blogs/:id
// @access  Private (Author only)
export const deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // 1. Delete image from Cloudinary if exists
        if (blog.mediaUrl) {
            try {
                // Extract public ID from URL
                // Format: https://res.cloudinary.com/<cloud_name>/image/upload/v<version>/<public_id>.<extension>
                // We want everything after 'upload/' and version (if present), up to the extension
                const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i;
                const match = blog.mediaUrl.match(regex);
                if (match && match[1]) {
                    await cloudinary.uploader.destroy(match[1]);
                }
            } catch (err) {
                console.error('Cloudinary deletion error:', err);
                // Continue with blog deletion even if image delete fails
            }
        }

        // 2. Delete related interactions (comments, likes stored as docs if any, but likes are in array)
        // Check Controller: commentBlog creates Interaction type 'comment'.
        await Interaction.deleteMany({ blog: blog._id });
        await Comment.deleteMany({ blog: blog._id });

        // 3. Delete the blog
        await blog.deleteOne();
        await delCache('blogs:feed:*'); // Invalidate Feed
        res.json({ message: 'Blog removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a blog
// @route   PUT /api/blogs/:id
// @access  Private (Author only)
export const updateBlog = async (req, res) => {
    try {
        const { content, tags, mood, displayMode, isAnonymous, mediaUrl: bodyMediaUrl, backgroundImage: bodyBackgroundImage } = req.body;
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        // Check ownership
        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized to edit this post' });
        }

        // Handle Media logic
        // 1. If new file uploaded -> use req.file.path
        // 2. If bodyMediaUrl provided -> use that (could be clearing it or setting new URL)
        // 3. If neither -> keep existing (unless user explicitly cleared it, handled by frontend sending empty string in bodyMediaUrl maybe? 
        //    Actually for now let's say if bodyMediaUrl is explicitly passed as empty string, it clears.

        let mediaUrl = blog.mediaUrl;
        let oldMediaUrl = blog.mediaUrl;
        let shouldDeleteOldImage = false;

        if (req.file) {
            mediaUrl = req.file.path;
            shouldDeleteOldImage = true;
        } else if (bodyMediaUrl !== undefined) {
            // If bodyMediaUrl is sent (even empty), we update to it. 
            // If it's string 'null' or 'undefined' from formData strings, handle that?
            // Usually formData sends strings.
            if (bodyMediaUrl === 'null' || bodyMediaUrl === '') {
                mediaUrl = '';
                shouldDeleteOldImage = true;
            } else {
                mediaUrl = bodyMediaUrl;
                // Only delete if the URL has actually changed
                if (mediaUrl !== oldMediaUrl) {
                    shouldDeleteOldImage = true;
                }
            }
        }

        // Cleanup old image if needed
        if (shouldDeleteOldImage && oldMediaUrl) {
            try {
                const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i;
                const match = oldMediaUrl.match(regex);
                if (match && match[1]) {
                    await cloudinary.uploader.destroy(match[1]);
                }
            } catch (err) {
                console.error('Cloudinary deletion error during update:', err);
            }
        }

        blog.content = content || blog.content;
        blog.mood = mood || blog.mood;
        blog.displayMode = displayMode || blog.displayMode;
        blog.isAnonymous = isAnonymous === 'true' || isAnonymous === true ? true : (isAnonymous === 'false' || isAnonymous === false ? false : blog.isAnonymous);

        if (tags) {
            blog.tags = tags.split(',').map(tag => tag.trim());
        }

        blog.mediaUrl = mediaUrl;

        // Handle background image
        if (bodyBackgroundImage !== undefined) {
            blog.backgroundImage = (bodyBackgroundImage === 'null' || bodyBackgroundImage === '') ? '' : bodyBackgroundImage;
        }

        const updatedBlog = await blog.save();
        await updatedBlog.populate('author', 'username displayName profilePic privacySettings');
        res.json(updatedBlog);

    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ message: error.message });
    }
};
=======
import Blog from '../models/Blog.js';
import Comment from '../models/Comment.js';
import { createNotification } from './notificationController.js';
import Interaction from '../models/Interaction.js';
import User from '../models/User.js';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';

import { getCache, setCache, delCache } from '../config/redis.js';

// @desc    Create a new blog
// @route   POST /api/blogs
// @access  Private
export const createBlog = async (req, res) => {
    try {
        console.log('Request body:', req.body);
        console.log('Request file:', req.file);

        const { content, tags, mood, displayMode, isAnonymous, mediaUrl: bodyMediaUrl, backgroundImage: bodyBackgroundImage } = req.body;

        // Priority: 1. Multer File Path (Cloudinary URL), 2. Explicitly sent URL
        let mediaUrl = '';
        if (req.file) {
            mediaUrl = req.file.path;
        } else if (bodyMediaUrl) {
            mediaUrl = bodyMediaUrl;
        }

        const blog = new Blog({
            author: req.user._id,
            content,
            mediaUrl,
            backgroundImage: bodyBackgroundImage || '',
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            mood: mood || 'Thoughtful',
            displayMode: displayMode || 'Standard',
            isAnonymous: isAnonymous === 'true' || isAnonymous === true,
        });

        const createdBlog = await blog.save();
        await createdBlog.populate('author', 'username displayName profilePic privacySettings');

        const blogObj = createdBlog.toObject();
        if (blogObj.author) {
            blogObj.author.isOnline = true;
        }

        // Invalidate feed cache
        await delCache('blogs:feed:*');

        res.status(201).json(blogObj);
    } catch (error) {
        console.error('FULL BLOG ERROR:', error);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
};

// @desc    Get all blogs
// @route   GET /api/blogs
// @access  Public
export const getBlogs = async (req, res) => {
    try {
        const { mood, author, type, search, page = 1, limit = 10 } = req.query;

        // Generate cache key based on query params
        const cacheKey = `blogs:feed:${JSON.stringify(req.query)}`;

        // Check cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            // Apply real-time online status to cached data if possible, or accept slight staleness
            // For checking online status accurately, we might need to re-process cached data slightly
            // But for performance, returning cached data directly is best.
            // Let's quickly re-attach online status from current connected users
            const connectedUsers = req.app.get('connectedUsers') || new Map();
            if (connectedUsers && cachedData.blogs) {
                cachedData.blogs.forEach(blog => {
                    if (blog.author && typeof blog.author === 'object') {
                        const isSocketConnected = connectedUsers.has(blog.author._id.toString());
                        // cached data might not have privacySettings fully up to date if user changed it recently, 
                        // but we can check if it's there. 
                        // `blog.author` in cache comes from `toObject()`.
                        const isOnline = isSocketConnected && (blog.author.privacySettings?.showOnlineStatus !== false);
                        blog.author.isOnline = isOnline;
                    }
                });
            }
            return res.json(cachedData);
        }

        let filter = {};

        if (mood) filter.mood = mood;

        // Handle author parameter - support both username and ObjectId
        if (author) {
            if (mongoose.Types.ObjectId.isValid(author)) {
                filter.author = author;
            } else {
                // Find user by username and use their ObjectId
                const user = await User.findOne({ username: author });
                if (user) {
                    filter.author = user._id;
                }
            }
        }

        if (req.query.likedBy) {
            if (mongoose.Types.ObjectId.isValid(req.query.likedBy)) {
                filter.likes = req.query.likedBy;
            } else {
                const user = await User.findOne({ username: req.query.likedBy });
                if (user) {
                    filter.likes = user._id;
                }
            }
        }

        if (req.query.savedBy) {
            let userId = req.query.savedBy;
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                const user = await User.findOne({ username: userId });
                if (user) userId = user._id;
                else userId = null;
            }

            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    filter._id = { $in: user.bookmarks };
                }
            }
        }

        if (search) {
            // Find users with matching username
            const matchingUsers = await User.find({ username: { $regex: search, $options: 'i' } }).select('_id');
            const matchingUserIds = matchingUsers.map(user => user._id);

            filter.$or = [
                { content: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } },
                { author: { $in: matchingUserIds } }
            ];
        }

        // Date Filtering
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) {
                // Trust frontend timestamp
                filter.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                // Trust frontend timestamp
                filter.createdAt.$lte = new Date(req.query.endDate);
            }
        }

        // "Following" Feed Logic
        if (type === 'following' && req.user) {
            // Since req.user is attached by middleware, we can use it. But req.user might not have 'following' populated depending on how it was fetched.
            // Safe bet: fetch updated user following list
            const currentUser = await User.findById(req.user._id);
            if (currentUser) {
                filter.author = { $in: currentUser.following };
            }
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const blogs = await Blog.find(filter)
            .populate('author', 'username displayName profilePic privacySettings')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await Blog.countDocuments(filter);

        const connectedUsers = req.app.get('connectedUsers') || new Map();

        // Enhance blogs with online status and comment counts
        const blogsWithStatus = await Promise.all(blogs.map(async (blog) => {
            if (blog.author && typeof blog.author === 'object') {
                const isSocketConnected = connectedUsers.has(blog.author._id.toString());
                const isOnline = isSocketConnected && (blog.author.privacySettings?.showOnlineStatus !== false);
                blog.author.isOnline = isOnline;
            }

            // Get comment count efficiently
            const commentsCount = await Comment.countDocuments({ blog: blog._id });
            blog.commentsCount = commentsCount;

            return blog;
        }));

        const responseData = {
            blogs: blogsWithStatus,
            hasMore: skip + limitNum < total,
            total,
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum)
        };

        // Set Cache (Duration: 60 seconds)
        await setCache(cacheKey, responseData, 60);

        res.json(responseData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get blog by ID
// @route   GET /api/blogs/:id
// @access  Public
export const getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id).populate('author', 'username displayName profilePic privacySettings').lean();
        if (blog) {
            const connectedUsers = req.app.get('connectedUsers') || new Map();
            if (blog.author && typeof blog.author === 'object') {
                const isSocketConnected = connectedUsers.has(blog.author._id.toString());
                const isOnline = isSocketConnected && (blog.author.privacySettings?.showOnlineStatus !== false);
                blog.author.isOnline = isOnline;
            }

            // Add comment count
            const commentsCount = await Comment.countDocuments({ blog: blog._id });
            blog.commentsCount = commentsCount;

            res.json(blog);
        } else {
            res.status(404).json({ message: 'Blog not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Like a blog
// @route   PUT /api/blogs/:id/like
// @access  Private
export const likeBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        const io = req.app.get('io');
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        if (blog.likes.includes(req.user._id)) {
            // Unlike
            blog.likes = blog.likes.filter((id) => id.toString() !== req.user._id.toString());
        } else {
            // Like
            blog.likes.push(req.user._id);
            await createNotification(blog.author, req.user._id, 'like', blog._id, io);
        }
        await blog.save();

        // Invalidate feed cache as likes count changed
        // Note: For high performance, we might skip this and let it update on 60s TTL, 
        // but for correctness/UX we invalidate.
        await delCache('blogs:feed:*');

        res.json(blog.likes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Comment on a blog
// @route   POST /api/blogs/:id/comment
// @access  Private
export const commentBlog = async (req, res) => {
    try {
        const { text } = req.body;
        const interaction = await Interaction.create({
            blog: req.params.id,
            user: req.user._id,
            type: 'comment',
            text,
        });

        // Populate user info for immediate display
        const fullInteraction = await Interaction.findById(interaction._id).populate('user', 'username profilePic');

        res.status(201).json(fullInteraction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get comments for a blog
// @route   GET /api/blogs/:id/comments
// @access  Public
export const getComments = async (req, res) => {
    try {
        const comments = await Interaction.find({ blog: req.params.id, type: 'comment' })
            .populate('user', 'username profilePic')
            .sort({ createdAt: 1 });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a blog
// @route   DELETE /api/blogs/:id
// @access  Private (Author only)
export const deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // 1. Delete image from Cloudinary if exists
        if (blog.mediaUrl) {
            try {
                // Extract public ID from URL
                // Format: https://res.cloudinary.com/<cloud_name>/image/upload/v<version>/<public_id>.<extension>
                // We want everything after 'upload/' and version (if present), up to the extension
                const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i;
                const match = blog.mediaUrl.match(regex);
                if (match && match[1]) {
                    await cloudinary.uploader.destroy(match[1]);
                }
            } catch (err) {
                console.error('Cloudinary deletion error:', err);
                // Continue with blog deletion even if image delete fails
            }
        }

        // 2. Delete related interactions (comments, likes stored as docs if any, but likes are in array)
        // Check Controller: commentBlog creates Interaction type 'comment'.
        await Interaction.deleteMany({ blog: blog._id });
        await Comment.deleteMany({ blog: blog._id });

        // 3. Delete the blog
        await blog.deleteOne();
        await delCache('blogs:feed:*'); // Invalidate Feed
        res.json({ message: 'Blog removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a blog
// @route   PUT /api/blogs/:id
// @access  Private (Author only)
export const updateBlog = async (req, res) => {
    try {
        const { content, tags, mood, displayMode, isAnonymous, mediaUrl: bodyMediaUrl, backgroundImage: bodyBackgroundImage } = req.body;
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }

        // Check ownership
        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized to edit this post' });
        }

        // Handle Media logic
        // 1. If new file uploaded -> use req.file.path
        // 2. If bodyMediaUrl provided -> use that (could be clearing it or setting new URL)
        // 3. If neither -> keep existing (unless user explicitly cleared it, handled by frontend sending empty string in bodyMediaUrl maybe? 
        //    Actually for now let's say if bodyMediaUrl is explicitly passed as empty string, it clears.

        let mediaUrl = blog.mediaUrl;
        let oldMediaUrl = blog.mediaUrl;
        let shouldDeleteOldImage = false;

        if (req.file) {
            mediaUrl = req.file.path;
            shouldDeleteOldImage = true;
        } else if (bodyMediaUrl !== undefined) {
            // If bodyMediaUrl is sent (even empty), we update to it. 
            // If it's string 'null' or 'undefined' from formData strings, handle that?
            // Usually formData sends strings.
            if (bodyMediaUrl === 'null' || bodyMediaUrl === '') {
                mediaUrl = '';
                shouldDeleteOldImage = true;
            } else {
                mediaUrl = bodyMediaUrl;
                // Only delete if the URL has actually changed
                if (mediaUrl !== oldMediaUrl) {
                    shouldDeleteOldImage = true;
                }
            }
        }

        // Cleanup old image if needed
        if (shouldDeleteOldImage && oldMediaUrl) {
            try {
                const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i;
                const match = oldMediaUrl.match(regex);
                if (match && match[1]) {
                    await cloudinary.uploader.destroy(match[1]);
                }
            } catch (err) {
                console.error('Cloudinary deletion error during update:', err);
            }
        }

        blog.content = content || blog.content;
        blog.mood = mood || blog.mood;
        blog.displayMode = displayMode || blog.displayMode;
        blog.isAnonymous = isAnonymous === 'true' || isAnonymous === true ? true : (isAnonymous === 'false' || isAnonymous === false ? false : blog.isAnonymous);

        if (tags) {
            blog.tags = tags.split(',').map(tag => tag.trim());
        }

        blog.mediaUrl = mediaUrl;

        // Handle background image
        if (bodyBackgroundImage !== undefined) {
            blog.backgroundImage = (bodyBackgroundImage === 'null' || bodyBackgroundImage === '') ? '' : bodyBackgroundImage;
        }

        const updatedBlog = await blog.save();
        await updatedBlog.populate('author', 'username displayName profilePic privacySettings');
        res.json(updatedBlog);

    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ message: error.message });
    }
};
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
