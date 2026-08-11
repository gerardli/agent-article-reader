import type { BrowserType } from "playwright";

export type BrowserAccessReason =
  | "none_detected"
  | "login_required"
  | "subscription_required"
  | "metered"
  | "captcha"
  | "truncated"
  | "uncertain";

export interface BrowserAccessState {
  status: "available" | "restricted" | "uncertain";
  reason: BrowserAccessReason;
  indicators: string[];
  /**
   * The browser adapter never asserts that an article is complete. That
   * determination belongs to the extraction layer and must account for the
   * access signals returned here.
   */
  completeness: "partial" | "unknown";
}

export interface BrowserSnapshot {
  title: string;
  url: string;
  visibleText: string;
  visibleHtml: string;
  access: BrowserAccessState;
  limits: {
    htmlTruncated: boolean;
    textTruncated: boolean;
    maxDomBytes: number;
    maxTextCharacters: number;
    observedNavigationBytes: number | null;
  };
  provenance: {
    capturedAt: string;
    requestedUrl?: string;
    finalUrl: string;
    browserSession: "user-controlled-cdp" | "clean-ephemeral";
    navigationPerformed: boolean;
  };
}

export type NavigationPhase = "initial" | "redirect" | "subresource" | "final";

export interface NavigationPolicyContext {
  phase: NavigationPhase;
  browserSession: BrowserSnapshot["provenance"]["browserSession"];
}

/** Additional caller policy. The built-in public-network policy always runs first. */
export type NavigationSafetyHook = (
  url: URL,
  context: NavigationPolicyContext,
) => void | Promise<void>;

export type BrowserMode =
  | {
      kind: "cdp";
      endpoint: string;
      /** Required for any CDP host other than literal localhost/loopback. */
      allowNonLoopbackEndpoint?: boolean;
    }
  | {
      kind: "launch";
      headless?: boolean;
    };

export interface BrowserAdapterOptions {
  mode: BrowserMode;
  navigationSafetyHook?: NavigationSafetyHook;
  navigationTimeoutMs?: number;
  operationTimeoutMs?: number;
  maxResponseBytes?: number;
  maxDomBytes?: number;
  maxTextCharacters?: number;
  maxRedirects?: number;
}

export interface BrowserCaptureRequest {
  /**
   * Required for an ephemeral browser. When omitted for CDP, the most recent
   * already-open HTTP(S) page is captured without navigating it.
   */
  url?: string;
  waitUntil?: "domcontentloaded" | "load";
}

export type HostAddressResolver = (hostname: string) => Promise<readonly string[]>;

/** Dependency seam used by offline tests. Application code should omit it. */
export interface BrowserAdapterDependencies {
  chromium?: BrowserType;
  resolveHostname?: HostAddressResolver;
  now?: () => Date;
}
