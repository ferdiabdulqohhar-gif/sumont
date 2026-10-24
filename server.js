const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

let waitingQueue = [];

// Fungsi untuk mengirim jumlah user online real-time ke semua klien
function broadcastOnlineCount() {
    const onlineCount = io.engine.clientsCount || 0;
    io.emit('update_online_count', { count: onlineCount });
}

function leaveCurrentRoom(sock) {
    if (!sock) return;

    // Bersihkan antrean dari socket yang keluar
    waitingQueue = waitingQueue.filter(u => u && u.id !== sock.id);

    if (sock.currentRoom) {
        const roomClients = io.sockets.adapter.rooms.get(sock.currentRoom);
        if (roomClients) {
            for (const clientId of roomClients) {
                if (clientId !== sock.id) {
                    const partnerSocket = io.sockets.sockets.get(clientId);
                    sock.lastPartnerId = clientId;
                    if (partnerSocket) {
                        partnerSocket.lastPartnerId = sock.id;
                    }
                }
            }
        }
        sock.to(sock.currentRoom).emit('partner_left');
        sock.leave(sock.currentRoom);
        sock.currentRoom = null;
    }
}

function matchUsers() {
    // Filter antrean dari data undefined atau socket yang sudah tidak terhubung
    waitingQueue = waitingQueue.filter(u => u && u.id && io.sockets.sockets.has(u.id));

    if (waitingQueue.length < 2) return;

    const now = Date.now();
    const MIN_EX_WAIT_TIME = 5000; // Minimal 5 detik antre jika ex-partner

    for (let i = 0; i < waitingQueue.length; i++) {
        for (let j = i + 1; j < waitingQueue.length; j++) {
            const user1 = waitingQueue[i];
            const user2 = waitingQueue[j];

            if (!user1 || !user2) continue;

            if (user1.language === user2.language) {
                const socket1 = io.sockets.sockets.get(user1.id);
                const socket2 = io.sockets.sockets.get(user2.id);

                if (socket1 && socket2) {
                    const isExPartner = (socket1.lastPartnerId === socket2.id || socket2.lastPartnerId === socket1.id);

                    // Jika ex-partner, cek syarat minimal 5 detik antre masing-masing
                    if (isExPartner) {
                        const user1Wait = now - (user1.joinedAt || now);
                        const user2Wait = now - (user2.joinedAt || now);

                        if (user1Wait < MIN_EX_WAIT_TIME || user2Wait < MIN_EX_WAIT_TIME) {
                            continue; // Tahan dulu sampai keduanya melewati 5s
                        }
                    }

                    const roomName = `room_${user1.id}_${user2.id}`;
                    
                    socket1.join(roomName);
                    socket2.join(roomName);

                    socket1.currentRoom = roomName;
                    socket2.currentRoom = roomName;

                    socket1.emit('matched', { room: roomName, partnerAlias: user2.alias, initiator: true });
                    socket2.emit('matched', { room: roomName, partnerAlias: user1.alias, initiator: false });

                    // Keluarkan pasangan ini dari waitingQueue
                    waitingQueue = waitingQueue.filter(u => u.id !== user1.id && u.id !== user2.id);

                    return matchUsers();
                }
            }
        }
    }
}

// Check matching setiap 1 detik
setInterval(() => {
    matchUsers();
}, 1000);

io.on('connection', (socket) => {
    // Kirim langsung ke socket yang baru masuk agar langsung tampil tanpa refresh
    socket.emit('update_online_count', { count: io.engine.clientsCount });
    // Broadcast ke user lainnya
    broadcastOnlineCount();

    socket.on('join_queue', (data) => {
        leaveCurrentRoom(socket);

        const language = data.language || 'English';
        const alias = data.alias || 'Anonymous';

        waitingQueue.push({
            id: socket.id,
            language: language,
            alias: alias,
            joinedAt: Date.now()
        });

        matchUsers();
    });

    socket.on('leave_room', () => {
        leaveCurrentRoom(socket);
    });

    socket.on('signal', (data) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('signal', {
                signal: data.signal,
                from: socket.id
            });
        }
    });

    socket.on('disconnect', () => {
        leaveCurrentRoom(socket);
        broadcastOnlineCount();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
