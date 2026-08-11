import { describe, expect, it, vi } from "vitest";

import { boundedFetchHtml, createPinnedLookup } from "../../src/core/fetch.js";

const dnsResolver = async () => ["93.184.216.34"];

describe("boundedFetchHtml", () => {
  it("pins socket lookup to the prevalidated address", async () => {
    const lookup = createPinnedLookup("example.com", [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup("example.com", { family: 4 }, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address: address as string, family: family ?? 0 });
      });
    });
    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("rejects a socket lookup for any hostname other than the validated one", async () => {
    const lookup = createPinnedLookup("example.com", [
      { address: "93.184.216.34", family: 4 },
    ]);
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => {
      lookup("changed.example", {}, (lookupFailure) => resolve(lookupFailure!));
    });
    expect(error.code).toBe("EAI_FAIL");
  });

  it("fetches HTML with explicit safety-preserving defaults", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("<html><article>Hello</article></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const page = await boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver });
    expect(page.html).toContain("Hello");
    expect(page.contentType).toBe("text/html");
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://example.com/a"),
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
  });

  it("resolves exactly once for each outbound request", async () => {
    const resolver = vi.fn(async () => ["93.184.216.34"]);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("<html><article>Hello</article></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    await boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver: resolver });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("rejects DNS rebinding to a private address on a redirect hop", async () => {
    const resolver = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(["93.184.216.34"])
      .mockResolvedValueOnce(["127.0.0.1"]);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 302, headers: { location: "/next" } }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver: resolver }),
    ).rejects.toMatchObject({ code: "UNSAFE_TARGET" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("validates redirect destinations and blocks a redirect to localhost", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver }),
    ).rejects.toMatchObject({ code: "UNSAFE_TARGET" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("enforces the redirect limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) =>
      new Response(null, { status: 302, headers: { location: new URL("/again", url).href } }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver, maxRedirects: 1 }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
  });

  it("rejects unsupported content types before reading the body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a.pdf", { fetchImpl, dnsResolver }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT_TYPE" });
  });

  it("enforces the declared response size limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("short", {
        headers: { "content-type": "text/html", "content-length": "500" },
      }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver, maxBytes: 20 }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("enforces the streamed response size limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("x".repeat(100), { headers: { "content-type": "text/html" } }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver, maxBytes: 20 }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("aborts a request at the timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    );
    await expect(
      boundedFetchHtml("https://example.com/a", { fetchImpl, dnsResolver, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
