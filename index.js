<<<<<<< HEAD
import './loadEnv.js';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import interactionRoutes from './routes/interactionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import User from './models/User.js';
import cleanupRoutes from './routes/cleanupRoutes.js';

import { setupCronJobs } from './utils/cronJobs.js';
import { connectRedis } from './config/redis.js';

dotenv.config();

connectRedis();
connectDB();
setupCronJobs();

const app = express();

// Create HTTP server and Socket.IO
const server = createServer(app);
const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:5173",
    "http://localhost:3000"
].filter(Boolean);

const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Remove manual OPTIONS

const io = new Server(server, {
    cors: corsOptions
});

// Store connected users: userId -> Set of socketIds
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', async (userId) => {
        socket.userId = userId;

        if (!connectedUsers.has(userId)) {
            connectedUsers.set(userId, new Set());
        }
        connectedUsers.get(userId).add(socket.id);

        console.log(`User ${userId} joined with socket ${socket.id}. total: ${connectedUsers.get(userId).size}`);

        // Update user document: set isOnline true only if it's the first connection
        if (connectedUsers.get(userId).size === 1) {
            try {
                await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: null });
                socket.broadcast.emit('user_online', { userId });
            } catch (err) {
                console.error('Error updating online status on join:', err);
            }
        }
    });

    socket.on('disconnect', async () => {
        if (socket.userId && connectedUsers.has(socket.userId)) {
            const userConnections = connectedUsers.get(socket.userId);
            userConnections.delete(socket.id);

            console.log(`User ${socket.userId} disconnected socket ${socket.id}. remaining: ${userConnections.size}`);

            // Update user document: set isOnline false and record lastSeen only if no more connections
            if (userConnections.size === 0) {
                connectedUsers.delete(socket.userId);
                try {
                    const lastSeen = new Date();
                    await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen });
                    socket.broadcast.emit('user_offline', { userId: socket.userId, lastSeen });
                } catch (err) {
                    console.error('Error updating offline status on disconnect:', err);
                }
            }
        }
    });

    socket.on('typing', ({ conversationId, recipientId }) => {
        const recipientSockets = connectedUsers.get(recipientId);
        if (recipientSockets) {
            recipientSockets.forEach(socketId => {
                io.to(socketId).emit('user_typing', { conversationId, userId: socket.userId });
            });
        }
    });

    socket.on('stop_typing', ({ conversationId, recipientId }) => {
        const recipientSockets = connectedUsers.get(recipientId);
        if (recipientSockets) {
            recipientSockets.forEach(socketId => {
                io.to(socketId).emit('user_stop_typing', { conversationId, userId: socket.userId });
            });
        }
    });
});

// Make io available to routes
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5100;

const isVercel = process.env.VERCEL === '1';
if (!isVercel) {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
=======
import './loadEnv.js';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import interactionRoutes from './routes/interactionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import cleanupRoutes from './routes/cleanupRoutes.js';

import { setupCronJobs } from './utils/cronJobs.js';
import { connectRedis } from './config/redis.js';

dotenv.config();

connectRedis();
connectDB();
setupCronJobs();

const app = express();

// Create HTTP server and Socket.IO
const server = createServer(app);
const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:5173",
    "https://blog-frontend-one-omega.vercel.app"
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        const isAllowed = allowedOrigins.some(allowed =>
            allowed.replace(/\/$/, '') === origin.replace(/\/$/, '')
        );

        if (isAllowed || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

const io = new Server(server, {
    cors: corsOptions
});

// Store connected users
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (userId) => {
        connectedUsers.set(userId, socket.id);
        socket.userId = userId;
        console.log(`User ${userId} joined with socket ${socket.id}`);

        // Broadcast user online status to all connected clients
        socket.broadcast.emit('user_online', { userId });
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            console.log(`User ${socket.userId} disconnected`);

            // Broadcast user offline status to all connected clients
            socket.broadcast.emit('user_offline', { userId: socket.userId });
        }
    });
});

// Make io available to routes
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(compression()); // Added

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5100;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
