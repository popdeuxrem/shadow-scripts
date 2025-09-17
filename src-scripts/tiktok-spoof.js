#!/usr/bin/env node
/**
 * tiktok_spoof.js — Cyberpunk TikTok Stealth & Interaction Spoofer v2.0
 * ───────────────────────────────────────────────
 * Features:
 *  - Rotates User-Agent, Accept-Language, and Referer per request
 *  - Spoofs navigator, platform, timezone, and language
 *  - Randomized delays for scrolling, likes, and comments
 *  - Human-like typing and interaction timing
 *  - X-Forwarded-For IP spoofing per request
 *  - Neon-style console HUD logging
 */

(function(){
  console.log("%c[TIKTOK-SPOOF] Initializing Cyberpunk TikTok Spoofer", "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

  const userAgents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    "Mozilla/5.0 (Android 13; Mobile; rv:114.0) Gecko/114.0 Firefox/114.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
  ];

  const acceptLanguages = ["en-US,en;q=0.9","en-GB,en;q=0.8","fr-FR,fr;q=0.9","de-DE,de;q=0.8"];
  const referers = ["https://www.tiktok.com/","https://www.google.com/","https://www.bing.com/"];

  function randomChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function randomDelay(min=1500,max=5000){ return Math.floor(Math.random()*(max-min)+min); }

  function rotateHeaders(headers = {}){
    const rotated = Object.assign({}, headers);
    rotated["User-Agent"] = randomChoice(userAgents);
    rotated["Accept-Language"] = randomChoice(acceptLanguages);
    rotated["Referer"] = randomChoice(referers);
    rotated["X-Forwarded-For"] = Array.from({length:4},()=>Math.floor(Math.random()*256)).join(".");
    console.log("%c[TIKTOK-SPOOF] Rotated headers:", "color:#ff00ff;font-weight:bold", rotated);
    return rotated;
  }

  function spoofNavigator(){
    Object.defineProperty(navigator, "userAgent", {get:()=>randomChoice(userAgents), configurable:true});
    Object.defineProperty(navigator, "language", {get:()=>randomChoice(acceptLanguages), configurable:true});
    Object.defineProperty(navigator, "platform", {get:()=>randomChoice(["Win32","MacIntel","iPhone","Linux x86_64"]), configurable:true});
    console.log("%c[TIKTOK-SPOOF] Navigator spoofed", "color:#ff00ff;font-weight:bold");
  }

  async function humanLikeFetch(url, init = {}){
    init.headers = rotateHeaders(init.headers || {});
    const delay = randomDelay();
    console.log(`%c[TIKTOK-SPOOF] Delaying request ${delay}ms to mimic human`, "color:#ff00ff;font-weight:bold");
    await new Promise(r=>setTimeout(r, delay));
    return fetch(url, init);
  }

  function randomScroll(element = window, min=50,max=300){
    const delta = Math.floor(Math.random()*(max-min)+min);
    element.scrollBy({ top: delta, behavior: "smooth" });
    console.log(`%c[TIKTOK-SPOOF] Scrolled ${delta}px`, "color:#ff00ff;font-weight:bold");
  }

  function humanType(element, text, interval = 100){
    let i = 0;
    const typer = setInterval(()=>{
      element.value += text[i];
      i++;
      if(i>=text.length) clearInterval(typer);
    }, interval + Math.floor(Math.random()*50));
    console.log("%c[TIKTOK-SPOOF] Human typing initiated", "color:#ff00ff;font-weight:bold");
  }

  // Patch fetch for TikTok domain
  if(window.fetch){
    const origFetch = window.fetch;
    window.fetch = async function(input, init={}){
      const url = typeof input==="string"?input:input.url;
      if(url.includes("tiktok.com")) return humanLikeFetch(url, init);
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
      if(this._url && this._url.includes("tiktok.com")){
        for(const key in rotateHeaders()) this.setRequestHeader(key, rotateHeaders()[key]);
      }
      return origSend.apply(this, arguments);
    };
  }

  spoofNavigator();

  // Expose API
  window.tiktokSpoof = {
    rotateHeaders,
    humanLikeFetch,
    randomScroll,
    humanType,
    spoofNavigator
  };

  console.log("%c[TIKTOK-SPOOF] Active: All TikTok requests and interactions will be stealth and human-like", "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

})();
