"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/gen-configs.ts
var fs = require("fs");
var path = require("path");
var OUTDIR = "apps/loader/public/obfuscated";
var LOADER = "apps/loader/public/index.html";
var MANIFEST = "apps/loader/public/manifest.json";
var CATALOG = "apps/loader/public/catalog.html";
var INDEX_TEMPLATE = "scripts/index-template.html";
var CATALOG_TEMPLATE = "scripts/catalog-template.html";
// Utility: Recursively find all .js.b64 files in OUTDIR
function listB64Files(dir) {
    if (!fs.existsSync(dir))
        return [];
    var files = [];
    var _loop_1 = function (entry) {
        var full = path.join(dir, entry);
        var rel = path.relative(OUTDIR, full);
        if (fs.statSync(full).isDirectory()) {
            files = files.concat(listB64Files(full).map(function (f) { return path.join(entry, f); }));
        }
        else if (entry.endsWith(".js.b64")) {
            files.push(rel);
        }
    };
    for (var _i = 0, _a = fs.readdirSync(dir); _i < _a.length; _i++) {
        var entry = _a[_i];
        _loop_1(entry);
    }
    // Sort for deterministic builds
    return files.sort();
}
// Generate index.html loader
function generateIndexHtml(files) {
    var template = fs.readFileSync(INDEX_TEMPLATE, "utf8");
    var json = JSON.stringify(files, null, 2);
    var output = template.replace("__SPOOF_TARGETS__", json);
    fs.writeFileSync(LOADER, output, "utf8");
    console.log("Generated: ".concat(LOADER));
}
// Generate manifest.json
function generateManifest(files) {
    fs.writeFileSync(MANIFEST, JSON.stringify(files, null, 2), "utf8");
    console.log("Generated: ".concat(MANIFEST));
}
// Generate catalog.html
function generateCatalog(files) {
    var template = fs.readFileSync(CATALOG_TEMPLATE, "utf8");
    var listHtml = files
        .map(function (file) { return "<li><span class=\"url\">".concat(file, "</span></li>"); })
        .join("");
    var output = template.replace("__CATALOG_LIST__", listHtml);
    fs.writeFileSync(CATALOG, output, "utf8");
    console.log("Generated: ".concat(CATALOG));
}
// Main entry
function main() {
    // Ensure OUTDIR exists
    if (!fs.existsSync(OUTDIR))
        fs.mkdirSync(OUTDIR, { recursive: true });
    var files = listB64Files(OUTDIR);
    generateIndexHtml(files);
    generateManifest(files);
    generateCatalog(files);
}
main();
