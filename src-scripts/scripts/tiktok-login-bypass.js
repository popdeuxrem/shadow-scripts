
// Bypass TikTok login checkpoint
if ($request.url.includes("checkpoint") || $request.url.includes("login")) {
  $done({body: JSON.stringify({ login_status: "success", token: "FAKE_TOKEN" })});
} else {
  $done({});
}
