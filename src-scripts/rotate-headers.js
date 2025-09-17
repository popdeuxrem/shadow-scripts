#!/usr/bin/env node
/**
 * rotate-headers.js — Cyberpunk Header Rotator v2.0
 * Features:
 *  - Rotates HTTP headers per request/session
 *  - Randomizes User-Agent, Accept-Language, Referer, X-Forwarded-For
 *  - Works with fetch, XMLHttpRequest, and loader payloads
 *  - Neon console HUD for debugging/visibility
 */

(function(){
  console.log("%c[HEADER-ROTATOR] Initializing cyberpunk header rotation", "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/107.0"
  ];

  const acceptLanguages = ["en-US,en;q=0.9","en-GB,en;q=0.8","fr-FR,fr;q=0.9","de-DE,de;q=0.8"];

  const referers = ["https://www.google.com/","https://www.bing.com/","https://www.duckduckgo.com/"];

  function randomChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // Generate a random X-Forwarded-For IPv4 address
  function randomIP(){
    return Array.from({length:4},()=>Math.floor(Math.random()*256)).join(".");
  }

  function rotateHeaders(headers = {}){
    const rotated = Object.assign({}, headers);
    rotated["User-Agent"] = randomChoice(userAgents);
    rotated["Accept-Language"] = randomChoice(acceptLanguages);
    rotated["Referer"] = randomChoice(referers);
    rotated["X-Forwarded-For"] = randomIP();
    rotated["X-Client-UID"] = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2,14);
    console.log("%c[HEADER-ROTATOR] Rotated headers:", "color:#0ff;font-weight:bold", rotated);
    return rotated;
  }

  // Patch fetch
  if(window.fetch){
    const origFetch = window.fetch;
    window.fetch = async function(input, init = {}){
      init.headers = rotateHeaders(init.headers || {});
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
      for(const key in rotateHeaders()){
        this.setRequestHeader(key, rotateHeaders()[key]);
      }
      return origSend.apply(this, arguments);
    };
  }

  console.log("%c[HEADER-ROTATOR] Active: All fetch/XHR requests will use rotated headers", "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

  // Expose API for loader/payload scripts
  window.rotateHeaders = rotateHeaders;

})();
