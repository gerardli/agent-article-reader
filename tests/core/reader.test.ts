import { describe, expect, it, vi } from "vitest";

import { inspectArticle, readArticle } from "../../src/core/reader.js";

const dnsResolver = async () => ["93.184.216.34"];
const body = Array.from(
  { length: 10 },
  (_, index) => `<p>Paragraph ${index} contains enough public article text for reliable extraction and reading by an authorized user.</p>`,
).join("");

function html(inner: string): string {
  return `<!doctype html><html lang="en"><head><title>Example story</title><meta property="article:published_time" content="2025-01-02T03:04:05Z"></head><body><article><h1>Example story</h1>${inner}</article></body></html>`;
}

describe("article reader", () => {
  it("returns normalized content and provenance for an accessible page", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(html(body), { headers: { "content-type": "text/html" } }),
    );
    const result = await readArticle("https://example.com/story", {
      fetchImpl,
      dnsResolver,
      now: () => new Date("2025-02-03T04:05:06Z"),
    });
    expect(result.accessState).toBe("accessible");
    expect(result.isComplete).toBe(false);
    expect(result.content).toContain("Paragraph 0");
    expect(result.wordCount).toBeGreaterThan(50);
    expect(result.metadata).toMatchObject({
      title: "Example story",
      language: "en",
      publishedAt: "2025-01-02T03:04:05.000Z",
    });
    expect(result.provenance).toMatchObject({
      requestedUrl: "https://example.com/story",
      finalUrl: "https://example.com/story",
      fetchedAt: "2025-02-03T04:05:06.000Z",
      httpStatus: 200,
      extractor: "mozilla-readability",
    });
  });

  it("withholds extracted preview text when a paywall is detected", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(html(`${body}<aside>Subscribe to continue reading</aside>`), {
        headers: { "content-type": "text/html" },
      }),
    );
    const result = await readArticle("https://example.com/story", { fetchImpl, dnsResolver });
    expect(result).toMatchObject({
      accessState: "paywall_detected",
      isComplete: false,
      content: null,
      wordCount: 0,
    });
    expect(result.provenance.warnings).toHaveLength(1);
  });

  it.each([
    ["Verify that you are human", "error"],
    ["reached your free article limit", "paywall_detected"],
    ["Register to keep reading", "login_required"],
  ])("withholds content for reviewer restriction signal: %s", async (signal, accessState) => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(html(`${body}<aside>${signal}</aside>`), {
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await readArticle("https://example.com/story", { fetchImpl, dnsResolver });

    expect(result).toMatchObject({
      accessState,
      isComplete: false,
      content: null,
      wordCount: 0,
    });
  });

  it("returns structured safety failures without making a network call", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await readArticle("http://127.0.0.1/private", { fetchImpl, dnsResolver });
    expect(result).toMatchObject({
      accessState: "error",
      isComplete: false,
      content: null,
      error: { code: "UNSAFE_TARGET" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("inspect returns no article content field", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(html(body), { headers: { "content-type": "text/html" } }),
    );
    const result = await inspectArticle("https://example.com/story", { fetchImpl, dnsResolver });
    expect(result.accessState).toBe("accessible");
    expect(result).not.toHaveProperty("content");
    expect(result).not.toHaveProperty("wordCount");
  });
});
