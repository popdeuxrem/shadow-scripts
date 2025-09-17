#!/usr/bin/env node
/**
 * dynamic-script-loader.js — Cyberpunk-Futuristic Script Loader
 * ────────────────────────────────────────────────────────────────
 * Features:
 *  - Async loading of scripts from CDN, GitHub, or local
 *  - SHA256 integrity verification
 *  - Prioritization of critical payloads
 *  - Concurrent preload with micro-delay randomization
 *  - Neon cyberpunk console logging
 *  - Hooks for stealth/fingerprint modules
 */

(function(){
  const neonLog = msg => console.log(`%c[DYNAMIC-LOADER] ${msg}`, "color:#ff00ff;font-weight:bold;text-shadow:0 0 6px #ff00ff");
  neonLog("Initializing cyberpunk dynamic loader...");

  const loadedScripts = {};

  // Compute SHA256 of string content
  async function sha256(str){
    const buffer = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  // Load single script with integrity check
  async function loadScript(url, expectedHash=null, critical=false){
    if(loadedScripts[url]){
      neonLog(`Skipping already loaded script: ${url}`);
      return;
    }
    try {
      const resp = await fetch(url);
      const code = await resp.text();
      if(expectedHash){
        const digest = await sha256(code);
        if(digest !== expectedHash){
          neonLog(`⚠️ SHA256 mismatch for ${url}: expected ${expectedHash}, got ${digest}`);
          if(critical) throw new Error("Critical script hash mismatch");
          return;
        }
      }
      eval(code);
      loadedScripts[url] = true;
      neonLog(`Loaded script: ${url} ${critical?'(CRITICAL)':''}`);
    } catch(e){
      console.error(`[ERROR] Failed to load ${url}:`, e);
      if(critical) throw e;
    }
  }

  // Preload multiple scripts with optional critical prioritization
  async function preloadScripts(scripts=[]){
    neonLog(`Preloading ${scripts.length} scripts...`);

    // Separate critical and normal
    const criticalScripts = scripts.filter(s=>s.critical);
    const normalScripts = scripts.filter(s=>!s.critical);

    // Load critical sequentially
    for(const s of criticalScripts){
      await loadScript(s.url, s.hash, true);
      await new Promise(r=>setTimeout(r, Math.random()*50+20)); // micro delay
    }

    // Load normal concurrently
    await Promise.all(normalScripts.map(async s=>{
      await loadScript(s.url, s.hash, false);
      await new Promise(r=>setTimeout(r, Math.random()*30));
    }));

    neonLog("All scripts preloaded.");
  }

  // List loaded scripts
  function listLoaded(){
    return Object.keys(loadedScripts);
  }

  // Expose API globally
  window.DynamicScriptLoader = {
    load: loadScript,
    preload: preloadScripts,
    listLoaded,
  };

  neonLog("Dynamic Script Loader ready. Use `DynamicScriptLoader.preload([...])` or `DynamicScriptLoader.load(url)`.");
})();
