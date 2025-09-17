#!/usr/bin/env node
/**
 * rotate-cookies.js — Cyberpunk Cookie Rotator v2.0
 * ───────────────────────────────────────────────
 * Features:
 *  - Rotates session cookies per domain or per request
 *  - Randomized expiration & path
 *  - Integrates with payload loader
 *  - Logs neon-style HUD info in console
 *  - Optional deterministic rotation for testing
 */

(function(){
  console.log("%c[COOKIE-ROTATOR] Initializing cyberpunk cookie rotation", "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

  window.__COOKIE_STORE = window.__COOKIE_STORE || {};

  function generateRandomString(length = 16){
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(b => b.toString(16).padStart(2,'0'))
      .join('');
  }

  function rotateCookie(domain, name){
    const value = generateRandomString(24);
    const expires = new Date(Date.now() + 24*60*60*1000).toUTCString();
    const path = "/";
    document.cookie = `${name}=${value};domain=${domain};path=${path};expires=${expires};Secure;SameSite=Lax`;
    window.__COOKIE_STORE[`${domain}:${name}`] = { value, expires, path };
    console.log(`%c[COOKIE-ROTATOR] ${domain} -> ${name}=${value.slice(0,8)}...`, "color:#0ff;font-weight:bold");
    return value;
  }

  function rotateAll(domainMap){
    const results = {};
    Object.entries(domainMap).forEach(([domain, names]) => {
      results[domain] = {};
      names.forEach(name => results[domain][name] = rotateCookie(domain, name));
    });
    return results;
  }

  // Expose API for loader integration
  window.rotateCookie = rotateCookie;
  window.rotateAllCookies = rotateAll;

  console.log("%c[COOKIE-ROTATOR] Ready: call rotateCookie(domain, name) or rotateAllCookies({domain:[names]})", "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");
})();
