import type { BrowserType } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  BrowserAdapterError,
  BrowserSafetyError,
  PlaywrightBrowserAdapter,
} from "../../src/browser/index.js";

const PUBLIC_ADDRESSES = async () => ["93.184.216.34"] as const;

function evaluated(overrides: Record<string, unknown> = {}) {
  return {
    visibleText: "Visible article text",
    visibleHtml: "<body><article>Visible article text</article></body>",
    textTruncated: false,
    htmlTruncated: false,
    navigationTransferBytes: 1024,
    ...overrides,
  };
}

function fakePage(options: {
  url?: string;
  urlSequence?: string[];
  value?: ReturnType<typeof evaluated>;
} = {}) {
  const fallbackUrl = options.url ?? "https://example.com/article";
  const urlSequence = [...(options.urlSequence ?? [])];
  const page = {
    url: vi.fn(() => urlSequence.shift() ?? fallbackUrl),
    isClosed: vi.fn(() => false),
    setDefaultTimeout: vi.fn(),
    evaluate: vi.fn(async () => options.value ?? evaluated()),
    title: vi.fn(async () => "Visible title"),
    goto: vi.fn(),
    route: vi.fn(),
    close: vi.fn(),
  };
  return page;
}

function asChromium(value: object): BrowserType {
  return value as unknown as BrowserType;
}

function connectedBrowser(pages: object[]) {
  const context = {
    pages: vi.fn(() => pages),
    newPage: vi.fn(),
    close: vi.fn(),
  };
  const browser = {
    contexts: vi.fn(() => [context]),
    close: vi.fn(async () => undefined),
  };
  const launch = vi.fn();
  const connectOverCDP = vi.fn(async () => browser);
  return {
    browser,
    context,
    launch,
    connectOverCDP,
    chromium: asChromium({ connectOverCDP, launch }),
  };
}

describe("PlaywrightBrowserAdapter", () => {
  it("captures only the exact already-open CDP page and never navigates", async () => {
    const wrongPage = fakePage({ url: "https://example.com/other?mode=full" });
    const page = fakePage({
      url: "https://example.com/article?mode=full#open-fragment",
      value: evaluated({ visibleText: "Subscribe to unlock this article" }),
    });
    const session = connectedBrowser([wrongPage, page]);
    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "cdp", endpoint: "http://127.0.0.1:9222" } },
      {
        chromium: session.chromium,
        resolveHostname: PUBLIC_ADDRESSES,
        now: () => new Date("2026-08-10T00:00:00.000Z"),
      },
    );

    const snapshot = await adapter.capture({
      url: "https://example.com/article?mode=full#requested-fragment",
    });

    expect(snapshot.access).toMatchObject({
      status: "restricted",
      reason: "subscription_required",
      completeness: "partial",
    });
    expect(snapshot.provenance).toEqual({
      capturedAt: "2026-08-10T00:00:00.000Z",
      requestedUrl: "https://example.com/article?mode=full#requested-fragment",
      finalUrl: "https://example.com/article?mode=full#open-fragment",
      browserSession: "user-controlled-cdp",
      navigationPerformed: false,
    });
    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(wrongPage.evaluate).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.route).not.toHaveBeenCalled();
    expect(session.context.newPage).not.toHaveBeenCalled();
    expect(session.launch).not.toHaveBeenCalled();
    expect(page.close).not.toHaveBeenCalled();
    expect(session.context.close).not.toHaveBeenCalled();
    expect(session.browser.close).toHaveBeenCalledOnce();
  });

  it.each([
    "https://other.example/article?mode=full",
    "https://example.com/other?mode=full",
    "https://example.com/article?mode=preview",
  ])("fails closed when no open page matches %s", async (requestedUrl) => {
    const page = fakePage({ url: "https://example.com/article?mode=full" });
    const session = connectedBrowser([page]);
    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "cdp", endpoint: "http://127.0.0.1:9222" } },
      { chromium: session.chromium, resolveHostname: PUBLIC_ADDRESSES },
    );

    await expect(adapter.capture({ url: requestedUrl })).rejects.toBeInstanceOf(
      BrowserAdapterError,
    );
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.route).not.toHaveBeenCalled();
    expect(session.context.newPage).not.toHaveBeenCalled();
    expect(session.launch).not.toHaveBeenCalled();
  });

  it("fails closed if the selected page URL changes during capture", async () => {
    const page = fakePage({
      url: "https://example.com/other",
      urlSequence: ["https://example.com/article", "https://example.com/other"],
    });
    const session = connectedBrowser([page]);
    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "cdp", endpoint: "http://127.0.0.1:9222" } },
      { chromium: session.chromium, resolveHostname: PUBLIC_ADDRESSES },
    );

    await expect(
      adapter.capture({ url: "https://example.com/article" }),
    ).rejects.toBeInstanceOf(BrowserSafetyError);
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.route).not.toHaveBeenCalled();
    expect(session.context.newPage).not.toHaveBeenCalled();
  });

  it("enforces observed page-transfer limits without navigating", async () => {
    const page = fakePage({ value: evaluated({ navigationTransferBytes: 5000 }) });
    const session = connectedBrowser([page]);
    const adapter = new PlaywrightBrowserAdapter(
      {
        mode: { kind: "cdp", endpoint: "http://127.0.0.1:9222" },
        maxResponseBytes: 4096,
      },
      { chromium: session.chromium, resolveHostname: PUBLIC_ADDRESSES },
    );

    await expect(
      adapter.capture({ url: "https://example.com/article" }),
    ).rejects.toBeInstanceOf(BrowserAdapterError);
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.route).not.toHaveBeenCalled();
    expect(session.context.newPage).not.toHaveBeenCalled();
    expect(session.browser.close).toHaveBeenCalledOnce();
  });

  it("rejects remote CDP before opening a connection", async () => {
    const connectOverCDP = vi.fn();
    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "cdp", endpoint: "https://browser.example:9222" } },
      {
        chromium: asChromium({ connectOverCDP }),
        resolveHostname: PUBLIC_ADDRESSES,
      },
    );

    await expect(
      adapter.capture({ url: "https://example.com/article" }),
    ).rejects.toBeInstanceOf(BrowserSafetyError);
    expect(connectOverCDP).not.toHaveBeenCalled();
  });
});
