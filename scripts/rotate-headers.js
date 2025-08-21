const userAgents = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
  "Mozilla/5.0 (Linux; Android 10; SM-G973F)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
];
const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
$done({ headers: { "User-Agent": randomUA } });