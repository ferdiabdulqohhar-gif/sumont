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
    console.log('User connected:', socket.id);

    socket.on('join_queue', (data) => {
        socket.language = data.language || 'english';
        socket.alias = data.alias || 'Anonymous';
        
        console.log(`User ${socket.id} (${socket.alias}) joined queue for ${socket.language}`);

        const matchIndex = waitingQueue.findIndex(user => user.language === socket.language && user.id !== socket.id);

        if (matchIndex !== -1) {
            const partner = waitingQueue.splice(matchIndex, 1)[0];
            const roomName = `room_${socket.id}_${partner.id}`;

            socket.join(roomName);
            partner.join(roomName);

            socket.currentRoom = roomName;
            partner.currentRoom = roomName;

            console.log(`Matched! Room: ${roomName}`);

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
        socket.to(data.room).emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.to(data.room).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.room).emit('ice-candidate', data);
    });

    socket.on('send_message', (data) => {
        console.log("LOG CHAT: Pesan masuk dari client:", data);
        if (data && data.room && data.message) {
            socket.to(data.room).emit('receive_message', {
                message: data.message,
                senderAlias: socket.alias || 'Anonymous'
            });
            console.log("LOG CHAT: Pesan sukses diteruskan ke room:", data.room);
        } else {
            console.log("LOG CHAT: Pesan ditolak! Room atau message kosong.", data);
        }
    });

    socket.on('leave_room', () => {
        leaveCurrentRoom(socket);
    });

    socket.on('disconnect', () => {
        onlineUsers = Math.max(0, onlineUsers - 1);
        io.emit('online_users', onlineUsers);
        console.log('User disconnected:', socket.id);

        waitingQueue = waitingQueue.filter(user => user.id !== socket.id);
        leaveCurrentRoom(socket);
    });

    function leaveCurrentRoom(sock) {
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
