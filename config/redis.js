import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        connectTimeout: 5000 // 5 seconds timeout
    }
});

let isRedisConnected = false;

redisClient.on('error', (err) => {
    isRedisConnected = false;
    // Suppress intense logging for connection refusal to avoid console spam
    if (err.code !== 'ECONNREFUSED') {
        console.log('Redis Client Error', err);
    }
});

redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('Redis Client Connected');
});

redisClient.on('end', () => {
    isRedisConnected = false;
    console.log('Redis Client Disconnected');
});

export const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        isRedisConnected = false;
        console.error('Could not connect to Redis (Running without cache):', error.message);
    }
};

export const getCache = async (key) => {
    if (!isRedisConnected) return null;
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Redis Get Error:', error);
        return null;
    }
};

export const setCache = async (key, value, duration = 3600) => {
    if (!isRedisConnected) return;
    try {
        await redisClient.setEx(key, duration, JSON.stringify(value));
    } catch (error) {
        console.error('Redis Set Error:', error);
    }
};

export const delCache = async (pattern) => {
    if (!isRedisConnected) return;
    try {
        // If pattern contains *, we need to scan and delete
        if (pattern.includes('*')) {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
        } else {
            await redisClient.del(pattern);
        }
    } catch (error) {
        console.error('Redis Delete Error:', error);
    }
};

export default redisClient;
