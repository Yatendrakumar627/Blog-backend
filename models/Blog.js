import mongoose from 'mongoose';

const blogSchema = mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    mediaUrl: { type: String },
    backgroundImage: { type: String }, // Custom background for Poetry/Shayari modes
    tags: [{ type: String }],
    mood: { type: String, enum: ['Happy', 'Sad', 'Thoughtful', 'Healing', 'Excited', 'Angry'], default: 'Thoughtful' },
    displayMode: { type: String, enum: ['Standard', 'Poetry', 'Shayari'], default: 'Standard' },
    isAnonymous: { type: Boolean, default: false },
    reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, enum: ['I feel this', 'Sending hugs', 'Resonates', 'Snaps'], default: 'I feel this' }
    }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Keep for backward compatibility/easy querying
}, { timestamps: true });

// Indexes for performance
blogSchema.index({ author: 1, createdAt: -1 });
blogSchema.index({ createdAt: -1 }); // For discover feed sort
blogSchema.index({ mood: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ likes: 1 }); // For 'Liked Posts' query

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;
