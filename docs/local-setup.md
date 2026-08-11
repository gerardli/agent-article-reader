# Local setup

## Requirements

- Node.js 20, 22, or 24
- npm with the committed lockfile

## Build and verify

```bash
npm ci
npm run check
```

`npm run check` performs type checking, fixture-based tests, and a production build. CI skips Playwright browser downloads and does not run live-site tests.

Start the built stdio server:

```bash
npm start
```

The process waits for MCP JSON-RPC on stdin; running it directly is only a startup check. Configure an MCP client using an absolute path as shown in [mcp-config.md](./mcp-config.md).

## Optional browser source

Leave both variables unset for HTTP-only operation. To use a browser the user already controls, set a literal loopback CDP endpoint with an explicit port before starting the server:

```bash
ARTICLE_READER_CDP_ENDPOINT=http://127.0.0.1:9222 npm start
```

The user must start and authorize that local browser session. The endpoint must not contain credentials, and the production entrypoint rejects non-loopback CDP hosts.

Alternatively, after a human has approved and installed the Playwright Chromium binary, use a clean, ephemeral headless browser:

```bash
npx playwright install chromium
ARTICLE_READER_BROWSER_LAUNCH=1 npm start
```

If both variables are set, CDP takes precedence. Browser MCP requests still require a URL, enforce public-network and size limits, and return no article body when access is restricted or uncertain. Do not copy profiles, export cookies, put credentials in configuration, or commit local browser data. Browser installation, login, permissions, and real-site acceptance testing remain explicit human gates.
