const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let onlineUsers = 0;
let waitingQueue = [];

function matchUsers(user1, user2) {
    const roomName = `room_${user1.id}_${user2.id}`;

    user1.join(roomName);
    user2.join(roomName);

    user1.currentRoom = roomName;
    user2.currentRoom = roomName;

    user1.lastPartnerId = user2.id;
    user2.lastPartnerId = user1.id;

    io.to(user1.id).emit('matched', {
        room: roomName,
        initiator: true,
        partnerAlias: user2.alias
    });

    io.to(user2.id).emit('matched', {
        room: roomName,
        initiator: false,
        partnerAlias: user1.alias
    });
}

function processQueue() {
    if (waitingQueue.length < 2) return;

    for (let i = 0; i < waitingQueue.length; i++) {
        const user1 = waitingQueue[i];
        
        for (let j = i + 1; j < waitingQueue.length; j++) {
            const user2 = waitingQueue[j];

            if (user1.language !== user2.language) continue;

            const isEx = (user1.lastPartnerId === user2.id || user2.lastPartnerId === user1.id);
            const time1 = Date.now() - (user1.queuedAt || 0);
            const time2 = Date.now() - (user2.queuedAt || 0);

            // LOGIKA:
            // 1. Bukan mantan -> Langsung sikat!
            // 2. Mantan -> Kalau salah satu sudah nunggu > 5 detik, izinkan CLBK!
            if (!isEx || time1 > 5000 || time2 > 5000) {
                waitingQueue.splice(j, 1);
                waitingQueue.splice(i, 1);
                matchUsers(user1, user2);
                return processQueue();
            }
        }
    }
}

// Jalankan pengecekan antrean otomatis setiap 1 detik
setInterval(processQueue, 1000);

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('online_users', onlineUsers);

    socket.on('join_queue', (data) => {
        socket.language = (data && data.language) || 'english';
        socket.alias = (data && data.alias) || 'Anonymous';

        // Cegah duplikat antrean
        waitingQueue = waitingQueue.filter(u => u.id !== socket.id);
        
        socket.queuedAt = Date.now();
        waitingQueue.push(socket);

        processQueue();
    });

    socket.on('offer', (data) => {
        if (data && data.room) socket.to(data.room).emit('offer', data);
    });

    socket.on('answer', (data) => {
        if (data && data.room) socket.to(data.room).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        if (data && data.room) socket.to(data.room).emit('ice-candidate', data);
    });

    const handleIncomingMessage = (data) => {
        const messageText = typeof data === 'string' ? data : (data?.message || data?.text);
        const targetRoom = (typeof data === 'object' && data?.room) ? data.room : socket.currentRoom;

        if (targetRoom && messageText) {
            socket.to(targetRoom).emit('receive_message', {
                message: messageText,
                senderAlias: socket.alias || 'Anonymous'
            });
        }
    };

    socket.on('send_message', handleIncomingMessage);
    socket.on('message', handleIncomingMessage);
    socket.on('chat_message', handleIncomingMessage);

    socket.on('leave_room', () => {
        leaveCurrentRoom(socket);
    });

    socket.on('disconnect', () => {
        onlineUsers = Math.max(0, onlineUsers - 1);
        io.emit('online_users', onlineUsers);
        waitingQueue = waitingQueue.filter(user => user.id !== socket.id);
        leaveCurrentRoom(socket);
    });

    function leaveCurrentRoom(sock) {
        waitingQueue = waitingQueue.filter(u => u.id !== sock.id);
        if (sock.currentRoom) {
            sock.to(sock.currentRoom).emit('partner_left');
            sock.leave(sock.currentRoom);
            sock.currentRoom = null;
        }
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
