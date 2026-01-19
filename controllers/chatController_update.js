
// @desc    Update conversation theme
// @route   PUT /api/chat/theme/:conversationId
// @access  Private
export const updateTheme = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { theme } = req.body;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        // Check if user is participant
        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({ message: "Not authorized to update this conversation" });
        }

        conversation.theme = theme;
        await conversation.save();

        // Notify participants via socket
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        if (io) {
            conversation.participants.forEach(participantId => {
                const socketId = connectedUsers.get(participantId.toString());
                if (socketId) {
                    io.to(socketId).emit('conversation_theme_updated', {
                        conversationId,
                        theme
                    });
                }
            });
        }

        res.json({ message: "Theme updated", theme });
    } catch (error) {
        console.error('Update theme error:', error);
        res.status(500).json({ message: error.message });
    }
};
