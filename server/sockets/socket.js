const { Server } = require("socket.io");
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');

let io;
const onlineUsers = new Map(); // userId -> socketId

const initSocket = (server) => {
    io = new Server(server, {
        pingTimeout: 60000,
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
    });

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        // ─── Setup: user comes online ───────────────────────────────────────
        socket.on("setup", async (userData) => {
            if (!userData || !userData._id) return;
            const userIdStr = userData._id.toString();
            socket.join(userIdStr);
            onlineUsers.set(userIdStr, socket.id);
            socket.userId = userIdStr;

            try {
                await User.findByIdAndUpdate(userIdStr, { isOnline: true });
            } catch (e) { /* ignore */ }

            io.emit("online users", Array.from(onlineUsers.keys()));
            socket.emit("connected");

            // Sync undelivered messages for this user
            try {
                const userChats = await Chat.find({ users: userIdStr });
                const chatIds = userChats.map(c => c._id);

                const undelivered = await Message.find({
                    chatId: { $in: chatIds },
                    sender: { $ne: userIdStr },
                    status: 'sent'
                }).populate("sender", "username profilePic").populate("chatId");

                if (undelivered.length > 0) {
                    const ids = undelivered.map(m => m._id);
                    await Message.updateMany({ _id: { $in: ids } }, { status: 'delivered' });

                    for (const msg of undelivered) {
                        msg.status = 'delivered';
                        socket.emit("message recieved", msg);

                        const senderStr = msg.sender._id.toString();
                        if (onlineUsers.has(senderStr)) {
                            io.to(onlineUsers.get(senderStr)).emit("message status update", {
                                messageId: msg._id,
                                status: "delivered"
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Offline msg sync error:", err);
            }
        });

        // ─── Room Management ────────────────────────────────────────────────
        socket.on("join chat", (room) => {
            if (!room) return;
            socket.join(room);
            console.log("User joined room:", room);
        });

        // ─── Typing Indicators ──────────────────────────────────────────────
        socket.on("typing", ({ room, username }) => {
            if (!room) return;
            socket.to(room).emit("typing", username);
        });

        socket.on("stop typing", (room) => {
            if (!room) return;
            socket.to(room).emit("stop typing");
        });

        // ─── New Message ────────────────────────────────────────────────────
        socket.on("new message", async (newMessageData) => {
            try {
                const chatObj = newMessageData.chatId;
                if (!chatObj) return console.log("chatId missing in message");

                // chatId can be the full chat object OR just an ID string
                const chatId = chatObj._id || chatObj;
                const chat = typeof chatObj === 'object' && chatObj.users
                    ? chatObj
                    : await Chat.findById(chatId).populate("users", "_id");

                if (!chat || !chat.users) return console.log("Chat not found");

                // Save message to DB
                let message = await Message.create({
                    sender: newMessageData.sender._id,
                    content: newMessageData.content || "",
                    mediaUrl: newMessageData.mediaUrl || "",
                    isCallLog: newMessageData.isCallLog || false,
                    callDuration: newMessageData.callDuration || 0,
                    chatId: chatId,
                    replyTo: newMessageData.replyTo || null
                });

                // Populate for broadcasting
                message = await Message.findById(message._id)
                    .populate("sender", "username profilePic")
                    .populate("chatId")
                    .populate({
                        path: "replyTo",
                        populate: { path: "sender", select: "username" }
                    });

                // Update chat's latestMessage
                await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

                // Broadcast to each user in the chat
                for (const user of chat.users) {
                    const uid = user._id.toString();
                    if (uid === newMessageData.sender._id.toString()) continue;

                    if (onlineUsers.has(uid)) {
                        // Mark delivered immediately
                        await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
                        message.status = 'delivered';

                        io.to(onlineUsers.get(uid)).emit("message recieved", message);

                        // Tell sender: delivered
                        const senderUid = newMessageData.sender._id.toString();
                        if (onlineUsers.has(senderUid)) {
                            io.to(onlineUsers.get(senderUid)).emit("message status update", {
                                messageId: message._id,
                                status: "delivered"
                            });
                        }
                    }
                }

                // Also emit back to sender's socket so they get the DB-saved version (with _id)
                socket.emit("message saved", message);

            } catch (error) {
                console.error("Socket message save error:", error);
            }
        });

        // ─── Mark Chat Seen ─────────────────────────────────────────────────
        socket.on("mark chat seen", async ({ chatId, userId }) => {
            try {
                if (!chatId || !userId) return;
                console.log(`[SEEN] User ${userId} marking chat ${chatId} as seen`);

                const unseenMsgs = await Message.find({
                    chatId,
                    sender: { $ne: userId },
                    status: { $ne: 'seen' }
                });

                console.log(`[SEEN] Found ${unseenMsgs.length} unseen messages`);
                if (unseenMsgs.length === 0) return;

                const unseenIds = unseenMsgs.map(m => m._id);
                await Message.updateMany({ _id: { $in: unseenIds } }, { status: 'seen' });

                // Notify each unique sender
                const senderIds = [...new Set(unseenMsgs.map(m => m.sender.toString()))];
                for (const sid of senderIds) {
                    console.log(`[SEEN] Notifying sender ${sid}, online: ${onlineUsers.has(sid)}`);
                    if (onlineUsers.has(sid)) {
                        io.to(onlineUsers.get(sid)).emit("message status update", {
                            chatId: chatId.toString(),
                            status: "seen"
                        });
                    }
                }
            } catch (err) {
                console.error("Mark seen error:", err);
            }
        });

        // ─── Friend Request Notifications ────────────────────────────────────
        socket.on("friend-request-sent", ({ toUserId, request }) => {
            if (!toUserId) return;
            const targetSocketId = onlineUsers.get(toUserId.toString());
            if (targetSocketId) {
                io.to(targetSocketId).emit("friend-request-received", request);
            }
        });

        socket.on("friend-request-accepted", ({ toUserId, request }) => {
            if (!toUserId) return;
            const targetSocketId = onlineUsers.get(toUserId.toString());
            if (targetSocketId) {
                io.to(targetSocketId).emit("friend-accepted", request);
            }
        });

        // ─── WebRTC: 1-on-1 Call Signaling ──────────────────────────────────
        socket.on("callUser", ({ userToCall, signalData, from, name, type, chatId }) => {
            if (!userToCall) return;
            const targetSocketId = onlineUsers.get(userToCall);
            if (targetSocketId) {
                io.to(targetSocketId).emit("callUser", { signal: signalData, from, name, type, chatId });
            }
        });

        socket.on("answerCall", ({ to, signal }) => {
            const targetSocketId = onlineUsers.get(to);
            if (targetSocketId) {
                io.to(targetSocketId).emit("callAccepted", signal);
            }
        });

        socket.on("endCall", ({ to }) => {
            if (!to) return;
            const targetSocketId = onlineUsers.get(to);
            if (targetSocketId) {
                io.to(targetSocketId).emit("callEnded");
            }
        });

        // ─── WebRTC: Mesh Group Call ─────────────────────────────────────────
        socket.on("join-call", (chatId) => {
            if (!chatId) return;
            socket.join(`call-${chatId}`);
            socket.to(`call-${chatId}`).emit("user-joined-call", {
                userId: socket.userId,
                socketId: socket.id
            });
        });

        socket.on("signal-peer", ({ toSocketId, signal, fromUserId }) => {
            io.to(toSocketId).emit("signal-peer-received", {
                signal,
                fromUserId,
                fromSocketId: socket.id
            });
        });

        socket.on("leave-call", (chatId) => {
            if (!chatId) return;
            socket.leave(`call-${chatId}`);
            socket.to(`call-${chatId}`).emit("user-left-call", socket.userId);
        });

        // ─── Message Updates (Edit/Delete) ──────────────────────────────────
        socket.on("message update", (updatedMsg) => {
            if (!updatedMsg || !updatedMsg.chatId) return;
            const chatId = updatedMsg.chatId._id || updatedMsg.chatId;
            // Broadcast to chat room
            socket.to(chatId.toString()).emit("message update recieved", updatedMsg);
        });

        // ─── Group Management ────────────────────────────────────────────────
        socket.on("group update", ({ chatId, type, data }) => {
            if (!chatId) return;
            socket.to(chatId).emit("group update received", { type, data });
        });

        // ─── Disconnect ──────────────────────────────────────────────────────
        socket.on("disconnect", async () => {
            console.log("Socket disconnected:", socket.id);
            const uid = socket.userId;
            if (!uid) return;

            // Only remove if this socket is still the one mapped
            if (onlineUsers.get(uid) === socket.id) {
                onlineUsers.delete(uid);
                try {
                    await User.findByIdAndUpdate(uid, { isOnline: false, lastSeen: new Date() });
                } catch (e) { /* ignore */ }
                io.emit("online users", Array.from(onlineUsers.keys()));
            }
        });
    });
};

module.exports = { initSocket };
