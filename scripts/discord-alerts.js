#!/usr/bin/env node
/**
 * scripts/discord-alerts.js v2.0.0
 * ───────────────────────────────────────────────
 * Cyberpunk Futuristic Discord Alerts for Shadow-Scripts
 *
 * Features:
 *  - Neon-style logging in terminal
 *  - Success / Warning / Error / Info levels with color codes
 *  - Auto-gathers Git & GitHub metadata (SHA, branch, actor, repo, run URL)
 *  - Structured JSON embed formatting
 *  - CI/CD friendly logs
 *  - Graceful fallback if DISCORD_WEBHOOK_URL missing
 *
 * Usage:
 *   node scripts/discord-alerts.js --status=success --msg="Build deployed"
 *
 * Exit codes:
 *   0 -> OK
 *   2 -> Failed to send alert
 */

import https from "https";
import { spawnSync } from "child_process";

const argv = process.argv.slice(2);
const opts = { status: "info", msg: "No message provided" };

argv.forEach(arg => {
  if (arg.startsWith("--status=")) opts.status = arg.split("=")[1].toLowerCase();
  else if (arg.startsWith("--msg=")) opts.msg = arg.split("=")[1];
});

// webhook
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL || null;

// neon terminal logging
const COLORS = { success: "\x1b[38;5;82m", warning: "\x1b[38;5;226m", error: "\x1b[38;5;196m", info: "\x1b[38;5;51m", reset: "\x1b[0m" };
function logNeon(level, msg) {
  const color = COLORS[level] || COLORS.info;
  console.log(`${color}⚡ [${level.toUpperCase()}]${COLORS.reset} ${msg}`);
}

// git metadata
function getGitMeta() {
  const sha = process.env.GITHUB_SHA || spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();
  return { sha, branch };
}

// build Discord embed payload
function buildPayload() {
  const { sha, branch } = getGitMeta();
  const actor = process.env.GITHUB_ACTOR || "local";
  const repo = process.env.GITHUB_REPOSITORY || "local/repo";
  const runId = process.env.GITHUB_RUN_ID || null;
  const url = runId ? `https://github.com/${repo}/actions/runs/${runId}` : null;

  const COLOR_MAP = { success: 0x2ecc71, warning: 0xf1c40f, error: 0xe74c3c, info: 0x3498db };

  const embed = {
    title: `[${opts.status.toUpperCase()}] ${repo}`,
    description: opts.msg,
    color: COLOR_MAP[opts.status] || COLOR_MAP.info,
    fields: [
      { name: "Branch", value: branch, inline: true },
      { name: "Commit", value: sha.slice(0, 7), inline: true },
      { name: "Actor", value: actor, inline: true }
    ],
    timestamp: new Date().toISOString(),
  };

  if (url) embed.url = url;
  return { embeds: [embed] };
}

// send webhook
async function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    if (!WEBHOOK) {
      logNeon("warning", "DISCORD_WEBHOOK_URL not set. Skipping alert.");
      return resolve();
    }

    const data = JSON.stringify(payload);
    const url = new URL(WEBHOOK);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, res => {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new Error(`Webhook failed: ${res.statusCode} ${res.statusMessage}`));
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// main
async function main() {
  try {
    const payload = buildPayload();
    await sendWebhook(payload);
    logNeon(opts.status, `Discord alert sent successfully`);
    process.exit(0);
  } catch (err) {
    logNeon("error", `Failed to send Discord alert: ${err.message}`);
    process.exit(2);
  }
}

main();
