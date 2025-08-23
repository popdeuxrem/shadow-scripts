#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const configsDir = path.resolve(__dirname, "../apps/loader/public/configs");
const outHtml = path.join(configsDir, "../catalog.html");
const files = fs.readdirSync(configsDir).filter(f => !f.startsWith("."));

let html = `<html><head><title>Config Catalog</title></head><body><h1>Configs</h1><ul>`;
for (const f of files) {
  html += `<li><a href="configs/${f}">${f}</a></li>`;
}
html += `</ul></body></html>`;
fs.writeFileSync(outHtml, html);
console.log("Wrote catalog.html");
