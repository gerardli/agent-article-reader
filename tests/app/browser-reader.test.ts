import { describe, expect, it, vi } from "vitest";

import {
  createBrowserArticleReader,
  type BrowserSnapshotProvider,
} from "../../src/app/browser-reader.js";
import type { BrowserSnapshot } from "../../src/browser/types.js";

function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
  const paragraph = Array.from({ length: 120 }, (_, index) => `visible-word-${index}`).join(" ");
  return {
    title: "Visible article",
    url: "https://example.com/story",
    visibleText: paragraph,
    visibleHtml: `<body><article><h1>Visible article</h1><p>${paragraph}</p></article></body>`,
    access: {
      status: "available",
      reason: "none_detected",
      indicators: [],
      completeness: "unknown",
    },
    limits: {
      htmlTruncated: false,
      textTruncated: false,
      maxDomBytes: 2_000_000,
      maxTextCharacters: 500_000,
      observedNavigationBytes: 10_000,
    },
    provenance: {
      capturedAt: "2026-08-10T00:00:00.000Z",
      requestedUrl: "https://example.com/story",
      finalUrl: "https://example.com/story",
      browserSession: "user-controlled-cdp",
      navigationPerformed: false,
    },
    ...overrides,
  };
}

describe("browser article reader", () => {
  it("extracts content from an accessible visible DOM", async () => {
    const provider: BrowserSnapshotProvider = { capture: vi.fn().mockResolvedValue(snapshot()) };
    const result = await createBrowserArticleReader(provider).read("https://example.com/story");

    expect(result.accessState).toBe("accessible");
    expect(result.content).toContain("visible-word-100");
    expect(result.provenance.source).toBe("browser");
    expect(result.provenance.warnings[0]).toContain("visible DOM");
  });

  it("withholds browser content when a subscription restriction is visible", async () => {
    const provider: BrowserSnapshotProvider = {
      capture: vi.fn().mockResolvedValue(
        snapshot({
          access: {
            status: "restricted",
            reason: "subscription_required",
            indicators: ["subscription requirement is visible"],
            completeness: "partial",
          },
        }),
      ),
    };
    const result = await createBrowserArticleReader(provider).read("https://example.com/story");

    expect(result.accessState).toBe("paywall_detected");
    expect(result.content).toBeNull();
    expect(result.wordCount).toBe(0);
    expect(result.isComplete).toBe(false);
  });

  it("fails closed when browser capture fails", async () => {
    const provider: BrowserSnapshotProvider = {
      capture: vi.fn().mockRejectedValue(new Error("browser unavailable")),
    };
    const result = await createBrowserArticleReader(provider).read("https://example.com/story");

    expect(result).toMatchObject({
      accessState: "error",
      content: null,
      error: { code: "BROWSER_CAPTURE_FAILED" },
      provenance: { source: "browser" },
    });
  });
});
