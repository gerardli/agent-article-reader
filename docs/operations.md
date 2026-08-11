# Operations and upstream drift

This repository produces a local process, not a hosted service. Operational readiness means reproducible installation, passing checks, stable MCP contracts, and honest access reporting.

## Routine maintenance

1. Let Dependabot or an equivalent reviewer propose dependency updates; do not auto-merge them.
2. Run `npm ci && npm run check` on every change and across the supported Node matrix.
3. For extraction-library, MCP SDK, DNS/network, or Playwright updates, review release notes and rerun the relevant security and contract fixtures.
4. After an approved release, run a local MCP smoke test, then a human-controlled browser acceptance test if browser behavior changed.

## Drift signals

- A fixture loses title/body/canonical metadata.
- Access classification changes from partial/blocked to full.
- MCP tool schemas or structured result fields change.
- A redirect, DNS, timeout, or byte-limit test regresses.
- A browser adapter starts requiring profile, cookie, or credential transfer.
- A runtime starts accepting non-loopback CDP endpoints or both browser modes behave ambiguously.

Any access-status upgrade or network-safety regression blocks release. A website-specific extraction failure should degrade to partial/unsupported with a reason; it must not trigger bypass tactics.

## Release and rollback

Use tagged, reviewed commits only after CI and human gates pass. Keep MCP response fields backward-compatible within a minor release. If upstream drift creates false completeness or network risk, disable the affected adapter or revert to the last known-good tag; do not deploy an unverified workaround.
