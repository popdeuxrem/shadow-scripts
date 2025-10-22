# Repository Structure Overview

## Directory Map
| Path | Key Contents | Notes |
| --- | --- | --- |
| `/scripts` | Bash launcher (`build-all.sh`), unified pipeline (`gen-all.js`), per-client config generators (`gen-*.js`), validation and dashboard tooling | All CLI entry points use Node ESM except `gen-mitm-loader.js` and validation scripts that still use CommonJS wrappers.
| `/src-scripts` | Browser payload sources (fingerprint spoofers, loaders, automation helpers) | Inputs to `obfuscate-all.js`; published payloads land under `apps/loader/public/obfuscated`.
| `/configs` | `master-rules.yaml` baseline and `rules/` fragments | Consumed by Shadowrocket/Loon/Stash/Tunna/Egern generators.
| `/apps/loader` | Static loader app shell and workspace-local package.json | Final artifacts emitted into `apps/loader/public` by `gen-all.js`.
| `/node_modules` | Installed dependencies for root workspace | Mirrors declared ranges in root `package.json`.

## Primary Scripts & Entry Points
- `scripts/build-all.sh` — Bash front controller that parses CLI flags, checks toolchain prerequisites, and launches `gen-all.js` with resolved `--outdir`/`--profile` arguments.
- `scripts/gen-all.js` — Orchestrates the seven-step build (obfuscation, per-client configs, manifest/dashboard/index/catalog, QR codes, validation, reporting, summary).
- Config generators:
  - `gen-shadowrocket.js`, `gen-loon.js`, `gen-stash.js`, `gen-tunna.js`, `gen-egern.js` — Emit platform-specific YAML/CONF payloads respecting shared `--outdir` overrides and CI flags.
  - `gen-mobileconfig.js` — Bundles multiple `.mobileconfig` profiles into the shared configs directory.
- Supporting utilities:
  - `obfuscate-all.js` obfuscates payloads under `src-scripts/` into `apps/loader/public/obfuscated`.
  - `gen-manifest.js`, `gen-dashboard.js`, `gen-index-loader.js`, `gen-catalog.js`, `gen-qrcodes.js` produce dashboards, manifests, and QR collateral.
  - Validators (`validate-configs.js`, `validate-gitignore.js`, `validate-master-rules.js`, `validate-package.js`, `validate-workflows.js`) enforce baseline hygiene.
  - Ancillary helpers (`cred-rotator.js`, `discord-alerts.js`, `gen-mitm-loader.js`, etc.) support operational workflows outside the primary pipeline.

## CLI Script Mapping
| npm Script | Entry Point | Purpose |
| --- | --- | --- |
| `build`, `build:debug`, `build:production` | `scripts/build-all.sh` | Run the full pipeline with environment-controlled profile/flags.
| `generate:*` (shadowrocket, loon, stash, mobileconfig, tunna, manifest, dashboard, catalog, qrcodes) | `scripts/gen-*.js` | Invoke individual generators for targeted outputs or CI jobs.
| `obfuscate:*` | `scripts/obfuscate-all.js` | Produce obfuscated payload bundles with selectable profiles.
| `validate:*` | `scripts/validate-*.js` | Perform config, workflow, and gitignore validations.
| `serve`, `serve:dev` | Python HTTP server | Serve generated loader artifacts for manual inspection.

## Documentation Gaps
- No generator-specific README or usage reference exists under `/scripts` or alongside the config generators; only the top-level `README.md` covers the toolkit at a high level.
- `src-scripts/` payloads lack per-module documentation describing intent, prerequisites, or safe testing procedures.
- The `apps/loader` workspace includes a placeholder build script without guidance on integrating pipeline outputs into the app shell.
