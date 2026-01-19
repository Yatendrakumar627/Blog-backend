import User from '../models/User.js';

// Manual permanent cleanup endpoint
export const permanentCleanup = async (req, res) => {
    try {
        console.log('🗑️ Manual permanent cleanup triggered by admin');
        
        const result = await User.permanentCleanup();
        
        res.status(200).json({
            success: true,
            message: 'Permanent cleanup completed successfully',
            data: result
        });
    } catch (error) {
        console.error('❌ Error in permanent cleanup:', error);
        res.status(500).json({
            success: false,
            message: 'Error during cleanup',
            error: error.message
        });
    }
};

// Get cleanup statistics
export const getCleanupStats = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const stats = await User.aggregate([
            { $match: { notifications: { $exists: true, $ne: null } } },
            { $project: { 
                notificationCount: { $size: "$notifications" },
                oldNotifications: {
                    $size: {
                        $filter: {
                            input: "$notifications",
                            cond: { $lt: ["$$this.createdAt", thirtyDaysAgo] }
                        }
                    }
                },
                oldestNotification: { $min: "$notifications.createdAt" },
                newestNotification: { $max: "$notifications.createdAt" }
            }},
            { $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                totalNotifications: { $sum: "$notificationCount" },
                oldNotificationsCount: { $sum: "$oldNotifications" },
                oldestOverall: { $min: "$oldestNotification" },
                newestOverall: { $max: "$newestNotification" }
            }}
        ]);
        
        res.status(200).json({
            success: true,
            data: stats[0] || { 
                totalUsers: 0, 
                totalNotifications: 0, 
                oldNotificationsCount: 0 
            }
        });
    } catch (error) {
        console.error('❌ Error getting cleanup stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting statistics',
            error: error.message
        });
    }
};
