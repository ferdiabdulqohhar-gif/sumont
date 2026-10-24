const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Bersihkan total semua route /api/turn dan express.static sebelumnya
code = code.replace(/app\.get\s*\(\s*['"]\/api\/turn['"][\s\S]*?\}\);\s*/g, '');
code = code.replace(/app\.use\s*\(\s*express\.static\s*\([^)]+\)\s*\);\s*/g, '');

// Rapikan jarak baris kosong yang berlebihan
code = code.replace(/\n\s*\n\s*\n/g, '\n\n');

// Sisipkan route yang bersih dan presisi tepat di bawah inisialisasi socket.io
const target = 'const io = new Server(server);';
const insertion = `

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

if (code.includes(target)) {
    code = code.replace(target, target + insertion);
} else {
    code = insertion + '\n' + code;
}

fs.writeFileSync('server.js', code, 'utf8');
console.log('Server.js berhasil dibersihkan dan ditata ulang!');
