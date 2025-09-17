#!/usr/bin/env node
/**
 * cookie-fuzzer.js — Dynamic Cookie Manipulation & Fuzzing
 * ────────────────────────────────────────────────────────────────
 * Features:
 *  - Randomizes, rotates, and injects cookies per domain/session
 *  - Supports localStorage & sessionStorage token sync
 *  - Conditional expiration and Secure/SameSite flags
 *  - Integrates with stealth loaders and fingerprint evasion
 *  - Cyberpunk neon console logging
 */

(function() {
  const neonLog = msg => console.log(`%c[COOKIE-FUZZER] ${msg}`, "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

  neonLog("Initializing cookie fuzzer...");

  const sessionId = Math.random().toString(36).substr(2, 12);

  function randomToken(len = 24) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  function setCookie(name, value, opts={}) {
    const cookieName = `${sessionId}-${name}`;
    let cookieStr = `${cookieName}=${value}`;
    if(opts.path) cookieStr += `; path=${opts.path}`;
    else cookieStr += `; path=/`;
    if(opts.secure) cookieStr += `; Secure`;
    if(opts.sameSite) cookieStr += `; SameSite=${opts.sameSite}`;
    if(opts.expires) cookieStr += `; Expires=${opts.expires.toUTCString()}`;
    document.cookie = cookieStr;
  }

  function getCookie(name) {
    const cookieName = `${sessionId}-${name}`;
    const match = document.cookie.match(new RegExp(`(^|; )${cookieName}=([^;]+)`));
    return match ? match[2] : null;
  }

  function deleteCookie(name) {
    const cookieName = `${sessionId}-${name}`;
    document.cookie = `${cookieName}=; Max-Age=0; path=/`;
  }

  function fuzzCookies(count = 5) {
    neonLog(`Fuzzing ${count} cookies...`);
    for(let i=0;i<count;i++) {
      const name = `ck${i}-${sessionId}`;
      const value = randomToken(16 + Math.floor(Math.random()*16));
      const opts = {
        secure: Math.random() > 0.3,
        sameSite: ["Lax","Strict","None"][Math.floor(Math.random()*3)]
      };
      setCookie(name, value, opts);
    }
  }

  // Sync tokens to localStorage & sessionStorage for stealth loaders
  function syncStorage(keys = []) {
    keys.forEach(k => {
      const val = getCookie(k) || randomToken();
      localStorage.setItem(`${sessionId}-${k}`, val);
      sessionStorage.setItem(`${sessionId}-${k}`, val);
    });
    neonLog(`Synced cookies to storage: ${keys.join(", ")}`);
  }

  // Auto fuzz interval
  setInterval(() => {
    fuzzCookies(3 + Math.floor(Math.random()*3));
  }, 5000 + Math.random()*5000);

  window.cookieFuzzer = {
    sessionId,
    setCookie,
    getCookie,
    deleteCookie,
    fuzzCookies,
    syncStorage
  };

  neonLog("Cookie fuzzer active — dynamic cookies, storage sync, auto-fuzz enabled.");
})();
