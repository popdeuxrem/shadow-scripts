// paypal-spoof.js — hosted on GitHub raw
// Spoof User-Agent and add phantom headers for PayPal bots
$done({
  headers: {
    ...$request.headers,
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/17E5249a',
    'X-Client-Version': 'iOS 7.0.1',
    'X-App-Platform': 'iOS'
  }
});
