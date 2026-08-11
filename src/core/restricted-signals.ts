export type RestrictedSignalKind =
  | "captcha"
  | "login_required"
  | "subscription_required"
  | "metered"
  | "truncated";

interface RestrictedSignalRule {
  kind: RestrictedSignalKind;
  indicator: string;
  patterns: readonly RegExp[];
}

const RESTRICTED_SIGNAL_RULES: readonly RestrictedSignalRule[] = [
  {
    kind: "captcha",
    indicator: "human verification or CAPTCHA text is visible",
    patterns: [
      /verify\s+(?:that\s+)?you(?:\s+are|'re)\s+human/i,
      /complete\s+(?:the\s+)?security\s+check/i,
      /\bcaptcha\b/i,
      /checking\s+(?:if|whether)\s+(?:the\s+)?site\s+connection\s+is\s+secure/i,
      /(?:请完成|需要)(?:安全|人机)?验证/,
      /验证码/,
    ],
  },
  {
    kind: "login_required",
    indicator: "login or registration requirement is visible",
    patterns: [
      /\b(?:log|sign)\s+in\s+to\s+(?:continue|read|view)\b/i,
      /\bplease\s+(?:log|sign)\s+in\b/i,
      /\baccount\s+required\b/i,
      /\bcreate\s+an\s+account\s+(?:to|or\s+sign\s+in)/i,
      /\bregister\s+to\s+(?:keep|continue|start)\s+(?:reading|to\s+read)\b/i,
      /登录后(?:继续|阅读|查看)/,
      /请先登录/,
      /注册后(?:继续|阅读|查看)/,
    ],
  },
  {
    kind: "subscription_required",
    indicator: "subscription requirement is visible",
    patterns: [
      /\bsubscribe\s+to\s+(?:continue|read|unlock)\b/i,
      /\bsubscription\s+(?:is\s+)?required\b/i,
      /\b(?:this|the)\s+(?:article|content)\s+is\s+(?:only\s+)?for\s+subscribers\b/i,
      /\bsubscribers?\s+only\b/i,
      /\bunlock\s+(?:this|the)\s+(?:article|story)\b/i,
      /\b(?:already\s+a\s+subscriber|become\s+a\s+(?:subscriber|member))\b/i,
      /\b(?:class|id)=["'][^"']*(?:paywall|subscription-wall|meteredContent)[^"']*["']/i,
      /订阅后(?:继续|阅读|查看)/,
      /仅限订阅用户/,
    ],
  },
  {
    kind: "metered",
    indicator: "meter or article-limit message is visible",
    patterns: [
      /\b(?:have\s+)?reached\s+your\s+(?:(?:free\s+)?article|free\s+reading)\s+limit\b/i,
      /\b(?:used|read)\s+all\s+(?:of\s+)?your\s+(?:free\s+)?(?:articles?|reads?)\b/i,
      /\b(?:no|0)\s+(?:free\s+)?(?:articles?|reads?)\s+remaining\b/i,
      /\bmonthly\s+(?:article|reading)\s+limit\b/i,
      /本月(?:免费)?阅读.*(?:上限|次数)/,
      /免费阅读次数.*(?:用完|上限)/,
    ],
  },
  {
    kind: "truncated",
    indicator: "visible text indicates that article content is truncated",
    patterns: [
      /\bcontinue\s+reading\s+(?:this|the)\s+article\b/i,
      /\bcontinue\s+reading\s+(?:with|by)\s+(?:a\s+)?(?:subscription|membership)\b/i,
      /\bthe\s+rest\s+of\s+(?:this|the)\s+(?:article|story|content)\s+is\b/i,
      /\b(?:remaining|rest\s+of\s+(?:this|the))\s+(?:article|content)\b/i,
      /全文.*(?:订阅|会员).*阅读/,
      /剩余内容.*(?:订阅|会员)/,
    ],
  },
];

export interface RestrictedSignalDetection {
  kind: RestrictedSignalKind;
  indicators: string[];
}

export function detectRestrictedSignals(input: string): RestrictedSignalDetection | null {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  for (const rule of RESTRICTED_SIGNAL_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return { kind: rule.kind, indicators: [rule.indicator] };
    }
  }
  return null;
}
