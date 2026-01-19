<<<<<<< HEAD
import cron from 'node-cron';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// Run every day at midnight
// '0 0 * * *' = at 00:00 every day
export const setupCronJobs = () => {
    console.log('📅 Initializing Cron Jobs...');

    cron.schedule('0 0 * * *', async () => {
        console.log('🗑️ Running daily trash cleanup...');
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Find all conversations that have deletions older than 7 days
            const conversationsToCheck = await Conversation.find({
                'isDeleted.deletedAt': { $lt: sevenDaysAgo }
            });

            console.log(`Found ${conversationsToCheck.length} conversations to check for expiration.`);

            for (const conv of conversationsToCheck) {
                // Identify which participants have expired deletions
                const expiredUserIds = conv.isDeleted
                    .filter(d => d.deletedAt < sevenDaysAgo)
                    .map(d => d.user.toString());

                if (expiredUserIds.length === 0) continue;

                // Check if ALL participants have deleted this chat (expired or not)
                // If all participants have deleted the chat, and at least one is expired, 
                // we should check if *everyone* has expired or if we should just wait?
                // Logic: If EVERY participant has deleted the chat, we can safely delete it permanently
                // if the "latest" deletion is older than 7 days. 
                // OR, simpler: process each expired user individually.

                // APPROACH: Remove the user from the conversation's participant list effectively "permanently deleting" it for them.
                // If NO participants left, delete the whole conversation.

                // 1. Remove expired users from participants list
                conv.participants = conv.participants.filter(p => !expiredUserIds.includes(p.toString()));

                // 2. Remove the deletion record for them (cleanup)
                conv.isDeleted = conv.isDeleted.filter(d => !expiredUserIds.includes(d.user.toString()));

                // 3. If no participants left, delete the conversation and messages
                if (conv.participants.length === 0) {
                    await Message.deleteMany({ conversationId: conv._id });
                    await Conversation.findByIdAndDelete(conv._id);
                    console.log(`Permanently deleted conversation ${conv._id} (no participants left)`);
                } else {
                    await conv.save();
                    console.log(`Removed expired users ${expiredUserIds} from conversation ${conv._id}`);
                }
            }
            console.log('✅ Daily trash cleanup completed.');
        } catch (error) {
            console.error('❌ Error in trash cleanup cron job:', error);
        }
    });

    // Clean notifications older than 30 days - runs daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('🔔 Running permanent notification cleanup...');
        try {
            await User.permanentCleanup();
            console.log('✅ Permanent notification cleanup completed.');
        } catch (error) {
            console.error('❌ Error in permanent notification cleanup cron job:', error);
        }
    });

    console.log('✅ Cron Jobs scheduled.');
};
=======
import cron from 'node-cron';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// Run every day at midnight
// '0 0 * * *' = at 00:00 every day
export const setupCronJobs = () => {
    console.log('📅 Initializing Cron Jobs...');

    cron.schedule('0 0 * * *', async () => {
        console.log('🗑️ Running daily trash cleanup...');
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Find all conversations that have deletions older than 7 days
            const conversationsToCheck = await Conversation.find({
                'isDeleted.deletedAt': { $lt: sevenDaysAgo }
            });

            console.log(`Found ${conversationsToCheck.length} conversations to check for expiration.`);

            for (const conv of conversationsToCheck) {
                // Identify which participants have expired deletions
                const expiredUserIds = conv.isDeleted
                    .filter(d => d.deletedAt < sevenDaysAgo)
                    .map(d => d.user.toString());

                if (expiredUserIds.length === 0) continue;

                // Check if ALL participants have deleted this chat (expired or not)
                // If all participants have deleted the chat, and at least one is expired, 
                // we should check if *everyone* has expired or if we should just wait?
                // Logic: If EVERY participant has deleted the chat, we can safely delete it permanently
                // if the "latest" deletion is older than 7 days. 
                // OR, simpler: process each expired user individually.

                // APPROACH: Remove the user from the conversation's participant list effectively "permanently deleting" it for them.
                // If NO participants left, delete the whole conversation.

                // 1. Remove expired users from participants list
                conv.participants = conv.participants.filter(p => !expiredUserIds.includes(p.toString()));

                // 2. Remove the deletion record for them (cleanup)
                conv.isDeleted = conv.isDeleted.filter(d => !expiredUserIds.includes(d.user.toString()));

                // 3. If no participants left, delete the conversation and messages
                if (conv.participants.length === 0) {
                    await Message.deleteMany({ conversationId: conv._id });
                    await Conversation.findByIdAndDelete(conv._id);
                    console.log(`Permanently deleted conversation ${conv._id} (no participants left)`);
                } else {
                    await conv.save();
                    console.log(`Removed expired users ${expiredUserIds} from conversation ${conv._id}`);
                }
            }
            console.log('✅ Daily trash cleanup completed.');
        } catch (error) {
            console.error('❌ Error in trash cleanup cron job:', error);
        }
    });

    // Clean notifications older than 30 days - runs daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('🔔 Running permanent notification cleanup...');
        try {
            await User.permanentCleanup();
            console.log('✅ Permanent notification cleanup completed.');
        } catch (error) {
            console.error('❌ Error in permanent notification cleanup cron job:', error);
        }
    });

    console.log('✅ Cron Jobs scheduled.');
};
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
