import { classifyAccess } from "../core/access.js";
import { extractArticle } from "../core/extract.js";
import {
  EMPTY_METADATA,
  type AccessState,
  type ArticleInspection,
  type ArticleReadResult,
} from "../core/types.js";
import type { BrowserSnapshot } from "../browser/types.js";

export interface BrowserSnapshotProvider {
  capture(request: { url: string }): Promise<BrowserSnapshot>;
}

export interface BrowserArticleReader {
  inspect(url: string): Promise<ArticleInspection>;
  read(url: string): Promise<ArticleReadResult>;
}

function restrictedState(snapshot: BrowserSnapshot): AccessState | null {
  if (snapshot.limits.htmlTruncated || snapshot.limits.textTruncated) return "truncated";
  if (snapshot.access.status === "uncertain") return "truncated";
  if (snapshot.access.status !== "restricted") return null;

  switch (snapshot.access.reason) {
    case "login_required":
      return "login_required";
    case "subscription_required":
    case "metered":
      return "paywall_detected";
    case "truncated":
      return "truncated";
    case "captcha":
      return "error";
    default:
      return "unsupported";
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function createBrowserArticleReader(
  provider: BrowserSnapshotProvider,
): BrowserArticleReader {
  async function execute(url: string): Promise<ArticleReadResult> {
    try {
      const snapshot = await provider.capture({ url });
      const extracted = extractArticle(snapshot.visibleHtml, snapshot.url);
      const forcedState = restrictedState(snapshot);
      const classification = forcedState
        ? {
            accessState: forcedState,
            isComplete: false,
            indicators:
              snapshot.access.indicators.length > 0
                ? snapshot.access.indicators
                : ["browser capture could not establish complete access"],
          }
        : classifyAccess({
            status: 200,
            html: snapshot.visibleHtml,
            extractedText: extracted.text,
          });
      const canReturnContent =
        classification.accessState === "accessible" && classification.isComplete;

      return {
        ...classification,
        metadata: {
          ...extracted.metadata,
          title: extracted.metadata.title ?? (snapshot.title || null),
        },
        provenance: {
          source: "browser",
          requestedUrl: url,
          finalUrl: snapshot.url,
          fetchedAt: snapshot.provenance.capturedAt,
          httpStatus: null,
          contentType: "text/html",
          redirectChain: snapshot.url === url ? [] : [snapshot.url],
          extractor: "mozilla-readability",
          bytesReceived: byteLength(snapshot.visibleHtml),
          warnings: [
            `Captured from visible DOM in a ${snapshot.provenance.browserSession} browser session.`,
            ...(canReturnContent
              ? []
              : ["Content withheld because complete access was not established."]),
          ],
        },
        content: canReturnContent ? extracted.text : null,
        wordCount: canReturnContent ? extracted.wordCount : 0,
        error:
          forcedState === "error"
            ? { code: "BROWSER_ACCESS_BLOCKED", message: "Browser access was blocked by a verification step." }
            : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Browser capture failed.";
      return {
        accessState: "error",
        isComplete: false,
        metadata: { ...EMPTY_METADATA },
        provenance: {
          source: "browser",
          requestedUrl: url,
          finalUrl: null,
          fetchedAt: new Date().toISOString(),
          httpStatus: null,
          contentType: null,
          redirectChain: [],
          extractor: "none",
          bytesReceived: 0,
          warnings: [message],
        },
        indicators: ["BROWSER_CAPTURE_FAILED"],
        error: { code: "BROWSER_CAPTURE_FAILED", message },
        content: null,
        wordCount: 0,
      };
    }
  }

  return {
    read: execute,
    inspect: async (url) => {
      const { content: _content, wordCount: _wordCount, ...inspection } = await execute(url);
      return inspection;
    },
  };
}
