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
import rateLimit from 'express-rate-limit';

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
    "http://localhost:3000",
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

// Rate limiting - General API limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased from 100 to 1000 to prevent lockouts during normal SPA usage/development
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' }
});

// Strict rate limiter for auth endpoints (login/register)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Increased from 15 to 30 for better development experience
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again after 15 minutes.' }
});

// Apply rate limiters
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.get('/api/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ message: 'No URL provided' });

        // Validate URL format
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return res.status(400).json({ message: 'Invalid URL format' });
        }

        // Only allow HTTPS (and HTTP for development)
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return res.status(400).json({ message: 'Only HTTP/HTTPS URLs are allowed' });
        }

        // Block internal/private IP ranges to prevent SSRF
        const hostname = parsedUrl.hostname;
        const blockedPatterns = [
            /^localhost$/i,
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2\d|3[01])\./,
            /^192\.168\./,
            /^169\.254\./,    // AWS metadata
            /^0\./,
            /^\[::1\]/,       // IPv6 localhost
            /^metadata\./i,   // Cloud metadata endpoints
        ];

        if (blockedPatterns.some(pattern => pattern.test(hostname))) {
            return res.status(403).json({ message: 'Access to internal resources is not allowed' });
        }

        // Only allow known image CDN domains
        const allowedDomains = [
            'res.cloudinary.com',
            'images.unsplash.com',
            'i.imgur.com',
            'cdn.pixabay.com',
            'images.pexels.com',
            'lh3.googleusercontent.com',
            'avatars.githubusercontent.com',
            'upload.wikimedia.org',
        ];

        if (!allowedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
            return res.status(403).json({ message: 'Domain not allowed for proxying' });
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        
        const contentType = response.headers.get('content-type') || '';
        // Only allow image content types
        if (!contentType.startsWith('image/')) {
            return res.status(400).json({ message: 'Only image content is allowed through proxy' });
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Limit response size to 10MB
        if (buffer.length > 10 * 1024 * 1024) {
            return res.status(413).json({ message: 'Image too large (max 10MB)' });
        }
        
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=31536000');
        res.send(buffer);
    } catch (e) {
        res.status(500).json({ message: 'Proxy error' });
    }
});

app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5100;

const isVercel = process.env.VERCEL === '1';
if (!isVercel) {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
