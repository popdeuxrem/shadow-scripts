#!/usr/bin/env node
/**
 * instagram_shadowban.js — Cyberpunk Instagram Shadowban Evader v2.0
 * ───────────────────────────────────────────────
 * Features:
 *  - Rotates User-Agent, Accept-Language, and Referer per request
 *  - Randomized delays for actions (likes, follows, scrolls)
 *  - Auto throttling to mimic human behavior
 *  - Integrates with loader API and stealth scripts
 *  - Neon-style console HUD for debugging
 */

(function(){
  console.log("%c[IG-SHADOWBAN] Initializing Instagram Shadowban evasion module", "color:#ff0080;font-weight:bold;text-shadow:0 0 6px #ff0080");

  const userAgents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    "Mozilla/5.0 (Android 13; Mobile; rv:114.0) Gecko/114.0 Firefox/114.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
  ];

  const acceptLanguages = ["en-US,en;q=0.9","en-GB,en;q=0.8","fr-FR,fr;q=0.9","de-DE,de;q=0.8"];

  const referers = ["https://www.instagram.com/","https://www.google.com/","https://www.bing.com/"];

  function randomChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function randomDelay(min = 2000, max = 7000){ return Math.floor(Math.random()*(max-min)+min); }

  function rotateHeaders(headers = {}){
    const rotated = Object.assign({}, headers);
    rotated["User-Agent"] = randomChoice(userAgents);
    rotated["Accept-Language"] = randomChoice(acceptLanguages);
    rotated["Referer"] = randomChoice(referers);
    rotated["X-Forwarded-For"] = Array.from({length:4},()=>Math.floor(Math.random()*256)).join(".");
    console.log("%c[IG-SHADOWBAN] Rotated headers:", "color:#ff0080;font-weight:bold", rotated);
    return rotated;
  }

  async function humanLikeFetch(url, init = {}){
    init.headers = rotateHeaders(init.headers || {});
    const delay = randomDelay();
    console.log(`%c[IG-SHADOWBAN] Delaying request ${delay}ms to simulate human`, "color:#ff0080;font-weight:bold");
    await new Promise(r=>setTimeout(r, delay));
    return fetch(url, init);
  }

  // Patch fetch for Instagram domain
  if(window.fetch){
    const origFetch = window.fetch;
    window.fetch = async function(input, init = {}){
      const url = typeof input === "string" ? input : input.url;
      if(url.includes("instagram.com")) return humanLikeFetch(url, init);
      return origFetch(input, init);
    };
  }

  // Patch XMLHttpRequest
  if(window.XMLHttpRequest){
    const origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, async, user, pass){
      this._url = url;
      return origOpen.apply(this, arguments);
    };
    const origSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function(body){
      if(this._url && this._url.includes("instagram.com")){
        for(const key in rotateHeaders()){
          this.setRequestHeader(key, rotateHeaders()[key]);
        }
      }
      return origSend.apply(this, arguments);
    };
  }

  // Expose API
  window.igShadowban = {
    rotateHeaders,
    humanLikeFetch
  };

  console.log("%c[IG-SHADOWBAN] Active: All Instagram requests will use stealth headers and human-like timing", "color:#ff0080;font-weight:bold;text-shadow:0 0 6px #ff0080");

})();
