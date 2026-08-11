import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../../src/mcp/server.js";

const connected: Array<{ client: Client; server: ReturnType<typeof createMcpServer> }> = [];

afterEach(async () => {
  await Promise.all(connected.splice(0).map(async ({ client, server }) => {
    await client.close();
    await server.close();
  }));
});

async function connect(fetchImpl: typeof fetch) {
  const server = createMcpServer({
    fetchImpl,
    dnsResolver: async () => ["93.184.216.34"],
    now: () => new Date("2025-02-03T04:05:06Z"),
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  connected.push({ client, server });
  return client;
}

describe("MCP server", () => {
  it("advertises inspect_article and read_article", async () => {
    const client = await connect(vi.fn<typeof fetch>());
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["inspect_article", "read_article"]);
    expect(tools.tools.every((tool) => tool.outputSchema !== undefined)).toBe(true);
  });

  it("returns structured error output for an unsafe URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = await connect(fetchImpl);
    const result = await client.callTool({
      name: "read_article",
      arguments: { url: "http://127.0.0.1/private" },
    });
    expect(result.structuredContent).toMatchObject({
      accessState: "error",
      isComplete: false,
      error: { code: "UNSAFE_TARGET" },
      content: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
