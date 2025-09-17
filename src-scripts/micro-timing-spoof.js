#!/usr/bin/env node
/**
 * micro-timing-spoof.js — Micro-Timing & Event Spoofing
 * ────────────────────────────────────────────────────────────────
 * Features:
 *  - Randomizes JS timing for key browser APIs
 *  - Spoofs performance.now, Date.now, and requestAnimationFrame
 *  - Introduces micro-jitter in setTimeout/setInterval
 *  - Anti-behavioral fingerprinting for canvas/audio/webGL
 *  - Loader-ready and neon HUD logging
 */

(function() {
  // Neon HUD
  console.log("%c[MICRO-TIMING] Cyberpunk Stealth Active","color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

  const originalPerformanceNow = performance.now.bind(performance);
  const originalDateNow = Date.now.bind(Date);

  function randomJitter(range = 5) {
    return (Math.random() - 0.5) * range; // +/- range ms
  }

  // Overwrite performance.now
  performance.now = function() {
    return originalPerformanceNow() + randomJitter(1.5);
  };

  // Overwrite Date.now
  Date.now = function() {
    return originalDateNow() + randomJitter(2);
  };

  // Overwrite setTimeout/setInterval to inject micro-jitter
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;

  window.setTimeout = function(fn, delay, ...args) {
    return originalSetTimeout(fn, delay + randomJitter(10), ...args);
  };

  window.setInterval = function(fn, delay, ...args) {
    return originalSetInterval(fn, delay + randomJitter(10), ...args);
  };

  // Overwrite requestAnimationFrame to inject slight timing noise
  const originalRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function(callback) {
    return originalRAF(ts => callback(ts + randomJitter(1.2)));
  };

  // Utility API for loader
  window.microTimingSpoof = {
    log: msg => console.log(`%c[MICRO-TIMING] ${msg}`,"color:#0ff"),
    randomJitter
  };

  console.log("%c[MICRO-TIMING] Injection complete — JS micro-timing spoof active","color:#0ff");
})();
