const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let onlineUsers = 0;
let waitingQueue = [];

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('online_users', onlineUsers);

    socket.on('join_queue', (data) => {
        socket.language = (data && data.language) || 'english';
        socket.alias = (data && data.alias) || 'Anonymous';
        socket.queuedAt = Date.now(); // Catat waktu masuk antrean

        // Cari partner dengan sistem cerdas: 
        // Utamakan orang lain. Tapi kalau >5 detik tidak ada orang lain (server sepi), izinkan mantan ketemu lagi biar tidak stuck abadi.
        const matchIndex = waitingQueue.findIndex(user => {
            if (user.language !== socket.language || user.id === socket.id) return false;

            const isEx = (socket.lastPartnerId === user.id || user.lastPartnerId === socket.id);
            if (!isEx) return true; // Bukan mantan, langsung sikat!

            // Kalau mantan, cek apakah sudah menunggu lebih dari 5 detik (server sepi)
            const timeA = Date.now() - (socket.queuedAt || 0);
            const timeB = Date.now() - (user.queuedAt || 0);
            return timeA > 5000 && timeB > 5000;
        });

        if (matchIndex !== -1) {
            const partner = waitingQueue.splice(matchIndex, 1)[0];
            const roomName = `room_${socket.id}_${partner.id}`;

            socket.join(roomName);
            partner.join(roomName);

            socket.currentRoom = roomName;
            partner.currentRoom = roomName;

            // Catat partner terakhir untuk mencegah langsung nyambung lagi
            socket.lastPartnerId = partner.id;
            partner.lastPartnerId = socket.id;

            io.to(socket.id).emit('matched', {
                room: roomName,
                initiator: true,
                partnerAlias: partner.alias
            });

            io.to(partner.id).emit('matched', {
                room: roomName,
                initiator: false,
                partnerAlias: socket.alias
            });
        } else {
            waitingQueue.push(socket);
        }
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

    // Universal message handler (mendukung berbagai jenis format dari frontend)
    const handleIncomingMessage = (data) => {
        const messageText = typeof data === 'string' ? data : (data?.message || data?.text);
        const targetRoom = (typeof data === 'object' && data?.room) ? data.room : socket.currentRoom;

        console.log("Pesan masuk:", { messageText, targetRoom });

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
        if (sock.currentRoom) {
            sock.to(sock.currentRoom).emit('partner_left');
            sock.leave(sock.currentRoom);
            sock.currentRoom = null;
        }
        // MUTLAK: Bersihkan dari antrean agar tidak nyangkut/diculik saat di beranda
        waitingQueue = waitingQueue.filter(u => u.id !== sock.id);
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
