# Changelog

## 0.1.3 — 2026-05-01

### Changed
- `RegistryEntry` and `RegistryResponse` now match the current OpenCALL spec shape. The registry includes `schemaHash`, `endpoints`, optional `errorsUrl`, and structured `sync`, `idempotency`, `cache`, `telemetry`, and `stream` blocks instead of the earlier flattened metadata fields.

### Added
- Registry helper types for the structured spec fields: `RegistryEndpoint`, `SyncPolicy`, `IdempotencyPolicy`, `CachePolicy`, `TelemetryPolicy`, `StreamPolicy`, and `MediaSchemaEntry`.

## 0.1.2 — 2026-04-27

### Changed
- `RequestEnvelopeSchema.ctx.requestId` is now optional. Per the OpenCALL spec, the server is responsible for generating a `requestId` if the client omits it. The schema previously required it whenever `ctx` was present, which rejected legitimate spec-conformant envelopes.

### Added
- `OperationResult.state` now allows `"streaming"`. Streaming-subscription handlers can return a streaming result through `OperationModule`; `@opencall/server@0.2.1`'s `formatResponse` maps this to a 202 response with the populated `stream` field on the response envelope.
- `OperationResult.stream?: StreamDescriptor` field, populated when `state === "streaming"`.

### Docs
- README banner and `homepage` now point at `https://opencall-api.com` (the human-readable docs landing). The `/spec` path is reserved for raw markdown that AI agents fetch directly.

## 0.1.1 — 2026-04-27

### Added
- `StreamDescriptor` interface and `ResponseEnvelope.stream?: StreamDescriptor` field. Models the streaming subscription response shape that the spec already documents on the wire.

## 0.1.0 — 2026-04-27

Initial release. Extracted from the previously-private `@opencall/ts-tools` codebase.

- `RequestEnvelopeSchema` (Zod) and `RequestEnvelope` (`z.infer`) with `op`, `args`, `ctx` (including `requestId`, `sessionId`, `parentId`, `idempotencyKey`, `timeoutMs`, `locale`, `traceparent`), `auth`, and `media`.
- `ResponseEnvelope` with `state`, `result`, `error`, `location`, `retryAfterMs`, `expiresAt`, and `meta`.
- `OperationModule` (with `requiresAuth`), `OperationResult`, `RegistryEntry`, `RegistryResponse`.
- `DomainError`, `BackendUnavailableError` classes; `domainError`, `protocolError` constructors.
