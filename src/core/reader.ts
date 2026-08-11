import { classifyAccess } from "./access.js";
import { asReaderError } from "./errors.js";
import { extractArticle } from "./extract.js";
import { boundedFetchHtml, type BoundedFetchOptions } from "./fetch.js";
import {
  EMPTY_METADATA,
  type ArticleInspection,
  type ArticleProvenance,
  type ArticleReadResult,
} from "./types.js";

export interface ArticleReaderOptions extends BoundedFetchOptions {
  now?: () => Date;
}

function failedProvenance(url: string, fetchedAt: string, warning: string): ArticleProvenance {
  return {
    source: "http",
    requestedUrl: url,
    finalUrl: null,
    fetchedAt,
    httpStatus: null,
    contentType: null,
    redirectChain: [],
    extractor: "none",
    bytesReceived: 0,
    warnings: [warning],
  };
}

async function executeRead(url: string, options: ArticleReaderOptions): Promise<ArticleReadResult> {
  const fetchedAt = (options.now ?? (() => new Date()))().toISOString();
  try {
    const page = await boundedFetchHtml(url, options);
    const extracted = extractArticle(page.html, page.finalUrl);
    const classification = classifyAccess({
      status: page.status,
      html: page.html,
      extractedText: extracted.text,
    });
    const canReturnContent =
      classification.accessState === "accessible" && classification.isComplete;
    return {
      ...classification,
      metadata: extracted.metadata,
      provenance: {
        source: "http",
        requestedUrl: page.requestedUrl,
        finalUrl: page.finalUrl,
        fetchedAt,
        httpStatus: page.status,
        contentType: page.contentType,
        redirectChain: page.redirectChain,
        extractor: "mozilla-readability",
        bytesReceived: page.bytesReceived,
        warnings: canReturnContent ? [] : ["Content withheld because complete access was not established."],
      },
      content: canReturnContent ? extracted.text : null,
      wordCount: canReturnContent ? extracted.wordCount : 0,
      error: null,
    };
  } catch (error) {
    const readerError = asReaderError(error);
    const unsupported = readerError.code === "UNSUPPORTED_CONTENT_TYPE";
    return {
      accessState: unsupported ? "unsupported" : "error",
      isComplete: false,
      metadata: { ...EMPTY_METADATA },
      provenance: failedProvenance(url, fetchedAt, readerError.message),
      indicators: [readerError.code],
      error: { code: readerError.code, message: readerError.message },
      content: null,
      wordCount: 0,
    };
  }
}

export async function readArticle(
  url: string,
  options: ArticleReaderOptions = {},
): Promise<ArticleReadResult> {
  return executeRead(url, options);
}

export async function inspectArticle(
  url: string,
  options: ArticleReaderOptions = {},
): Promise<ArticleInspection> {
  const { content: _content, wordCount: _wordCount, ...inspection } = await executeRead(url, options);
  return inspection;
}
