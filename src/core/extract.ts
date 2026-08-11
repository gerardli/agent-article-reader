import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import { ReaderError } from "./errors.js";
import type { ArticleMetadata } from "./types.js";

export interface ExtractedArticle {
  metadata: ArticleMetadata;
  text: string | null;
  wordCount: number;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function publishedAt(document: Document): string | null {
  const candidates = [
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    document.querySelector('meta[name="date"]')?.getAttribute("content"),
    document.querySelector("time[datetime]")?.getAttribute("datetime"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function countWords(text: string | null): number {
  if (!text) return 0;
  const tokens = text.match(/[\p{L}\p{N}]+/gu);
  return tokens?.length ?? 0;
}

export function extractArticle(html: string, url: string): ExtractedArticle {
  try {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    const language = normalizeNullable(document.documentElement.lang);
    const publicationDate = publishedAt(document);
    const parsed = new Readability(document.cloneNode(true) as Document).parse();
    const text = normalizeNullable(parsed?.textContent);

    return {
      metadata: {
        title: normalizeNullable(parsed?.title ?? document.title),
        byline: normalizeNullable(parsed?.byline),
        siteName: normalizeNullable(parsed?.siteName),
        publishedAt: publicationDate,
        language,
        excerpt: normalizeNullable(parsed?.excerpt),
      },
      text,
      wordCount: countWords(text),
    };
  } catch (error) {
    throw new ReaderError("EXTRACTION_FAILED", "The page could not be parsed as an article.", {
      cause: error,
    });
  }
}
