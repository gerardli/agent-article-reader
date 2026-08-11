import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { inspectArticle, readArticle, type ArticleReaderOptions } from "../core/index.js";
import type { BrowserArticleReader } from "../app/browser-reader.js";

const accessStateSchema = z.enum([
  "accessible",
  "login_required",
  "paywall_detected",
  "truncated",
  "unsupported",
  "error",
]);

const metadataSchema = z.object({
  title: z.string().nullable(),
  byline: z.string().nullable(),
  siteName: z.string().nullable(),
  publishedAt: z.string().nullable(),
  language: z.string().nullable(),
  excerpt: z.string().nullable(),
});

const provenanceSchema = z.object({
  source: z.enum(["http", "browser"]),
  requestedUrl: z.string(),
  finalUrl: z.string().nullable(),
  fetchedAt: z.string(),
  httpStatus: z.number().int().nullable(),
  contentType: z.string().nullable(),
  redirectChain: z.array(z.string()),
  extractor: z.enum(["mozilla-readability", "none"]),
  bytesReceived: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

const errorSchema = z.object({ code: z.string(), message: z.string() }).nullable();

const inspectionShape = {
  accessState: accessStateSchema,
  isComplete: z.boolean(),
  metadata: metadataSchema,
  provenance: provenanceSchema,
  indicators: z.array(z.string()),
  error: errorSchema,
};

const readShape = {
  ...inspectionShape,
  content: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
};

function toolResponse(structuredContent: object) {
  const output = structuredContent as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}

export function createMcpServer(
  readerOptions: ArticleReaderOptions = {},
  browserReader?: BrowserArticleReader,
): McpServer {
  const server = new McpServer({ name: "agent-article-reader", version: "0.1.0" });

  server.registerTool(
    "inspect_article",
    {
      title: "Inspect article access",
      description:
        "Inspect article metadata and access state without returning article text. Does not bypass access controls.",
      inputSchema: {
        url: z.url().describe("Public HTTP(S) article URL"),
        source: z.enum(["http", "browser"]).optional().describe("Retrieval source; defaults to http"),
      },
      outputSchema: inspectionShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, source }) => {
      if (source === "browser") {
        return toolResponse(
          browserReader
            ? await browserReader.inspect(url)
            : await unavailableBrowserResult(url, false),
        );
      }
      return toolResponse(await inspectArticle(url, readerOptions));
    },
  );

  server.registerTool(
    "read_article",
    {
      title: "Read accessible article",
      description:
        "Extract main text only when the fetched page appears completely accessible. Does not bypass paywalls, login, or anti-bot controls.",
      inputSchema: {
        url: z.url().describe("Public HTTP(S) article URL"),
        source: z.enum(["http", "browser"]).optional().describe("Retrieval source; defaults to http"),
      },
      outputSchema: readShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, source }) => {
      if (source === "browser") {
        return toolResponse(
          browserReader
            ? await browserReader.read(url)
            : await unavailableBrowserResult(url, true),
        );
      }
      return toolResponse(await readArticle(url, readerOptions));
    },
  );

  return server;
}

async function unavailableBrowserResult(url: string, includeContent: boolean) {
  const base = {
    accessState: "error" as const,
    isComplete: false,
    metadata: {
      title: null,
      byline: null,
      siteName: null,
      publishedAt: null,
      language: null,
      excerpt: null,
    },
    provenance: {
      source: "browser" as const,
      requestedUrl: url,
      finalUrl: null,
      fetchedAt: new Date().toISOString(),
      httpStatus: null,
      contentType: null,
      redirectChain: [],
      extractor: "none" as const,
      bytesReceived: 0,
      warnings: ["Browser source is not configured for this MCP server."],
    },
    indicators: ["BROWSER_NOT_CONFIGURED"],
    error: {
      code: "BROWSER_NOT_CONFIGURED",
      message: "Browser source is not configured for this MCP server.",
    },
  };
  return includeContent ? { ...base, content: null, wordCount: 0 } : base;
}
