import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
    getOrCreateConversation,
    getConversations,
    getMessages,
    sendMessage,
    getUnreadCount,
    markAsRead,
    deleteMessage,
    deleteConversation,
    getTrashedConversations,
    restoreConversation,
    permanentDeleteConversation,
    updateTheme,
    downloadChat,
    toggleReaction
} from '../controllers/chatController.js';

const router = express.Router();

router.use(protect);

router.post('/conversation', getOrCreateConversation);
router.get('/conversations', getConversations);
router.get('/messages/:conversationId', getMessages);
router.post('/message', sendMessage);
router.post('/reaction', toggleReaction);
router.get('/unread-count', getUnreadCount);
router.put('/read/:conversationId', markAsRead);
router.delete('/message/:messageId', deleteMessage);
router.delete('/conversation/:conversationId', deleteConversation);
router.get('/trash', getTrashedConversations);
router.post('/restore/:conversationId', restoreConversation);
router.delete('/permanent-delete/:conversationId', permanentDeleteConversation);
router.put('/theme/:conversationId', updateTheme);
router.get('/download/:conversationId', downloadChat);

export default router;
