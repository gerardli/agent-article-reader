import type { BrowserAccessReason, BrowserAccessState } from "./types.js";

interface SignalRule {
  reason: Exclude<BrowserAccessReason, "none_detected" | "uncertain">;
  patterns: readonly RegExp[];
  indicators: readonly string[];
}

const SIGNAL_RULES: readonly SignalRule[] = [
  {
    reason: "captcha",
    patterns: [
      /verify (?:that )?you are human/i,
      /complete the security check/i,
      /captcha/i,
      /checking (?:if|whether) (?:the )?site connection is secure/i,
    ],
    indicators: ["human verification or CAPTCHA text is visible"],
  },
  {
    reason: "login_required",
    patterns: [
      /(?:sign|log) in to (?:continue|read|view)/i,
      /create an account (?:to|or sign in)/i,
      /登录后(?:继续|阅读|查看)/,
      /请先登录/,
    ],
    indicators: ["login requirement is visible"],
  },
  {
    reason: "subscription_required",
    patterns: [
      /subscribe to (?:continue|read|unlock)/i,
      /subscriber(?:s)? only/i,
      /unlock (?:this|the) (?:article|story)/i,
      /订阅后(?:继续|阅读|查看)/,
      /仅限订阅用户/,
    ],
    indicators: ["subscription requirement is visible"],
  },
  {
    reason: "metered",
    patterns: [
      /(?:reached|used) (?:your|the) (?:(?:free )?article|free reading) limit/i,
      /(?:articles?|reads?) remaining/i,
      /monthly limit/i,
      /本月(?:免费)?阅读.*(?:上限|次数)/,
      /免费阅读次数.*(?:用完|上限)/,
    ],
    indicators: ["meter or article-limit message is visible"],
  },
  {
    reason: "truncated",
    patterns: [
      /continue reading (?:with|by) (?:a )?(?:subscription|membership)/i,
      /the rest of this (?:article|story) is/i,
      /全文.*(?:订阅|会员).*阅读/,
      /剩余内容.*(?:订阅|会员)/,
    ],
    indicators: ["visible text indicates that article content is truncated"],
  },
];

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

  for (const rule of SIGNAL_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        status: "restricted",
        reason: rule.reason,
        indicators: [...rule.indicators],
        completeness: "partial",
      };
    }
  }

  return {
    status: "available",
    reason: "none_detected",
    indicators: [],
    completeness: "unknown",
  };
}
