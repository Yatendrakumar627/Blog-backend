<<<<<<< HEAD
import mongoose from 'mongoose';

const interactionSchema = mongoose.Schema({
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment'], required: true },
    text: { type: String }, // Content if it's a comment
}, { timestamps: true });

// Indexes
interactionSchema.index({ blog: 1, type: 1 }); // For fetching/counting comments per blog
interactionSchema.index({ user: 1 }); // For fetching user activity

const Interaction = mongoose.model('Interaction', interactionSchema);

export default Interaction;
=======
import mongoose from 'mongoose';

const interactionSchema = mongoose.Schema({
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment'], required: true },
    text: { type: String }, // Content if it's a comment
}, { timestamps: true });

// Indexes
interactionSchema.index({ blog: 1, type: 1 }); // For fetching/counting comments per blog
interactionSchema.index({ user: 1 }); // For fetching user activity

const Interaction = mongoose.model('Interaction', interactionSchema);

export default Interaction;
>>>>>>> 6e17f64bdf4d9035de8c98e4477237c68f177673
