#!/usr/bin/env node
/**
 * cyberpunk-master-rules-auto.js — Full Automation Pipeline
 * ---------------------------------------------------------
 * - Fetches remote RULE-SET lists
 * - Validates integrity via SHA256
 * - Detects overlaps
 * - Updates master-rules.yaml
 * - Maintains changelog
 *
 * Author: PopdeuxRem
 * License: MIT
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// ============================
// Config
// ============================
const RULES_DIR = path.resolve('configs/rules');
const MASTER_RULES_PATH = path.resolve('configs/master-rules.yaml');
const CHANGELOG_PATH = path.resolve('configs/master-rules-changelog.json');

const CDN_SOURCES = [
    'https://popdeuxrem.github.io/shadow-scripts/configs/rules/'
];

const START_MARKER = '## 📦 Remote RULE-SET Sources';
const END_MARKER = '## 🌍 Default Fallback Routing';
const VALID_PREFIXES = [
    'DOMAIN-SUFFIX',
    'DOMAIN-KEYWORD',
    'DOMAIN',
    'IP-CIDR',
    'IP6-CIDR',
    'USER-AGENT',
    'GEOIP',
];

// ============================
// Helpers
// ============================
function hash(str, algo = 'sha256') {
    return crypto.createHash(algo).update(str).digest('hex');
}

function fetchRemoteFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) return reject(new Error(`Failed: ${url}`));
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function syncRemoteRules() {
    if (!fs.existsSync(RULES_DIR)) fs.mkdirSync(RULES_DIR, { recursive: true });

    for (const baseUrl of CDN_SOURCES) {
        const listName = path.basename(baseUrl) || 'remote.list';
        const localPath = path.join(RULES_DIR, listName);
        try {
            const content = await fetchRemoteFile(baseUrl);
            const sha = hash(content);
            const prevSha = fs.existsSync(localPath) ? hash(fs.readFileSync(localPath, 'utf8')) : null;

            if (prevSha !== sha) {
                fs.writeFileSync(localPath, content, 'utf8');
                console.log(`🔄 Updated ${listName} (SHA256: ${sha})`);
            } else {
                console.log(`✅ ${listName} unchanged`);
            }
        } catch (err) {
            console.error(`❌ Failed fetching ${baseUrl}: ${err.message}`);
        }
    }
}

function collectRuleSetLines() {
    const seenFiles = new Set();
    const domainMap = new Map();
    const rules = [];

    const files = fs.readdirSync(RULES_DIR)
        .filter(f => f.endsWith('.list') && !f.startsWith('.'))
        .sort();

    for (const file of files) {
        if (seenFiles.has(file)) continue;
        seenFiles.add(file);

        const lines = fs.readFileSync(path.join(RULES_DIR, file), 'utf8')
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'));

        for (const line of lines) {
            for (const prefix of VALID_PREFIXES) {
                if (line.startsWith(prefix)) {
                    const domain = line.split(',', 2)[1]?.trim();
                    if (!domain) continue;
                    if (!domainMap.has(domain)) domainMap.set(domain, []);
                    domainMap.get(domain).push(file);
                    break;
                }
            }
        }

        rules.push(`  - RULE-SET,${CDN_SOURCES[0]}${file},US`);
    }

    const overlaps = Array.from(domainMap.entries()).filter(([_, fs]) => fs.length > 1);
    if (overlaps.length) {
        console.error('❌ Domain overlaps detected:');
        overlaps.forEach(([domain, fs]) => console.error(`  ${domain} → ${fs.join(', ')}`));
        process.exit(1);
    }

    return rules;
}

function injectRuleSets(yaml, ruleLines) {
    const startIdx = yaml.indexOf(START_MARKER);
    const endIdx = yaml.indexOf(END_MARKER);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error('Markers not found or invalid.');
    }
    return `${yaml.slice(0, startIdx + START_MARKER.length)}\n${ruleLines.join('\n')}\n\n${yaml.slice(endIdx)}`;
}

function extractExistingRuleSets(yaml) {
    const lines = yaml.split(/\r?\n/);
    const existing = [];
    let active = false;
    for (const line of lines) {
        if (line.includes(START_MARKER)) active = true;
        else if (line.includes(END_MARKER)) break;
        else if (active && line.includes('RULE-SET,')) existing.push(line.trim());
    }
    return new Set(existing);
}

function updateChangelog(added, removed) {
    const log = {
        timestamp: new Date().toISOString(),
        added,
        removed
    };
    const history = fs.existsSync(CHANGELOG_PATH) ? JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8')) : [];
    history.push(log);
    fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(history, null, 4), 'utf8');
    console.log(`📖 Changelog updated (${added.length} added, ${removed.length} removed)`);
}

// ============================
// Main Pipeline
// ============================
async function main() {
    console.log('🚀 Starting Cyberpunk Master Rules Automation...');

    // Step 1: Sync remote rules
    await syncRemoteRules();

    // Step 2: Load master YAML
    const masterYaml = fs.readFileSync(MASTER_RULES_PATH, 'utf8');

    // Step 3: Collect new RULE-SET lines
    const newRules = collectRuleSetLines();
    const newRulesSet = new Set(newRules.map(r => r.trim()));
    const currentRulesSet = extractExistingRuleSets(masterYaml);

    const added = [...newRulesSet].filter(r => !currentRulesSet.has(r));
    const removed = [...currentRulesSet].filter(r => !newRulesSet.has(r));

    if (!added.length && !removed.length) {
        console.log('✅ No changes detected. Skipping write.');
        return;
    }

    // Step 4: Inject updated RULE-SETs
    const updatedYaml = injectRuleSets(masterYaml, newRules);
    if (hash(updatedYaml) !== hash(masterYaml)) {
        fs.writeFileSync(MASTER_RULES_PATH, updatedYaml, 'utf8');
        console.log(`✅ master-rules.yaml updated (${newRules.length} RULE-SETs)`);
    }

    // Step 5: Update changelog
    updateChangelog(added, removed);

    console.log('🎯 Cyberpunk Master Rules Pipeline complete.');
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});