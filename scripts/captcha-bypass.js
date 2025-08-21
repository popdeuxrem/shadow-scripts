// CAPTCHA Bypass Simulation
$done({ body: JSON.stringify({ success: true, challenge_ts: Date.now(), hostname: "google.com" }) });