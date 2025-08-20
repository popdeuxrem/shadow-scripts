// wallets-spoof.js
// TrustWallet / MetaMask / Coinbase stealth headers
$done({
  headers: {
    ...$request.headers,
    'User-Agent': 'Trust/6.21.0 (iOS; 17.4; iPhone)',
    'X-App-Version': '6.21.0',
    'X-App-Platform': 'iOS',
    'X-Wallet': 'TrustWallet'
  }
});
