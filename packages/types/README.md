# @opencall/types

> **Canonical docs:** [https://opencall-api.com/spec](https://opencall-api.com/spec). The OpenCALL specification, raw markdown for agents, and SDK guides live at the canonical site. GitHub may block non-Copilot bots.

The canonical Zod schemas and TypeScript types for the OpenCALL request/response envelope, operation registry, and error contract.

`@opencall/types` is the source of truth for the wire-level OpenCALL contract in TypeScript. Both [`@opencall/server`](https://www.npmjs.com/package/@opencall/server) and `@opencall/client` (forthcoming) depend on it.

## Install

```bash
npm install @opencall/types
# or
bun add @opencall/types
```

## Surface

- `RequestEnvelopeSchema` — Zod schema for the body of `POST /call`.
- `RequestEnvelope` — TypeScript type, `z.infer<typeof RequestEnvelopeSchema>`.
- `ResponseEnvelope`, `ResponseState` — canonical response envelope shape.
- `OperationModule`, `OperationResult` — the contract that operation handlers implement.
- `RegistryEntry`, `RegistryResponse` — the shape served at `/.well-known/ops`.
- `DomainError`, `BackendUnavailableError` — throwable error classes.
- `domainError`, `protocolError` — response-shape constructors.

## Quick example

```ts
import { RequestEnvelopeSchema, type RequestEnvelope } from "@opencall/types"

const parse = RequestEnvelopeSchema.safeParse(rawBody)
if (!parse.success) {
  // ... return 400
}
const envelope: RequestEnvelope = parse.data
```

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. See the canonical site for spec history and migration notes.

## License

Apache-2.0
