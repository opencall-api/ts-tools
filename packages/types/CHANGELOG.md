# Changelog

## 0.1.0 — 2026-04-27

Initial release. Extracted from the previously-private `@opencall/ts-tools` codebase.

- `RequestEnvelopeSchema` (Zod) and `RequestEnvelope` (`z.infer`) with `op`, `args`, `ctx` (including `requestId`, `sessionId`, `parentId`, `idempotencyKey`, `timeoutMs`, `locale`, `traceparent`), `auth`, and `media`.
- `ResponseEnvelope` with `state`, `result`, `error`, `location`, `retryAfterMs`, `expiresAt`, and `meta`.
- `OperationModule` (with `requiresAuth`), `OperationResult`, `RegistryEntry`, `RegistryResponse`.
- `DomainError`, `BackendUnavailableError` classes; `domainError`, `protocolError` constructors.
