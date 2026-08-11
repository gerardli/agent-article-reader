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
  if (!extractedText || extractedText.trim().length < 200) {
    return {
      accessState: "truncated",
      isComplete: false,
      indicators: ["insufficient extractable article text"],
    };
  }

  return { accessState: "accessible", isComplete: true, indicators: [] };
}
