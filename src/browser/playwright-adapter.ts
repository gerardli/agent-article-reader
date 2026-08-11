import { chromium as defaultChromium } from "playwright";
import type {
  Browser,
  BrowserContext,
  Page,
  Request,
  Response,
  Route,
} from "playwright";

import { detectBrowserAccessState } from "./access-state.js";
import {
  assertSafeCdpEndpoint,
  BrowserSafetyError,
  createNavigationGuard,
} from "./security.js";
import type {
  BrowserAdapterDependencies,
  BrowserAdapterOptions,
  BrowserCaptureRequest,
  BrowserSnapshot,
  NavigationPhase,
} from "./types.js";

const DEFAULT_NAVIGATION_TIMEOUT_MS = 15_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_DOM_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TEXT_CHARACTERS = 500_000;
const DEFAULT_MAX_REDIRECTS = 5;

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
      | "navigationTimeoutMs"
      | "operationTimeoutMs"
      | "maxResponseBytes"
      | "maxDomBytes"
      | "maxTextCharacters"
      | "maxRedirects"
    >
  > &
    Pick<BrowserAdapterOptions, "mode" | "navigationSafetyHook">;

  readonly #dependencies: Required<Pick<BrowserAdapterDependencies, "chromium" | "now">> &
    Pick<BrowserAdapterDependencies, "resolveHostname">;

  constructor(options: BrowserAdapterOptions, dependencies: BrowserAdapterDependencies = {}) {
    this.#options = {
      mode: options.mode,
      navigationTimeoutMs: positiveInteger(
        options.navigationTimeoutMs,
        DEFAULT_NAVIGATION_TIMEOUT_MS,
        "navigationTimeoutMs",
      ),
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
      maxRedirects: nonNegativeInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS, "maxRedirects"),
      ...(options.navigationSafetyHook
        ? { navigationSafetyHook: options.navigationSafetyHook }
        : {}),
    };
    this.#dependencies = {
      chromium: dependencies.chromium ?? defaultChromium,
      now: dependencies.now ?? (() => new Date()),
      ...(dependencies.resolveHostname
        ? { resolveHostname: dependencies.resolveHostname }
        : {}),
    };
  }

  async capture(request: BrowserCaptureRequest = {}): Promise<BrowserSnapshot> {
    const browserSession =
      this.#options.mode.kind === "cdp" ? "user-controlled-cdp" : "clean-ephemeral";
    const guard = createNavigationGuard({
      browserSession,
      ...(this.#dependencies.resolveHostname
        ? { resolveHostname: this.#dependencies.resolveHostname }
        : {}),
      ...(this.#options.navigationSafetyHook
        ? { hook: this.#options.navigationSafetyHook }
        : {}),
    });

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let ownsContext = false;
    let ownsPage = false;
    let operationError: unknown;

    try {
      if (this.#options.mode.kind === "cdp") {
        const endpoint = assertSafeCdpEndpoint(
          this.#options.mode.endpoint,
          this.#options.mode.allowNonLoopbackEndpoint,
        );
        browser = await withTimeout(
          this.#dependencies.chromium.connectOverCDP(endpoint.href, {
            timeout: this.#options.operationTimeoutMs,
          }),
          this.#options.operationTimeoutMs,
          "CDP connection",
        );
        context = browser.contexts()[0];
        if (!context) {
          throw new BrowserAdapterError("Connected browser has no accessible context");
        }

        if (request.url) {
          await guard(request.url, "initial");
          page = await context.newPage();
          ownsPage = true;
        } else {
          page = selectExistingPage(context.pages());
          if (!page) {
            throw new BrowserAdapterError("No open HTTP(S) page is available in the connected browser");
          }
          await guard(page.url(), "final");
        }
      } else {
        if (!request.url) {
          throw new BrowserAdapterError("A URL is required when launching a clean browser");
        }
        await guard(request.url, "initial");
        browser = await withTimeout(
          this.#dependencies.chromium.launch({ headless: this.#options.mode.headless ?? true }),
          this.#options.operationTimeoutMs,
          "browser launch",
        );
        context = await browser.newContext({
          serviceWorkers: "block",
          permissions: [],
        });
        ownsContext = true;
        page = await context.newPage();
        ownsPage = true;
      }

      page.setDefaultTimeout(this.#options.operationTimeoutMs);
      page.setDefaultNavigationTimeout(this.#options.navigationTimeoutMs);

      let navigationResponse: Response | null = null;
      if (request.url) {
        const routeState: { error?: Error } = {};
        await page.route("**/*", async (route) => {
          await enforceRequestSafety(route, guard, page!, this.#options.maxRedirects, routeState);
        });

        try {
          navigationResponse = await page.goto(request.url, {
            waitUntil: request.waitUntil ?? "domcontentloaded",
            timeout: this.#options.navigationTimeoutMs,
          });
        } catch (error) {
          throw routeState.error ?? error;
        }
        if (routeState.error) throw routeState.error;
        assertRedirectLimit(navigationResponse, this.#options.maxRedirects);
        assertContentLength(navigationResponse, this.#options.maxResponseBytes);
        await guard(page.url(), "final");
      }

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
        throw new BrowserAdapterError("Navigation response exceeded maxResponseBytes");
      }

      return {
        title: await withTimeout(page.title(), this.#options.operationTimeoutMs, "page title"),
        url: page.url(),
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
          ...(request.url ? { requestedUrl: request.url } : {}),
          finalUrl: page.url(),
          browserSession,
          navigationPerformed: request.url !== undefined,
        },
      };
    } catch (error) {
      operationError = error;
      if (error instanceof BrowserAdapterError || error instanceof BrowserSafetyError) throw error;
      throw new BrowserAdapterError("Browser capture failed", { cause: error });
    } finally {
      const cleanupErrors: unknown[] = [];
      if (ownsPage && page && !page.isClosed()) {
        await page.close().catch((error: unknown) => cleanupErrors.push(error));
      }
      if (ownsContext && context) {
        await context.close().catch((error: unknown) => cleanupErrors.push(error));
      }
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

async function enforceRequestSafety(
  route: Route,
  guard: (url: string, phase: NavigationPhase) => Promise<URL>,
  page: Page,
  maxRedirects: number,
  state: { error?: Error },
): Promise<void> {
  const request = route.request();
  const url = request.url();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    await route.abort("blockedbyclient");
    return;
  }

  try {
    const isMainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
    const phase: NavigationPhase = isMainNavigation
      ? request.redirectedFrom()
        ? "redirect"
        : "initial"
      : "subresource";
    if (isMainNavigation && redirectDepth(request) > maxRedirects) {
      throw new BrowserSafetyError("Navigation exceeded maxRedirects");
    }
    await guard(url, phase);
    await route.continue();
  } catch (error) {
    state.error = error instanceof Error ? error : new BrowserSafetyError("Unsafe browser request blocked");
    await route.abort("blockedbyclient");
  }
}

function assertContentLength(response: Response | null, maxResponseBytes: number): void {
  if (!response) return;
  const value = response.headers()["content-length"];
  if (!value) return;
  const bytes = Number(value);
  if (Number.isFinite(bytes) && bytes > maxResponseBytes) {
    throw new BrowserAdapterError("Navigation response exceeded maxResponseBytes");
  }
}

function assertRedirectLimit(response: Response | null, maxRedirects: number): void {
  if (response && redirectDepth(response.request()) > maxRedirects) {
    throw new BrowserSafetyError("Navigation exceeded maxRedirects");
  }
}

function redirectDepth(request: Request): number {
  let depth = 0;
  let current = request.redirectedFrom();
  while (current) {
    depth += 1;
    current = current.redirectedFrom();
  }
  return depth;
}

function selectExistingPage(pages: readonly Page[]): Page | undefined {
  return [...pages]
    .reverse()
    .find((candidate) => !candidate.isClosed() && /^https?:\/\//i.test(candidate.url()));
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

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new BrowserAdapterError(`${name} must be a non-negative integer`);
  }
  return candidate;
}
