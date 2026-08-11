import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

import type {
  BrowserSnapshot,
  HostAddressResolver,
  NavigationPhase,
  NavigationSafetyHook,
} from "./types.js";

const ALLOWED_CDP_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
const ALLOWED_PAGE_PROTOCOLS = new Set(["http:", "https:"]);

export class BrowserSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserSafetyError";
  }
}

export function assertSafeCdpEndpoint(
  endpoint: string,
  allowNonLoopbackEndpoint = false,
): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new BrowserSafetyError("CDP endpoint must be an absolute URL");
  }

  if (!ALLOWED_CDP_PROTOCOLS.has(parsed.protocol)) {
    throw new BrowserSafetyError("CDP endpoint must use HTTP(S) or WS(S)");
  }
  if (parsed.username || parsed.password) {
    throw new BrowserSafetyError("CDP endpoint must not contain credentials");
  }
  if (!parsed.port) {
    throw new BrowserSafetyError("CDP endpoint must include an explicit port");
  }

  if (!allowNonLoopbackEndpoint && !isLiteralLoopbackHost(parsed.hostname)) {
    throw new BrowserSafetyError(
      "CDP endpoint is not literal localhost/loopback; set allowNonLoopbackEndpoint explicitly",
    );
  }
  return parsed;
}

export async function resolvePublicAddresses(hostname: string): Promise<readonly string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address }) => address);
}

export async function assertPublicHttpUrl(
  input: string | URL,
  resolveHostname: HostAddressResolver = resolvePublicAddresses,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = input instanceof URL ? input : new URL(input);
  } catch {
    throw new BrowserSafetyError("Navigation target must be an absolute URL");
  }

  if (!ALLOWED_PAGE_PROTOCOLS.has(parsed.protocol)) {
    throw new BrowserSafetyError("Navigation target must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new BrowserSafetyError("Navigation target must not contain credentials");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new BrowserSafetyError("Local navigation targets are blocked");
  }

  const addresses = isIP(stripIpv6Brackets(hostname))
    ? [stripIpv6Brackets(hostname)]
    : await resolveHostname(hostname).catch(() => []);

  if (addresses.length === 0) {
    throw new BrowserSafetyError("Navigation target did not resolve to a public address");
  }
  for (const address of addresses) {
    if (!isPublicAddress(address)) {
      throw new BrowserSafetyError("Private, loopback, and link-local navigation targets are blocked");
    }
  }
  return parsed;
}

export function createNavigationGuard(options: {
  resolveHostname?: HostAddressResolver;
  hook?: NavigationSafetyHook;
  browserSession: BrowserSnapshot["provenance"]["browserSession"];
}): (url: string, phase: NavigationPhase) => Promise<URL> {
  const resolver = options.resolveHostname ?? resolvePublicAddresses;
  const resolutions = new Map<string, Promise<readonly string[]>>();
  const resolveOnce: HostAddressResolver = (hostname) => {
    const cached = resolutions.get(hostname);
    if (cached) return cached;
    const pending = resolver(hostname);
    resolutions.set(hostname, pending);
    return pending;
  };
  return async (url, phase) => {
    const parsed = await assertPublicHttpUrl(url, resolveOnce);
    await options.hook?.(parsed, { phase, browserSession: options.browserSession });
    return parsed;
  };
}

function isLiteralLoopbackHost(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname.toLowerCase());
  if (normalized === "localhost") return true;
  if (!isIP(normalized)) return false;

  try {
    const address = ipaddr.parse(normalized);
    return address.range() === "loopback";
  } catch {
    return false;
  }
}

function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(stripIpv6Brackets(address));
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}
