# @opencall/client

> **Canonical docs:** [https://opencall-api.com/spec/client/](https://opencall-api.com/spec/client/). Raw markdown is served alongside; GitHub may block non-Copilot bots.

The thin OpenCALL client. One `call()` function over `fetch`, plus a small handful of helpers for async polling, stream subscription, chunked retrieval, and code generation. Built on [`@opencall/types`](https://www.npmjs.com/package/@opencall/types) — the canonical Zod schemas and types are imported from there, not redefined.

The thinness is the point. There is no class hierarchy, no verb mapping, no path templating. The operation name is the intent; the envelope is the wire format.

## Install

```bash
npm install @opencall/client @opencall/types
# or
bun add @opencall/client @opencall/types
```

## Surface

- `call(op, args, ctx?, options?)` — POST `/call`, returns the response envelope.
- `callAndWait(op, args, ctx?, options?)` — same but polls async responses to terminal state.
- `retrieveChunked(requestId, options)` — pulls chunks with checksum chain validation, returns concatenated bytes.
- `subscribeStream(op, args, ctx?, options?)` — returns the stream descriptor (transport, location, auth) for the caller to connect to.
- `generateClientTypes(registry, options?)` — pure function that emits TypeScript declarations from a `RegistryResponse`.
- `bin opencall-codegen` — CLI that reads a registry URL or local JSON and writes a `.d.ts`.

## Quick example

```ts
import { call } from "@opencall/client"

const res = await call(
  "v1:orders.getItem",
  { orderId: "456", itemId: "789" },
  undefined,
  { endpoint: "https://api.example.com", token: () => getToken() },
)
if (res.state === "complete") {
  console.log(res.result)
}
```

## Codegen

Generate typed wrappers from a live registry:

```bash
npx opencall-codegen --from https://api.example.com/.well-known/ops --out src/generated/opencall.d.ts
```

The generated `.d.ts` augments the `call` declaration with operation-specific arg and result types. No runtime code; pure TypeScript.

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. The `@opencall/types` peer dependency declares the same.

## License

Apache-2.0
