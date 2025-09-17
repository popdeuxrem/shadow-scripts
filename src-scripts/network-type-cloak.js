#!/usr/bin/env node
/**
 * network-type-cloak.js — Network Type & Connection Cloaking
 * ────────────────────────────────────────────────────────────────
 * Features:
 *  - Overrides navigator.connection properties (effectiveType, downlink, rtt)
 *  - Spoofs network type per session (WiFi, 4G, 3G, 2G)
 *  - Adds jitter/randomization for dynamic fingerprint evasion
 *  - Hooks into online/offline events
 *  - Cyberpunk neon HUD console logging
 */

(function() {
  const neonLog = msg => console.log(`%c[NETWORK-TYPE-CLOAK] ${msg}`, "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

  neonLog("Initializing network type cloak...");

  const networkProfiles = [
    { type: "wifi", effectiveType: "4g", downlink: 50, rtt: 20 },
    { type: "cellular", effectiveType: "3g", downlink: 2, rtt: 100 },
    { type: "cellular", effectiveType: "2g", downlink: 0.3, rtt: 300 },
    { type: "ethernet", effectiveType: "4g", downlink: 100, rtt: 10 }
  ];

  const profile = networkProfiles[Math.floor(Math.random() * networkProfiles.length)];
  neonLog(`Emulating network: ${profile.type} (effectiveType: ${profile.effectiveType})`);

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    Object.defineProperty(connection, "effectiveType", { get: () => profile.effectiveType, configurable: true });
    Object.defineProperty(connection, "downlink", { get: () => profile.downlink, configurable: true });
    Object.defineProperty(connection, "rtt", { get: () => profile.rtt, configurable: true });
    Object.defineProperty(connection, "type", { get: () => profile.type, configurable: true });
  }

  window.addEventListener("online", () => neonLog("Network status: online"));
  window.addEventListener("offline", () => neonLog("Network status: offline"));

  // Optional dynamic jitter
  setInterval(() => {
    if (connection) {
      const jitter = (Math.random() - 0.5) * 5;
      Object.defineProperty(connection, "rtt", { get: () => profile.rtt + jitter, configurable: true });
      Object.defineProperty(connection, "downlink", { get: () => profile.downlink + jitter, configurable: true });
    }
  }, 5000);

  neonLog("Network type cloaking active — navigator.connection spoofed dynamically.");
})();
