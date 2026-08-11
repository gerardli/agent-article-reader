# Security and threat model

## Protected assets

- The user's local network and cloud-instance metadata endpoints
- Browser sessions, credentials, cookies, tokens, and profiles
- Accurate claims about what content was actually accessible
- MCP protocol integrity and logs

## Main threats and controls

| Threat | Required control |
| --- | --- |
| SSRF through a supplied URL | HTTP(S) allowlist; reject credentials in URLs, localhost, private/link-local/special-use IPs; validate each destination |
| DNS rebinding or redirect into a private target | HTTP transport pins each validated public IP while preserving Host/SNI and re-resolves every redirect; browser routes are checked before continuation |
| Oversized or slow response | Tight timeout, redirect, and byte limits; abort on overflow |
| Paywall/auth/CAPTCHA evasion | Detect and report access state; never alter identity, cookies, referrers, or source to evade controls |
| Secret leakage | Never accept or log credentials, cookies, tokens, profiles, or page session exports |
| Prompt injection in page text | Treat extracted content as untrusted data; the Skill ignores embedded instructions |
| False completeness | Preserve partial/blocked status through every layer; never call previews full articles |
| MCP stream corruption | Reserve stdout for JSON-RPC; diagnostics go to stderr |

## Logging rules

Logs may contain an operation name, coarse status, duration, and a redacted origin. They must not contain query strings, fragments, article bodies, request/response headers, credentials, cookies, tokens, or browser state.

## Non-goals

This project does not bypass hard paywalls or access controls, solve CAPTCHAs, spoof clients, clear metering cookies, recover hidden subscriber text, scrape through rotating identities, or act as a credential/session broker.

## Residual risk

The HTTP source pins the validated address to its socket. Playwright does not expose equivalent address pinning, so the browser source still has a validation-to-navigation DNS race. An attached CDP context may also contain pre-existing service workers outside this process's ownership. Keep browser mode local, opt-in, single-user, and limited to intended sites. Remote or multi-tenant deployment requires a separate security review.

Report suspected security defects privately to the repository owner. Do not include secrets or captured browser data in an issue.
