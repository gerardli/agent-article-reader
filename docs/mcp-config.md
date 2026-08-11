# MCP client configuration

Build the repository first with `npm ci && npm run build`. Replace `/absolute/path/agent-article-reader` below with the local clone's absolute path.

## Codex CLI

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.article_reader]
command = "node"
args = ["/absolute/path/agent-article-reader/dist/index.js"]
enabled = true
```

Restart Codex and confirm that `inspect_article` and `read_article` are listed for the `article_reader` server.

For an already-authorized browser exposed on a local CDP port, add this line under the same server block:

```toml
env = { ARTICLE_READER_CDP_ENDPOINT = "http://127.0.0.1:9222" }
```

For an approved, locally installed Playwright Chromium instead, use:

```toml
env = { ARTICLE_READER_BROWSER_LAUNCH = "1" }
```

## JSON-based MCP clients

```json
{
  "mcpServers": {
    "article-reader": {
      "command": "node",
      "args": ["/absolute/path/agent-article-reader/dist/index.js"],
      "env": {
        "ARTICLE_READER_CDP_ENDPOINT": "http://127.0.0.1:9222"
      }
    }
  }
}
```

Omit `env` for HTTP-only use. Set only one browser variable; CDP wins if both exist. No token, cookie, browser profile, remote CDP address, or website credential belongs in this configuration. Client-specific installation and permission prompts require human approval and are not automated by this repository.
