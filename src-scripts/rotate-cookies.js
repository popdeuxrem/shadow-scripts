const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cookieSets = [
  {
    sessionid: crypto.randomUUID(),
    csrftoken: crypto.randomBytes(16).toString('hex'),
    device_id: `android-${crypto.randomBytes(8).toString('hex')}`
  },
  {
    sid: `SID-${crypto.randomBytes(12).toString('hex')}`,
    uid: Math.floor(Math.random() * 9000000000 + 1000000000).toString(),
    token: crypto.randomUUID()
  },
  {
    app_session: `app-${crypto.randomBytes(6).toString('hex')}`,
    auth_token: crypto.createHash('sha256').update(Date.now().toString()).digest('hex'),
    visitor_id: crypto.randomBytes(12).toString('base64')
  }
];

const outputPath = path.join(__dirname, '../auth/rotated-cookies.json');
const selected = cookieSets[Math.floor(Math.random() * cookieSets.length)];

fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2));
console.log("🍪 Rotated cookies written to:", outputPath);
