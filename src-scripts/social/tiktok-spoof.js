(function () {
  const log = msg => console.log(`[🔥 TikTok Spoof] ${msg}`);
  log("Injected");

  // 1. Force region
  Object.defineProperty(navigator, "language", {
    get: () => "en-US"
  });
  Object.defineProperty(navigator, "languages", {
    get: () => ["en-US", "en"]
  });

  // 2. Fake user agent fingerprint
  Object.defineProperty(navigator, "userAgent", {
    get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
  });

  // 3. Remove TikTok Web Logs / Monitoring
  const blockPatterns = [
    /\/v1\/log\/batch/,
    /\/monitor\/log/,
    /\/api\/monitor/,
    /\/v1\/report/,
    /\/report\/log/
  ];

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    if (typeof args[0] === "string" && blockPatterns.some(rx => rx.test(args[0]))) {
      log("Blocked: " + args[0]);
      return new Response(null, { status: 204 });
    }
    return originalFetch(...args);
  };

  // 4. Hide automation indicators
  delete navigator.__proto__.webdriver;
  Object.defineProperty(navigator, "webdriver", { get: () => false });

  // 5. Override window object clues
  Object.defineProperty(window, "chrome", { get: () => ({ runtime: {} }) });

  // 6. Remove suspicious properties
  const clean = () => {
    delete navigator.permissions;
    delete navigator.plugins;
    delete navigator.mimeTypes;
    delete navigator.connection;
    delete navigator.deviceMemory;
  };
  clean();

  // 7. Session spoof values
  const spoof = {
    session_id: "tt-session-1",
    user_id: "spoofed-user",
    token: "spoofed-token"
  };
  localStorage.setItem("tt_token", JSON.stringify(spoof));
  log("Token/session spoofed");
})();
