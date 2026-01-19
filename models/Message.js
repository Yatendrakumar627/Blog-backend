<<<<<<< HEAD
import mongoose from 'mongoose';

const messageSchema = mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    mediaUrl: {
        type: String,
        default: null
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', 'file', null],
        default: null
    },
    reactions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: String
    }],
    read: {
        type: Boolean,
        default: false
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    }
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, read: 1 }); // Optimized for unread count query

const Message = mongoose.model('Message', messageSchema);

export default Message;
=======
import mongoose from 'mongoose';

const messageSchema = mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    }
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, read: 1 }); // Optimized for unread count query

const Message = mongoose.model('Message', messageSchema);

export default Message;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
