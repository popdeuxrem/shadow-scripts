const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const tokens = [
  {
    type: "bearer",
    token: `Bearer ${crypto.randomBytes(32).toString('hex')}`
  },
  {
    type: "access_token",
    token: `ya29.${crypto.randomBytes(48).toString('base64url')}`
  },
  {
    type: "api_key",
    token: crypto.createHash('sha256').update(Date.now().toString()).digest('hex')
  },
  {
    type: "auth_token",
    token: `auth-${crypto.randomBytes(24).toString('hex')}`
  }
];

const outputPath = path.join(__dirname, '../auth/rotated-tokens.json');
const selected = tokens[Math.floor(Math.random() * tokens.length)];

fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2));
console.log("🔑 Rotated token written to:", outputPath);
