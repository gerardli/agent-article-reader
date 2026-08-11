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
  value?: ReturnType<typeof evaluated>;
  lifecycle?: string[];
  gotoBehavior?: (routeHandler: ((route: unknown) => Promise<void>) | undefined) => Promise<unknown>;
} = {}) {
  let routeHandler: ((route: unknown) => Promise<void>) | undefined;
  let closed = false;
  const lifecycle = options.lifecycle ?? [];
  const page = {
    url: vi.fn(() => options.url ?? "https://example.com/article"),
    isClosed: vi.fn(() => closed),
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    route: vi.fn(async (_pattern: string, handler: (route: unknown) => Promise<void>) => {
      routeHandler = handler;
    }),
    goto: vi.fn(async () => options.gotoBehavior?.(routeHandler) ?? null),
    evaluate: vi.fn(async () => options.value ?? evaluated()),
    title: vi.fn(async () => "Visible title"),
    close: vi.fn(async () => {
      closed = true;
      lifecycle.push("page.close");
    }),
    mainFrame: vi.fn(() => ({ id: "main" })),
  };
  return page;
}

function asChromium(value: object): BrowserType {
  return value as unknown as BrowserType;
}

describe("PlaywrightBrowserAdapter", () => {
  it("captures an already-open CDP page without navigating or closing that page", async () => {
    const page = fakePage({
      value: evaluated({ visibleText: "Subscribe to unlock this article" }),
    });
    const context = {
      pages: vi.fn(() => [page]),
      newPage: vi.fn(),
      close: vi.fn(),
    };
    const browser = {
      contexts: vi.fn(() => [context]),
      close: vi.fn(async () => undefined),
    };
    const chromium = asChromium({
      connectOverCDP: vi.fn(async () => browser),
    });

    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "cdp", endpoint: "http://127.0.0.1:9222" } },
      {
        chromium,
        resolveHostname: PUBLIC_ADDRESSES,
        now: () => new Date("2026-08-10T00:00:00.000Z"),
      },
    );
    const snapshot = await adapter.capture();

    expect(snapshot.access).toMatchObject({
      status: "restricted",
      reason: "subscription_required",
      completeness: "partial",
    });
    expect(snapshot.provenance).toEqual({
      capturedAt: "2026-08-10T00:00:00.000Z",
      finalUrl: "https://example.com/article",
      browserSession: "user-controlled-cdp",
      navigationPerformed: false,
    });
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.close).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("launches a clean context and cleans up owned resources in order", async () => {
    const lifecycle: string[] = [];
    const page = fakePage({ lifecycle });
    const context = {
      pages: vi.fn(() => []),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => lifecycle.push("context.close")),
    };
    const browser = {
      contexts: vi.fn(() => []),
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => lifecycle.push("browser.close")),
    };
    const chromium = asChromium({ launch: vi.fn(async () => browser) });
    const phases: string[] = [];

    const adapter = new PlaywrightBrowserAdapter(
      {
        mode: { kind: "launch", headless: true },
        navigationSafetyHook: (_url, contextValue) => phases.push(contextValue.phase),
      },
      { chromium, resolveHostname: PUBLIC_ADDRESSES },
    );
    const snapshot = await adapter.capture({ url: "https://example.com/article" });

    expect(snapshot.provenance).toMatchObject({
      requestedUrl: "https://example.com/article",
      finalUrl: "https://example.com/article",
      browserSession: "clean-ephemeral",
      navigationPerformed: true,
    });
    expect(phases).toEqual(["initial", "final"]);
    expect(browser.newContext).toHaveBeenCalledWith({
      serviceWorkers: "block",
      permissions: [],
    });
    expect(lifecycle).toEqual(["page.close", "context.close", "browser.close"]);
  });

  it("blocks an unsafe browser subrequest and still cleans up", async () => {
    const lifecycle: string[] = [];
    const abort = vi.fn(async () => undefined);
    const continueRequest = vi.fn(async () => undefined);
    const page = fakePage({
      lifecycle,
      gotoBehavior: async (handler) => {
        await handler?.({
          request: () => ({
            url: () => "http://169.254.169.254/latest/meta-data",
            isNavigationRequest: () => false,
            frame: () => ({ id: "subframe" }),
            redirectedFrom: () => null,
          }),
          abort,
          continue: continueRequest,
        });
        throw new Error("net::ERR_FAILED");
      },
    });
    const context = {
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => lifecycle.push("context.close")),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => lifecycle.push("browser.close")),
    };
    const chromium = asChromium({ launch: vi.fn(async () => browser) });
    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "launch" } },
      { chromium, resolveHostname: PUBLIC_ADDRESSES },
    );

    await expect(adapter.capture({ url: "https://example.com/article" })).rejects.toBeInstanceOf(
      BrowserSafetyError,
    );
    expect(abort).toHaveBeenCalledWith("blockedbyclient");
    expect(continueRequest).not.toHaveBeenCalled();
    expect(lifecycle).toEqual(["page.close", "context.close", "browser.close"]);
  });

  it("enforces observed response limits and cleans up after failure", async () => {
    const lifecycle: string[] = [];
    const page = fakePage({
      lifecycle,
      value: evaluated({ navigationTransferBytes: 5000 }),
    });
    const context = {
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => lifecycle.push("context.close")),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => lifecycle.push("browser.close")),
    };
    const adapter = new PlaywrightBrowserAdapter(
      { mode: { kind: "launch" }, maxResponseBytes: 4096 },
      {
        chromium: asChromium({ launch: vi.fn(async () => browser) }),
        resolveHostname: PUBLIC_ADDRESSES,
      },
    );

    await expect(adapter.capture({ url: "https://example.com/article" })).rejects.toBeInstanceOf(
      BrowserAdapterError,
    );
    expect(lifecycle).toEqual(["page.close", "context.close", "browser.close"]);
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

    await expect(adapter.capture()).rejects.toBeInstanceOf(BrowserSafetyError);
    expect(connectOverCDP).not.toHaveBeenCalled();
  });
});
