const express = require('express');
const router = express.Router();
const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { protect } = require('../middleware/auth');

// Helper: get all accepted friend IDs for a user
async function getFriendIds(userId) {
    const accepted = await FriendRequest.find({
        $or: [{ sender: userId }, { receiver: userId }],
        status: 'accepted'
    });
    return accepted.map(r =>
        r.sender.toString() === userId.toString() ? r.receiver : r.sender
    );
}

// POST /api/friends/request — send a friend request
router.post('/request', protect, async (req, res) => {
    const { receiverId } = req.body;
    if (!receiverId) return res.status(400).json({ message: 'receiverId required' });
    if (receiverId === req.user._id.toString()) {
        return res.status(400).json({ message: "You can't add yourself" });
    }

    try {
        // Check if a request already exists in either direction
        const existing = await FriendRequest.findOne({
            $or: [
                { sender: req.user._id, receiver: receiverId },
                { sender: receiverId, receiver: req.user._id }
            ]
        });
        if (existing) {
            if (existing.status === 'accepted') return res.status(400).json({ message: 'Already friends' });
            if (existing.status === 'pending') return res.status(400).json({ message: 'Request already sent' });
            if (existing.status === 'rejected') {
                // Allow re-request after rejection
                existing.status = 'pending';
                existing.sender = req.user._id;
                existing.receiver = receiverId;
                await existing.save();
                return res.json({ message: 'Request re-sent', request: existing });
            }
        }

        const request = await FriendRequest.create({
            sender: req.user._id,
            receiver: receiverId
        });

        const populated = await FriendRequest.findById(request._id)
            .populate('sender', 'username profilePic')
            .populate('receiver', 'username profilePic');

        res.status(201).json({ message: 'Friend request sent', request: populated });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/friends/request/:receiverId — unsend a pending friend request
router.delete('/request/:receiverId', protect, async (req, res) => {
    try {
        const deleted = await FriendRequest.findOneAndDelete({
            sender: req.user._id,
            receiver: req.params.receiverId,
            status: 'pending'
        });
        
        if (!deleted) {
            return res.status(404).json({ message: 'Pending request not found' });
        }
        res.json({ message: 'Friend request unsent' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/friends/accept/:id — accept a request
router.put('/accept/:id', protect, async (req, res) => {
    try {
        const request = await FriendRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.receiver.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        request.status = 'accepted';
        await request.save();

        // Automatically create a Chat document if one does not exist yet
        let isChat = await Chat.find({
            isGroupChat: false,
            $and: [
                { users: { $elemMatch: { $eq: req.user._id } } },
                { users: { $elemMatch: { $eq: request.sender } } }
            ]
        });
        if (isChat.length === 0) {
            await Chat.create({
                chatName: "sender",
                isGroupChat: false,
                users: [req.user._id, request.sender],
            });
        }

        const populated = await FriendRequest.findById(request._id)
            .populate('sender', 'username profilePic')
            .populate('receiver', 'username profilePic');

        res.json({ message: 'Friend request accepted', request: populated });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/friends/reject/:id — reject a request
router.put('/reject/:id', protect, async (req, res) => {
    try {
        const request = await FriendRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.receiver.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        request.status = 'rejected';
        await request.save();
        res.json({ message: 'Friend request rejected' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/friends/:friendId — remove a friend
router.delete('/:friendId', protect, async (req, res) => {
    try {
        await FriendRequest.findOneAndDelete({
            $or: [
                { sender: req.user._id, receiver: req.params.friendId },
                { sender: req.params.friendId, receiver: req.user._id }
            ],
            status: 'accepted'
        });
        res.json({ message: 'Friend removed' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/friends — list all accepted friends
router.get('/', protect, async (req, res) => {
    try {
        const friendIds = await getFriendIds(req.user._id);
        const friends = await User.find({ _id: { $in: friendIds } }).select('-password');
        res.json(friends);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/friends/requests — incoming pending requests
router.get('/requests', protect, async (req, res) => {
    try {
        const requests = await FriendRequest.find({
            receiver: req.user._id,
            status: 'pending'
        }).populate('sender', 'username profilePic').sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/friends/sent — requests I sent that are still pending
router.get('/sent', protect, async (req, res) => {
    try {
        const requests = await FriendRequest.find({
            sender: req.user._id,
            status: 'pending'
        }).populate('receiver', 'username profilePic');
        res.json(requests);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/friends/discover — users I haven't added yet
router.get('/discover', protect, async (req, res) => {
    try {
        const friendIds = await getFriendIds(req.user._id);

        // Get requests we sent that are pending
        const pendingSent = await FriendRequest.find({
            sender: req.user._id,
            status: 'pending'
        }).select('receiver');
        const pendingSentIds = pendingSent.map(r => r.receiver.toString());

        // Get requests we received that are pending
        const pendingReceived = await FriendRequest.find({
            receiver: req.user._id,
            status: 'pending'
        }).select('sender');
        const pendingReceivedIds = pendingReceived.map(r => r.sender.toString());

        // Exclude self, friends, and people whose requests we haven't responded to yet
        const excludeIds = [req.user._id, ...friendIds, ...pendingReceivedIds];

        let allUsers = await User.find({ _id: { $nin: excludeIds } })
            .select('-password')
            .sort({ username: 1 })
            .lean();

        // Mark users we've sent a request to
        allUsers = allUsers.map(u => ({
            ...u,
            requestSent: pendingSentIds.includes(u._id.toString())
        }));

        res.json(allUsers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
module.exports.getFriendIds = getFriendIds;
