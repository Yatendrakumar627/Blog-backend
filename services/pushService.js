<<<<<<< HEAD
import webPush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// Initial setup (will be called on app start)
export const setupPushNotifications = () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webPush.setVapidDetails(
            'mailto:admin@blogapp.com', // Replace with real admin email
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        console.log('Web Push initialized');
    } else {
        console.warn('VAPID keys not found. Push notifications will not work.');
    }
};

export const sendPushNotification = async (subscription, payload) => {
    try {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.warn('Cannot send push: Missing VAPID keys');
            return null;
        }

        const result = await webPush.sendNotification(subscription, JSON.stringify(payload));
        return result;
    } catch (error) {
        console.error('Error sending push notification:', error);
        return null;
    }
};
=======
import webPush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// Initial setup (will be called on app start)
export const setupPushNotifications = () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webPush.setVapidDetails(
            'mailto:admin@blogapp.com', // Replace with real admin email
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        console.log('Web Push initialized');
    } else {
        console.warn('VAPID keys not found. Push notifications will not work.');
    }
};

export const sendPushNotification = async (subscription, payload) => {
    try {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.warn('Cannot send push: Missing VAPID keys');
            return null;
        }

        const result = await webPush.sendNotification(subscription, JSON.stringify(payload));
        return result;
    } catch (error) {
        console.error('Error sending push notification:', error);
        return null;
    }
};
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
