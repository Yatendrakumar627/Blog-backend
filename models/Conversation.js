import mongoose from 'mongoose';

const conversationSchema = mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    theme: {
        type: String,
        default: 'default'
    },
    // Trash system fields
    isDeleted: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        deletedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isPermanentlyDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Ensure unique conversation for same set of participants (simplified for 2 users)
// Ensure unique conversation for same set of participants (simplified for 2 users)
conversationSchema.index({ participants: 1, updatedAt: -1 }); // Optimized for calculating list sorted by recent activity

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
