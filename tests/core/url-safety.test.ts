import { describe, expect, it, vi } from "vitest";

import { ReaderError } from "../../src/core/errors.js";
import {
  isPublicIp,
  resolvePublicHttpUrl,
  validatePublicHttpUrl,
} from "../../src/core/url-safety.js";

const publicDns = async () => ["93.184.216.34"];

describe("URL safety", () => {
  it.each([
    "http://localhost/article",
    "http://sub.localhost/article",
    "http://127.0.0.1/article",
    "http://10.0.0.2/article",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/article",
    "http://[fc00::1]/article",
    "http://metadata.google.internal/",
  ])("blocks local and special target %s", async (url) => {
    await expect(validatePublicHttpUrl(url, publicDns)).rejects.toMatchObject<Partial<ReaderError>>({
      code: "UNSAFE_TARGET",
    });
  });

  it.each(["file:///etc/passwd", "ftp://example.com/file", "data:text/plain,hello"])(
    "blocks non-HTTP URL %s",
    async (url) => {
      await expect(validatePublicHttpUrl(url, publicDns)).rejects.toMatchObject({
        code: "INVALID_URL",
      });
    },
  );

  it("blocks credentials embedded in a URL", async () => {
    await expect(validatePublicHttpUrl("https://user:pass@example.com", publicDns)).rejects.toMatchObject({
      code: "INVALID_URL",
    });
  });

  it("blocks a hostname when any DNS result is private", async () => {
    const resolver = vi.fn(async () => ["93.184.216.34", "10.0.0.5"]);
    await expect(validatePublicHttpUrl("https://example.com", resolver)).rejects.toMatchObject({
      code: "UNSAFE_TARGET",
    });
  });

  it("allows a public HTTP URL after DNS validation", async () => {
    const result = await validatePublicHttpUrl("https://example.com/article", publicDns);
    expect(result.href).toBe("https://example.com/article");
  });

  it("returns the public addresses that a transport must pin", async () => {
    const result = await resolvePublicHttpUrl("https://example.com/article", async () => [
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]);
    expect(result.addresses).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("recognizes only globally routable unicast addresses", () => {
    expect(isPublicIp("93.184.216.34")).toBe(true);
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("192.168.1.1")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
  });
});
