# Dependency Inventory

## Root Workspace (`package.json`)
| Type | Package | Declared Range | Installed Version | Latest Stable* | Recommended Pin |
| --- | --- | --- | --- | --- | --- |
| dependency | javascript-obfuscator | ^4.1.1 | 4.1.1 | — (offline) | 4.1.1 |
| dependency | js-yaml | ^4.1.0 | 4.1.0 | — (offline) | 4.1.0 |
| dependency | plist | ^3.1.0 | 3.1.0 | — (offline) | 3.1.0 |
| dependency | uuid | ^11.1.0 | 11.1.0 | — (offline) | 11.1.0 |
| dependency | qrcode | ^1.5.4 | 1.5.4 | — (offline) | 1.5.4 |
| devDependency | chalk | ^5.3.0 | 5.6.2 | — (offline) | Align range to ^5.6.2 |
| devDependency | typescript | ^5.2.2 | 5.9.3 | — (offline) | Pin workspace to 5.9.3 |
| optionalDependency | sharp | ^0.33.0 | 0.33.5 | — (offline) | Update range to ^0.33.5 |

## Loader Workspace (`apps/loader/package.json`)
| Package | Declared Range | Installed Version | Latest Stable* | Recommended Pin |
| --- | --- | --- | --- | --- |
| typescript | ^5.6.2 | 5.9.3 | — (offline) | Pin to 5.9.3 (match root) |

## Observations
- The root workspace declares TypeScript `^5.2.2` while the loader declares `^5.6.2`; pnpm hoists `5.9.3`, so both manifests should be updated to an explicit `5.9.3` pin to avoid drift.
- Chalk resolves to `5.6.2`, newer than the declared `^5.3.0`; update the range to document the tested toolchain.
- Sharp is optional but installs `0.33.5`, which exceeds the declared `^0.33.0`; tighten the range to the known-good release.
- No additional package.json files exist under `configs/`, `scripts/`, or `src-scripts/`; workspace manifests rely solely on the root and loader entries.

\* Latest stable versions could not be fetched because registry access is blocked in the execution environment.
