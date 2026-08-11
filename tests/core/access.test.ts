import { describe, expect, it } from "vitest";

import { classifyAccess } from "../../src/core/access.js";

describe("access classification", () => {
  it("classifies explicit login gates", () => {
    expect(
      classifyAccess({ status: 200, html: "Please sign in to continue", extractedText: "preview" }),
    ).toMatchObject({ accessState: "login_required", isComplete: false });
  });

  it("classifies explicit paywall notices", () => {
    expect(
      classifyAccess({
        status: 200,
        html: "Subscribe to continue reading this report",
        extractedText: "preview",
      }),
    ).toMatchObject({ accessState: "paywall_detected", isComplete: false });
  });

  it("classifies visible truncation boundaries", () => {
    expect(
      classifyAccess({
        status: 200,
        html: "Continue reading this article",
        extractedText: "preview",
      }),
    ).toMatchObject({ accessState: "truncated", isComplete: false });
  });

  it("does not claim complete access for tiny extracts", () => {
    expect(classifyAccess({ status: 200, html: "<article>x</article>", extractedText: "x" })).toEqual({
      accessState: "truncated",
      isComplete: false,
      indicators: ["insufficient extractable article text"],
    });
  });

  it("claims accessible only for substantive extraction without block signals", () => {
    expect(
      classifyAccess({ status: 200, html: "<article>open</article>", extractedText: "x".repeat(500) }),
    ).toEqual({ accessState: "accessible", isComplete: true, indicators: [] });
  });
});
