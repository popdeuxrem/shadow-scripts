#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const CONFIG_DIR = "apps/loader/public/configs";
const QR_DIR = "apps/loader/public/qrcodes";

fs.mkdirSync(QR_DIR, { recursive: true });

const targets = [
  { file: "shadowrocket.conf", label: "Shadowrocket" },
  { file: "stash.yaml", label: "Stash" },
  { file: "loon.conf", label: "Loon" },
  { file: "tunna.conf", label: "Tunna" },
  { file: "shadow_config.mobileconfig", label: "MobileConfig" },
];

const BASE_URL = "https://popdeuxrem.github.io/shadow-scripts/configs/";

(async () => {
  for (const { file, label } of targets) {
    const url = `${BASE_URL}${file}`;
    const output = path.join(QR_DIR, `${file}.png`);

    await QRCode.toFile(output, url, {
      errorCorrectionLevel: "H",
      type: "png",
      margin: 1,
      scale: 6,
    });

    console.log(`✅ QR for ${label}: ${url} → ${output}`);
  }
})();
