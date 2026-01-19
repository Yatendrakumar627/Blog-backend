import mongoose from 'mongoose';

let cachedConnection = null;

const connectDB = async () => {
    if (cachedConnection) {
        return cachedConnection;
    }

    if (!process.env.MONGO_URI) {
        console.error('CRITICAL: MONGO_URI is not defined in environment variables');
        return;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 8000,
            socketTimeoutMS: 45000,
            heartbeatFrequencyMS: 1000,
        });

        cachedConnection = conn;
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        // Don't set cachedConnection if it failed
    }
};

mongoose.connection.on('error', (err) => {
    console.error(`Mongoose connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected');
});

export default connectDB;
