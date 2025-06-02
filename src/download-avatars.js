// This script can be run to download avatar images
// Run with: node download-avatars.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const avatars = [
  {
    name: 'player1-avatar.png',
    url: 'https://ui-avatars.com/api/?name=Player+1&background=0D8ABC&color=fff&size=128&rounded=true&bold=true'
  },
  {
    name: 'player2-avatar.png',
    url: 'https://ui-avatars.com/api/?name=Player+2&background=2A2A2A&color=fff&size=128&rounded=true&bold=true'
  },
  {
    name: 'bot-avatar.png',
    url: 'https://ui-avatars.com/api/?name=Bot&background=8C0303&color=fff&size=128&rounded=true&bold=true'
  }
];

const assetsDir = path.join(__dirname, 'assets');

// Create assets directory if it doesn't exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Download each avatar
avatars.forEach(avatar => {
  const filePath = path.join(assetsDir, avatar.name);
  const file = fs.createWriteStream(filePath);
  
  https.get(avatar.url, response => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log(`Downloaded ${avatar.name}`);
    });
  }).on('error', err => {
    fs.unlink(filePath, () => {}); // Delete file on error
    console.error(`Error downloading ${avatar.name}: ${err.message}`);
  });
});

console.log('Downloading avatars...'); 