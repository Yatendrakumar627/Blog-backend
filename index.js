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

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
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
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
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
// Restart server to load .env changes

export default app;
