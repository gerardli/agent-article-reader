# agent-article-reader

A local MCP server and Codex/ChatGPT skill for inspecting and reading public, open-access, or already-authorized web articles.

The reader reports access state and provenance before returning article text. It intentionally does not bypass paywalls, authentication, CAPTCHAs, anti-bot systems, or other access controls.

## Included

- `inspect_article`: metadata and conservative access classification without article text.
- `read_article`: normalized article content when access is classified as accessible; `isComplete` reports whether completeness was proven, separately from whether text is returned.
- Safe HTTP retrieval with SSRF protection, DNS-pinned connections, redirect/timeout/size limits, and HTML-only responses.
- Optional Playwright source for visible DOM from an exact already-open page in a local user-controlled CDP session.
- Repository Skill in `.agents/skills/article-reader` and minimal plugin manifest.
- Offline unit/integration tests and Node 20/22/24 CI.

## Verify

```bash
npm ci
npm run check
```

## Run the MCP server

```bash
npm start
```

HTTP is the default source. Optional browser setup and MCP client examples are documented in [`docs/local-setup.md`](docs/local-setup.md) and [`docs/mcp-config.md`](docs/mcp-config.md).

## Boundaries

- No credentials, cookies, browser profiles, or exported sessions are accepted or stored.
- Restricted, login-required, metered, truncated, CAPTCHA, and uncertain pages return no article body.
- Browser mode is local, explicit, single-user, never navigates, and is not approved for remote or multi-tenant deployment.
- Real-site acceptance, browser permission, Skill/MCP installation, publishing, and deployment remain human gates.

See [`AGENTS.md`](AGENTS.md) for enforced project boundaries and [`docs/security.md`](docs/security.md) for the threat model.
