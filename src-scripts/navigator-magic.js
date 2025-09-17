#!/usr/bin/env node
/**
 * navigator-magic.js — Dynamic Navigator Spoofing
 * ──────────────────────────────────────────────────────────────
 * Features:
 *  - Rotates navigator.userAgent, platform, language, deviceMemory, hardwareConcurrency
 *  - Dynamic per-session spoofing
 *  - Integrates with loader for stealth mode
 *  - Cyberpunk neon console logging
 *  - Mitigates fingerprinting and bot detection
 */

(function() {
  const neonLog = (msg) => console.log(`%c[NAVIGATOR-MAGIC] ${msg}`, "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

  neonLog("Cyberpunk navigator spoof active");

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/17A557 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
  ];

  const platforms = ["Win32", "MacIntel", "iPhone", "Linux armv8l"];
  const languages = ["en-US", "en-GB", "fr-FR", "de-DE", "ja-JP"];
  const deviceMemoryOptions = [4, 8, 16];
  const hardwareConcurrencyOptions = [2, 4, 8, 16];

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Override navigator properties
  const navProto = Object.getPrototypeOf(navigator);

  Object.defineProperty(navProto, "userAgent", { get: () => pickRandom(userAgents) });
  Object.defineProperty(navProto, "platform", { get: () => pickRandom(platforms) });
  Object.defineProperty(navProto, "language", { get: () => pickRandom(languages) });
  Object.defineProperty(navProto, "languages", { get: () => [pickRandom(languages), "en-US"] });
  Object.defineProperty(navProto, "deviceMemory", { get: () => pickRandom(deviceMemoryOptions) });
  Object.defineProperty(navProto, "hardwareConcurrency", { get: () => pickRandom(hardwareConcurrencyOptions) });

  // Optional rotation API
  window.navigatorMagic = {
    rotate: () => {
      neonLog("Rotating navigator properties dynamically");
      // Trigger re-define to rotate
      Object.defineProperty(navProto, "userAgent", { get: () => pickRandom(userAgents) });
      Object.defineProperty(navProto, "platform", { get: () => pickRandom(platforms) });
      Object.defineProperty(navProto, "language", { get: () => pickRandom(languages) });
      Object.defineProperty(navProto, "languages", { get: () => [pickRandom(languages), "en-US"] });
      Object.defineProperty(navProto, "deviceMemory", { get: () => pickRandom(deviceMemoryOptions) });
      Object.defineProperty(navProto, "hardwareConcurrency", { get: () => pickRandom(hardwareConcurrencyOptions) });
    }
  };

  neonLog("Navigator spoof complete");
})();
