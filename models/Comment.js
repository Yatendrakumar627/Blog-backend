import mongoose from 'mongoose';

const commentSchema = mongoose.Schema({
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
}, { timestamps: true });

// Index for faster fetching of comments for a blog
commentSchema.index({ blog: 1, createdAt: -1 });

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
