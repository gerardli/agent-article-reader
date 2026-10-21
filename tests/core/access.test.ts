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
        html: "Continue reading this full article",
        extractedText: "preview",
      }),
    ).toMatchObject({ accessState: "truncated", isComplete: false });
  });

  it("does not claim complete for very short extracts", () => {
    const result = classifyAccess({ 
      status: 200, 
      html: "<article>x</article>", 
      extractedText: "x" 
    });
    expect(result.accessState).toBe("accessible");
    expect(result.isComplete).toBe(false);
    expect(result.indicators).toContain("insufficient text to assess completeness");
  });

  it("returns accessible but incomplete for substantial text without proof of completeness", () => {
    const result = classifyAccess({ 
      status: 200, 
      html: "<article>open</article>", 
      extractedText: "x".repeat(500) 
    });
    expect(result.accessState).toBe("accessible");
    expect(result.isComplete).toBe(false);
    expect(result.indicators[0]).toMatch(/completeness cannot be proven/);
  });

  describe("regression: false positive prevention", () => {
    it("does not block articles discussing CAPTCHA as a topic", () => {
      const result = classifyAccess({
        status: 200,
        html: "<p>This article discusses how captcha systems work and their security implications.</p>",
        extractedText: "This article discusses how captcha systems work and their security implications. ".repeat(5),
      });
      expect(result.accessState).toBe("accessible");
    });

    it("does not block articles with subscribe buttons in sidebar", () => {
      const result = classifyAccess({
        status: 200,
        html: `
          <article>Main content here</article>
          <aside>Subscribe to our newsletter</aside>
        `,
        extractedText: "Main content here. ".repeat(20),
      });
      expect(result.accessState).toBe("accessible");
    });

    it("blocks when subscription is required to continue reading", () => {
      const result = classifyAccess({
        status: 200,
        html: "Subscribe to continue reading",
        extractedText: "Preview text",
      });
      expect(result.accessState).toBe("paywall_detected");
    });

    it("distinguishes complete short articles from truncated content", () => {
      const shortComplete = classifyAccess({
        status: 200,
        html: "<article>A brief but complete news update.</article>",
        extractedText: "A brief but complete news update.",
      });
      expect(shortComplete.accessState).toBe("accessible");
      expect(shortComplete.isComplete).toBe(false);
      expect(shortComplete.indicators[0]).not.toMatch(/truncated/);
    });
  });
});
