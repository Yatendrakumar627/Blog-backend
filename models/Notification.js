import mongoose from 'mongoose';

const notificationSchema = mongoose.Schema({
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment', 'follow'], required: true },
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog' },
    read: { type: Boolean, default: false },
}, { timestamps: true });

// Indexes
notificationSchema.index({ recipient: 1, createdAt: -1 }); // For fetching user notifications sorted by date
notificationSchema.index({ recipient: 1, read: 1 }); // For counting unread notifications

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
