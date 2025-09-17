#!/usr/bin/env node
/**
 * old-device-emulator.js — Legacy Device & OS Emulator
 * ────────────────────────────────────────────────────────────────
 * Features:
 *  - Spoofs navigator properties for old devices (iOS, Android, Windows)
 *  - Emulates screen resolution, devicePixelRatio, and touch capabilities
 *  - Overrides hardware concurrency and memory for legacy targets
 *  - Integrates with fingerprint evasion & stealth loaders
 *  - Cyberpunk neon console logging
 */

(function() {
  const neonLog = msg => console.log(`%c[OLD-DEVICE-EMULATOR] ${msg}`, "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

  neonLog("Initializing old device emulator...");

  // Define legacy device profiles
  const legacyDevices = [
    {
      name: "iPhone 6",
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) Mobile/14E5239e",
      deviceMemory: 1,
      hardwareConcurrency: 2,
      screen: { width: 750, height: 1334, dpr: 2 },
      touch: true
    },
    {
      name: "Samsung Galaxy S5",
      platform: "Linux armv7l",
      userAgent: "Mozilla/5.0 (Linux; Android 6.0; SM-G900P Build/MRA58K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Mobile Safari/537.36",
      deviceMemory: 2,
      hardwareConcurrency: 2,
      screen: { width: 1080, height: 1920, dpr: 3 },
      touch: true
    },
    {
      name: "Windows 7 Desktop",
      platform: "Win32",
      userAgent: "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36",
      deviceMemory: 4,
      hardwareConcurrency: 2,
      screen: { width: 1366, height: 768, dpr: 1 },
      touch: false
    }
  ];

  // Pick a random legacy device
  const device = legacyDevices[Math.floor(Math.random() * legacyDevices.length)];
  neonLog(`Emulating device profile: ${device.name}`);

  // Override navigator properties
  Object.defineProperty(navigator, "userAgent", { get: () => device.userAgent, configurable: true });
  Object.defineProperty(navigator, "platform", { get: () => device.platform, configurable: true });
  Object.defineProperty(navigator, "deviceMemory", { get: () => device.deviceMemory, configurable: true });
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => device.hardwareConcurrency, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { get: () => (device.touch ? 5 : 0), configurable: true });

  // Override screen properties
  Object.defineProperty(window.screen, "width", { get: () => device.screen.width, configurable: true });
  Object.defineProperty(window.screen, "height", { get: () => device.screen.height, configurable: true });
  Object.defineProperty(window.screen, "devicePixelRatio", { get: () => device.screen.dpr, configurable: true });

  neonLog("Legacy device emulation active — navigator and screen spoofed.");
})();
