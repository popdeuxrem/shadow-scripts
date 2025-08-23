
// Simulate successful Face ID scan
if ($request.url.includes("biometric")) {
  $done({body: JSON.stringify({ success: true, auth_token: "FAKE_BIOMETRIC_TOKEN" })});
} else {
  $done({});
}
