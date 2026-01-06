import Notification from '../models/Notification.js';
import User from '../models/User.js';

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .populate('sender', 'username profilePic privacySettings')
            .populate('blog', 'title')
            .lean();

        const connectedUsers = req.app.get('connectedUsers');
        const notificationsWithStatus = notifications.map(n => {
            if (n.sender && typeof n.sender === 'object') {
                const isOnline = connectedUsers && connectedUsers.has(n.sender._id.toString());
                n.sender.isOnline = isOnline && (n.sender.privacySettings?.showOnlineStatus !== false);
            }
            return n;
        });

        res.json(notificationsWithStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markRead = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (notification) {
            if (notification.recipient.toString() !== req.user._id.toString()) {
                return res.status(401).json({ message: 'Not authorized' });
            }

            notification.read = true;
            await notification.save();
            res.json(notification);
        } else {
            res.status(404).json({ message: 'Notification not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
export const markAllRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, read: false },
            { $set: { read: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Internal Helper to create notification
export const createNotification = async (recipientId, senderId, type, blogId = null, io = null) => {
    try {
        if (recipientId.toString() === senderId.toString()) return;

        const recipient = await User.findById(recipientId);
        if (!recipient) return;

        // Check if user has disabled this type of notification
        const settings = recipient.notificationSettings || {};
        if (type === 'like' && settings.likeNotifications === false) return;
        if (type === 'comment' && settings.commentNotifications === false) return;
        if (type === 'follow' && settings.followNotifications === false) return;

        const notification = await Notification.create({
            recipient: recipientId,
            sender: senderId,
            type,
            blog: blogId
        });

        // Populate notification data for real-time sending
        const populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'username profilePic')
            .populate('blog', 'title');

        // Send real-time notification if io is available
        if (io) {
            const connectedUsers = io.sockets.sockets;
            for (const [socketId, socket] of connectedUsers) {
                if (socket.userId === recipientId.toString()) {
                    io.to(socketId).emit('notification', populatedNotification);
                    break;
                }
            }
        }

        return populatedNotification;
    } catch (error) {
        console.error('Notification creation failed:', error);
    }
};
