import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        minlength: 3,
        maxlength: 20,
        match: /^[a-zA-Z0-9_]+$/,
        validate: {
            validator: function (username) {
                return !/^[0-9]/.test(username); // Username cannot start with a number
            },
            message: 'Username cannot start with a number'
        }
    },
    displayName: {
        type: String,
        maxlength: 50,
        default: ''
    },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    bio: { type: String, default: '' },
    profilePic: { type: String, default: '' },
    coverPic: { type: String, default: '' },
    notificationSettings: {
        emailNotifications: { type: Boolean, default: true },
        pushNotifications: { type: Boolean, default: false },
        commentNotifications: { type: Boolean, default: true },
        likeNotifications: { type: Boolean, default: true },
        followNotifications: { type: Boolean, default: true }
    },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Blog' }],
    notifications: [{
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: ['like', 'comment', 'follow'], required: true },
        blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    }],
}, { timestamps: true });

// Create index for faster searches
userSchema.index({ followers: 1 });
userSchema.index({ following: 1 });
userSchema.index({ 'notifications.createdAt': -1 }); // For efficient notification sorting

// Static method to clean notifications older than 30 days
userSchema.statics.cleanOldNotifications = async function () {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.updateMany(
        {},
        {
            $pull: {
                notifications: {
                    createdAt: { $lt: thirtyDaysAgo }
                }
            }
        }
    );

    console.log(`Cleaned old notifications from ${result.modifiedCount} users`);
    return result;
};

// Static method for permanent cleanup - removes all old notifications and compacts database
userSchema.statics.permanentCleanup = async function () {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log('🗑️ Starting permanent notification cleanup...');

    // Step 1: Remove old notifications from all users
    const result = await this.updateMany(
        {},
        {
            $pull: {
                notifications: {
                    createdAt: { $lt: thirtyDaysAgo }
                }
            }
        }
    );

    console.log(`Removed old notifications from ${result.modifiedCount} users`);

    // Step 2: Optimize database by removing empty notification arrays
    const compactResult = await this.updateMany(
        { notifications: { $size: 0 } },
        { $unset: { notifications: "" } }
    );

    console.log(`Compacted ${compactResult.modifiedCount} users with empty notification arrays`);

    // Step 3: Get statistics
    const stats = await this.aggregate([
        { $match: { notifications: { $exists: true, $ne: null } } },
        {
            $project: {
                notificationCount: { $size: "$notifications" },
                oldestNotification: { $min: "$notifications.createdAt" },
                newestNotification: { $max: "$notifications.createdAt" }
            }
        },
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                totalNotifications: { $sum: "$notificationCount" },
                oldestOverall: { $min: "$oldestNotification" },
                newestOverall: { $max: "$newestNotification" }
            }
        }
    ]);

    console.log('📊 Cleanup Statistics:', stats[0] || { totalUsers: 0, totalNotifications: 0 });

    return {
        cleanedUsers: result.modifiedCount,
        compactedUsers: compactResult.modifiedCount,
        statistics: stats[0] || { totalUsers: 0, totalNotifications: 0 }
    };
};

// Instance method to add notification to user's notifications array
userSchema.methods.addNotification = async function (notificationData) {
    // Add new notification
    this.notifications.push(notificationData);

    // Keep only last 30 notifications
    if (this.notifications.length > 30) {
        this.notifications = this.notifications.slice(-30);
    }

    await this.save();
    return this.notifications;
};

const User = mongoose.model('User', userSchema);

export default User;
