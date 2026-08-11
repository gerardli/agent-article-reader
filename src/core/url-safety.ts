import { lookup } from "node:dns/promises";

import ipaddr from "ipaddr.js";

import { ReaderError } from "./errors.js";

export type DnsResolver = (hostname: string) => Promise<readonly string[]>;

export interface PublicAddress {
  address: string;
  family: 4 | 6;
}

export interface PublicUrlResolution {
  url: URL;
  addresses: readonly PublicAddress[];
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.aws.internal",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal"];

export const defaultDnsResolver: DnsResolver = async (hostname) => {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch (error) {
    throw new ReaderError("DNS_LOOKUP_FAILED", "The target hostname could not be resolved.", {
      cause: error,
    });
  }
};

function normalizeIpLiteral(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  return parsed.range() === "unicast";
}

function assertPublicAddress(address: string): void {
  if (!isPublicIp(address)) {
    throw new ReaderError("UNSAFE_TARGET", "The target resolves to a non-public network address.");
  }
}

function publicAddress(address: string): PublicAddress {
  assertPublicAddress(address);
  const parsed = ipaddr.process(address);
  return { address: parsed.toString(), family: parsed.kind() === "ipv4" ? 4 : 6 };
}

export async function resolvePublicHttpUrl(
  input: string | URL,
  resolver: DnsResolver = defaultDnsResolver,
): Promise<PublicUrlResolution> {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch (error) {
    throw new ReaderError("INVALID_URL", "A valid absolute URL is required.", { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ReaderError("INVALID_URL", "Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) {
    throw new ReaderError("INVALID_URL", "URLs containing credentials are not supported.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname.length === 0 ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new ReaderError("UNSAFE_TARGET", "The target hostname is not allowed.");
  }

  const possibleIp = normalizeIpLiteral(hostname);
  if (ipaddr.isValid(possibleIp)) {
    return { url, addresses: [publicAddress(possibleIp)] };
  }

  const addresses = await resolver(hostname);
  if (addresses.length === 0) {
    throw new ReaderError("DNS_LOOKUP_FAILED", "The target hostname has no address records.");
  }
  return { url, addresses: addresses.map(publicAddress) };
}

export async function validatePublicHttpUrl(
  input: string | URL,
  resolver: DnsResolver = defaultDnsResolver,
): Promise<URL> {
  return (await resolvePublicHttpUrl(input, resolver)).url;
}
