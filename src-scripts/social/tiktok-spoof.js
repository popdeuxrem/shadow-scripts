// tiktok-spoof.js
// Spoofs mobile headers and app environment
$done({
  headers: {
    ...$request.headers,
    'User-Agent': 'com.zhiliaoapp.musically/330020 (iPhone; iOS 17.4; Scale/3.00)',
    'X-Tt-Env': 'prod',
    'X-Requested-With': 'com.zhiliaoapp.musically'
  }
});
