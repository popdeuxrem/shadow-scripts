#!/usr/bin/env node
/**
 * fp-evasion.js — Basic fingerprint evasion v2.0
 * Features:
 *  - Simple navigator spoofing
 *  - Minimal canvas/WebGL noise
 *  - Neon console HUD
 */

(function(){
  console.log("%c[FP-EVASION] Initializing basic fingerprint evasion", "color:#0ff;font-weight:bold");

  // Simple navigator spoofing
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const lang = "en-US";
  Object.defineProperty(navigator, "userAgent", { get: () => ua });
  Object.defineProperty(navigator, "language", { get: () => lang });

  // Minimal canvas noise
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args){
    const ctx = this.getContext("2d");
    if(ctx){
      const img = ctx.getImageData(0,0,this.width,this.height);
      for(let i=0;i<img.data.length;i+=4) img.data[i] ^= 1;
      ctx.putImageData(img,0,0);
    }
    return origToDataURL.apply(this,args);
  };

  console.log("%c[FP-EVASION] Basic evasion active", "color:#0ff;font-weight:bold");
})();
