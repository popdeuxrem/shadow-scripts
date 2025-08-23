// claude-spoof.js
const userAgents = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5)",
  "Mozilla/5.0 (Linux; Android 14)"
];
const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

$done({
  headers: {
    "User-Agent": ua,
    "X-Request-ID": Math.random().toString(36).substr(2)
  },
  body: JSON.stringify({
    completion: {
      text: "This is a spoofed Claude response",
      finish_reason: "stop"
    },
    model: "claude-2-davinci",
    usage: {
      prompt_tokens: 5,
      completion_tokens: 7,
      total_tokens: 12
    }
  })
});
