const socket = io();
let localStream;
let peerConnection;
let isMuted = false;
let roomID;

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 1. Mulai Cari Teman Bicara
async function startSearch() {
    const lang = document.getElementById('language-select').value;
    document.getElementById('status').innerText = "Status: Mencari teman ngobrol...";
    
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            alert("Izin mikrofon ditolak atau tidak ditemukan!");
            return;
        }
    }
    
    socket.emit('join_queue', { language: lang });
}

// 2. Event saat berhasil menemukan pasangan
socket.on('matched', async (data) => {
    roomID = data.room;
    document.getElementById('status').innerText = "Status: Terhubung dengan teman baru!";
    document.getElementById('setup-panel').style.display = "none";
    document.getElementById('chat-controls').style.display = "block";

    createPeerConnection();

    // Jika terpilih sebagai initiator, buat WebRTC Offer
    if (data.initiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', { room: roomID, offer: offer });
        } catch (err) {
            console.error("Gagal membuat offer:", err);
        }
    }
});

// 3. WebRTC Signaling: Menerima Offer
socket.on('offer', async (data) => {
    if (!peerConnection) createPeerConnection();
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { room: roomID, answer: answer });
    } catch (err) {
        console.error("Gagal memproses offer:", err);
    }
});

// 4. WebRTC Signaling: Menerima Answer
socket.on('answer', async (data) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (err) {
        console.error("Gagal memproses answer:", err);
    }
});

// 5. WebRTC Signaling: Menerima ICE Candidate
socket.on('ice-candidate', async (data) => {
    try {
        if (peerConnection && data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) {
        console.error("Gagal menambah ICE candidate:", err);
    }
});

// Membuat koneksi WebRTC baru
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // Masukkan suara lokal ke koneksi
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Tangkap suara lawan bicara
    peerConnection.ontrack = (event) => {
        const remoteAudio = document.getElementById('remote-audio');
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(e => console.log('Autoplay diblokir browser, butuh interaksi:', e));
    };

    // Kirim ICE candidate ke server
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { room: roomID, candidate: event.candidate });
        }
    };
}

// 6. Fitur Mute / Unmute Mikrofon
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isMuted = !isMuted;
            audioTrack.enabled = !isMuted;
            
            const muteBtn = document.getElementById('mute-btn');
            muteBtn.innerText = isMuted ? "🎙️ Unmute Mic" : "🎙️ Mute Mic";
            muteBtn.classList.toggle('active', isMuted);
        }
    }
}

// 7. Fitur Skip / Next Pasangan
function nextPartner() {
    document.getElementById('status').innerText = "Status: Memutuskan & mencari baru...";
    closePeerConnection();
    socket.emit('leave_room', { room: roomID });
    startSearch();
}

// 8. Fitur Reboot / Refresh Koneksi Suara
function rebootConnection() {
    document.getElementById('status').innerText = "Status: Mereset koneksi suara...";
    if (peerConnection) {
        peerConnection.restartIce();
    }
}

// 9. Fitur Blokir & Laporkan Pengguna
function reportAndBlock() {
    if (confirm("Apakah kamu yakin ingin memblokir dan melaporkan orang ini?")) {
        socket.emit('report_peer');
        alert("Pengguna telah dilaporkan dan diblokir.");
        nextPartner();
    }
}

// Menutup koneksi Peer
function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    document.getElementById('chat-controls').style.display = "none";
    document.getElementById('setup-panel').style.display = "block";
}

// Jika partner keluar duluan
socket.on('partner_left', () => {
    document.getElementById('status').innerText = "Status: Teman bicara keluar. Mencari lagi...";
    closePeerConnection();
    startSearch();
});
