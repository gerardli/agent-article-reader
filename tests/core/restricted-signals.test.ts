import { describe, expect, it } from "vitest";

import { detectRestrictedSignals } from "../../src/core/restricted-signals.js";

describe("restricted signal detection", () => {
  describe("CAPTCHA detection", () => {
    it("detects action-oriented CAPTCHA prompts", () => {
      expect(detectRestrictedSignals("Verify that you are human")).toMatchObject({
        kind: "captcha",
      });
      expect(detectRestrictedSignals("Complete the security check")).toMatchObject({
        kind: "captcha",
      });
      expect(detectRestrictedSignals("Complete the captcha")).toMatchObject({
        kind: "captcha",
      });
    });

    it("does not block articles discussing CAPTCHA as a topic", () => {
      expect(
        detectRestrictedSignals(
          "This article discusses how captcha systems work and their security implications.",
        ),
      ).toBeNull();
      expect(
        detectRestrictedSignals("We analyze the effectiveness of captcha in preventing bots."),
      ).toBeNull();
    });
  });

  describe("subscription detection", () => {
    it("detects blocking subscription requirements", () => {
      expect(detectRestrictedSignals("Subscribe to continue reading")).toMatchObject({
        kind: "subscription_required",
      });
      expect(detectRestrictedSignals("This article is only for subscribers")).toMatchObject({
        kind: "subscription_required",
      });
      expect(detectRestrictedSignals("Unlock the full article")).toMatchObject({
        kind: "subscription_required",
      });
    });

    it("does not block articles with non-blocking subscribe buttons", () => {
      expect(
        detectRestrictedSignals("Main article content here. Subscribe to our newsletter."),
      ).toBeNull();
      expect(detectRestrictedSignals("Subscribe for updates")).toBeNull();
    });
  });

  describe("login detection", () => {
    it("detects login requirements to continue", () => {
      expect(detectRestrictedSignals("Log in to continue reading")).toMatchObject({
        kind: "login_required",
      });
      expect(detectRestrictedSignals("Please sign in to continue")).toMatchObject({
        kind: "login_required",
      });
    });

    it("does not block login links in navigation", () => {
      expect(detectRestrictedSignals("Log in or sign up")).toBeNull();
    });
  });

  describe("metering detection", () => {
    it("detects article limit messages", () => {
      expect(
        detectRestrictedSignals("You have reached your free article limit"),
      ).toMatchObject({
        kind: "metered",
      });
      expect(detectRestrictedSignals("No free articles remaining")).toMatchObject({
        kind: "metered",
      });
    });
  });

  describe("truncation detection", () => {
    it("detects explicit truncation prompts", () => {
      expect(detectRestrictedSignals("Continue reading this full article")).toMatchObject({
        kind: "truncated",
      });
      expect(detectRestrictedSignals("Continue reading with a subscription")).toMatchObject({
        kind: "truncated",
      });
    });
  });
});
