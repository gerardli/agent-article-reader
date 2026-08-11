import { describe, expect, it } from "vitest";

import { detectBrowserAccessState } from "../../src/browser/index.js";

describe("visible access-state hints", () => {
  it.each([
    ["Verify that you are human before continuing", "captcha"],
    ["Sign in to continue reading", "login_required"],
    ["Subscribe to unlock this article", "subscription_required"],
    ["You have reached your free article limit", "metered"],
    ["The rest of this article is available to members", "truncated"],
    ["请先登录，然后阅读文章", "login_required"],
  ])("detects %s", (visibleText, reason) => {
    const state = detectBrowserAccessState(visibleText);
    expect(state).toMatchObject({
      status: "restricted",
      reason,
      completeness: "partial",
    });
    expect(state.indicators.length).toBeGreaterThan(0);
  });

  it("never claims complete content even when no restriction is visible", () => {
    expect(detectBrowserAccessState("A normal visible article paragraph.")).toEqual({
      status: "available",
      reason: "none_detected",
      indicators: [],
      completeness: "unknown",
    });
  });

  it("marks an empty visible DOM as uncertain", () => {
    expect(detectBrowserAccessState("  \n ")).toMatchObject({
      status: "uncertain",
      reason: "uncertain",
      completeness: "unknown",
    });
  });
});
