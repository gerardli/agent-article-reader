export const ACCESS_STATES = [
  "accessible",
  "login_required",
  "paywall_detected",
  "truncated",
  "unsupported",
  "error",
] as const;

export type AccessState = (typeof ACCESS_STATES)[number];

export interface ArticleMetadata {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  publishedAt: string | null;
  language: string | null;
  excerpt: string | null;
}

export interface ArticleProvenance {
  source: "http" | "browser";
  requestedUrl: string;
  finalUrl: string | null;
  fetchedAt: string;
  httpStatus: number | null;
  contentType: string | null;
  redirectChain: string[];
  extractor: "mozilla-readability" | "none";
  bytesReceived: number;
  warnings: string[];
}

export interface ArticleError {
  code: string;
  message: string;
}

export interface ArticleInspection {
  accessState: AccessState;
  isComplete: boolean;
  metadata: ArticleMetadata;
  provenance: ArticleProvenance;
  indicators: string[];
  error: ArticleError | null;
}

export interface ArticleReadResult extends ArticleInspection {
  content: string | null;
  wordCount: number;
}

export const EMPTY_METADATA: ArticleMetadata = {
  title: null,
  byline: null,
  siteName: null,
  publishedAt: null,
  language: null,
  excerpt: null,
};
