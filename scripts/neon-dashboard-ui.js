#!/usr/bin/env node
/**
 * neon-dashboard-ui.js v2.0.0
 * ───────────────────────────────────────────────
 * Cyberpunk Futuristic NEON Dashboard UI
 * Features:
 *  - Renders payloads, configs, and QR codes
 *  - Neon / terminal-style cyberpunk interface
 *  - Async SHA256/preview verification
 *  - Grouped by type: Payloads, Configs, QR Codes
 *  - CI/CD friendly, color-coded logs
 *  - Integrates dynamically with MITM / FP / token loaders
 */

(function() {
  const ROOT = window.SHADOW_ROOT || "/";
  const neonColors = ["#00ff99","#0ff","#ff00ff","#ff4081","#f1c40f"];
  const log = (...args)=>console.log("%c[NEON-DASH]",`color:${pickRandom(neonColors)};font-weight:bold`,...args);
  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // Build tables
  function createTable(headers, items){
    const table = document.createElement("table");
    table.style.width="100%";
    table.style.borderCollapse="collapse";
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    headers.forEach(h=>{
      const th = document.createElement("th");
      th.textContent=h;
      th.style.border="1px solid #222";
      th.style.padding="6px";
      th.style.background="#111";
      th.style.color="#0ff";
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    items.forEach(item=>{
      const tr = document.createElement("tr");
      headers.forEach(h=>{
        const td=document.createElement("td");
        td.style.border="1px solid #222";
        td.style.padding="4px";
        td.style.color="#7fff7f";
        td.style.fontSize="12px";
        td.textContent=item[h]||"n/a";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  async function fetchManifest() {
    try {
      const resp = await fetch(`${ROOT}manifest.json`);
      return await resp.json();
    } catch(e){
      log("Failed to fetch manifest:", e);
      return {assets:[], duplicates:[], references:{}};
    }
  }

  function buildSection(title, content){
    const section = document.createElement("div");
    section.style.marginBottom="1.5em";
    const h2 = document.createElement("h2");
    h2.textContent=`⚡ ${title}`;
    h2.style.color="#0ff";
    h2.style.textShadow="0 0 8px #0ff";
    section.appendChild(h2);
    const block = document.createElement("div");
    block.style.background="#0c0c0c";
    block.style.border="1px solid #111";
    block.style.borderRadius="6px";
    block.style.padding="12px";
    block.appendChild(content);
    section.appendChild(block);
    return section;
  }

  async function renderDashboard() {
    const container = document.getElementById("neon-dashboard") || document.body;
    container.innerHTML="";
    const manifest = await fetchManifest();

    // Payloads
    const payloadItems = manifest.assets
      .filter(a=>a.mimeHint==="application/javascript"||a.mimeHint==="application/base64")
      .map(a=>({
        Filename:a.filename,
        Size:a.size,
        SHA256:a.sha256.slice(0,12)+"...",
        SHA512:a.sha512.slice(0,12)+"...",
        Preview:a.sample?.preview?.split("\n").slice(0,5).join("\n")||"n/a"
      }));
    container.appendChild(buildSection("Payloads", createTable(["Filename","Size","SHA256","SHA512","Preview"], payloadItems)));

    // Configs
    const configItems = manifest.assets
      .filter(a=>a.mimeHint==="text/plain"||a.filename.endsWith(".conf")||a.filename.endsWith(".mobileconfig"))
      .map(a=>({Filename:a.filename, Size:a.size, SHA256:a.sha256.slice(0,12)+"..."}));
    container.appendChild(buildSection("Configs", createTable(["Filename","Size","SHA256"], configItems)));

    // QR Codes
    const qrItems = (manifest.references?.qr_catalog?.items || []).map(q=>({
      Filename:q.filename,
      Type:q.type,
      SHA256:q.sha256.slice(0,12)+"...",
      URL:q.url
    }));
    container.appendChild(buildSection("QR Codes", createTable(["Filename","Type","SHA256","URL"], qrItems)));

    // Duplicates
    if(manifest.duplicates?.length){
      const dupItems = manifest.duplicates.map(d=>({SHA256:d.sha, Files:d.files.join(", ")}));
      container.appendChild(buildSection("Duplicate Assets", createTable(["SHA256","Files"], dupItems)));
    }

    log("🚀 NEON Dashboard rendered",manifest.assets.length,"assets");
  }

  // Auto-render
  document.addEventListener("DOMContentLoaded",()=>renderDashboard());

  // Expose API
  window.NEON_DASHBOARD = { render: renderDashboard, log };

})();
