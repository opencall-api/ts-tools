# Changelog

## 0.1.0 — 2026-04-27

Initial release. The thin OpenCALL client + codegen.

### Added
- `call()` — single-function `POST /call` with envelope construction, ctx merging, optional Bearer token (static or function), optional response validation.
- `callAndWait()` — polling helper for async (`accepted`/`pending`) responses, honours `retryAfterMs`, configurable `maxWaitMs`.
- `retrieveChunked()` — pulls server-driven chunked results, validates each chunk's sha256 hash and the chain of `checksumPrevious` links.
- `subscribeStream()` — performs the subscribe call and returns the typed `StreamDescriptor` (`transport`, `encoding`, `schema`, `location`, `sessionId`, optional `auth`); connection itself is the caller's responsibility.
- `generateClientTypes()` — library function emitting TypeScript declarations from a `RegistryResponse`.
- `opencall-codegen` CLI — reads registry URL or local JSON, writes a `.d.ts`.
