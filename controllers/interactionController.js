import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import Blog from '../models/Blog.js';

// Toggle Follow User
export const toggleFollow = async (req, res) => {
    try {
        const { id: targetUserId } = req.params;
        const currentUserId = req.user.id;
        const io = req.app.get('io');

        if (targetUserId === currentUserId) {
            return res.status(400).json({ message: "You cannot follow yourself" });
        }

        const targetUser = await User.findById(targetUserId);
        const currentUser = await User.findById(currentUserId);

        if (!targetUser || !currentUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isFollowing = currentUser.following.includes(targetUserId);

        if (isFollowing) {
            // Unfollow
            currentUser.following = currentUser.following.filter(id => id.toString() !== targetUserId);
            targetUser.followers = targetUser.followers.filter(id => id.toString() !== currentUserId);
            await currentUser.save();
            await targetUser.save();
            res.status(200).json({ message: "Unfollowed successfully", isFollowing: false });
        } else {
            // Follow
            currentUser.following.push(targetUserId);
            targetUser.followers.push(currentUserId);
            await currentUser.save();
            await targetUser.save();

            await createNotification(targetUserId, currentUserId, 'follow', null, io);

            res.status(200).json({ message: "Followed successfully", isFollowing: true });
        }

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Toggle Bookmark Post
export const toggleBookmark = async (req, res) => {
    try {
        const { id: blogId } = req.params;
        const userId = req.user.id;

        const blog = await Blog.findById(blogId);
        if (!blog) {
            return res.status(404).json({ message: "Blog post not found" });
        }

        const user = await User.findById(userId);

        const isBookmarked = user.bookmarks.includes(blogId);

        if (isBookmarked) {
            // Remove Bookmark
            user.bookmarks = user.bookmarks.filter(id => id.toString() !== blogId);
            await user.save();
            res.status(200).json({ message: "Bookmark removed", isBookmarked: false });
        } else {
            // Add Bookmark
            user.bookmarks.push(blogId);
            await user.save();
            res.status(200).json({ message: "Bookmarked successfully", isBookmarked: true });
        }

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
