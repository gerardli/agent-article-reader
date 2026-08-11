import { describe, expect, it } from "vitest";

import {
  assertPublicHttpUrl,
  assertSafeCdpEndpoint,
  BrowserSafetyError,
} from "../../src/browser/index.js";

describe("browser endpoint safety", () => {
  it("allows literal loopback CDP endpoints by default", () => {
    expect(assertSafeCdpEndpoint("http://127.0.0.1:9222").hostname).toBe("127.0.0.1");
    expect(assertSafeCdpEndpoint("ws://[::1]:9222/devtools/browser/id").port).toBe("9222");
  });

  it("rejects non-loopback CDP endpoints without an override", () => {
    expect(() => assertSafeCdpEndpoint("https://browser.example:9222")).toThrow(/loopback/);
  });

  it("rejects credentials and missing explicit ports", () => {
    expect(() => assertSafeCdpEndpoint("http://user:secret@localhost:9222")).toThrow(
      /credentials/,
    );
    expect(() => assertSafeCdpEndpoint("http://localhost")).toThrow(/explicit port/);
  });
});

describe("browser page target safety", () => {
  it("accepts only HTTP(S) targets resolving entirely to public addresses", async () => {
    const result = await assertPublicHttpUrl(
      "https://example.com/article",
      async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
    );
    expect(result.href).toBe("https://example.com/article");
  });

  it.each([
    ["http://localhost:3000/article", ["127.0.0.1"]],
    ["http://127.0.0.1/article", ["127.0.0.1"]],
    ["http://10.1.2.3/article", ["10.1.2.3"]],
    ["http://169.254.169.254/latest/meta-data", ["169.254.169.254"]],
    ["http://[::1]/article", ["::1"]],
  ])("blocks local/private target %s", async (target, addresses) => {
    await expect(assertPublicHttpUrl(target, async () => addresses)).rejects.toBeInstanceOf(
      BrowserSafetyError,
    );
  });

  it("blocks DNS answers containing any private address", async () => {
    await expect(
      assertPublicHttpUrl("https://mixed.example/article", async () => [
        "93.184.216.34",
        "192.168.1.10",
      ]),
    ).rejects.toThrow(/Private/);
  });

  it("defaults to deny when DNS resolution fails", async () => {
    await expect(
      assertPublicHttpUrl("https://missing.example/article", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow(/did not resolve/);
  });
});
