<<<<<<< HEAD
import Comment from '../models/Comment.js';
import Blog from '../models/Blog.js';
import { createNotification } from './notificationController.js';

export const addComment = async (req, res) => {
    try {
        const { content, blogId } = req.body;
        const userId = req.user.id; // Corrected: user.id from authMiddleware

        if (!content || !blogId) {
            return res.status(400).json({ message: "Content and Blog ID are required" });
        }

        const blog = await Blog.findById(blogId);
        const io = req.app.get('io');
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        const newComment = new Comment({
            content,
            author: userId,
            blog: blogId
        });

        const savedComment = await newComment.save();

        // Trigger notification
        await createNotification(blog.author, userId, 'comment', blogId, io);

        // Populate author details before sending response
        await savedComment.populate('author', '_id username displayName profilePic privacySettings');

        const commentObj = savedComment.toObject();
        if (commentObj.author) {
            commentObj.author.isOnline = true; // Commenter is obviously online
        }

        res.status(201).json(commentObj);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getComments = async (req, res) => {
    try {
        const { blogId } = req.params;

        const comments = await Comment.find({ blog: blogId })
            .populate('author', '_id username displayName profilePic privacySettings')
            .sort({ createdAt: -1 })
            .lean();

        const connectedUsers = req.app.get('connectedUsers');
        const commentsWithStatus = comments.map(comment => {
            if (comment.author && typeof comment.author === 'object') {
                const isOnline = connectedUsers && connectedUsers.has(comment.author._id.toString());
                comment.author.isOnline = isOnline && (comment.author.privacySettings?.showOnlineStatus !== false);
            }
            return comment;
        });

        res.status(200).json(commentsWithStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user.id;

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Check if user is the author of the comment
        if (comment.author.toString() !== userId) {
            return res.status(403).json({ message: "You are not authorized to delete this comment" });
        }

        await Comment.deleteOne({ _id: commentId });

        res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};
=======
import Comment from '../models/Comment.js';
import Blog from '../models/Blog.js';
import { createNotification } from './notificationController.js';

export const addComment = async (req, res) => {
    try {
        const { content, blogId } = req.body;
        const userId = req.user.id; // Corrected: user.id from authMiddleware

        if (!content || !blogId) {
            return res.status(400).json({ message: "Content and Blog ID are required" });
        }

        const blog = await Blog.findById(blogId);
        const io = req.app.get('io');
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        const newComment = new Comment({
            content,
            author: userId,
            blog: blogId
        });

        const savedComment = await newComment.save();

        // Trigger notification
        await createNotification(blog.author, userId, 'comment', blogId, io);

        // Populate author details before sending response
        await savedComment.populate('author', '_id username displayName profilePic privacySettings');

        const commentObj = savedComment.toObject();
        if (commentObj.author) {
            commentObj.author.isOnline = true; // Commenter is obviously online
        }

        res.status(201).json(commentObj);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getComments = async (req, res) => {
    try {
        const { blogId } = req.params;

        const comments = await Comment.find({ blog: blogId })
            .populate('author', '_id username displayName profilePic privacySettings')
            .sort({ createdAt: -1 })
            .lean();

        const connectedUsers = req.app.get('connectedUsers');
        const commentsWithStatus = comments.map(comment => {
            if (comment.author && typeof comment.author === 'object') {
                const isOnline = connectedUsers && connectedUsers.has(comment.author._id.toString());
                comment.author.isOnline = isOnline && (comment.author.privacySettings?.showOnlineStatus !== false);
            }
            return comment;
        });

        res.status(200).json(commentsWithStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user.id;

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Check if user is the author of the comment
        if (comment.author.toString() !== userId) {
            return res.status(403).json({ message: "You are not authorized to delete this comment" });
        }

        await Comment.deleteOne({ _id: commentId });

        res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
