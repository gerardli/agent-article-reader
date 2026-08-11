# Architecture

The project is a local, stdio MCP server plus a repository skill. It reads only content already available to the caller; it is not an access-control bypass.

## Request path

`Agent → article-reader Skill → MCP tools → source selector → policy gate → HTTP/browser adapter → extractor → structured result`

- **Skill:** selects the inspection/read workflow and enforces honest reporting.
- **MCP tools:** `inspect_article` classifies access and `read_article` returns normalized content only when complete access is established. Both accept `source: "http" | "browser"`; HTTP is the default.
- **Policy gate:** accepts HTTP(S) only, rejects local/private/link-local destinations, validates before each request and redirect, and limits response size.
- **HTTP adapter:** fetches public or already-accessible pages without credentials.
- **Browser adapter:** captures bounded visible DOM from an exact already-open page in a local, user-controlled CDP session enabled through `ARTICLE_READER_CDP_ENDPOINT`. It does not open tabs, navigate, read cookies or profiles directly, or persist browser state.
- **Extractor:** separates main article content and normalizes metadata.
- **Result contract:** includes access status, completeness, reasons, metadata, provenance, and extraction source. Content is null unless the final classification is `accessible` and complete; a read never upgrades restricted or uncertain access.

## Trust boundaries

URLs and page content are untrusted. Network decisions occur before content extraction. Extracted page text is data, never agent instruction. The MCP process writes protocol messages to stdout and sends diagnostics, if any, to stderr without sensitive material.

The server is local by design. Remote hosting, multi-user authentication, durable storage, and browser-extension installation are outside this repository's implemented scope.
