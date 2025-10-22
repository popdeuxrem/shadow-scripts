# Security Smoke Test

## High-Risk Execution Patterns
- `scripts/gen-mitm-loader.js` reads obfuscated payloads and executes them directly in the browser via `eval(script)`, after fetching from `/obfuscated/<host>.b64`. Although integrity-checked, this dynamic execution warrants strict audit controls and consent-based testing only.【F:scripts/gen-mitm-loader.js†L19-L162】
- `src-scripts/dynamic-script-loader.js` fetches remote scripts at runtime and evaluates them (`eval(code)`), which can expose users to untrusted code if the source is compromised; limit usage to controlled lab environments.【F:src-scripts/dynamic-script-loader.js†L14-L89】

## Child Process & Shell Usage
- Multiple generators rely on `child_process` (`execSync`, `spawnSync`) for Git metadata, QR hooks, and downstream tooling, which should be reviewed when hardening CI sandboxes.【F:scripts/gen-all.js†L17-L126】【F:scripts/gen-mitm-loader.js†L15-L163】【F:scripts/discord-alerts.js†L23-L112】

## Domain Target Sensitivity
- The MITM loader prioritizes payloads for high-profile domains (`paypal.com`, `stripe.com`, `openai.com`, `anthropic.com`, `claude.ai`). Ensure all testing remains lawful, consented, and scoped to approved red-team exercises.【F:scripts/gen-mitm-loader.js†L72-L180】

## Secrets & Credentials
- No hardcoded API keys or private keys detected in `scripts/`, `src-scripts/`, or `configs/`. Continue to rely on environment variables (e.g., `DISCORD_WEBHOOK_URL`) for secret injection.【F:scripts/discord-alerts.js†L34-L101】

## Recommended Follow-Up
- Introduce lint or CI guards that flag new uses of `eval`, `Function`, or shell execution to prevent regressions.
- Document consent and scope requirements for MITM payload usage directly in the repository.
