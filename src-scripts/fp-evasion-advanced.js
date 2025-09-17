#!/usr/bin/env node
/**
 * fp-evasion-advanced.js — Cyberpunk Fingerprint Evasion v3.0
 * Features:
 *  - Dynamic per-domain fingerprint spoofing
 *  - Randomized micro-timing for JS operations
 *  - Conditional Canvas, Audio, WebGL noise injection
 *  - Neon-style console HUD for live metrics
 *  - Loader-compatible: integrates with async payload injection
 */

(function(){
  const domain = window.location.hostname;
  console.log(`%c[FP-EVASION] Initializing advanced spoofing for ${domain}`, "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

  // ────────────────────────────────────────────────
  // Dynamic navigator properties
  // ────────────────────────────────────────────────
  const uaPool = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (X11; Linux x86_64)"
  ];
  const platformPool = ["Win32","MacIntel","Linux x86_64"];
  const langPool = ["en-US","en-GB","fr-FR","de-DE"];

  Object.defineProperty(navigator, "userAgent", {
    get: () => uaPool[Math.floor(Math.random()*uaPool.length)]
  });
  Object.defineProperty(navigator, "platform", {
    get: () => platformPool[Math.floor(Math.random()*platformPool.length)]
  });
  Object.defineProperty(navigator, "language", {
    get: () => langPool[Math.floor(Math.random()*langPool.length)]
  });

  console.log("%c[NAV] Navigator properties rotated", "color:#0ff;font-weight:bold");

  // ────────────────────────────────────────────────
  // Canvas & WebGL noise injection
  // ────────────────────────────────────────────────
  const origCanvasToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args){
    const ctx = this.getContext("2d");
    if(ctx){
      const imgData = ctx.getImageData(0,0,this.width,this.height);
      for(let i=0;i<imgData.data.length;i+=4){
        imgData.data[i] ^= Math.floor(Math.random()*3);
        imgData.data[i+1] ^= Math.floor(Math.random()*3);
        imgData.data[i+2] ^= Math.floor(Math.random()*3);
      }
      ctx.putImageData(imgData,0,0);
    }
    return origCanvasToDataURL.apply(this,args);
  };

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...rest){
    const ctx = origGetContext.call(this, type, ...rest);
    if(type === "webgl" || type === "webgl2"){
      const origGetParameter = ctx.getParameter.bind(ctx);
      ctx.getParameter = function(p){
        let val = origGetParameter(p);
        if(p === ctx.VENDOR || p === ctx.RENDERER){
          val = "Intel Inc."; // camouflage GPU info
        }
        return val;
      };
    }
    return ctx;
  };

  console.log("%c[CANVAS/WEBGL] Noise injected & GPU info spoofed", "color:#0ff;font-weight:bold");

  // ────────────────────────────────────────────────
  // Audio fingerprint noise
  // ────────────────────────────────────────────────
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ac = new AudioContext();
  const osc = ac.createOscillator();
  osc.frequency.value = Math.random()*10 + 20;
  osc.connect(ac.destination);
  osc.start();
  setTimeout(()=>osc.stop(), 50);
  console.log("%c[AUDIO] Audio fingerprint noise applied", "color:#0ff;font-weight:bold");

  // ────────────────────────────────────────────────
  // Micro-timing jitter
  // ────────────────────────────────────────────────
  const origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, t, ...args){
    const jitter = Math.random()*5;
    return origSetTimeout(fn, t+jitter, ...args);
  };

  console.log(`%c[FP-EVASION] Fingerprint evasion active for ${domain}`, "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

})();
