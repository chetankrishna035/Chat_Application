const API_URL = window.location.protocol === 'file:' 
    ? 'http://localhost:5003/api'
    : window.location.origin + '/api';
let socket;
let currentUser = null;
let currentChat = null;
let users = [];
let onlineUsersList = [];
let unreadCounts = {};
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
let originalTitle = document.title;
let currentPage = 1;
const messagesLimit = 30;
let hasMoreMessages = true;

// ─── Helper: resolve any profile pic value to a valid <img> src ──────────────
function getAvatarUrl(pic) {
    if (!pic) return '/default-avatar.png';
    if (pic.startsWith('http') || pic.startsWith('/') || pic.startsWith('data:')) return pic;
    // bare filename → treat as an upload
    return `/uploads/${pic.split('/').pop()}`;
}

// DOM Elements
const authContainer = document.getElementById('auth-view');
const chatContainer = document.getElementById('chat-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const usersList = document.getElementById('users-list');
const chatMessages = document.getElementById('chat-messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const attachBtn = document.getElementById('attach-btn');
const mediaInput = document.getElementById('media-input');
const sendBtn = document.getElementById('send-btn');
const currentChatName = document.getElementById('current-chat-name');
const typingIndicator = document.getElementById('typing-indicator');
const smartReplies = document.getElementById('smart-replies');
const sidebar = document.getElementById('sidebar');
const mainChat = document.querySelector('.bg-chat');
const backBtn = document.getElementById('back-btn');
const userSearchInput = document.getElementById('user-search');

// Profile DOM Elements
const myProfilePic = document.getElementById('my-profile-pic');
const myUsernameDisplay = document.getElementById('my-username');
const profilePicModal = document.getElementById('modal-profile-pic');
const profileUpload = document.getElementById('profile-upload');
const profileUsername = document.getElementById('modal-username');
const profileBio = document.getElementById('modal-bio');
const saveProfileBtn = document.getElementById('save-profile-btn');

// WebRTC / Call DOM Elements
const videoCallBtn = document.getElementById('video-call-btn');
const voiceCallBtn = document.getElementById('voice-call-btn');
const videoCallOverlay = document.getElementById('video-call-overlay');
const incomingCallModal = document.getElementById('incoming-call-modal');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const endCallBtn = document.getElementById('end-call-btn');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');
const callerNameDisplay = document.getElementById('caller-name');
const callerInitialDisplay = document.getElementById('caller-initial');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const callTimerDisplay = document.getElementById('call-duration-timer');
const ringingUI = document.getElementById('call-ringing-ui');
const ringAvatar = document.getElementById('ring-avatar');
const ringName = document.getElementById('ring-name');
const ringStatus = document.getElementById('ring-status');

// Group Chat DOM Elements
const newGroupBtn = document.getElementById('new-group-btn');
const groupNameInput = document.getElementById('group-name-input');
const groupUserSearch = document.getElementById('group-user-search');
const groupUsersList = document.getElementById('group-users-list');
const selectedUsersBadges = document.getElementById('selected-users-badges');
const createGroupConfirmBtn = document.getElementById('create-group-confirm');

// Reply DOM Elements
const replyPreview = document.getElementById('reply-preview');
const replyUser = document.getElementById('reply-user');
const replyText = document.getElementById('reply-text');
const cancelReplyBtn = document.getElementById('cancel-reply');

// WebRTC State
let localStream = null;
let displayStream = null;
let peers = new Map();
let incomingCallData = null;
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let callDurationTimer = null;
let secondsElapsed = 0;
let callType = 'video';
let replyingToMessageId = null;
let selectedGroupUsers = [];
// Missing call state vars (were used but never declared — caused crashes)
let isCallInitiator = false;
let activeCallUserId = null;
let peer = null;

// DOM for Multi-Video
const shareScreenBtn = document.getElementById('share-screen-btn');
const callDurationTimerUI = document.getElementById('call-duration-timer');

// Voice Recording DOM
const voiceRecBtn = document.getElementById('voice-rec-btn');
const recordingStatus = document.getElementById('recording-status');
const recordingTimer = document.getElementById('recording-timer');
const cancelRecordingBtn = document.getElementById('cancel-recording');
const stopRecordingBtn = document.getElementById('stop-recording-btn');

// Voice Recording State
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordingSeconds = 0;
const videoGrid = document.getElementById('video-grid');

// Audio Objects
const outgoingRingtone = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
outgoingRingtone.loop = true;
const callRingtone = new Audio('https://assets.mixkit.co/active_storage/sfx/1351/1351-preview.mp3');
callRingtone.loop = true;
const callEndSound = new Audio('https://assets.mixkit.co/active_storage/sfx/1352/1352-preview.mp3');

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize app
function init() {
    const user = localStorage.getItem('chatAppUser');
    if (user) {
        currentUser = JSON.parse(user);
        showChatView();
        connectSocket();
        fetchUsers();
    }
}

// Show/Hide Views
function showChatView() {
    authContainer.classList.add('d-none');
    authContainer.classList.remove('d-flex');
    chatContainer.classList.remove('d-none');

    myUsernameDisplay.innerText = currentUser.username;
    myProfilePic.src = getAvatarUrl(currentUser.profilePic);

    // Mobile View Setup
    if (window.innerWidth <= 768) {
        mainChat.classList.add('hidden-mobile');
        sidebar.classList.remove('hidden-mobile');
    }
}




function showAuthView() {
    localStorage.removeItem('chatAppUser');
    currentUser = null;
    currentChat = null;
    if (socket) socket.disconnect();
    chatContainer.classList.add('d-none');
    authContainer.classList.remove('d-none');
    authContainer.classList.add('d-flex');
}

// Authentication
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('chatAppUser', JSON.stringify(data));
            currentUser = data;
            showChatView();
            connectSocket();
            fetchUsers();
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Server error');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (password !== confirmPassword) {
        alert("Passwords do not match!");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('chatAppUser', JSON.stringify(data));
            currentUser = data;
            showChatView();
            connectSocket();
            fetchUsers();
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Server error');
    }
});

logoutBtn.addEventListener('click', showAuthView);

// Password Visibility toggles
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;

    icon.addEventListener('click', () => {
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
}
togglePassword('login-password', 'toggle-login-pass');
togglePassword('reg-password', 'toggle-reg-pass');
togglePassword('reg-confirm-password', 'toggle-reg-confirm-pass');

// Fetch only accepted friends, then their existing chats
async function fetchUsers() {
    try {
        const res = await fetch(`${API_URL}/friends`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await res.json();
        if (res.ok) {
            users = data;  // only accepted friends
            fetchChats();
            // Also refresh request badge
            fetchIncomingRequests();
        }
    } catch (err) {
        console.error('Error fetching friends:', err);
    }
}

async function fetchChats() {
    try {
        const res = await fetch(`${API_URL}/chat`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await res.json();
        if (res.ok) {
            renderChats(data);
        }
    } catch (err) {
        console.error('Error fetching chats:', err);
    }
}

function renderChats(chats) {
    usersList.innerHTML = '';
    if (!chats || chats.length === 0) {
        usersList.innerHTML = '<div class="p-4 text-center text-muted">No conversations yet.</div>';
        return;
    }

    chats.forEach(chat => {
        const isGroup = chat.isGroupChat;
        const chatTitle = isGroup ? chat.chatName : chat.users.find(u => u._id !== currentUser._id).username;
        const otherUser = isGroup ? null : chat.users.find(u => u._id !== currentUser._id);
        const isOnline = otherUser ? onlineUsersList.includes(otherUser._id) : false;

        const profilePicUrl = isGroup ? defaultAvatar : getAvatarUrl(otherUser?.profilePic);

        const div = document.createElement('div');
        div.className = 'user-item p-3 d-flex align-items-center position-relative animate__animated animate__fadeIn';
        if (currentChat && currentChat._id === chat._id) div.classList.add('active');

        const unreadCount = unreadCounts[chat._id] || 0;

        div.innerHTML = `
            <div class="position-relative me-3">
                <div class="rounded-circle shadow-sm d-flex align-items-center justify-content-center ${isGroup ? 'bg-primary text-white' : ''}" style="width: 48px; height: 48px; overflow: hidden; background: #e2e8f0;">
                    ${isGroup ? '<i class="fa-solid fa-users"></i>' : `<img src="${profilePicUrl}" style="width: 100%; height: 100%; object-fit: cover;">`}
                </div>
                ${!isGroup && isOnline ? '<span class="status-dot online position-absolute bottom-0 end-0 border border-white border-2"></span>' : ''}
            </div>
            <div class="flex-grow-1 overflow-hidden">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <h6 class="mb-0 fw-bold text-truncate">${chatTitle}</h6>
                    <small class="text-muted" style="font-size: 0.7rem;">${chat.latestMessage ? new Date(chat.latestMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</small>
                </div>
                <div class="text-truncate small ${unreadCount > 0 ? 'fw-bold text-dark' : 'text-muted'}">
                    ${chat.latestMessage ? (chat.latestMessage.sender._id === currentUser._id ? 'You: ' : '') + chat.latestMessage.content : 'No messages yet'}
                </div>
            </div>
            ${unreadCount > 0 ? `<div class="ms-2"><span class="badge bg-primary rounded-pill px-2 py-1">${unreadCount} New</span></div>` : ''}
        `;

        div.onclick = () => {
            document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            
            // Clear unread logic dynamically
            if (unreadCounts[chat._id] > 0) {
                unreadCounts[chat._id] = 0;
                document.title = "Chat App"; // Reset title
                const badge = div.querySelector('.ms-2');
                if (badge) badge.remove();
                const preview = div.querySelector('.text-truncate.small');
                if (preview) {
                    preview.classList.remove('fw-bold', 'text-dark');
                    preview.classList.add('text-muted');
                }
            }

            currentChat = chat;
            currentChatName.innerText = chatTitle;
            messageInput.disabled = false;
            sendBtn.disabled = false;
            voiceRecBtn.disabled = false;

            // Video/Voice call, Unfriend & Clear Chat logic
            const unfriendBtn = document.getElementById('unfriend-btn');
            const clearChatBtn = document.getElementById('clear-chat-btn');
            if (isGroup) {
                videoCallBtn.classList.remove('d-none');
                voiceCallBtn.classList.add('d-none'); // Group voice uses conference
                if (unfriendBtn) unfriendBtn.classList.add('d-none');
            } else {
                videoCallBtn.classList.remove('d-none');
                voiceCallBtn.classList.remove('d-none');
                if (unfriendBtn && otherUser) {
                    unfriendBtn.classList.remove('d-none');
                    unfriendBtn.onclick = () => confirmUnfriend(otherUser._id, otherUser.username);
                }
            }
            // Show clear chat for all chat types
            if (clearChatBtn) {
                clearChatBtn.classList.remove('d-none');
                clearChatBtn.onclick = () => clearCurrentChat();
            }

            socket.emit('join chat', chat._id);

            // Mobile flip
            document.body.classList.add('mobile-chat-active');
            document.body.classList.remove('mobile-chat-hidden');

            fetchMessages();
        };

        usersList.appendChild(div);
    });
}

async function fetchUsersSilently() {
    try {
        const res = await fetch(`${API_URL}/friends`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await res.json();
        if (res.ok) users = data;
    } catch (err) { }
}

// Time Formatting function for Last Seen
function timeSince(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return "just now";
}

function renderUsers() {
    const searchTerm = userSearchInput ? userSearchInput.value.toLowerCase().trim() : '';
    const filteredUsers = users.filter(user => user.username.toLowerCase().includes(searchTerm));

    usersList.innerHTML = '';

    if (filteredUsers.length === 0) {
        usersList.innerHTML = '<div class="p-4 text-center text-muted">No users found.</div>';
        return;
    }

    filteredUsers.forEach(user => {
        const isOnline = onlineUsersList.includes(user._id);
        const unreadCount = unreadCounts[user._id] || 0;

        const div = document.createElement('div');
        div.className = 'user-item p-3 d-flex align-items-center position-relative';
        if (currentChat && currentChat.users.some(u => u._id === user._id)) {
            div.classList.add('active');
        }

        // Online or Last Seen text
        const statusText = isOnline
            ? `<small class="text-success fw-bold">Active now</small>`
            : `<small class="text-muted">Last seen: ${timeSince(user.lastSeen)}</small>`;

        const profilePicUrl = getAvatarUrl(user.profilePic);
        div.innerHTML = `
            <div class="position-relative me-3">
                <img src="${profilePicUrl}" class="rounded-circle shadow-sm" style="width: 45px; height: 45px; object-fit: cover; border: 2px solid ${isOnline ? '#22c55e' : '#ccc'};">
                <span class="status-dot ${isOnline ? 'online' : ''} position-absolute bottom-0 end-0 border border-white border-2"></span>
            </div>
            <div class="flex-grow-1">
                <h6 class="mb-0 fw-bold">${user.username}</h6>
                ${statusText}
            </div>
            ${unreadCount > 0 ? `<span class="badge bg-danger rounded-pill position-absolute end-0 me-3">${unreadCount}</span>` : ''}
        `;

        div.addEventListener('click', () => {
            document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');

            // Clear unread notifications
            unreadCounts[user._id] = 0;
            document.title = originalTitle;
            renderUsers(); // Refresh to remove badge

            accessChat(user._id, user.username);

            // Mobile switch to chat
            document.body.classList.add('mobile-chat-active');
            document.body.classList.remove('mobile-chat-hidden');
        });

        usersList.appendChild(div);
    });
}

// User Search event logic
if (userSearchInput) {
    userSearchInput.addEventListener('input', () => {
        renderUsers();
    });
}

// Mobile back button
backBtn.addEventListener('click', () => {
    document.body.classList.add('mobile-chat-hidden');
    document.body.classList.remove('mobile-chat-active');
    currentChat = null;
});

// Create/Access Chat
async function accessChat(userId, username) {
    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ userId })
        });
        const data = await res.json();

        if (res.ok) {
            currentChat = data;
            currentChatName.innerText = username;
            messageInput.disabled = false;
            sendBtn.disabled = false;
            videoCallBtn.classList.remove('d-none');
            voiceCallBtn.classList.remove('d-none');
            socket.emit('join chat', currentChat._id);
            fetchMessages();
        }
    } catch (err) {
        console.error('Error accessing chat:', err);
    }
}

// Fetch Messages (Paginated)
async function fetchMessages(isLoadMore = false) {
    if (!currentChat || (!hasMoreMessages && isLoadMore)) return;

    if (!isLoadMore) {
        currentPage = 1;
        hasMoreMessages = true;
        chatMessages.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
    }

    try {
        const res = await fetch(`${API_URL}/chat/${currentChat._id}?page=${currentPage}&limit=${messagesLimit}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await res.json();

        if (res.ok) {
            if (data.length < messagesLimit) hasMoreMessages = false;

            if (isLoadMore) {
                // Prepend older messages
                const oldScrollHeight = chatMessages.scrollHeight;
                const blankState = chatMessages.querySelector('.text-muted.mt-5');
                if (blankState) blankState.remove();

                // Remove loading spinner
                const spinner = chatMessages.querySelector('.spinner-border')?.closest('.text-center');
                if (spinner) spinner.remove();

                const reverseMsgs = [...data].reverse(); // They come reverse-reverse (chronological)
                // Wait, server already reverses it. So data is newest last in the batch.
                // We want to prepend them.
                data.forEach(msg => {
                    prependMessageUI(msg);
                });
                chatMessages.scrollTop = chatMessages.scrollHeight - oldScrollHeight;
            } else {
                renderMessages(data);
                scrollToBottom();
                socket.emit("join chat", currentChat._id);
                socket.emit("mark chat seen", { chatId: currentChat._id, userId: currentUser._id });
            }
        }
    } catch (err) {
        console.error('Error fetching msg:', err);
    }
}

function prependMessageUI(msg) {
    const isMine = msg.sender._id === currentUser._id;
    const isDeleted = msg.isDeleted;
    const div = document.createElement('div');
    div.className = `message-bubble ${isMine ? 'message-sent' : 'message-received shadow-sm'} ${isDeleted ? 'deleted' : ''}`;
    if (msg._id) div.id = `msg-${msg._id}`;

    const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let mediaHtml = '';
    if (msg.mediaUrl && !isDeleted) {
        if (msg.mediaUrl.endsWith('.webm') || msg.mediaUrl.includes('audio')) {
            mediaHtml = `<div class="voice-note-container p-2 mb-2 rounded bg-light border border-primary border-opacity-10 d-flex align-items-center gap-2" style="max-width: 250px;">
                            <i class="fa-solid fa-microphone text-primary"></i>
                            <audio src="${msg.mediaUrl}" controls class="w-100" style="height: 35px; border-radius: 20px;"></audio>
                        </div>`;
        } else {
            mediaHtml = `<img src="${msg.mediaUrl}" class="chat-image mb-2 d-block" onclick="window.open(this.src)" />`;
        }
    }

    const actionsHtml = `<div class="message-actions"><i class="fa-solid fa-reply action-icon" onclick="prepareReply('${msg._id}', '${msg.sender.username}', '${msg.content}')" title="Reply"></i></div>`;
    const editedTag = msg.isEdited ? `<span class="is-edited-tag">(edited)</span>` : '';

    div.innerHTML = `${actionsHtml}<span class="msg-text">${msg.content || ''}</span> ${editedTag}<span class="message-meta">${time}</span>`;

    chatMessages.prepend(div);
}

// Infinite Scroll Listener
chatMessages.addEventListener('scroll', () => {
    if (chatMessages.scrollTop === 0 && hasMoreMessages) {
        currentPage++;
        fetchMessages(true);
    }
});

function renderMessages(messages) {
    if (!messages || messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="text-center text-muted mt-5">
                <i class="fa-regular fa-comment-dots fa-3x mb-3 opacity-50"></i>
                <p>No messages yet. Say hi!</p>
            </div>
        `;
        return;
    }

    chatMessages.innerHTML = '';
    messages.forEach(msg => {
        appendMessageUI(msg);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getTickHtml(status, isMine) {
    if (!isMine) return '';
    if (status === 'seen') return '<span style="color:#0d6efd; font-weight:bold; margin-left: 3px;">✓✓ Seen</span>'; // Blue with Seen text
    if (status === 'delivered') return '<span style="color:#888;">✓✓</span>';
    return '<span style="color:#888;">✓</span>';
}

function appendMessageUI(msg) {
    // Remove blank state if exists
    if (chatMessages.querySelector('.opacity-50')) {
        chatMessages.innerHTML = '';
    }

    if (msg.isCallLog) {
        const div = document.createElement('div');
        div.className = 'd-flex justify-content-center w-100';
        div.innerHTML = `<div class="message-call-log shadow-sm" style="background:#f1f5f9; color:#475569; padding: 6px 16px; border-radius: 12px; margin: 12px 0; font-size: 13px;">
                            ${msg.content}
                         </div>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }

    const isMine = msg.sender._id === currentUser._id;
    const isDeleted = msg.isDeleted;
    const div = document.createElement('div');
    div.className = `message-bubble ${isMine ? 'message-sent' : 'message-received shadow-sm'} ${isDeleted ? 'deleted' : ''}`;

    // Add ID so we can update it later
    if (msg._id) div.id = `msg-${msg._id}`;

    const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let mediaHtml = '';
    if (msg.mediaUrl && !isDeleted) {
        if (msg.mediaUrl.endsWith('.webm') || msg.mediaUrl.includes('audio')) {
            // It's a voice note
            const audioSrc = msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `uploads/${msg.mediaUrl.split('/').pop()}`;
            mediaHtml = `
                <div class="voice-note-container p-2 mb-2 rounded bg-light border border-primary border-opacity-10 d-flex align-items-center gap-2" style="max-width: 250px;">
                    <i class="fa-solid fa-microphone text-primary"></i>
                    <audio src="${audioSrc}" controls class="w-100" style="height: 35px; border-radius: 20px;"></audio>
                </div>
            `;
        } else {
            // It's an image or video
            const imgSrc = msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `uploads/${msg.mediaUrl.split('/').pop()}`;
            mediaHtml = `<img src="${imgSrc}" class="chat-image mb-2 d-block" onclick="window.open(this.src)" />`;
        }
    }

    const actionsHtml = (isMine && !isDeleted) ? `
        <div class="message-actions">
            <i class="fa-solid fa-reply action-icon" onclick="prepareReply('${msg._id}', '${msg.sender.username}', '${msg.content}')" title="Reply"></i>
            <i class="fa-solid fa-pen action-icon" onclick="prepareEditMessage('${msg._id}')" title="Edit"></i>
            <i class="fa-solid fa-trash action-icon delete" onclick="deleteMessageRequest('${msg._id}')" title="Delete for everyone"></i>
        </div>
    ` : `
        <div class="message-actions">
            <i class="fa-solid fa-reply action-icon" onclick="prepareReply('${msg._id}', '${msg.sender.username}', '${msg.content}')" title="Reply"></i>
        </div>
    `;

    const editedTag = msg.isEdited ? `<span class="is-edited-tag">(edited)</span>` : '';

    // Reply UI
    let replyHtml = '';
    if (msg.replyTo && !isDeleted) {
        // Since we don't have the full object here usually, we'd need a snippet.
        // For now, let's assume content populated if we populated on server.
        const replyMsg = msg.replyTo;
        replyHtml = `
            <div class="reply-snippet p-2 mb-2 rounded bg-dark bg-opacity-10 border-start border-4 border-primary small">
                <div class="fw-bold text-primary">${replyMsg.sender?.username || 'User'}</div>
                <div class="text-truncate">${replyMsg.content || 'Media'}</div>
            </div>
        `;
    }

    div.innerHTML = `
        ${actionsHtml}
        ${replyHtml}
        ${mediaHtml}
        <span class="msg-text">${msg.content ? msg.content : ''}</span> ${editedTag}
        <span class="message-meta">${time} <span class="msg-status" data-id="${msg._id}">${getTickHtml(msg.status || 'sent', isMine)}</span></span>
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Attachment Logic
if (attachBtn && mediaInput) {
    attachBtn.addEventListener('click', () => {
        mediaInput.click();
    });

    mediaInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !currentChat) return;

        const formData = new FormData();
        formData.append('media', file);

        try {
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentUser.token}` },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                const msgData = {
                    content: "",
                    mediaUrl: data.url,
                    chatId: currentChat,
                    sender: { _id: currentUser._id, username: currentUser.username }
                };

                socket.emit('new message', msgData);

                // Optimistic UI update
                const optimisticMsg = {
                    ...msgData,
                    createdAt: new Date().toISOString(),
                    _id: 'temp-' + Date.now()
                };
                appendMessageUI(optimisticMsg);
            } else {
                alert("Upload failed: " + data.message);
            }
        } catch (err) {
            console.error('File upload error', err);
            alert('File upload failed');
        }

        // Reset input
        mediaInput.value = '';
    });
}


// Send Message (form submit → delegates to sendMessage)
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (editingMessageId) {
        editMessageRequest(editingMessageId, messageInput.value.trim());
    } else {
        sendMessage();
    }
});


// Typing Logic
let typingTimer;
messageInput.addEventListener('input', () => {
    if (!currentChat) return;

    // Pass username for "Named Typing Indicators"
    socket.emit('typing', { room: currentChat._id, username: currentUser.username });

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('stop typing', currentChat._id);
    }, 3000);
});


// Messaging Logic and Smart Replies follow (Redundant voice recording logic removed)

// Smart Replies
async function generateSmartReplies(msgContent) {
    try {
        const res = await fetch(`${API_URL}/chat/suggest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ latestMessage: msgContent })
        });
        const data = await res.json();

        if (data.suggestions && data.suggestions.length > 0 && smartReplies) {
            smartReplies.innerHTML = '';
            data.suggestions.forEach(sug => {
                const span = document.createElement('span');
                span.className = 'smart-reply-chip';
                span.innerText = sug;
                span.addEventListener('click', () => {
                    if (messageInput) messageInput.value = sug;
                    if (smartReplies) smartReplies.classList.add('d-none');
                    if (messageForm) messageForm.dispatchEvent(new Event('submit'));
                });
                smartReplies.appendChild(span);
            });
            smartReplies.classList.remove('d-none');
        } else if (smartReplies) {
            smartReplies.classList.add('d-none');
        }
    } catch (err) {
        console.error(err);
    }
}

// Socket Connection
function connectSocket() {
    // Standardizing protocol for Render/Cloud environments
    const socketOptions = {
        transports: ['websocket', 'polling'],
        secure: window.location.protocol === 'https:',
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    };

    const SOCKET_URL = API_URL.replace('/api', '');
    socket = io(SOCKET_URL, socketOptions);

    socket.emit('setup', currentUser);

    socket.on('connected', () => {
        console.log('✅ Connected to Server');
    });

    socket.on('connect_error', (err) => {
        console.warn('⚠️ Connection Error:', err.message);
        if (window.location.protocol === 'file:') {
            alert("Connection Refused: You are opening index.html as a file. Please use the Render link instead.");
        }
    });

    socket.on('message recieved', (newMessageReceived) => {
        // chatId may be a populated object or just a string id
        const msgChatId = newMessageReceived.chatId?._id || newMessageReceived.chatId;
        if (!currentChat || currentChat._id !== msgChatId) {
            // Notification Logic Trigger
            unreadCounts[msgChatId] = (unreadCounts[msgChatId] || 0) + 1;

            // Play Sound
            notificationSound.play().catch(e => console.log('Audio play blocked by browser.'));

            // Update Title
            document.title = `(${unreadCounts[msgChatId]}) New Message - Chat App`;

            // Re-fetch conversation list to show badge & snippet
            fetchChats();
        } else {
            appendMessageUI(newMessageReceived);
            generateSmartReplies(newMessageReceived.content);
            socket.emit("mark chat seen", { chatId: currentChat._id, userId: currentUser._id });
        }
    });

    socket.on('message status update', ({ messageId, chatId, status }) => {
        console.log('📬 Status update:', { messageId, chatId, status });
        if (messageId) {
            // Update specific message tick
            const statusSpan = document.querySelector(`.msg-status[data-id="${messageId}"]`);
            if (statusSpan) statusSpan.innerHTML = getTickHtml(status, true);
        }
        if (chatId && status === 'seen') {
            // If we are currently viewing this chat, bulk-update ALL our sent message ticks to seen
            const currentChatId = currentChat?._id;
            if (currentChatId && (currentChatId === chatId || currentChatId === chatId.toString())) {
                const spans = document.querySelectorAll('.message-sent .msg-status');
                spans.forEach(span => span.innerHTML = getTickHtml('seen', true));
            }
        }
    });

    socket.on('typing', (username) => {
        typingIndicator.innerText = `${username} is typing...`;
        typingIndicator.classList.remove('d-none');
    });

    socket.on('stop typing', () => {
        typingIndicator.classList.add('d-none');
        typingIndicator.innerText = 'Typing...';
    });

    // --- Mesh Signaling Listeners ---
    socket.on("user-joined-call", ({ socketId, userId }) => {
        // Stop outgoing ringtone once a peer joins
        outgoingRingtone.muted = true;
        outgoingRingtone.pause();
        outgoingRingtone.currentTime = 0;

        const p = createPeer(socketId, userId, true);
        peers.set(socketId, p);

        const participant = users.find(u => u._id === userId);
        const name = participant ? participant.username : 'User';
        appendCallLog(`${name} has joined the call`);
    });

    socket.on("signal-peer-received", ({ signal, fromSocketId, fromUserId }) => {
        // Stop all ringtones as we are receiving signaling
        outgoingRingtone.muted = true;
        outgoingRingtone.pause();
        outgoingRingtone.currentTime = 0;
        callRingtone.muted = true;
        callRingtone.pause();
        callRingtone.currentTime = 0;

        let p = peers.get(fromSocketId);
        if (!p) {
            p = createPeer(fromSocketId, fromUserId, false);
            peers.set(fromSocketId, p);
        }
        p.signal(signal);
    });

    socket.on("user-left-call", (userId) => {
        const vid = document.getElementById(`video-${userId}`);
        if (vid) vid.closest('.video-container').remove();

        const participant = users.find(u => u._id === userId);
        const name = participant ? participant.username : 'User';
        appendCallLog(`${name} has left the call`);
    });

    socket.on("group update received", ({ type, data }) => {
        if (type === 'rename') {
            currentChat.chatName = data.newName;
            currentChatName.innerText = data.newName;
        } else if (type === 'remove' && data.userId === currentUser._id) {
            alert("You have been removed from this group.");
            backBtn.click();
        }
        // Refresh users list to update member counts/lists in group info
        fetchUsersSilently();
    });

    socket.on('message update recieved', (updatedMsg) => {
        updateMessageUI(updatedMsg);
    });

    socket.on('online users', (activeUsersArray) => {
        onlineUsersList = activeUsersArray;
        // Refresh sidebar to update online/offline indicators
        fetchChats();

        // Optional: silent re-fetch in background to sync database lastSeen
        fetchUsersSilently();
    });

    // WEBRTC SIGNALING
    socket.on('callUser', (data) => {
        incomingCallData = data;
        callerNameDisplay.innerText = data.name;
        callerInitialDisplay.innerText = data.name.charAt(0).toUpperCase();

        // Show if it's voice or video
        const typeText = data.type === 'video' ? 'Incoming Video Call...' : 'Incoming Voice Call...';
        incomingCallModal.querySelector('.text-muted').innerText = typeText;

        incomingCallModal.classList.remove('d-none');
        callRingtone.muted = false;
        callRingtone.play().catch(e => console.log("Audio block: ", e));
    });

    socket.on('callAccepted', (signal) => {
        //MESH HANDLE: Simply clear the ringing UI and let the grid fill
        outgoingRingtone.muted = true;
        outgoingRingtone.pause();
        outgoingRingtone.currentTime = 0;
        if (ringingUI) ringingUI.classList.add('d-none');
        startTimer();
    });

    // Replace temp optimistic message with real DB id
    socket.on('message saved', (savedMsg) => {
        const temps = chatMessages.querySelectorAll('[id^="msg-temp-"]');
        if (temps.length > 0) {
            const last = temps[temps.length - 1];
            last.id = `msg-${savedMsg._id}`;
            const statusSpan = last.querySelector('.msg-status');
            if (statusSpan) statusSpan.setAttribute('data-id', savedMsg._id);
        }
    });

    // Remote party hung up → close overlay
    socket.on('callEnded', () => {
        endCall('Remote ended');
    });

    // Wire friend-request real-time events
    wirefrFriendSocketEvents();
}

// UNIFIED WEBRTC ACTIONS (Standard & Group use the same Mesh Grid)
async function handleStartCall(type) {
    if (!currentChat) return;

    const isGroup = currentChat.isGroupChat;
    const otherUser = isGroup ? null : currentChat.users.find(u => u._id !== currentUser._id);

    if (!isGroup && otherUser && !onlineUsersList.includes(otherUser._id)) {
        alert("User is offline!");
        return;
    }

    callType = type;
    isCallInitiator = true;
    activeCallUserId = isGroup ? null : otherUser._id;
    isMuted = false;
    isVideoOff = false;

    // Show Overlay & Ringing UI
    videoCallOverlay.classList.remove('d-none');
    ringingUI.classList.remove('d-none');
    callTimerDisplay.classList.add('d-none');

    if (isGroup) {
        ringName.innerText = currentChat.chatName;
        ringStatus.innerText = "Starting Group Call...";
        ringAvatar.src = defaultAvatar; // Or group icon
    } else {
        if (ringName) ringName.innerText = otherUser.username;
        if (ringStatus) ringStatus.innerText = "Ringing...";
        if (ringAvatar) {
            ringAvatar.src = getAvatarUrl(otherUser.profilePic);
        }
    }

    try {
        const streamConstraints = {
            video: type === 'video',
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        localStream = await navigator.mediaDevices.getUserMedia(streamConstraints);

        // Show local preview in grid
        addLocalStream();

        if (!isGroup) {
            outgoingRingtone.muted = false;
            outgoingRingtone.play().catch(e => console.log("Audio block: ", e));
            // Send Invitation
            socket.emit('callUser', {
                userToCall: otherUser._id,
                from: currentUser._id,
                name: currentUser.username,
                type: type,
                chatId: currentChat._id
            });
        }

        // Join the Unified Call Room
        socket.emit("join-call", currentChat._id);
        startTimer();
    } catch (err) {
        console.error("Call initialization error:", err);
        alert("Could not access camera/mic.");
        endCall();
    }
}

videoCallBtn.addEventListener('click', () => handleStartCall('video'));
voiceCallBtn.addEventListener('click', () => handleStartCall('voice'));

acceptCallBtn.addEventListener('click', async () => {
    callRingtone.muted = true;
    callRingtone.pause();
    callRingtone.currentTime = 0;
    incomingCallModal.classList.add('d-none');
    videoCallOverlay.classList.remove('d-none');

    isCallInitiator = false;
    activeCallUserId = incomingCallData.from;
    callType = incomingCallData.type || 'video';
    isMuted = false;
    isVideoOff = false;

    // Show Connecting UI (Null-safe)
    if (ringingUI) ringingUI.classList.remove('d-none');
    if (ringName) ringName.innerText = incomingCallData.name;
    if (ringStatus) ringStatus.innerText = "Connecting...";

    const sender = users.find(u => u._id === activeCallUserId);
    if (ringAvatar) {
        ringAvatar.src = getAvatarUrl(sender?.profilePic);
    }

    try {
        const streamConstraints = {
            video: callType === 'video',
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        localStream = await navigator.mediaDevices.getUserMedia(streamConstraints);

        // Show local preview in grid
        addLocalStream();

        // Join the Unified Call Room
        socket.emit("join-call", incomingCallData.chatId || currentChat._id);
        startTimer();
    } catch (err) {
        console.error("Join call error:", err);
        endCall();
    }
});

function endCall(reason = 'Ended') {
    console.log("Call Ended:", reason);

    // Stop all media
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (displayStream) {
        displayStream.getTracks().forEach(track => track.stop());
        displayStream = null;
    }

    // Destroy all Mesh peers
    peers.forEach(p => p.destroy());
    peers.clear();

    // Clear Individual peer if exists
    if (peer) {
        peer.destroy();
        peer = null;
    }

    // Notify server to leave call room
    if (currentChat) socket.emit("leave-call", currentChat._id);

    // UI Cleanup
    videoCallOverlay.classList.add('d-none');
    incomingCallModal.classList.add('d-none');
    videoGrid.innerHTML = ''; // Wipe the grid

    // Audio Cleanup — stop ALL sounds immediately
    callRingtone.muted = true;
    callRingtone.pause();
    callRingtone.currentTime = 0;
    outgoingRingtone.muted = true;
    outgoingRingtone.pause();
    outgoingRingtone.currentTime = 0;
    callEndSound.pause();
    callEndSound.currentTime = 0;

    // Log the call if initiator
    if (isCallInitiator && activeCallUserId && currentChat) {
        let durationStr = secondsElapsed > 0 ? `${Math.floor(secondsElapsed / 60)}m ${secondsElapsed % 60}s` : "No Answer";

        const logMsg = {
            content: `📞 ${callType === 'video' ? 'Video' : 'Voice'} Call - ${durationStr}`,
            chatId: currentChat._id,
            sender: currentUser,
            isCallLog: true,
            callDuration: secondsElapsed
        };

        socket.emit('new message', logMsg);
        appendMessageUI({ ...logMsg, createdAt: new Date().toISOString(), _id: 'temp-' + Date.now() });
    }

    // Reset states
    incomingCallData = null;
    activeCallUserId = null;
    isCallInitiator = false;
    secondsElapsed = 0;
    clearInterval(callDurationTimer);

    if (toggleMicBtn) {
        toggleMicBtn.classList.remove('active');
        toggleMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    }
    if (toggleVideoBtn) {
        toggleVideoBtn.classList.remove('active');
        toggleVideoBtn.innerHTML = '<i class="fa-solid fa-video"></i>';
    }
}

endCallBtn.addEventListener('click', () => {
    const toUser = incomingCallData ? incomingCallData.from : activeCallUserId;
    if (toUser) socket.emit('endCall', { to: toUser });
    endCall('I ended');
});

rejectCallBtn.addEventListener('click', () => {
    if (incomingCallData) socket.emit('endCall', { to: incomingCallData.from });
    endCall('I rejected');
});

// Init
const defaultAvatar = "/default-avatar.png";

// Handle Profile Modal Population
const profileBtn = document.getElementById('profile-btn');
if (profileBtn) {
    profileBtn.addEventListener('click', () => {
        if (currentUser) {
            profileUsername.innerText = currentUser.username;
            profileBio.value = currentUser.bio || '';
            profilePicModal.src = currentUser.profilePic || defaultAvatar;
        }
    });

}

let cropper = null;
const profileViewArea = document.getElementById('profile-view-area');
const cropperArea = document.getElementById('cropper-area');
const cropperImage = document.getElementById('cropper-image');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const saveCropBtn = document.getElementById('save-crop-btn');

// Start Cropping Session
profileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        profileViewArea.classList.add('d-none');
        cropperArea.classList.remove('d-none');
        cropperImage.src = event.target.result;

        if (cropper) cropper.destroy();

        cropper = new Cropper(cropperImage, {
            aspectRatio: 1, // perfect square
            viewMode: 1,
            dragMode: 'move'
        });
    };
    reader.readAsDataURL(file);
    profileUpload.value = ''; // Reset input
});

cancelCropBtn.addEventListener('click', () => {
    cropperArea.classList.add('d-none');
    profileViewArea.classList.remove('d-none');
    if (cropper) cropper.destroy();
});

// Save Cropped Image
saveCropBtn.addEventListener('click', () => {
    if (!cropper) return;
    saveCropBtn.disabled = true;
    saveCropBtn.innerText = "Saving...";

    cropper.getCroppedCanvas({
        width: 400,
        height: 400
    }).toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('media', blob, "profile.jpg");

        try {
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentUser.token}`
                },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                currentUser.profilePic = data.url;
                profilePicModal.src = currentUser.profilePic;

                // Revert UI
                cropperArea.classList.add('d-none');
                profileViewArea.classList.remove('d-none');
                if (cropper) cropper.destroy();
            } else {
                alert("Upload failed: " + data.message);
            }
        } catch (err) {
            alert('Server error uploading image');
        } finally {
            saveCropBtn.disabled = false;
            saveCropBtn.innerText = "Crop & Upload";
        }
    }, 'image/jpeg', 0.8);
});

// Save Profile changes
saveProfileBtn.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_URL}/auth/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                profilePic: currentUser.profilePic,
                bio: profileBio.value
            })
        });

        const data = await res.json();
        if (res.ok) {
            currentUser = data; // replace with updated data
            localStorage.setItem('chatAppUser', JSON.stringify(currentUser));
            if (currentUser.profilePic) myProfilePic.src = currentUser.profilePic;

            // Close modal using bootstrap JS
            const myModalEl = document.getElementById('profileModal');
            const modal = bootstrap.Modal.getInstance(myModalEl);
            modal.hide();
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Server error saving profile');
    }
});

// Emoji Picker Logic
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

const emojis = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"];

if (emojiBtn && emojiPicker) {
    // Populate
    emojiPicker.innerHTML = '<div class="d-flex flex-wrap gap-1">' + emojis.map(e => `<span class="emoji-item">${e}</span>`).join('') + '</div>';

    // Toggle
    emojiBtn.addEventListener('click', () => {
        emojiPicker.classList.toggle('d-none');
    });

    // Pick
    emojiPicker.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-item')) {
            messageInput.value += e.target.innerText;
            messageInput.focus();
            emojiPicker.classList.add('d-none');
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.classList.add('d-none');
        }
    });
}

// --- Group Chat Logic ---

if (groupUserSearch) {
    groupUserSearch.addEventListener('input', () => {
        renderGroupUserSearch();
    });
}

function renderGroupUserSearch() {
    const term = groupUserSearch.value.toLowerCase().trim();
    if (!term) {
        groupUsersList.innerHTML = '<div class="text-center p-3 text-muted small">Search for users to add them...</div>';
        return;
    }

    const filtered = users.filter(u =>
        u._id !== currentUser._id &&
        u.username.toLowerCase().includes(term) &&
        !selectedGroupUsers.some(sel => sel._id === u._id)
    );

    groupUsersList.innerHTML = '';

    if (filtered.length === 0) {
        groupUsersList.innerHTML = '<div class="text-center p-3 text-muted small">No users found.</div>';
    }

    filtered.forEach(user => {
        const div = document.createElement('div');
        div.className = 'p-2 border-bottom d-flex align-items-center cursor-pointer hover-bg-light';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <img src="${user.profilePic || defaultAvatar}" class="rounded-circle me-2" style="width: 30px; height: 30px; object-fit: cover;">
            <span class="flex-grow-1">${user.username}</span>
            <i class="fa-solid fa-plus text-primary"></i>
        `;
        div.onclick = () => selectUserForGroup(user);
        groupUsersList.appendChild(div);
    });
}

function selectUserForGroup(user) {
    if (selectedGroupUsers.some(u => u._id === user._id)) return;

    selectedGroupUsers.push(user);
    renderSelectedBadges();
    groupUserSearch.value = '';
    renderGroupUserSearch();
}

function renderSelectedBadges() {
    selectedUsersBadges.innerHTML = '';
    selectedGroupUsers.forEach(user => {
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary rounded-pill d-flex align-items-center p-2 mb-1';
        badge.innerHTML = `
            ${user.username}
            <i class="fa-solid fa-xmark ms-2 cursor-pointer" style="cursor:pointer"></i>
        `;
        badge.querySelector('i').onclick = () => {
            selectedGroupUsers = selectedGroupUsers.filter(u => u._id !== user._id);
            renderSelectedBadges();
            renderGroupUserSearch();
        };
        selectedUsersBadges.appendChild(badge);
    });
}

createGroupConfirmBtn.addEventListener('click', async () => {
    const name = groupNameInput.value.trim();
    if (!name || selectedGroupUsers.length < 2) {
        alert("Please enter a group name and select at least 2 other users.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/chat/group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                name: name,
                users: JSON.stringify(selectedGroupUsers.map(u => u._id))
            })
        });

        const data = await res.json();
        if (res.ok) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('groupModal')).hide();
            // Clear state
            groupNameInput.value = '';
            selectedGroupUsers = [];
            renderSelectedBadges();
            // Open the new chat
            currentChat = data;
            currentChatName.innerText = data.chatName;
            fetchMessages();
            fetchChats(); // Refresh sidebar for new group

            // Show alert/notification
            alert("Group created successfully!");
        } else {
            alert(data.message || "Failed to create group.");
        }
    } catch (err) {
        console.error(err);
    }
});

// --- Message Actions (Edit/Delete) ---
let editingMessageId = null;

window.prepareEditMessage = (msgId) => {
    const msgElement = document.getElementById(`msg-${msgId}`);
    if (!msgElement) return;

    const content = msgElement.querySelector('.msg-text').innerText;
    messageInput.value = content;
    messageInput.focus();
    editingMessageId = msgId;

    // Change send icon to checkmark
    sendBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    sendBtn.classList.add('btn-success');
};

async function deleteMessageRequest(msgId) {
    if (!confirm("Are you sure you want to delete this message for everyone?")) return;

    try {
        const res = await fetch(`${API_URL}/chat/message/${msgId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (res.ok) {
            const data = await res.json();
            updateMessageUI(data.updatedMessage);
            socket.emit("message update", data.updatedMessage);
        }
    } catch (err) {
        console.error(err);
    }
}

async function editMessageRequest(msgId, newContent) {
    try {
        const res = await fetch(`${API_URL}/chat/message/${msgId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ content: newContent })
        });

        if (res.ok) {
            const data = await res.json();
            updateMessageUI(data.updatedMessage);
            socket.emit("message update", data.updatedMessage);

            // Revert UI
            editingMessageId = null;
            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            sendBtn.classList.remove('btn-success');
            messageInput.value = '';
        }
    } catch (err) {
        console.error(err);
    }
}

function updateMessageUI(updatedMsg) {
    const msgElement = document.getElementById(`msg-${updatedMsg._id}`);
    if (!msgElement) return;

    if (updatedMsg.isDeleted) {
        msgElement.classList.add('deleted');
        msgElement.querySelector('.msg-text').innerText = "This message was deleted";
        const media = msgElement.querySelector('.chat-image');
        if (media) media.remove();
        const actions = msgElement.querySelector('.message-actions');
        if (actions) actions.remove();
    } else if (updatedMsg.isEdited) {
        msgElement.querySelector('.msg-text').innerText = updatedMsg.content;
        if (!msgElement.querySelector('.is-edited-tag')) {
            const tag = document.createElement('span');
            tag.className = 'is-edited-tag';
            tag.innerText = ' (edited)';
            msgElement.querySelector('.msg-text').appendChild(tag);
        }
    }
}

// ─── sendMessage: the core function called by Enter key + send button ───────
function sendMessage() {
    if (!messageInput || !messageInput.value.trim() || !currentChat || !socket) return;

    const content = messageInput.value.trim();
    const msgData = {
        content: content,
        mediaUrl: "",
        chatId: currentChat,
        sender: { _id: currentUser._id, username: currentUser.username },
        replyTo: replyingToMessageId || null
    };

    socket.emit('new message', msgData);

    // Optimistic UI
    const optimisticMsg = {
        ...msgData,
        createdAt: new Date().toISOString(),
        _id: 'temp-' + Date.now()
    };
    if (replyingToMessageId) {
        optimisticMsg.replyTo = {
            sender: { username: replyUser.innerText.replace('Replying to ', '') },
            content: replyText.innerText
        };
    }
    appendMessageUI(optimisticMsg);

    messageInput.value = '';
    replyingToMessageId = null;
    if (replyPreview) replyPreview.classList.add('d-none');
    socket.emit('stop typing', currentChat._id);
    if (smartReplies) smartReplies.classList.add('d-none');
}

// Update the message sending logic to handle edits
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (editingMessageId) {
            editMessageRequest(editingMessageId, messageInput.value.trim());
        } else {
            sendMessage();
        }
    }
});

sendBtn.addEventListener('click', () => {
    if (editingMessageId) {
        editMessageRequest(editingMessageId, messageInput.value.trim());
    } else {
        sendMessage();
    }
});

// startTimer is an alias for startCallDurationTimer
function startTimer() { startCallDurationTimer(); }

// Update socket to handle real-time message updates
// Add this in connectSocket()
// socket.on("message update", (updatedMsg) => {
//     updateMessageUI(updatedMsg);
// });

// --- Group Info & Admin Functions ---
const groupInfoModal = new bootstrap.Modal(document.getElementById('groupInfoModal'));
const infoGroupName = document.getElementById('info-group-name');
const infoGroupAdminName = document.getElementById('info-group-admin-name');
const groupMembersList = document.getElementById('group-members-list');
const adminActions = document.getElementById('admin-actions');
const renameGroupInput = document.getElementById('rename-group-input');
const renameGroupBtn = document.getElementById('rename-group-btn');
const leaveGroupBtn = document.getElementById('leave-group-btn');

currentChatName.parentElement.onclick = () => {
    if (currentChat && currentChat.isGroupChat) {
        showGroupInfo();
    }
};

function showGroupInfo() {
    infoGroupName.innerText = currentChat.chatName;
    const admin = currentChat.groupAdmin;
    infoGroupAdminName.innerText = `Admin: ${admin.username}`;

    const isAdmin = admin._id === currentUser._id;
    if (isAdmin) {
        adminActions.classList.remove('d-none');
        renameGroupInput.value = currentChat.chatName;
    } else {
        adminActions.classList.add('d-none');
    }

    groupMembersList.innerHTML = '';
    currentChat.users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'p-3 border-bottom d-flex align-items-center';
        div.innerHTML = `
            <img src="${user.profilePic || defaultAvatar}" class="rounded-circle me-3" style="width: 40px; height: 40px; object-fit: cover;">
            <div class="flex-grow-1">
                <h6 class="mb-0 fw-bold">${user.username} ${user._id === admin._id ? '<span class="badge bg-warning text-dark ms-1" style="font-size: 9px;">Admin</span>' : ''}</h6>
                <small class="text-muted">${user.email || ''}</small>
            </div>
            ${isAdmin && user._id !== currentUser._id ? `<button class="btn btn-sm btn-outline-danger rounded-pill" onclick="removeFromGroupRequest('${user._id}')">Remove</button>` : ''}
        `;
        groupMembersList.appendChild(div);
    });

    groupInfoModal.show();
}

renameGroupBtn.onclick = async () => {
    const newName = renameGroupInput.value.trim();
    if (!newName || newName === currentChat.chatName) return;

    try {
        const res = await fetch(`${API_URL}/chat/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ chatId: currentChat._id, chatName: newName })
        });
        const data = await res.json();
        if (res.ok) {
            currentChat = data;
            currentChatName.innerText = data.chatName;
            infoGroupName.innerText = data.chatName;
            fetchChats(); // Refresh sidebar for rename

            // Broadcast to other members
            socket.emit("group update", { chatId: currentChat._id, type: 'rename', data: { newName } });

            alert("Group renamed successfully!");
        }
    } catch (err) { }
};

window.removeFromGroupRequest = async (userId) => {
    if (!confirm("Remove this user from the group?")) return;

    try {
        const res = await fetch(`${API_URL}/chat/groupremove`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ chatId: currentChat._id, userId: userId })
        });
        const data = await res.json();
        if (res.ok) {
            currentChat = data;

            // Broadcast to the removed user (and others)
            socket.emit("group update", { chatId: currentChat._id, type: 'remove', data: { userId } });

            showGroupInfo(); // Refresh member list
            alert("User removed.");
        }
    } catch (err) { }
};

// --- Threaded Reply Logic ---
window.prepareReply = (msgId, username, text) => {
    replyingToMessageId = msgId;
    replyUser.innerText = `Replying to ${username}`;
    replyText.innerText = text || "Media";
    replyPreview.classList.remove('d-none');
    messageInput.focus();
};

cancelReplyBtn.onclick = () => {
    replyingToMessageId = null;
    replyPreview.classList.add('d-none');
};

// --- Multi-User Video Calling (Mesh) Logic ---

async function startMultiUserCall() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream = stream;
        videoCallOverlay.classList.remove('d-none');
        addLocalStream();

        // Start Duration Timer
        startCallDurationTimer();

        // Join the Call Room
        socket.emit("join-call", currentChat._id);
    } catch (err) {
        console.error("Camera access denied:", err);
        alert("Please allow camera access to start calling.");
    }
}

function startCallDurationTimer() {
    clearInterval(callDurationTimer);
    secondsElapsed = 0;
    callDurationTimerUI.innerText = "00:00";
    callDurationTimer = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        callDurationTimerUI.innerText = `${mins}:${secs}`;
    }, 1000);
}

// UNIFIED START LOGIC
async function startMultiUserCall() {
    // Now just a wrapper for handleStartCall('video') 
    // or shared unified logic
    handleStartCall('video');
}

function addLocalStream() {
    const existing = document.getElementById('local-video-preview');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'local-video-preview';
    container.className = 'video-container position-relative animate__animated animate__zoomIn';
    container.innerHTML = `
        <video id="my-video" autoplay playsinline muted></video>
        <div class="video-label">You</div>
    `;
    videoGrid.appendChild(container);
    const video = container.querySelector('video');
    video.srcObject = localStream;

    // Auto-hide ringing UI when stream added to grid
    ringingUI.classList.add('d-none');
}

function createPeer(toSocketId, userId, initiator) {
    // Find username from users list
    const participant = users.find(u => u._id === userId);
    const username = participant ? participant.username : 'User';

    const p = new SimplePeer({
        initiator: initiator,
        trickle: false,
        stream: localStream,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });

    p.on('signal', signal => {
        socket.emit('signal-peer', { toSocketId, signal, fromUserId: currentUser._id });
    });

    p.on('stream', stream => {
        addRemoteStream(userId, username, stream);
        // Ensure ring is hidden when we get a remote participant
        ringingUI.classList.add('d-none');
    });

    p.on('close', () => {
        const vid = document.getElementById(`video-${userId}`);
        if (vid) vid.closest('.video-container').remove();
        peers.delete(toSocketId);
    });

    p.on('error', err => console.log('Peer error:', err));

    return p;
}

function addRemoteStream(userId, username, stream) {
    let container = document.getElementById(`video-container-${userId}`);
    if (!container) {
        container = document.createElement('div');
        container.id = `video-container-${userId}`;
        container.className = 'video-container';
        container.innerHTML = `
            <video id="video-${userId}" autoplay playsinline></video>
            <div class="video-label">${username}</div>
            <div class="video-controls-overlay">
                 <span class="muted-icon d-none"><i class="fa-solid fa-microphone-slash text-danger"></i></span>
            </div>
        `;
        videoGrid.appendChild(container);
    }
    const video = container.querySelector('video');
    video.srcObject = stream;

    // Speaker Highlighting
    monitorVolume(stream, container);
}

function monitorVolume(stream, element) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
        if (!element.parentElement) return; // Stop if removed
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        let average = sum / dataArray.length;

        if (average > 30) {
            element.classList.add('active-speaker');
        } else {
            element.classList.remove('active-speaker');
        }
        requestAnimationFrame(checkVolume);
    };
    checkVolume();
}

function appendCallLog(content) {
    const msgData = {
        content: content,
        isCallLog: true,
        chatId: currentChat,
        sender: { _id: currentUser._id, username: currentUser.username }
    };
    appendMessageUI(msgData);
}

// Call Control Handlers
toggleMicBtn.onclick = () => {
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    toggleMicBtn.classList.toggle('btn-danger', isMuted);
    toggleMicBtn.innerHTML = isMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
};

toggleVideoBtn.onclick = () => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
    toggleVideoBtn.classList.toggle('btn-danger', isVideoOff);
    toggleVideoBtn.innerHTML = isVideoOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
};

shareScreenBtn.onclick = async () => {
    try {
        if (!isScreenSharing) {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            displayStream = stream;

            // Replace tracks in all peers
            const videoTrack = stream.getVideoTracks()[0];
            for (let [socketId, p] of peers) {
                p.replaceTrack(localStream.getVideoTracks()[0], videoTrack, localStream);
            }

            // Update local preview
            document.getElementById('my-video').srcObject = stream;

            videoTrack.onended = () => stopScreenSharing();
            isScreenSharing = true;
            shareScreenBtn.classList.add('btn-success');
        } else {
            stopScreenSharing();
        }
    } catch (err) {
        console.error(err);
    }
};

function stopScreenSharing() {
    if (!isScreenSharing) return;
    isScreenSharing = false;
    shareScreenBtn.classList.remove('btn-success');

    if (displayStream) {
        displayStream.getTracks().forEach(t => t.stop());
        displayStream = null;
    }

    // Restore camera track to all peers
    if (localStream) {
        const cameraTrack = localStream.getVideoTracks()[0];
        if (cameraTrack) {
            for (let [socketId, p] of peers) {
                try { p.replaceTrack(null, cameraTrack, localStream); } catch (e) { }
            }
            const myVid = document.getElementById('my-video');
            if (myVid) myVid.srcObject = localStream;
        }
    }
}


// --- Voice Recording Logic ---


async function startRecording() {
    if (!currentChat) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            if (audioChunks.length > 0 && recordingSeconds > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await uploadVoiceNote(audioBlob);
            }
            audioChunks = [];
        };

        mediaRecorder.start(200); // collect data every 200ms
        recordingSeconds = 0;
        if (recordingStatus) recordingStatus.classList.remove('d-none');

        recordingInterval = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
            const secs = (recordingSeconds % 60).toString().padStart(2, '0');
            if (recordingTimer) recordingTimer.innerText = `${mins}:${secs}`;
        }, 1000);

        if (voiceRecBtn) voiceRecBtn.classList.add('text-danger');
    } catch (err) {
        console.error("Recording start failed:", err);
        alert("Microphone access denied. Please allow microphone access.");
    }
}

function stopRecording(isCancel = false) {
    if (isCancel) {
        audioChunks = []; // discard data before stop fires onstop
        recordingSeconds = 0; // prevent upload condition
    }
    clearInterval(recordingInterval);
    recordingInterval = null;
    
    if (recordingStatus) recordingStatus.classList.add('d-none');
    if (recordingTimer) recordingTimer.innerText = "00:00";
    if (voiceRecBtn) voiceRecBtn.classList.remove('text-danger');

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop(); // triggers onstop → uploadVoiceNote (unless cancelled)
    }
}

async function uploadVoiceNote(blob) {
    if (!currentChat || !currentUser) return;
    const formData = new FormData();
    formData.append('media', blob, `voice_${Date.now()}.webm`);

    try {
        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }, // ← fixed token
            body: formData
        });
        const data = await res.json();

        if (res.ok && data.url) {
            const msgData = {
                content: "🎤 Voice Message",
                mediaUrl: data.url,
                chatId: currentChat,              // ← full chat object (not just _id)
                sender: { _id: currentUser._id, username: currentUser.username }
            };
            socket.emit('new message', msgData);
            appendMessageUI({ ...msgData, createdAt: new Date().toISOString(), _id: 'temp-' + Date.now() });
        } else {
            alert('Voice upload failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        console.error("Voice upload failed:", err);
        alert('Voice upload failed. Is the server running?');
    }
}

// Wire voice record button (toggle start/stop-record behaviour)
if (voiceRecBtn) {
    voiceRecBtn.addEventListener('click', () => {
        const isRecording = mediaRecorder && mediaRecorder.state === 'recording';
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording(false);
        }
    });
}

// Stop and Send button
if (stopRecordingBtn) stopRecordingBtn.addEventListener('click', () => stopRecording(false));

// Cancel button – discard the recording
if (cancelRecordingBtn) cancelRecordingBtn.addEventListener('click', () => stopRecording(true));


// ════════════════════════════════════════════════════════════════
//  FRIEND REQUEST SYSTEM
// ════════════════════════════════════════════════════════════════

let currentSidebarTab = 'chats';

// ── Sidebar Tab Switcher ─────────────────────────────────────────
function switchSidebarTab(tab) {
    currentSidebarTab = tab;
    const tabs = ['chats', 'friends', 'requests'];
    tabs.forEach(t => {
        const panel = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tab-${t}-btn`);
        if (panel) panel.classList.toggle('d-none', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });

    const searchBar = document.getElementById('sidebar-search-bar');
    if (searchBar) searchBar.classList.toggle('d-none', tab === 'requests');

    if (tab === 'friends') fetchDiscoverUsers();
    if (tab === 'requests') fetchIncomingRequests();
}

// ── Fetch discover list (people you can add) ─────────────────────
async function fetchDiscoverUsers() {
    const list = document.getElementById('discover-list');
    if (!list || !currentUser) return;
    list.innerHTML = '<div class="text-center mt-3 text-muted small"><div class="spinner-border spinner-border-sm"></div> Loading...</div>';

    try {
        const res = await fetch(`${API_URL}/friends/discover`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const users = await res.json();
        if (!res.ok) throw new Error(users.message);

        if (!users.length) {
            list.innerHTML = '<div class="text-center mt-4 text-muted small p-3">No new people to add right now.</div>';
            return;
        }

        list.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'user-item p-3 d-flex align-items-center gap-2';
            
            const btnHtml = u.requestSent
                ? `<button class="btn btn-sm btn-success rounded-pill px-3" id="add-btn-${u._id}" onmouseover="this.innerHTML='<i class=\\'fa-solid fa-xmark me-1\\'></i>Unsend'; this.classList.replace('btn-success', 'btn-danger')" onmouseout="this.innerHTML='<i class=\\'fa-solid fa-check me-1\\'></i>Sent'; this.classList.replace('btn-danger', 'btn-success')" onclick="unsendFriendRequest('${u._id}', this)"><i class="fa-solid fa-check me-1"></i>Sent</button>`
                : `<button class="btn btn-sm btn-primary rounded-pill px-3" id="add-btn-${u._id}" onclick="sendFriendRequest('${u._id}', this)"><i class="fa-solid fa-user-plus me-1"></i>Add</button>`;

            div.innerHTML = `
                <img src="${getAvatarUrl(u.profilePic)}" class="rounded-circle" style="width:42px;height:42px;object-fit:cover;">
                <div class="flex-grow-1">
                    <div class="fw-bold">${u.username}</div>
                    <small class="text-muted">${u.bio || 'Available'}</small>
                </div>
                ${btnHtml}
            `;
            list.appendChild(div);
        });
    } catch (err) {
        list.innerHTML = `<div class="text-center mt-4 text-danger small">${err.message}</div>`;
    }
}

// ── Send Friend Request ──────────────────────────────────────────
async function sendFriendRequest(receiverId, btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div>';

    try {
        const res = await fetch(`${API_URL}/friends/request`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiverId })
        });
        const data = await res.json();

        if (res.ok) {
            btn.innerHTML = '<i class="fa-solid fa-check me-1"></i>Sent';
            btn.classList.replace('btn-primary', 'btn-success');
            btn.disabled = false;
            btn.onmouseover = () => { btn.innerHTML='<i class="fa-solid fa-xmark me-1"></i>Unsend'; btn.classList.replace('btn-success', 'btn-danger'); };
            btn.onmouseout = () => { btn.innerHTML='<i class="fa-solid fa-check me-1"></i>Sent'; btn.classList.replace('btn-danger', 'btn-success'); };
            btn.onclick = () => unsendFriendRequest(receiverId, btn);
            // Real-time notify the receiver
            socket.emit('friend-request-sent', { toUserId: receiverId, request: data.request });
        } else {
            btn.innerHTML = `<i class="fa-solid fa-user-plus me-1"></i>Add`;
            btn.disabled = false;
            alert(data.message);
        }
    } catch (err) {
        btn.innerHTML = `<i class="fa-solid fa-user-plus me-1"></i>Add`;
        btn.disabled = false;
        alert('Error sending request');
    }
}

// ── Unsend Friend Request ──────────────────────────────────────────
async function unsendFriendRequest(receiverId, btn) {
    if (!btn) return;
    const prevHtml = btn.innerHTML;
    const prevClass = btn.className;
    
    // Reset mouse handlers temporarily
    btn.onmouseover = null;
    btn.onmouseout = null;
    btn.disabled = true;
    btn.className = 'btn btn-sm btn-danger rounded-pill px-3';
    btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div>';

    try {
        const res = await fetch(`${API_URL}/friends/request/${receiverId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (res.ok) {
            // Revert back to Add button
            btn.className = 'btn btn-sm btn-primary rounded-pill px-3';
            btn.innerHTML = '<i class="fa-solid fa-user-plus me-1"></i>Add';
            btn.disabled = false;
            btn.onclick = () => sendFriendRequest(receiverId, btn);
            btn.onmouseover = null;
            btn.onmouseout = null;
            
            // Real-time notification (optional, simply withdraws so they don't see it)
            // socket.emit('friend-request-unsent', { toUserId: receiverId });
        } else {
            const data = await res.json();
            alert(data.message || 'Failed to unsend request');
            btn.innerHTML = prevHtml;
            btn.className = prevClass;
            btn.disabled = false;
            btn.onmouseover = () => { btn.innerHTML='<i class="fa-solid fa-xmark me-1"></i>Unsend'; btn.classList.replace('btn-success', 'btn-danger'); };
            btn.onmouseout = () => { btn.innerHTML='<i class="fa-solid fa-check me-1"></i>Sent'; btn.classList.replace('btn-danger', 'btn-success'); };
        }
    } catch (err) {
        console.error(err);
        btn.innerHTML = prevHtml;
        btn.className = prevClass;
        btn.disabled = false;
        btn.onmouseover = () => { btn.innerHTML='<i class="fa-solid fa-xmark me-1"></i>Unsend'; btn.classList.replace('btn-success', 'btn-danger'); };
        btn.onmouseout = () => { btn.innerHTML='<i class="fa-solid fa-check me-1"></i>Sent'; btn.classList.replace('btn-danger', 'btn-success'); };
        alert('Server error while unsending request');
    }
}

// ── Unfriend ───────────────────────────────────────────────────
async function confirmUnfriend(friendId, friendName) {
    if (!confirm(`Are you sure you want to unfriend ${friendName}?`)) return;
    
    try {
        const res = await fetch(`${API_URL}/friends/${friendId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (res.ok) {
            // Success
            alert(`You are no longer friends with ${friendName}.`);
            
            // Clean up UI if this chat was active
            if (currentChat && Array.isArray(currentChat.users) && currentChat.users.some(u => u._id === friendId)) {
                currentChat = null;
                currentChatName.innerText = 'Select a user to chat';
                chatMessages.innerHTML = `
                    <div class="text-center text-muted mt-5">
                        <i class="fa-regular fa-comment-dots fa-3x mb-3 opacity-50"></i>
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                `;
                messageInput.disabled = true;
                sendBtn.disabled = true;
                voiceRecBtn.disabled = true;
                document.getElementById('video-call-btn').classList.add('d-none');
                document.getElementById('voice-call-btn').classList.add('d-none');
                document.getElementById('unfriend-btn').classList.add('d-none');
                document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
            }
            
            fetchChats(); // Refresh sidebar to remove the chat
            fetchDiscoverUsers(); // They might appear back in "Find Friends"
        } else {
            const data = await res.json();
            alert(data.message || 'Error unfriending user');
        }
    } catch (err) {
        console.error(err);
        alert('Server error while unfriending.');
    }
}

// ── Clear Chat ─────────────────────────────────────────────────
async function clearCurrentChat() {
    if (!currentChat) return;
    if (!confirm('Are you sure you want to clear all messages in this chat? This cannot be undone.')) return;

    try {
        const res = await fetch(`${API_URL}/chat/clear/${currentChat._id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (res.ok) {
            // Clear the messages UI
            chatMessages.innerHTML = `
                <div class="text-center text-muted mt-5">
                    <i class="fa-regular fa-comment-dots fa-3x mb-3 opacity-50"></i>
                    <p>No messages yet. Start the conversation!</p>
                </div>
            `;
            // Refresh sidebar to update latest message preview
            fetchChats();
        } else {
            const data = await res.json();
            alert(data.message || 'Failed to clear chat');
        }
    } catch (err) {
        console.error(err);
        alert('Server error while clearing chat.');
    }
}

// ── Fetch Incoming Requests ──────────────────────────────────────
async function fetchIncomingRequests() {
    const list = document.getElementById('requests-list');
    const badge = document.getElementById('requests-badge');
    if (!list || !currentUser) return;
    list.innerHTML = '<div class="text-center mt-3 text-muted small"><div class="spinner-border spinner-border-sm"></div> Loading...</div>';

    try {
        const res = await fetch(`${API_URL}/friends/requests`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const requests = await res.json();
        if (!res.ok) throw new Error(requests.message);

        // Update badge
        if (badge) {
            if (requests.length > 0) {
                badge.textContent = requests.length;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }

        if (!requests.length) {
            list.innerHTML = '<div class="text-center mt-4 text-muted small p-3">No pending friend requests.</div>';
            return;
        }

        list.innerHTML = '';
        requests.forEach(req => {
            const s = req.sender;
            const div = document.createElement('div');
            div.className = 'p-3 d-flex align-items-center gap-2 border-bottom';
            div.id = `req-${req._id}`;
            div.innerHTML = `
                <img src="${getAvatarUrl(s.profilePic)}" class="rounded-circle" style="width:44px;height:44px;object-fit:cover;">
                <div class="flex-grow-1">
                    <div class="fw-bold">${s.username}</div>
                    <small class="text-muted">Wants to be your friend</small>
                </div>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-success rounded-pill px-2" onclick="respondToRequest('${req._id}', 'accept', '${s._id}')">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger rounded-pill px-2" onclick="respondToRequest('${req._id}', 'reject', '${s._id}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (err) {
        list.innerHTML = `<div class="text-center mt-4 text-danger small">${err.message}</div>`;
    }
}

// ── Accept / Reject ──────────────────────────────────────────────
async function respondToRequest(requestId, action, senderId) {
    try {
        const res = await fetch(`${API_URL}/friends/${action}/${requestId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await res.json();

        if (res.ok) {
            // Remove the request card
            const card = document.getElementById(`req-${requestId}`);
            if (card) card.remove();

            if (action === 'accept') {
                // Notify the sender in real time
                socket.emit('friend-request-accepted', { toUserId: senderId, request: data.request });
                // Refresh chats so new friend appears
                await fetchUsers();
                // Show a toast-style notification
                showFriendToast(`You and ${data.request?.sender?.username || 'someone'} are now friends! 🎉`);
            }

            // Refresh badge
            fetchIncomingRequests();
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ── Show a brief toast notification ─────────────────────────────
function showFriendToast(msg) {
    let toast = document.getElementById('friend-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'friend-toast';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:10px 22px;border-radius:30px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.5s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

// ── Socket: incoming friend request ─────────────────────────────
// (Wired in connectSocket below this function block)
function wirefrFriendSocketEvents() {
    if (!socket) return;

    socket.on('friend-request-received', (request) => {
        const badge = document.getElementById('requests-badge');
        if (badge) {
            const cur = parseInt(badge.textContent) || 0;
            badge.textContent = cur + 1;
            badge.classList.remove('d-none');
        }
        // If requests tab is open, refresh it
        if (currentSidebarTab === 'requests') fetchIncomingRequests();
        showFriendToast(`📩 ${request?.sender?.username || 'Someone'} sent you a friend request!`);
    });

    socket.on('friend-accepted', (request) => {
        fetchUsers(); // Refresh so accepted friend shows in chats
        showFriendToast(`🎉 ${request?.receiver?.username || 'Someone'} accepted your friend request!`);
    });
}

// ── Filter search to work on active tab ─────────────────────────
const userSearchInput2 = document.getElementById('user-search');
if (userSearchInput2) {
    userSearchInput2.addEventListener('input', () => {
        const q = userSearchInput2.value.toLowerCase();
        if (currentSidebarTab === 'chats') {
            document.querySelectorAll('#users-list .user-item').forEach(el => {
                const name = el.querySelector('h6')?.textContent?.toLowerCase() || '';
                el.style.display = name.includes(q) ? '' : 'none';
            });
        } else if (currentSidebarTab === 'friends') {
            document.querySelectorAll('#discover-list .user-item').forEach(el => {
                const name = el.querySelector('.fw-bold')?.textContent?.toLowerCase() || '';
                el.style.display = name.includes(q) ? '' : 'none';
            });
        }
    });
}


// Init logic stays at the end
init();
