require('dotenv').config();
const express = require('express');
const compression = require('compression');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { initSocket } = require('./sockets/socket');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Route imports
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const friendRoutes = require('./routes/friendRoutes');

const app = express();
app.use(compression());
const server = http.createServer(app);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug logger
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Static: serve uploaded files
app.use('/uploads', express.static(uploadDir));

// Initialize Socket.io
initSocket(server);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/friends', friendRoutes);

// Serve client static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Catch-all → serve the SPA (MUST be last)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
});

// Database Connection & Server Start
const PORT = process.env.PORT || 5003;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart-chat';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        server.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });
