# Changelog

## 0.1.2 — 2026-05-01

### Changed
- `generateClientTypes()` and the server-side codegen now tolerate registry entries whose `resultSchema` is omitted for streaming operations under the current spec.
- Bumped `@opencall/types` dep from `^0.1.2` to `^0.1.3` to consume the structured registry contract types.

## 0.1.1 — 2026-04-27

### Changed
- Bumped `@opencall/types` dep from `^0.1.1` to `^0.1.2` (picks up the relaxed `ctx.requestId` schema and the streaming `OperationResult` shape).

### Docs
- README banner and `homepage` now point at `https://opencall-api.com` (the human-readable docs landing). The `/spec` path is reserved for raw markdown that AI agents fetch directly.

## 0.1.0 — 2026-04-27

Initial release. The thin OpenCALL client + codegen.

### Added
- `call()` — single-function `POST /call` with envelope construction, ctx merging, optional Bearer token (static or function), optional response validation.
- `callAndWait()` — polling helper for async (`accepted`/`pending`) responses, honours `retryAfterMs`, configurable `maxWaitMs`.
- `retrieveChunked()` — pulls server-driven chunked results, validates each chunk's sha256 hash and the chain of `checksumPrevious` links.
- `subscribeStream()` — performs the subscribe call and returns the typed `StreamDescriptor` (`transport`, `encoding`, `schema`, `location`, `sessionId`, optional `auth`); connection itself is the caller's responsibility.
- `generateClientTypes()` — library function emitting TypeScript declarations from a `RegistryResponse`.
- `opencall-codegen` CLI — reads registry URL or local JSON, writes a `.d.ts`.
