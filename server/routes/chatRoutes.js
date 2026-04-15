const express = require('express');
const {
    accessChat,
    fetchChats,
    allMessages,
    suggestReply,
    getUserAnalytics,
    createGroupChat,
    renameGroup,
    addToGroup,
    removeFromGroup,
    deleteMessage,
    editMessage,
    clearChat
} = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, accessChat);
router.get('/', protect, fetchChats);

router.post('/suggest', protect, suggestReply);
router.get('/analytics/data', protect, getUserAnalytics);

// Group Chat Routes
router.post('/group', protect, createGroupChat);
router.put('/rename', protect, renameGroup);
router.put('/groupadd', protect, addToGroup);
router.put('/groupremove', protect, removeFromGroup);

// Message Management
router.delete('/message/:messageId', protect, deleteMessage);
router.put('/message/:messageId', protect, editMessage);

// Clear Chat
router.delete('/clear/:chatId', protect, clearChat);

// This parameterized route must be last to avoid shadowing other routes!
router.get('/:chatId', protect, allMessages);

module.exports = router;
