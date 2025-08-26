// instagram_shadowban.js — cloaks automation + fingerprint flags for IG

(() => {
  const log = (msg) => console.log(`[IG Cloak] ${msg}`);

  // Suppress webdriver detection
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: true,
  });

  // Patch user-agent to mimic mobile IG app browser
  Object.defineProperty(navigator, 'userAgent', {
    get: () =>
      'Mozilla/5.0 (Linux; Android 11; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.23.111',
    configurable: true,
  });

  // Set platform
  Object.defineProperty(navigator, 'platform', {
    get: () => 'Linux armv8l',
    configurable: true,
  });

  // Mobile screen dimensions
  Object.defineProperty(window.screen, 'width', { get: () => 412 });
  Object.defineProperty(window.screen, 'height', { get: () => 915 });

  // Force timezone to match locale
  Intl.DateTimeFormat = (() => {
    const Original = Intl.DateTimeFormat;
    return function (...args) {
      const dtf = new Original(...args);
      Object.defineProperty(dtf.resolvedOptions(), 'timeZone', {
        get: () => 'America/New_York',
        configurable: true,
      });
      return dtf;
    };
  })();

  // Fake plugins array
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3],
    configurable: true,
  });

  // Block IG bot detection functions
  const blockEval = Function.prototype.toString;
  Function.prototype.toString = function () {
    if (this.name.includes("toString") || this === blockEval) {
      return blockEval.call(this);
    }
    return "function () { [native code] }";
  };

  // Patch notification permission
  Object.defineProperty(Notification, 'permission', {
    get: () => 'default',
  });

  // Patch navigator.connection
  if (navigator.connection) {
    try {
      Object.defineProperty(navigator.connection, 'effectiveType', {
        get: () => '4g',
        configurable: true,
      });
    } catch {}
  }

  log('Instagram shadowban cloak loaded.');
})();
