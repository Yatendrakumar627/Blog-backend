import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

// @desc    Get or create a conversation with a specific user
// @route   POST /api/chat/conversation
// @access  Private
export const getOrCreateConversation = async (req, res) => {
    try {
        const { recipientId } = req.body;
        const senderId = req.user._id;

        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }

        if (recipientId === senderId.toString()) {
            return res.status(400).json({ message: "You cannot chat with yourself" });
        }

        // Check if recipientId is a username or ObjectId
        let recipient;
        if (mongoose.Types.ObjectId.isValid(recipientId)) {
            // It's an ObjectId, find by ID
            recipient = await User.findById(recipientId);
        } else {
            // It's a username, find by username
            recipient = await User.findOne({ username: recipientId });
        }

        if (!recipient) {
            return res.status(404).json({ message: "Recipient not found" });
        }

        // Check privacy settings
        const privacy = recipient.privacySettings || {};

        if (privacy.allowMessages === false) {
            return res.status(403).json({ message: "This user has disabled direct messaging" });
        }

        // Find existing conversation between these two users
        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, recipient._id] }
        }).populate('participants', 'username profilePic displayName privacySettings');

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, recipient._id]
            });
            conversation = await conversation.populate('participants', 'username profilePic displayName privacySettings');
        }

        res.status(200).json(conversation);
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all conversations for the current user
// @route   GET /api/chat/conversations
// @access  Private
export const getConversations = async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id
        })
            .populate('participants', 'username profilePic displayName privacySettings')
            .populate('lastMessage')
            .sort({ updatedAt: -1 });

        // Get connected users from Socket.IO
        const connectedUsers = req.app.get('connectedUsers');

        // Add online status to each conversation participant
        const conversationsWithOnlineStatus = conversations.map(conv => {
            const participants = conv.participants.map(participant => {
                const isSocketConnected = connectedUsers ? connectedUsers.has(participant._id.toString()) : false;
                const isOnline = isSocketConnected && (participant.privacySettings?.showOnlineStatus !== false);
                return {
                    ...participant.toObject(),
                    isOnline
                };
            });

            return {
                ...conv.toObject(),
                participants
            };
        });

        res.json(conversationsWithOnlineStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get messages for a specific conversation
// @route   GET /api/chat/messages/:conversationId
// @access  Private
export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await Message.find({ conversationId })
            .sort({ createdAt: 1 })
            .populate('sender', 'username profilePic privacySettings') // Added privacySettings
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username privacySettings' // Added privacySettings
                }
            });

        // Get connected users from Socket.IO
        const connectedUsers = req.app.get('connectedUsers');

        // Add online status to message senders
        const messagesWithOnlineStatus = messages.map(message => {
            if (message.sender) {
                const sender = message.sender.toObject();
                // Ensure privacySettings is populated or handled. message.sender population usually only includes username/profilePic.
                // We might need to check if privacySettings is populated. 
                // Wait, getMessages only populates 'username profilePic'. It DOES NOT populate privacySettings.
                // WE NEED TO UPDATE THE POPULATE CALL FIRST or assume defaults?
                // Actually, for messages, maybe we skip online status if privacy is missing, or we need to fetch it.
                // Let's rely on what's available. If privacySettings is missing, we might leak.
                // Better approach: In getMessages, update populate to include privacySettings.

                // For now, I'll update the logic assuming I'll fix the populate below.
                const isSocketConnected = connectedUsers ? connectedUsers.has(sender._id.toString()) : false;
                sender.isOnline = isSocketConnected && (sender.privacySettings?.showOnlineStatus !== false);
                message.sender = sender;
            }

            // Also handle replyTo sender if exists
            if (message.replyTo && message.replyTo.sender) {
                const replySender = message.replyTo.sender; // This is a doc if populated?
                // replyTo population also needs privacySettings
                const isSocketConnected = connectedUsers ? connectedUsers.has(replySender._id.toString()) : false;
                replySender.isOnline = isSocketConnected && (replySender.privacySettings?.showOnlineStatus !== false);
            }

            return message;
        });

        res.json(messagesWithOnlineStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Send a message
// @route   POST /api/chat/message
// @access  Private
export const sendMessage = async (req, res) => {
    try {
        const { conversationId, recipientId, text, replyTo } = req.body;
        const senderId = req.user._id;

        // Check if recipientId is a username or ObjectId
        let recipient;
        if (mongoose.Types.ObjectId.isValid(recipientId)) {
            // It's an ObjectId, find by ID
            recipient = await User.findById(recipientId);
        } else {
            // It's a username, find by username
            recipient = await User.findOne({ username: recipientId });
        }

        if (!recipient) {
            return res.status(404).json({ message: "Recipient not found" });
        }

        if (recipient.privacySettings?.allowMessages === false) {
            return res.status(403).json({ message: "This user has disabled direct messaging" });
        }

        const message = await Message.create({
            conversationId,
            sender: senderId,
            recipient: recipient._id,
            text,
            replyTo: replyTo || null
        });

        // Update last message in conversation
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: message._id
        });

        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username profilePic privacySettings')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username privacySettings'
                }
            });

        // Socket.io emission will be handled in the socket handler or here if io passed
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        // Add online status to message sender
        if (populatedMessage.sender && connectedUsers) {
            const sender = populatedMessage.sender.toObject();
            sender.isOnline = connectedUsers.has(sender._id.toString());
            populatedMessage.sender = sender;
        }

        // Also handle replyTo sender if exists
        if (populatedMessage.replyTo && populatedMessage.replyTo.sender && connectedUsers) {
            const replySender = populatedMessage.replyTo.sender;
            replySender.isOnline = connectedUsers.has(replySender._id.toString());
        }

        if (io && connectedUsers) {
            const recipientSocketId = connectedUsers.get(recipientId);
            if (recipientSocketId) {
                // Check if the conversation is in trash for the recipient
                const conversation = await Conversation.findById(conversationId);
                const isRecipientTrash = conversation.isDeleted &&
                    conversation.isDeleted.some(deletion => deletion.user.toString() === recipientId.toString());

                // Emit message with trash information
                io.to(recipientSocketId).emit('new_message', {
                    ...populatedMessage.toObject(),
                    isTrashed: isRecipientTrash
                });

                // If conversation is in trash, also emit a special notification
                if (isRecipientTrash) {
                    io.to(recipientSocketId).emit('message_in_trashed_chat', {
                        conversationId,
                        message: populatedMessage,
                        sender: populatedMessage.sender,
                        text: populatedMessage.text
                    });
                }
            }
        }

        res.status(201).json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get unread messages count
// @route   GET /api/chat/unread-count
// @access  Private
export const getUnreadCount = async (req, res) => {
    try {
        const count = await Message.countDocuments({
            recipient: req.user._id,
            read: false
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark all messages in a conversation as read
// @route   PUT /api/chat/read/:conversationId
// @access  Private
export const markAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        await Message.updateMany(
            { conversationId, recipient: req.user._id, read: false },
            { $set: { read: true } }
        );
        res.json({ message: "Messages marked as read" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Move conversation to trash (soft delete)
// @route   DELETE /api/chat/conversation/:conversationId
// @access  Private
export const deleteConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;

        // Find the conversation and verify user is a participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        // Check if user is a participant in this conversation
        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({ message: "Not authorized to delete this conversation" });
        }

        // Check if already deleted by this user
        const alreadyDeleted = conversation.isDeleted.some(deletion =>
            deletion.user.toString() === userId.toString()
        );

        if (alreadyDeleted) {
            return res.status(400).json({ message: "Conversation already in trash" });
        }

        // Add user to deleted array (move to trash)
        conversation.isDeleted.push({
            user: userId,
            deletedAt: new Date()
        });

        await conversation.save();

        // Socket emission to update UI in real-time
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        if (io && connectedUsers) {
            // Notify the other participant that conversation was moved to trash
            const otherParticipantId = conversation.participants.find(id => id.toString() !== userId.toString());
            if (otherParticipantId) {
                const otherSocketId = connectedUsers.get(otherParticipantId.toString());
                if (otherSocketId) {
                    io.to(otherSocketId).emit('conversation_moved_to_trash', {
                        conversationId,
                        deletedBy: userId
                    });
                }
            }
        }

        res.json({
            message: "Conversation moved to trash",
            conversationId,
            deletedAt: new Date(),
            willBePermanentlyDeleted: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get trashed conversations for the current user
// @route   GET /api/chat/trash
// @access  Private
export const getTrashedConversations = async (req, res) => {
    try {
        const userId = req.user._id;

        // Only return conversations where the current user has moved them to trash
        const conversations = await Conversation.find({
            'isDeleted.user': userId,
            isPermanentlyDeleted: false
        })
            .populate('participants', 'username displayName profilePic privacySettings')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'username displayName'
                }
            })
            .sort({ updatedAt: -1 });

        // Add hasNewMessages flag to each conversation
        const conversationsWithNewMessages = conversations.map(conv => {
            const userDeletion = conv.isDeleted.find(deletion => deletion.user.toString() === userId.toString());
            const hasNewMessages = conv.lastMessage &&
                new Date(conv.lastMessage.createdAt) > new Date(userDeletion.deletedAt);

            console.log('Trash conversation debug:', {
                conversationId: conv._id,
                lastMessage: conv.lastMessage,
                lastMessageText: conv.lastMessage?.text,
                lastMessageSender: conv.lastMessage?.sender,
                userDeletionDate: userDeletion?.deletedAt,
                hasNewMessages
            });

            return {
                ...conv.toObject(),
                hasNewMessages
            };
        });

        res.json(conversationsWithNewMessages);
    } catch (error) {
        console.error('Get trashed conversations error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Restore conversation from trash
// @route   POST /api/chat/restore/:conversationId
// @access  Private
export const restoreConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        // Remove user from deleted array (restore from trash)
        conversation.isDeleted = conversation.isDeleted.filter(deletion =>
            deletion.user.toString() !== userId.toString()
        );

        await conversation.save();

        // Socket emission to update UI in real-time
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        if (io && connectedUsers) {
            const userSocketId = connectedUsers.get(userId.toString());
            if (userSocketId) {
                io.to(userSocketId).emit('conversation_restored', {
                    conversationId
                });
            }
        }

        res.json({ message: "Conversation restored from trash", conversationId });
    } catch (error) {
        console.error('Restore conversation error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Permanently delete conversation (from trash)
// @route   DELETE /api/chat/permanent-delete/:conversationId
// @access  Private
export const permanentDeleteConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        // Check if user has this conversation in trash
        const userDeleted = conversation.isDeleted.some(deletion =>
            deletion.user.toString() === userId.toString()
        );

        if (!userDeleted) {
            return res.status(400).json({ message: "Conversation not in trash" });
        }

        // Check if all participants have deleted this conversation
        const allParticipantsDeleted = conversation.participants.every(participant =>
            conversation.isDeleted.some(deletion => deletion.user.toString() === participant.toString())
        );

        if (allParticipantsDeleted) {
            // All participants deleted - permanently delete everything
            await Message.deleteMany({ conversationId });
            await Conversation.findByIdAndDelete(conversationId);

            // Notify all participants
            const io = req.app.get('io');
            const connectedUsers = req.app.get('connectedUsers');

            if (io && connectedUsers) {
                conversation.participants.forEach(participantId => {
                    const socketId = connectedUsers.get(participantId.toString());
                    if (socketId) {
                        io.to(socketId).emit('conversation_permanently_deleted', {
                            conversationId
                        });
                    }
                });
            }

            res.json({ message: "Conversation permanently deleted", conversationId });
        } else {
            // Only this user permanently deleted - remove them from deleted array
            conversation.isDeleted = conversation.isDeleted.filter(deletion =>
                deletion.user.toString() !== userId.toString()
            );

            // Remove user from participants
            conversation.participants = conversation.participants.filter(p =>
                p.toString() !== userId.toString()
            );

            await conversation.save();

            res.json({ message: "Conversation permanently deleted for you", conversationId });
        }
    } catch (error) {
        console.error('Permanent delete conversation error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a message
// @route   DELETE /api/chat/message/:messageId
// @access  Private
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        // Check ownership
        if (message.sender.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: "Not authorized to delete this message" });
        }

        await message.deleteOne();

        // Socket emission to update UI in real-time
        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');

        if (io && connectedUsers) {
            const recipientId = message.recipient.toString();
            const recipientSocketId = connectedUsers.get(recipientId);

            // Emit to recipient
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('message_deleted', messageId);
            }
        }

        res.json({ message: "Message deleted", messageId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

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

        if (io && connectedUsers) {
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

// @desc    Download chat conversation
// @route   GET /api/chat/download/:conversationId
// @access  Private
export const downloadChat = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { format = 'doc' } = req.query;
        const userId = req.user._id;

        // Verify user is participant in this conversation
        const conversation = await Conversation.findById(conversationId)
            .populate('participants', 'username displayName');

        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        if (!conversation.participants.some(p => p._id.toString() === userId.toString())) {
            return res.status(403).json({ message: "Not authorized to download this conversation" });
        }

        // Get all messages for this conversation
        const messages = await Message.find({ conversationId })
            .sort({ createdAt: 1 })
            .populate('sender', 'username displayName')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username displayName'
                }
            });

        if (format === 'doc') {
            // Create HTML content that Word can open properly
            let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="Generator" content="Microsoft Word 15">
    <title>Chat Conversation</title>
    <style>
        @page WordSection1 {
            size: 8.5in 11.0in;
            margin: 1.0in 1.0in 1.0in 1.0in;
        }
        div.WordSection1 {
            page: WordSection1;
        }
        body {
            font-family: "Calibri", sans-serif;
            font-size: 11pt;
            line-height: 1.15;
            margin: 0;
            padding: 0;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
        }
        .header h1 {
            font-size: 16pt;
            font-weight: bold;
            color: #333;
            margin: 0 0 10px 0;
        }
        .header p {
            margin: 5px 0;
            font-size: 11pt;
        }
        .date-header {
            font-weight: bold;
            font-size: 12pt;
            color: #666;
            margin: 20px 0 15px 0;
            text-align: center;
            page-break-after: avoid;
        }
        .message {
            margin-bottom: 15px;
            padding: 8px;
            border-left: 3px solid #007bff;
            background-color: #f8f9fa;
            page-break-inside: avoid;
        }
        .sender {
            font-weight: bold;
            color: #333;
            margin-bottom: 2px;
            font-size: 11pt;
        }
        .time {
            font-size: 10pt;
            color: #666;
            margin-bottom: 5px;
        }
        .text {
            color: #000;
            font-size: 11pt;
            margin: 0;
        }
        .reply {
            margin-left: 20px;
            font-style: italic;
            color: #666;
            border-left: 2px solid #ddd;
            padding-left: 10px;
            margin-top: 5px;
            font-size: 10pt;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 10pt;
            color: #666;
            border-top: 1px solid #ccc;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <div class="WordSection1">
        <div class="header">
            <h1>Chat Conversation Export</h1>
            <p><strong>Participants:</strong> ${conversation.participants.map(p => p.displayName || p.username).join(', ')}</p>
            <p><strong>Created:</strong> ${conversation.createdAt.toLocaleString()}</p>
            <p><strong>Total Messages:</strong> ${messages.length}</p>
        </div>
        <div class="messages">
    `;

            let lastDate = null;
            messages.forEach(msg => {
                const senderName = msg.sender.displayName || msg.sender.username;
                const messageDate = new Date(msg.createdAt);
                const currentDate = messageDate.toLocaleDateString();
                const messageTime = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Add date header when date changes
                if (currentDate !== lastDate) {
                    htmlContent += `<div class="date-header">--- ${currentDate} ---</div>`;
                    lastDate = currentDate;
                }

                htmlContent += `
                <div class="message">
                    <div class="sender">${senderName}</div>
                    <div class="time">${messageTime}</div>
                    <div class="text">${msg.text}</div>
                `;

                if (msg.replyTo) {
                    const replySender = msg.replyTo.sender.displayName || msg.replyTo.sender.username;
                    htmlContent += `<div class="reply">↳ Replying to: ${replySender}: "${msg.replyTo.text}"</div>`;
                }

                htmlContent += `</div>`;
            });

            htmlContent += `
        </div>
        <div class="footer">
            <p>Exported at: ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>
            `;

            res.setHeader('Content-Type', 'application/msword');
            res.setHeader('Content-Disposition', `attachment; filename="chat_${conversationId}_${Date.now()}.doc"`);
            return res.send(htmlContent);

        } else if (format === 'txt') {
            // Format as plain text with sender on separate line
            let textContent = `Chat Conversation Export\n`;
            textContent += `========================\n\n`;
            textContent += `Participants: ${conversation.participants.map(p => p.displayName || p.username).join(', ')}\n`;
            textContent += `Created: ${conversation.createdAt.toLocaleString()}\n`;
            textContent += `Total Messages: ${messages.length}\n\n`;
            textContent += `Messages:\n`;
            textContent += `---------\n\n`;

            let lastDate = null;
            messages.forEach(msg => {
                const senderName = msg.sender.displayName || msg.sender.username;
                const messageDate = new Date(msg.createdAt);
                const currentDate = messageDate.toLocaleDateString();
                const messageTime = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Show date header only when date changes
                if (currentDate !== lastDate) {
                    textContent += `\n--- ${currentDate} ---\n\n`;
                    lastDate = currentDate;
                }

                textContent += `${senderName}\n`;
                textContent += `${messageTime}\n`;
                textContent += `${msg.text}\n\n`;

                if (msg.replyTo) {
                    const replySender = msg.replyTo.sender.displayName || msg.replyTo.sender.username;
                    textContent += `↳ Replying to: ${replySender}: "${msg.replyTo.text}"\n\n`;
                }
            });

            textContent += `\nExported at: ${new Date().toLocaleString()}`;

            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="chat_${conversationId}_${Date.now()}.txt"`);
            return res.send(textContent);
        } else if (format === 'csv') {
            // Format as CSV
            let csvContent = 'Timestamp,Sender,Recipient,Message,Reply To,Read\n';

            messages.forEach(msg => {
                const senderName = msg.sender.displayName || msg.sender.username;
                const timestamp = msg.createdAt.toISOString();
                const messageText = `"${msg.text.replace(/"/g, '""')}"`; // Escape quotes
                const replyToText = msg.replyTo ? `"${msg.replyTo.text.replace(/"/g, '""')}"` : '';

                csvContent += `${timestamp},${senderName},${msg.recipient},${messageText},${replyToText},${msg.read}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="chat_${conversationId}_${Date.now()}.csv"`);
            return res.send(csvContent);
        } else {
            return res.status(400).json({ message: "Unsupported format. Use doc, txt, or csv" });
        }

    } catch (error) {
        console.error('Download chat error:', error);
        res.status(500).json({ message: error.message });
    }
};
