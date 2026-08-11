export type ReaderErrorCode =
  | "INVALID_URL"
  | "UNSAFE_TARGET"
  | "DNS_LOOKUP_FAILED"
  | "TOO_MANY_REDIRECTS"
  | "INVALID_REDIRECT"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "FETCH_FAILED"
  | "EXTRACTION_FAILED";

export class ReaderError extends Error {
  constructor(
    public readonly code: ReaderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReaderError";
  }
}

export function asReaderError(error: unknown): ReaderError {
  if (error instanceof ReaderError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new ReaderError("TIMEOUT", "The request exceeded the configured time limit.", {
      cause: error,
    });
  }
  return new ReaderError("FETCH_FAILED", "The page could not be fetched.", {
    cause: error,
  });
}
