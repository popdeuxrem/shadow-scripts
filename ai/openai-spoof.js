// openai-spoof.js
// Emulates legit browser and prevents fingerprinting
$done({
  headers: {
    ...$request.headers,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.133 Safari/537.36',
    'X-Client-Data': 'CIe2yQEIpLbJAQjBtskBCPqcygEIqZ3KAQiSnMoB'
  }
});
