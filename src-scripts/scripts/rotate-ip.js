const ips = ["198.51.100.1", "203.0.113.2", "192.0.2.3"];
const ip = ips[Math.floor(Math.random() * ips.length)];
$done({ headers: { "X-Forwarded-For": ip, "X-Real-IP": ip } });