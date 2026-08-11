#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createBrowserArticleReader } from "./app/browser-reader.js";
import { PlaywrightBrowserAdapter } from "./browser/index.js";
import { createMcpServer } from "./mcp/index.js";

function configuredBrowserReader() {
  const endpoint = process.env.ARTICLE_READER_CDP_ENDPOINT;
  if (endpoint) {
    return createBrowserArticleReader(
      new PlaywrightBrowserAdapter({ mode: { kind: "cdp", endpoint } }),
    );
  }
  if (process.env.ARTICLE_READER_BROWSER_LAUNCH === "1") {
    return createBrowserArticleReader(
      new PlaywrightBrowserAdapter({ mode: { kind: "launch", headless: true } }),
    );
  }
  return undefined;
}

async function main(): Promise<void> {
  const server = createMcpServer({}, configuredBrowserReader());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup failure";
  process.stderr.write(`agent-article-reader failed to start: ${message}\n`);
  process.exitCode = 1;
});
