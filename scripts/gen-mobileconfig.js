#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const yaml = require("js-yaml");

const CONFIG_PATH = "configs/master-rules.yaml";
const OUTPUT_PATH = "apps/loader/public/configs/shadow_config.mobileconfig";

const BASE_LOADER = "https://popdeuxrem.github.io/shadow-scripts/index.html";
const PREFER_GROUP = process.env.PREFER_GROUP || "US";

// ➤ Generate UUID
const uuid = () => crypto.randomUUID?.() || require("uuid").v4();

// ➤ Load YAML config
const doc = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8"));

const payloadUUID = uuid();
const contentUUID = uuid();

// ➤ Build PayloadContent
const content = {
  PayloadContent: [
    {
      PayloadUUID: payloadUUID,
      PayloadType: "com.shadowrocket.configuration",
      PayloadVersion: 1,
      PayloadIdentifier: `com.popdeuxrem.shadowrocket.${PREFER_GROUP.toLowerCase()}`,
      PayloadDisplayName: `Shadow Config - ${PREFER_GROUP}`,
      PayloadDescription: `Auto-loaded MITM config from ${BASE_LOADER}`,
      ProxyGroup: PREFER_GROUP,
      RuleList: [
        `RULE-SET,${BASE_LOADER}/configs/ruleset.txt,${PREFER_GROUP}`,
        `URL-REGEX,.*mitm-loader.js,REJECT`,
        `FINAL,${PREFER_GROUP}`,
      ],
      MITM: {
        enabled: true,
        domains: doc?.mitm?.hostnames || [],
      },
      Script: {
        enabled: true,
        url: `${BASE_LOADER}/scripts/mitm-loader.js`,
      },
    },
  ],
  PayloadDisplayName: `PopdeuxRem AutoLoader`,
  PayloadIdentifier: "com.popdeuxrem.shadow-config",
  PayloadUUID: contentUUID,
  PayloadVersion: 1,
  PayloadType: "Configuration",
  PayloadDescription: "Auto-install MITM loader + rules",
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, plist(content));

console.log(`✅ MobileConfig generated: ${OUTPUT_PATH}`);

// ➤ Convert JS object to .mobileconfig PLIST XML
function plist(obj) {
  const serialize = (val) => {
    if (Array.isArray(val)) {
      return `<array>${val.map(serialize).join("")}</array>`;
    }
    if (typeof val === "object" && val !== null) {
      return `<dict>${Object.entries(val)
        .map(([k, v]) => `<key>${k}</key>${serialize(v)}`)
        .join("")}</dict>`;
    }
    if (typeof val === "string") return `<string>${val}</string>`;
    if (typeof val === "number") return `<integer>${val}</integer>`;
    if (typeof val === "boolean")
      return `<${val ? "true" : "false"}/>`;
    return "";
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${serialize(obj)}
</plist>`;
}
