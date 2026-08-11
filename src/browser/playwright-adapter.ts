import { chromium as defaultChromium } from "playwright";
import type { Browser, Page } from "playwright";

import { detectBrowserAccessState } from "./access-state.js";
import {
  assertSafeCdpEndpoint,
  assertPublicHttpUrl,
  BrowserSafetyError,
} from "./security.js";
import type {
  BrowserAdapterDependencies,
  BrowserAdapterOptions,
  BrowserCaptureRequest,
  BrowserSnapshot,
} from "./types.js";

const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_DOM_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TEXT_CHARACTERS = 500_000;

interface EvaluatedVisibleDom {
  visibleText: string;
  visibleHtml: string;
  textTruncated: boolean;
  htmlTruncated: boolean;
  navigationTransferBytes: number | null;
}

export class BrowserAdapterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BrowserAdapterError";
  }
}

export class PlaywrightBrowserAdapter {
  readonly #options: Required<
    Pick<
      BrowserAdapterOptions,
      | "operationTimeoutMs"
      | "maxResponseBytes"
      | "maxDomBytes"
      | "maxTextCharacters"
    >
  > & Pick<BrowserAdapterOptions, "mode">;

  readonly #dependencies: Required<Pick<BrowserAdapterDependencies, "chromium" | "now">> &
    Pick<BrowserAdapterDependencies, "resolveHostname">;

  constructor(options: BrowserAdapterOptions, dependencies: BrowserAdapterDependencies = {}) {
    this.#options = {
      mode: options.mode,
      operationTimeoutMs: positiveInteger(
        options.operationTimeoutMs,
        DEFAULT_OPERATION_TIMEOUT_MS,
        "operationTimeoutMs",
      ),
      maxResponseBytes: positiveInteger(
        options.maxResponseBytes,
        DEFAULT_MAX_RESPONSE_BYTES,
        "maxResponseBytes",
      ),
      maxDomBytes: positiveInteger(options.maxDomBytes, DEFAULT_MAX_DOM_BYTES, "maxDomBytes"),
      maxTextCharacters: positiveInteger(
        options.maxTextCharacters,
        DEFAULT_MAX_TEXT_CHARACTERS,
        "maxTextCharacters",
      ),
    };
    this.#dependencies = {
      chromium: dependencies.chromium ?? defaultChromium,
      now: dependencies.now ?? (() => new Date()),
      ...(dependencies.resolveHostname
        ? { resolveHostname: dependencies.resolveHostname }
        : {}),
    };
  }

  async capture(request: BrowserCaptureRequest): Promise<BrowserSnapshot> {
    const browserSession = "user-controlled-cdp" as const;
    let browser: Browser | undefined;
    let page: Page | undefined;
    let operationError: unknown;

    try {
      const requestedUrl = await assertPublicHttpUrl(
        request.url,
        this.#dependencies.resolveHostname,
      );
      const endpoint = assertSafeCdpEndpoint(this.#options.mode.endpoint);
      browser = await withTimeout(
        this.#dependencies.chromium.connectOverCDP(endpoint.href, {
          timeout: this.#options.operationTimeoutMs,
        }),
        this.#options.operationTimeoutMs,
        "CDP connection",
      );
      const context = browser.contexts()[0];
      if (!context) {
        throw new BrowserAdapterError("Connected browser has no accessible context");
      }
      page = selectMatchingPage(context.pages(), requestedUrl);
      if (!page) {
        throw new BrowserAdapterError("No already-open browser page matches the requested URL");
      }

      page.setDefaultTimeout(this.#options.operationTimeoutMs);

      const evaluated = await withTimeout(
        page.evaluate(
          ({ maxDomBytes, maxTextCharacters }) =>
            captureVisibleDom(maxDomBytes, maxTextCharacters),
          {
            maxDomBytes: this.#options.maxDomBytes,
            maxTextCharacters: this.#options.maxTextCharacters,
          },
        ),
        this.#options.operationTimeoutMs,
        "visible DOM extraction",
      );

      if (
        evaluated.navigationTransferBytes !== null &&
        evaluated.navigationTransferBytes > this.#options.maxResponseBytes
      ) {
        throw new BrowserAdapterError("Observed page transfer exceeded maxResponseBytes");
      }

      const title = await withTimeout(
        page.title(),
        this.#options.operationTimeoutMs,
        "page title",
      );
      const finalUrl = assertMatchingPageUrl(page, requestedUrl);

      return {
        title,
        url: finalUrl,
        visibleText: evaluated.visibleText,
        visibleHtml: evaluated.visibleHtml,
        access: detectBrowserAccessState(evaluated.visibleText),
        limits: {
          htmlTruncated: evaluated.htmlTruncated,
          textTruncated: evaluated.textTruncated,
          maxDomBytes: this.#options.maxDomBytes,
          maxTextCharacters: this.#options.maxTextCharacters,
          observedNavigationBytes: evaluated.navigationTransferBytes,
        },
        provenance: {
          capturedAt: this.#dependencies.now().toISOString(),
          requestedUrl: request.url,
          finalUrl,
          browserSession,
          navigationPerformed: false,
        },
      };
    } catch (error) {
      operationError = error;
      if (error instanceof BrowserAdapterError || error instanceof BrowserSafetyError) throw error;
      throw new BrowserAdapterError("Browser capture failed", { cause: error });
    } finally {
      const cleanupErrors: unknown[] = [];
      if (browser) {
        await browser.close().catch((error: unknown) => cleanupErrors.push(error));
      }
      if (!operationError && cleanupErrors.length > 0) {
        throw new BrowserAdapterError("Browser cleanup failed", {
          cause: new AggregateError(cleanupErrors),
        });
      }
    }
  }
}

function selectMatchingPage(pages: readonly Page[], requestedUrl: URL): Page | undefined {
  return [...pages]
    .reverse()
    .find(
      (candidate) =>
        !candidate.isClosed() && urlsMatchIgnoringFragment(candidate.url(), requestedUrl),
    );
}

function assertMatchingPageUrl(page: Page, requestedUrl: URL): string {
  const currentUrl = page.url();
  if (!urlsMatchIgnoringFragment(currentUrl, requestedUrl)) {
    throw new BrowserSafetyError("Browser page URL changed before capture completed");
  }
  return currentUrl;
}

function urlsMatchIgnoringFragment(actual: string, requested: URL): boolean {
  try {
    const parsed = new URL(actual);
    return (
      parsed.origin === requested.origin &&
      parsed.pathname === requested.pathname &&
      parsed.search === requested.search
    );
  } catch {
    return false;
  }
}

function captureVisibleDom(maxDomBytes: number, maxTextCharacters: number): EvaluatedVisibleDom {
  const body = document.body;
  const rawText = body?.innerText ?? "";
  const textTruncated = rawText.length > maxTextCharacters;
  const visibleText = rawText.slice(0, maxTextCharacters);

  const cloneVisible = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "");
    if (!(node instanceof Element)) return null;

    const excluded = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED"]);
    if (excluded.has(node.tagName)) return null;
    const visible =
      typeof node.checkVisibility === "function"
        ? node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : (() => {
            const style = getComputedStyle(node);
            return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
          })();
    if (!visible || node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return null;

    const clone = document.createElement(node.tagName.toLowerCase());
    for (const name of ["lang", "dir", "datetime", "title", "aria-label"]) {
      const value = node.getAttribute(name);
      if (value !== null) clone.setAttribute(name, value);
    }
    if (node instanceof HTMLAnchorElement) {
      try {
        const href = new URL(node.href, document.baseURI);
        if (href.protocol === "http:" || href.protocol === "https:") {
          href.username = "";
          href.password = "";
          href.search = "";
          href.hash = "";
          clone.setAttribute("href", href.href);
        }
      } catch {
        // Invalid and non-HTTP links are intentionally omitted.
      }
    }
    for (const child of node.childNodes) {
      const childClone = cloneVisible(child);
      if (childClone) clone.appendChild(childClone);
    }
    return clone;
  };

  const clonedBody = body ? cloneVisible(body) : null;
  const rawHtml = clonedBody instanceof Element ? clonedBody.outerHTML : "";
  const encoder = new TextEncoder();
  const encoded = encoder.encode(rawHtml);
  const htmlTruncated = encoded.byteLength > maxDomBytes;
  let visibleHtml = rawHtml;
  if (htmlTruncated) {
    let low = 0;
    let high = rawHtml.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (encoder.encode(rawHtml.slice(0, middle)).byteLength <= maxDomBytes) low = middle;
      else high = middle - 1;
    }
    visibleHtml = rawHtml.slice(0, low);
  }

  const navigationEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const transferSize = navigationEntry?.transferSize;
  return {
    visibleText,
    visibleHtml,
    textTruncated,
    htmlTruncated,
    navigationTransferBytes:
      typeof transferSize === "number" && transferSize > 0 ? transferSize : null,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new BrowserAdapterError(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new BrowserAdapterError(`${name} must be a positive integer`);
  }
  return candidate;
}
