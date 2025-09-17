#!/usr/bin/env node
/**
 * canvas-audio-webgl-noise.js — Advanced Fingerprint Noise Injection
 * ────────────────────────────────────────────────────────────────
 * Features:
 *  - Injects subtle noise into Canvas and WebGL rendering
 *  - Spoofs audio fingerprinting (AudioContext, oscillators)
 *  - Works per-session and per-proxy
 *  - Loader-ready for dynamic injection
 *  - Neon HUD logging for debugging
 */

(function() {
  // Neon HUD
  console.log("%c[FINGERPRINT-NOISE] Cyberpunk Stealth Active","color:#ff0099;font-weight:bold;text-shadow:0 0 6px #ff0099");

  // Canvas & WebGL noise
  function injectCanvasNoise() {
    try {
      const proto = HTMLCanvasElement.prototype;
      const origGetContext = proto.getContext;
      proto.getContext = function(type, ...args) {
        const ctx = origGetContext.call(this, type, ...args);
        if(type === "2d" || type === "webgl" || type === "webgl2") {
          const origGetImageData = ctx.getImageData;
          ctx.getImageData = function(x, y, w, h) {
            const data = origGetImageData.call(this, x, y, w, h);
            for(let i=0; i<data.data.length; i+=4) data.data[i] ^= Math.floor(Math.random()*2);
            return data;
          };
        }
        return ctx;
      };
      console.log("%c[FINGERPRINT-NOISE] Canvas/WebGL noise injected","color:#ff0099");
    } catch(e) {
      console.warn("[FINGERPRINT-NOISE] Canvas/WebGL injection failed", e);
    }
  }

  // Audio fingerprint noise
  function injectAudioNoise() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const origCreateOscillator = AudioCtx.prototype.createOscillator;
      AudioCtx.prototype.createOscillator = function(...args) {
        const osc = origCreateOscillator.apply(this, args);
        const origStart = osc.start.bind(osc);
        osc.start = function(...sArgs) {
          const detuneNoise = Math.random()*5-2.5; // +/-2.5 cents random
          osc.detune.value += detuneNoise;
          origStart(...sArgs);
        };
        return osc;
      };
      console.log("%c[FINGERPRINT-NOISE] Audio fingerprint noise injected","color:#ff0099");
    } catch(e) {
      console.warn("[FINGERPRINT-NOISE] Audio injection failed", e);
    }
  }

  window.fpNoise = {
    injectCanvasNoise,
    injectAudioNoise,
    log: msg => console.log(`%c[FINGERPRINT-NOISE] ${msg}`,"color:#ff0099")
  };

  // Auto-apply
  injectCanvasNoise();
  injectAudioNoise();
})();
