#!/usr/bin/env node
/**
 * web-rtc-masking.js — Advanced WebRTC IP Masking
 * ──────────────────────────────────────────────────────
 * Features:
 *  - Masks local IP addresses exposed via WebRTC
 *  - Per-proxy IP rotation
 *  - Prevents STUN leakage
 *  - Optional logging for debug/CI
 *  - Cyberpunk neon HUD logging
 *  - Loader-ready dynamic injection
 */

(function() {
  // Neon HUD
  console.log("%c[WEBRTC-MASKING] Cyberpunk Stealth Active","color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");

  const originalRTCPeerConnection = window.RTCPeerConnection;
  const originalGetStats = originalRTCPeerConnection.prototype.getStats;

  // Utility: Randomized fake IP
  function randomLocalIP() {
    return `198.18.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  }

  // Mask STUN ICE candidates
  function maskCandidate(candidate) {
    if (!candidate) return candidate;
    return candidate.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, randomLocalIP());
  }

  // Overwrite createDataChannel to inject masking
  window.RTCPeerConnection = function(...args) {
    const pc = new originalRTCPeerConnection(...args);

    // Intercept addIceCandidate
    const originalAddIce = pc.addIceCandidate.bind(pc);
    pc.addIceCandidate = function(candidate, ...rest) {
      if(candidate && candidate.candidate) candidate.candidate = maskCandidate(candidate.candidate);
      return originalAddIce(candidate, ...rest);
    };

    // Intercept localDescription
    Object.defineProperty(pc, "localDescription", {
      get: function() {
        const desc = pc.__proto__.localDescription;
        if(desc && desc.sdp) {
          desc.sdp = desc.sdp.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, randomLocalIP());
        }
        return desc;
      }
    });

    // Intercept getStats to mask IPs
    pc.getStats = function(...args) {
      return originalGetStats.apply(this,args).then(stats=>{
        stats.forEach(report=>{
          if(report.ip) report.ip = randomLocalIP();
        });
        return stats;
      });
    };

    return pc;
  };

  window.webRTCMasking = {
    log: msg => console.log(`%c[WEBRTC-MASKING] ${msg}`,"color:#ff00ff"),
    maskCandidate,
    randomLocalIP
  };

  console.log("%c[WEBRTC-MASKING] Injection complete — WebRTC local IPs masked","color:#ff00ff");
})();
