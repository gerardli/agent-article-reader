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
    requestedUrl: string;
    finalUrl: string;
    browserSession: "user-controlled-cdp";
    navigationPerformed: boolean;
  };
}

export interface BrowserMode {
  kind: "cdp";
  endpoint: string;
}

export interface BrowserAdapterOptions {
  mode: BrowserMode;
  operationTimeoutMs?: number;
  maxResponseBytes?: number;
  maxDomBytes?: number;
  maxTextCharacters?: number;
}

export interface BrowserCaptureRequest {
  /** Exact already-open page URL to capture. Fragment differences are ignored. */
  url: string;
}

export type HostAddressResolver = (hostname: string) => Promise<readonly string[]>;

/** Dependency seam used by offline tests. Application code should omit it. */
export interface BrowserAdapterDependencies {
  chromium?: BrowserType;
  resolveHostname?: HostAddressResolver;
  now?: () => Date;
}
