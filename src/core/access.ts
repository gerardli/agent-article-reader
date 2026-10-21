import type { AccessState } from "./types.js";
import { detectRestrictedSignals } from "./restricted-signals.js";

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

/**
 * Classify accessibility and completeness based on HTTP signals only.
 * 
 * Key principles:
 * - `accessible` means no detected restrictions, NOT a guarantee of completeness
 * - `isComplete` requires explicit positive evidence, not just absence of restrictions
 * - For HTTP fetch, we cannot prove completeness without external metadata
 */
export function classifyAccess(signals: AccessSignals): AccessClassification {
  const { status, html, extractedText } = signals;
  if (status === 401) {
    return { accessState: "login_required", isComplete: false, indicators: ["HTTP 401"] };
  }

  const restricted = detectRestrictedSignals(`${html}\n${extractedText ?? ""}`);
  if (restricted) {
    const accessState: AccessState =
      restricted.kind === "login_required"
        ? "login_required"
        : restricted.kind === "subscription_required" || restricted.kind === "metered"
          ? "paywall_detected"
          : restricted.kind === "truncated"
            ? "truncated"
            : "error";
    return { accessState, isComplete: false, indicators: restricted.indicators };
  }

  if (status === 403 || status === 429) {
    return { accessState: "error", isComplete: false, indicators: [`HTTP ${status}`] };
  }
  if (status < 200 || status >= 400) {
    return { accessState: "error", isComplete: false, indicators: [`HTTP ${status}`] };
  }
  
  // Short or missing text is accessible but completeness unknown
  if (!extractedText || extractedText.trim().length < 100) {
    return {
      accessState: "accessible",
      isComplete: false,
      indicators: ["insufficient text to assess completeness"],
    };
  }

  // No restrictions detected and substantial text present
  // However, we cannot prove completeness without explicit signals
  return {
    accessState: "accessible",
    isComplete: false,
    indicators: ["no restrictions detected; completeness cannot be proven from HTTP alone"],
  };
}
