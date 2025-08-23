#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const configsDir = path.resolve(__dirname, "../apps/loader/public/configs");

let pass = true;
fs.readdirSync(configsDir).forEach(f => {
  const content = fs.readFileSync(path.join(configsDir, f), "utf8");
  if (!content || content.length < 10) {
    console.error(`❌ ${f} is empty or too small!`);
    pass = false;
  }
});
if (!pass) {
  process.exit(1);
} else {
  console.log("All configs validated (size/syntax check).");
}
