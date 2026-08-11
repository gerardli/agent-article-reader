import { detectRestrictedSignals } from "../core/restricted-signals.js";
import type { BrowserAccessReason, BrowserAccessState } from "./types.js";

export function detectBrowserAccessState(visibleText: string): BrowserAccessState {
  const normalized = visibleText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {
      status: "uncertain",
      reason: "uncertain",
      indicators: ["page has no visible text"],
      completeness: "unknown",
    };
  }

  const restricted = detectRestrictedSignals(normalized);
  if (restricted) {
    return {
      status: "restricted",
      reason: restricted.kind,
      indicators: restricted.indicators,
      completeness: "partial",
    };
  }

  return {
    status: "available",
    reason: "none_detected",
    indicators: [],
    completeness: "unknown",
  };
}
