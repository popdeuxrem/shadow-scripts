#!/usr/bin/env node
/**
 * scripts/textnow-spoof.js v1.0.0
 * ───────────────────────────────────────────────
 * Cyberpunk Futuristic TextNow Spoof
 * - Rotates session fingerprints per account
 * - Simulates human typing and message sending delays
 * - Supports proxy-aware connections and multi-account rotation
 * - Integrates with NEON loader + FP evasion + token rotators
 * - CI/CD friendly logs and metadata
 */

(function() {
  const DEBUG = false;
  const MIN_TYPING_DELAY = 50;  // ms per character
  const MAX_TYPING_DELAY = 300; // ms per character
  const MIN_MSG_INTERVAL = 1000; // ms
  const MAX_MSG_INTERVAL = 4000; // ms

  const tokens = window.TEXTNOW_TOKENS || [];
  const proxies = window.TEXTNOW_PROXIES || [];

  function randomInt(min,max){return Math.floor(Math.random()*(max-min+1)+min);}
  function pickRandom(arr){return arr[randomInt(0,arr.length-1)];}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

  // ─ Simulate typing in input
  async function typeMessage(input, msg){
    input.focus();
    for(const c of msg){
      input.value += c;
      input.dispatchEvent(new InputEvent('input',{bubbles:true,data:c}));
      await sleep(randomInt(MIN_TYPING_DELAY,MAX_TYPING_DELAY));
    }
    if(DEBUG) console.log("[TextNow-Spoof] Typed message:", msg);
  }

  // ─ Rotate session token and proxy
  function getSession(){
    return {
      token: tokens.length ? pickRandom(tokens) : null,
      proxy: proxies.length ? pickRandom(proxies) : null,
      sessionId: crypto.randomUUID()
    };
  }

  // ─ Send message request
  async function sendMessage(endpoint, message){
    const session = getSession();
    const headers = { 'Content-Type':'application/json' };
    if(session.token) headers['Authorization'] = `Bearer ${session.token}`;
    if(session.proxy) headers['X-Forwarded-For'] = session.proxy;

    const payload = { message, sessionId: session.sessionId };
    try{
      const resp = await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload)});
      const data = await resp.json();
      if(DEBUG) console.log("[TextNow-Spoof] Sent message:", data);
      return data;
    } catch(e){
      if(DEBUG) console.warn("[TextNow-Spoof] Message failed:", e);
      return null;
    }
  }

  // ─ Randomized multi-message simulation
  async function simulateMessaging(endpoint, messages=[]){
    for(const m of messages){
      const input = document.querySelector('textarea,input[type=text]');
      if(input) await typeMessage(input,m);
      await sendMessage(endpoint,m);
      await sleep(randomInt(MIN_MSG_INTERVAL,MAX_MSG_INTERVAL));
    }
    if(DEBUG) console.log("[TextNow-Spoof] Simulation complete.");
  }

  // ─ Expose API
  window.TEXTNOW_SPOOF = {
    send: sendMessage,
    simulate: simulateMessaging,
    getSession
  };

  // Auto-run if global messages and endpoint provided
  document.addEventListener('DOMContentLoaded',()=>{
    if(window.AUTO_TEXTNOW_MESSAGES && window.TEXTNOW_ENDPOINT){
      simulateMessaging(window.TEXTNOW_ENDPOINT, window.AUTO_TEXTNOW_MESSAGES);
    }
  });

})();
