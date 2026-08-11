import type { AccessState } from "./types.js";

export interface AccessSignals {
  status: number;
  html: string;
  extractedText: string | null;
}

export interface AccessClassification {
  accessState: AccessState;
  isComplete: boolean;
  indicators: string[];
}

const LOGIN_PATTERNS: readonly [RegExp, string][] = [
  [/\b(?:log|sign)\s+in\s+to\s+(?:continue|read|view)\b/i, "login prompt"],
  [/\bplease\s+(?:log|sign)\s+in\b/i, "login prompt"],
  [/\baccount\s+required\b/i, "account required"],
];

const PAYWALL_PATTERNS: readonly [RegExp, string][] = [
  [/\bsubscribe\s+to\s+(?:continue|read|unlock)\b/i, "subscription prompt"],
  [/\bsubscription\s+(?:is\s+)?required\b/i, "subscription required"],
  [/\b(?:this|the)\s+(?:article|content)\s+is\s+(?:only\s+)?for\s+subscribers\b/i, "subscriber-only notice"],
  [/\b(?:already\s+a\s+subscriber|become\s+a\s+(?:subscriber|member))\b/i, "subscriber prompt"],
  [/\b(?:class|id)=["'][^"']*(?:paywall|subscription-wall|meteredContent)[^"']*["']/i, "paywall markup"],
];

const TRUNCATION_PATTERNS: readonly [RegExp, string][] = [
  [/\bcontinue\s+reading\s+(?:this|the)\s+article\b/i, "continue-reading boundary"],
  [/\b(?:remaining|rest of (?:this|the))\s+(?:article|content)\b/i, "remaining-content notice"],
];

function matches(html: string, patterns: readonly [RegExp, string][]): string[] {
  const found: string[] = [];
  for (const [pattern, label] of patterns) {
    if (pattern.test(html)) found.push(label);
  }
  return found;
}

export function classifyAccess(signals: AccessSignals): AccessClassification {
  const { status, html, extractedText } = signals;
  if (status === 401) {
    return { accessState: "login_required", isComplete: false, indicators: ["HTTP 401"] };
  }

  const loginIndicators = matches(html, LOGIN_PATTERNS);
  if (loginIndicators.length > 0) {
    return { accessState: "login_required", isComplete: false, indicators: loginIndicators };
  }

  const paywallIndicators = matches(html, PAYWALL_PATTERNS);
  if (paywallIndicators.length > 0) {
    return { accessState: "paywall_detected", isComplete: false, indicators: paywallIndicators };
  }

  const truncationIndicators = matches(html, TRUNCATION_PATTERNS);
  if (truncationIndicators.length > 0) {
    return { accessState: "truncated", isComplete: false, indicators: truncationIndicators };
  }

  if (status === 403 || status === 429) {
    return { accessState: "error", isComplete: false, indicators: [`HTTP ${status}`] };
  }
  if (status < 200 || status >= 400) {
    return { accessState: "error", isComplete: false, indicators: [`HTTP ${status}`] };
  }
  if (!extractedText || extractedText.trim().length < 200) {
    return {
      accessState: "truncated",
      isComplete: false,
      indicators: ["insufficient extractable article text"],
    };
  }

  return { accessState: "accessible", isComplete: true, indicators: [] };
}
