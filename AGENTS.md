# Project boundaries

Build an agent-callable article reader for content the user is authorized to access.

## Allowed

- Public pages, open-access copies, and pages already visible in a user-controlled browser session.
- Main-content extraction, metadata normalization, citations, and access-state detection.
- Local stdio MCP, a repository skill, browser adapters, fixtures, tests, CI, and documentation.

## Prohibited

- Do not bypass hard paywalls, authentication, access controls, CAPTCHAs, robots protections, or anti-bot systems.
- Do not clear or manipulate cookies to defeat metering, spoof user-agents/referrers, use archives to evade access restrictions, or recover hidden subscriber content.
- Do not collect, log, commit, or request credentials, cookies, tokens, or browser profiles.
- Do not deploy services, publish packages, install browser extensions, or change external settings.

## Engineering rules

- Default-deny network targets: HTTP(S) only, block localhost and private/link-local IP ranges, limit redirects and response size.
- Never claim full content when the page indicates blocked, login-required, metered, or truncated access.
- Return structured provenance and access status with every extraction.
- Run `npm run check` before handoff.
