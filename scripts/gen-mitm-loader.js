// scripts/gen-mitm-loader.js
const fs = require("fs");
const path = require("path");

const OUTPUT = path.resolve(__dirname, "../apps/loader/public/scripts/mitm-loader.js");

// Minimal query string parser for mobile JS engines
function parseQuery(url) {
  const out = {};
  const q = url.indexOf("?") !== -1 ? url.split("?")[1] : "";
  if (q) {
    q.split("&").forEach(kv => {
      const [k, v] = kv.split("=");
      out[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
    });
  }
  return out;
}

const loader = `/*
 * MITM Payload Loader (Mobile/Shadowrocket-safe)
 * Generated: ${(new Date()).toISOString()}
 * Auto-injects base64 payload(s) by ?inject=foo.js,bar.js or #inject=all
 */

let log = (msg) => { try { console.log("[LOADER] " + msg); } catch {} };
let injected = [];

function parseQuery(url) {
  let out = {};
  let q = url.indexOf("?") !== -1 ? url.split("?")[1] : "";
  if (q) {
    q.split("&").forEach(kv => {
      let [k, v] = kv.split("=");
      out[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
    });
  }
  return out;
}

function getInjectList(url, hash) {
  let q = parseQuery(url || "");
  let inject = q.inject || "";
  if (!inject && hash && hash.startsWith("#inject="))
    inject = decodeURIComponent(hash.slice(8));
  if (!inject) return [];
  return inject.trim().toLowerCase() === "all"
    ? ["__ALL__"]
    : inject.split(",").map(x => x.trim()).filter(Boolean);
}

async function injectPayload(name, base) {
  // Only .js payloads
  if (!/^[\\w.-]+\\.js$/.test(name)) { log("Rejected unsafe name " + name); return; }
  const url = base + name + ".b64";
  try {
    log("Fetching " + url);
    const r = await fetch(url, {cache: "no-cache"});
    if (!r.ok) { log("HTTP " + r.status); return; }
    const txt = (await r.text()).trim();
    if (!txt) { log("Empty payload: " + name); return; }
    const s = document.createElement("script");
    s.textContent = atob(txt);
    document.documentElement.appendChild(s);
    log("Injected " + name);
    injected.push(name);
  } catch(e) { log("Fetch failed: " + e); }
}

(async function () {
  try {
    // Shadowrocket/Loon/Quantumult X-safe: use string logic for URLs
    const href = typeof location !== "undefined" ? location.href : (typeof $request !== "undefined" ? $request.url : "");
    const hash = typeof location !== "undefined" ? location.hash : "";
    const base = href.replace(/\\/[^/]*$/, "/obfuscated/");
    const manifestURL = base.replace(/\\/obfuscated\\/$/, "/manifest.json");
    log("Manifest: " + manifestURL);
    const r = await fetch(manifestURL, {cache: "no-cache"});
    const arr = r.ok ? await r.json() : [];
    const files = arr.filter(f => f.endsWith(".js.b64")).map(f => f.replace(/\\.js\\.b64$/, ".js"));
    log("Payloads: " + files.length);
    // Parse targets
    const list = getInjectList(href, hash);
    let targets = [];
    if (list.length && list[0] === "__ALL__") {
      targets = files;
      log("Auto-inject: all (" + files.length + ")");
    } else if (list.length) {
      targets = files.filter(f => list.includes(f));
      log("Auto-inject: " + targets.join(","));
    }
    for (const n of targets) await injectPayload(n, base);
  } catch(e) { log("Loader error: " + e); }
})();
`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, loader);
console.log("✅ mitm-loader.js generated");
