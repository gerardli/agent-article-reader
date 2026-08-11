import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrowserArticleReader } from "../../src/app/browser-reader.js";
import { createMcpServer } from "../../src/mcp/server.js";

const closeables: Array<{ client: Client; server: ReturnType<typeof createMcpServer> }> = [];

afterEach(async () => {
  await Promise.all(
    closeables.splice(0).map(async ({ client, server }) => {
      await client.close();
      await server.close();
    }),
  );
});

async function connect(browserReader?: BrowserArticleReader) {
  const server = createMcpServer({}, browserReader);
  const client = new Client({ name: "browser-integration-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeables.push({ client, server });
  return client;
}

describe("MCP browser source", () => {
  it("routes browser reads through the configured browser reader", async () => {
    const read = vi.fn().mockResolvedValue({
      accessState: "accessible",
      isComplete: true,
      metadata: {
        title: "Visible article",
        byline: null,
        siteName: "Example",
        publishedAt: null,
        language: "en",
        excerpt: null,
      },
      provenance: {
        source: "browser",
        requestedUrl: "https://example.com/story",
        finalUrl: "https://example.com/story",
        fetchedAt: "2026-08-10T00:00:00.000Z",
        httpStatus: null,
        contentType: "text/html",
        redirectChain: [],
        extractor: "mozilla-readability",
        bytesReceived: 500,
        warnings: ["visible DOM"],
      },
      indicators: [],
      error: null,
      content: "Visible article content that the user can access.",
      wordCount: 8,
    });
    const browserReader: BrowserArticleReader = {
      read,
      inspect: vi.fn(),
    };
    const client = await connect(browserReader);

    const result = await client.callTool({
      name: "read_article",
      arguments: { url: "https://example.com/story", source: "browser" },
    });

    expect(read).toHaveBeenCalledWith("https://example.com/story");
    expect(result.structuredContent).toMatchObject({
      accessState: "accessible",
      provenance: { source: "browser" },
    });
  });

  it("returns a structured error when browser source is not configured", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "inspect_article",
      arguments: { url: "https://example.com/story", source: "browser" },
    });

    expect(result.structuredContent).toMatchObject({
      accessState: "error",
      indicators: ["BROWSER_NOT_CONFIGURED"],
      provenance: { source: "browser" },
    });
  });
});
