# ⚡ Smart Chat: Advanced Real-Time Messaging Platform

A production-grade, real-time chat application featuring AI-powered smart replies and a premium "WhatsApp-style" user experience.


## 🚀 Key Features

###  AI-Powered "Smart Replies"
- **Contextual Suggestions**: Over **100+ randomized variations** across 17 distinct chat intents (Greetings, Logistics, Emotions, Professional, etc.).
- **Response Ranking**: Automatically detects questions vs. statements to provide the most relevant quick-tap chips.

###  Premium Media & Profile Tools
- **WhatsApp-Style Cropper**: Integrated `Cropper.js` for perfect profile picture positioning.
- **Media Attachments**: Send images and videos instantly with auto-previews.
- **Emoji Picker**: Built-in interactive emoji library.

###  Core Functionality
- **Socket.io Performance**: Instant real-time updates for messages and typing indicators.
- **Presence Tracking**: Real-time Online/Offline status and dynamic "Last Seen" timestamps.
- **Secure Auth**: JWT-based authentication with password hashing (Bcrypt).
- **Responsive glassmorphism UI**: A gorgeous, mobile-first design built with Bootstrap 5 and custom CSS.

---

##  Tech Stack

- **Frontend**: HTML5, Vanilla CSS, JavaScript (ES6+), Bootstrap 5.
- **Backend**: Node.js, Express.js.
- **Real-Time**: Socket.io.
- **Database**: MongoDB (Mongoose).
- **Imaging**: Cropper.js.

---

## 💻 Local Setup Instructions

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) (Local or Atlas)

### 2. Clone the Repository

### 3. Setup the Server
```bash
cd server
npm install
```

### 4. Environment Variables
Create a `.env` file in the `/server` directory:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/smart-chat
JWT_SECRET=your_super_secret_key
```

### 5. Start the Application
From the **root** folder, run:
```bash
npm start
```
*The app will be available at `http://localhost:5003`*

---

## 🌐 Deployment to Render.com

This app is pre-configured for Render.com:
1. Push this repo to your GitHub.
2. Link the repository to a **New Web Service** on Render.
3. Use Build Command: `npm install && npm run build`
4. Use Start Command: `npm start`
5. Add your `MONGO_URI` and `JWT_SECRET` to the environment variables.

---

## 🤝 Contributing
Contributions are welcome! Feel free to open an issue or submit a pull request.

## 📄 License
This project is licensed under the MIT License.
