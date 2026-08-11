import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";

import { ReaderError, asReaderError } from "./errors.js";
import {
  defaultDnsResolver,
  resolvePublicHttpUrl,
  type DnsResolver,
  type PublicAddress,
} from "./url-safety.js";

export interface BoundedFetchOptions {
  fetchImpl?: typeof fetch;
  dnsResolver?: DnsResolver;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  bytesReceived: number;
  redirectChain: string[];
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml"]);

function lookupError(message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = "EAI_FAIL";
  return error;
}

/**
 * Supplies only the already-validated addresses to Node's socket connection.
 * Keeping the original URL hostname preserves Host, TLS SNI, and certificate checks.
 */
export function createPinnedLookup(
  expectedHostname: string,
  addresses: readonly PublicAddress[],
): LookupFunction {
  const normalizedExpected = expectedHostname.toLowerCase().replace(/\.$/, "");
  return (hostname, options, callback) => {
    if (hostname.toLowerCase().replace(/\.$/, "") !== normalizedExpected) {
      callback(lookupError("The transport requested an unexpected hostname."), "", 0);
      return;
    }
    const requestedFamily = options.family === 4 || options.family === 6 ? options.family : 0;
    const matching = requestedFamily === 0
      ? addresses
      : addresses.filter(({ family }) => family === requestedFamily);
    if (matching.length === 0) {
      callback(lookupError("No validated address matches the requested network family."), "", 0);
      return;
    }
    if (options.all) {
      callback(null, matching.map(({ address, family }) => ({ address, family })));
      return;
    }
    const selected = matching[0]!;
    callback(null, selected.address, selected.family);
  };
}

async function pinnedHttpFetch(
  url: URL,
  addresses: readonly PublicAddress[],
  signal: AbortSignal,
): Promise<Response> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          accept: "text/html, application/xhtml+xml;q=0.9",
          "accept-encoding": "identity",
        },
        lookup: createPinnedLookup(url.hostname, addresses),
        signal,
        maxHeaderSize: 64 * 1024,
      },
      (incoming) => {
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          const name = incoming.rawHeaders[index];
          const value = incoming.rawHeaders[index + 1];
          if (name !== undefined && value !== undefined) headers.append(name, value);
        }
        const status = incoming.statusCode ?? 500;
        const hasNoBody = status === 204 || status === 205 || status === 304;
        const body = hasNoBody
          ? null
          : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
        try {
          resolve(new Response(body, {
            status,
            statusText: incoming.statusMessage ?? "",
            headers,
          }));
        } catch (error) {
          incoming.destroy();
          reject(error);
        }
      },
    );
    req.once("error", reject);
    req.end();
  });
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await response.body?.cancel();
      throw new ReaderError("RESPONSE_TOO_LARGE", "The response exceeds the configured size limit.");
    }
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ReaderError("RESPONSE_TOO_LARGE", "The response exceeds the configured size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function mediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

export async function boundedFetchHtml(
  inputUrl: string,
  options: BoundedFetchOptions = {},
): Promise<FetchedPage> {
  const resolver = options.dnsResolver ?? defaultDnsResolver;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;

  if (timeoutMs < 1 || maxBytes < 1 || maxRedirects < 0 || maxRedirects > 10) {
    throw new ReaderError("FETCH_FAILED", "Invalid fetch limits.");
  }

  const initialResolution = await resolvePublicHttpUrl(inputUrl, resolver);
  const requested = initialResolution.url;
  let currentResolution = initialResolution;
  const redirectChain: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let redirects = 0; ; redirects += 1) {
      const current = currentResolution.url;
      let response: Response;
      try {
        response = options.fetchImpl
          ? await options.fetchImpl(current, {
              method: "GET",
              redirect: "manual",
              signal: controller.signal,
              headers: {
                accept: "text/html, application/xhtml+xml;q=0.9",
              },
            })
          : await pinnedHttpFetch(current, currentResolution.addresses, controller.signal);
      } catch (error) {
        throw asReaderError(error);
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel();
        if (redirects >= maxRedirects) {
          throw new ReaderError("TOO_MANY_REDIRECTS", "The page exceeded the redirect limit.");
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new ReaderError("INVALID_REDIRECT", "The redirect response has no destination.");
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch (error) {
          throw new ReaderError("INVALID_REDIRECT", "The redirect destination is invalid.", {
            cause: error,
          });
        }
        currentResolution = await resolvePublicHttpUrl(next, resolver);
        redirectChain.push(currentResolution.url.href);
        continue;
      }

      const contentType = mediaType(response);
      if (!HTML_CONTENT_TYPES.has(contentType)) {
        await response.body?.cancel();
        throw new ReaderError(
          "UNSUPPORTED_CONTENT_TYPE",
          `Unsupported response content type: ${contentType || "unknown"}.`,
        );
      }
      const bytes = await readBoundedBody(response, maxBytes);
      return {
        requestedUrl: requested.href,
        finalUrl: current.href,
        status: response.status,
        contentType,
        html: new TextDecoder().decode(bytes),
        bytesReceived: bytes.byteLength,
        redirectChain,
      };
    }
  } catch (error) {
    throw asReaderError(error);
  } finally {
    clearTimeout(timer);
  }
}
