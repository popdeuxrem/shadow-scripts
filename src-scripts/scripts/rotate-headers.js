const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const headers = [
  {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "com.textnow.mobile",
    "TLS-Fingerprint": "chrome/114.0.5735.198"
  },
  {
    "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-G996U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.198 Mobile Safari/537.36",
    "Accept-Language": "en-US,en;q=0.8",
    "X-App-Token": crypto.randomUUID(),
    "TLS-Fingerprint": "chrome/114.0.5735.198"
  },
  {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "DNT": "1",
    "TLS-Fingerprint": "chrome/115.0.5790.171",
    "Upgrade-Insecure-Requests": "1"
  },
  {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "Accept-Language": "en-US;q=0.9,en;q=0.8",
    "TLS-Fingerprint": "chrome/116.0.5845.96",
    "Sec-Fetch-Mode": "navigate"
  }
];

const outputPath = path.join(__dirname, '../auth/rotated-headers.json');
const selected = headers[Math.floor(Math.random() * headers.length)];

fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2));
console.log("✅ Rotated headers written to:", outputPath);
