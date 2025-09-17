#!/usr/bin/env node
/**
 * navigator-rotator.js — Dynamic navigator rotation
 * Features:
 *  - Rotates userAgent, platform, language per session
 *  - Neon HUD logging
 */

(function(){
  console.log("%c[NAV-ROTATOR] Initializing navigator rotation", "color:#0ff;font-weight:bold");

  const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (X11; Linux x86_64)"
  ];
  const platforms = ["Win32","MacIntel","Linux x86_64"];
  const langs = ["en-US","en-GB","fr-FR"];

  Object.defineProperty(navigator, "userAgent", { get: () => uas[Math.floor(Math.random()*uas.length)] });
  Object.defineProperty(navigator, "platform", { get: () => platforms[Math.floor(Math.random()*platforms.length)] });
  Object.defineProperty(navigator, "language", { get: () => langs[Math.floor(Math.random()*langs.length)] });

  console.log("%c[NAV-ROTATOR] Navigator properties rotated", "color:#0ff;font-weight:bold");
})();
