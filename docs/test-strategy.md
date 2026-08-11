# Test strategy

`npm run check` is the release gate. It must pass type checking, tests, and the production build on Node.js 20, 22, and 24.

## Automated coverage

- URL validation: protocols, embedded credentials, malformed hosts, localhost, IPv4/IPv6 private and special ranges
- Redirect and DNS safety: each hop revalidated; unsafe destinations fail closed
- Fetch limits: timeout, redirect cap, media type, and maximum bytes
- Extraction: representative fixtures for metadata, canonical URLs, main text, malformed HTML, and encoding
- Access classification: full, preview/partial, login, metered/paywall, CAPTCHA/anti-bot, and unsupported content
- Contract invariants: every result includes access state and provenance; blocked/partial inputs never become full
- MCP behavior: tool schemas, HTTP/browser source selection, unavailable-browser errors, structured errors, clean stdout, and deterministic responses
- Browser integration: visible-DOM mapping, restricted-content withholding, and provenance
- Browser adapter: mocked or local fixtures only in CI; no downloaded browser binary or live website

## Test data

Use synthetic or purpose-built fixtures. Do not commit copied subscriber content, cookies, credentials, browser profiles, or captured authenticated sessions.

## Human acceptance

Real-browser and real-site checks occur only after explicit browser permissions and lawful access are confirmed. Record the URL category and pass/fail reason, not protected article text or session data.
