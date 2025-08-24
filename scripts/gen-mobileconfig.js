#!/usr/bin/env node
/**
 * Generate shadowrocket.mobileconfig from master-rules.yaml
 * iOS users can install directly to apply routing + MITM.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import plist from 'plist';

const root    = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src     = path.join(root, 'configs', 'master-rules.yaml');
const outDir  = path.join(root, 'apps', 'loader', 'public', 'configs');
const out     = path.join(outDir, 'shadowrocket.mobileconfig');

const yml = yaml.load(fs.readFileSync(src, 'utf8'));

const PROFILE_ID = 'com.popdeuxrem.shadowrocket';
const ORGANIZATION = 'PopDeuxRem Scripts';
const DISPLAY_NAME = 'Shadowrocket Auto Config';
const DESCRIPTION = 'Auto-install proxy config with MITM, DNS, routing rules.';
const UUID = () => crypto.randomUUID();

/**
 * Build the Shadowrocket payload using plist format
 */
const payload = {
  PayloadContent: [{
    PayloadType: 'com.shadowrocket.config',
    PayloadVersion: 1,
    PayloadIdentifier: `${PROFILE_ID}.config`,
    PayloadUUID: UUID(),
    PayloadEnabled: true,
    PayloadDisplayName: DISPLAY_NAME,
    PayloadDescription: DESCRIPTION,

    dns: yml.dns || '1.1.1.1',

    proxies: Object.values(yml.proxies || {}).flat().map(p => {
      const obj = {
        type: p.type,
        name: p.name,
        host: p.host,
        port: p.port,
      };
      if (p.user)        obj.user = p.user;
      if (p.pass)        obj.pass = p.pass;
      if (p.tls)         obj.tls = true;
      if (p.ws)          obj.ws = true;
      if (p.ws_path)     obj['ws-path'] = p.ws_path;
      if (p.servername)  obj.servername = p.servername;
      return obj;
    }),

    'proxy-groups': Object.entries(yml.groups || {}).map(([name, proxies]) => ({
      name,
      type: 'select',
      proxies
    })),

    rules: [
      ...(yml.rules || []).map(r =>
        typeof r === 'string' ? r : `${r.type},${r.value},${r.group}`),
      ...(yml.external_rule_sets || []).map(x =>
        `RULE-SET,${x.url},${x.group}`),
      ...(yml.block_domains || []).map(d =>
        `DOMAIN-SUFFIX,${d},REJECT`),
      'FINAL,US'
    ],

    mitm: {
      enabled: true,
      hostnames: yml.mitm_hostnames || []
    },

    script: yml.scripts?.loader_url
      ? {
          http_response: `^https?:\\/\\/.+`,
          script_path: yml.scripts.loader_url
        }
      : undefined
  }],

  PayloadType: 'Configuration',
  PayloadVersion: 1,
  PayloadIdentifier: PROFILE_ID,
  PayloadUUID: UUID(),
  PayloadDisplayName: DISPLAY_NAME,
  PayloadDescription: DESCRIPTION,
  PayloadOrganization: ORGANIZATION
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, plist.build(payload));
console.log('✅  Generated', out);
