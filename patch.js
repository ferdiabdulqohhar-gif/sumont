const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Bersihkan route /api/turn dan express.static yang lama agar tidak duplikat/berantakan
content = content.replace(/app\.get\s*\(\s*['"]\/api\/turn['"][\s\S]*?\}\);\s*/g, '');
content = content.replace(/app\.use\s*\(\s*express\.static\s*\([^)]+\)\s*\);\s*/g, '');

// Blok TURN & Static yang bersih dan rapi
const turnBlock = `
app.get('/api/turn', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelay',
        credential: 'openrelay'
      }
    ]
  });
});

app.use(express.static('public'));
`;

// Masukkan tepat setelah inisialisasi socket.io
if (content.includes('const io = new Server(server);')) {
    content = content.replace('const io = new Server(server);', 'const io = new Server(server);' + turnBlock);
} else {
    content = turnBlock + '\n' + content;
}

fs.writeFileSync('server.js', content, 'utf8');
console.log('SUCCESS: server.js berhasil ditambal dengan bersih!');
