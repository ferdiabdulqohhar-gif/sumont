const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingUser = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    io.emit('online_users', io.engine.clientsCount);

    socket.on('join_queue', (data) => {
        socket.language = data.language;
        socket.alias = data.alias || "Anonymous";

        if (waitingUser && waitingUser.id !== socket.id) {
            const roomName = `room_${socket.id}_${waitingUser.id}`;
            
            socket.join(roomName);
            waitingUser.join(roomName);

            socket.partnerId = waitingUser.id;
            waitingUser.partnerId = socket.id;

            io.to(socket.id).emit('matched', {
                room: roomName,
                initiator: true,
                partnerAlias: waitingUser.alias
            });

            io.to(waitingUser.id).emit('matched', {
                room: roomName,
                initiator: false,
                partnerAlias: socket.alias
            });

            waitingUser = null;
        } else {
            waitingUser = socket;
        }
    });

    socket.on('offer', (data) => {
        socket.to(data.room).emit('offer', { offer: data.offer });
    });

    socket.on('answer', (data) => {
        socket.to(data.room).emit('answer', { answer: data.answer });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.room).emit('ice-candidate', { candidate: data.candidate });
    });

    socket.on('leave_room', () => {
        handleLeave(socket);
    });

    socket.on('disconnect', () => {
        if (waitingUser === socket) {
            waitingUser = null;
        }
        handleLeave(socket);
        io.emit('online_users', io.engine.clientsCount);
        console.log('User disconnected:', socket.id);
    });
});

function handleLeave(socket) {
    if (socket.partnerId) {
        io.to(socket.partnerId).emit('partner_left');
        const partner = io.sockets.sockets.get(socket.partnerId);
        if (partner) {
            partner.partnerId = null;
        }
        socket.partnerId = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
