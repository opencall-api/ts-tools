# @opencall/server

> **Canonical docs:** [https://opencall-api.com/spec](https://opencall-api.com/spec). The OpenCALL specification, raw markdown for agents, and SDK guides live at the canonical site. GitHub may block non-Copilot bots.

Server-side tooling for implementing OpenCALL APIs in TypeScript. Provides the operation registry builder, JSDoc-driven operation discovery, dispatcher helpers, runtime payload validation, and a code generator.

Built on [`@opencall/types`](https://www.npmjs.com/package/@opencall/types) — the canonical Zod schemas and types are imported from there, not redefined.

## Install

```bash
npm install @opencall/server @opencall/types
# or
bun add @opencall/server @opencall/types
```

## Surface

- `buildRegistry`, `buildRegistryFromModules` — produces the `/.well-known/ops` response from operation definitions. Use the file-scan version on Node; use `buildRegistryFromModules` on Cloudflare Workers and other edge runtimes that lack `node:fs`.
- `parseJSDoc` — extracts operation metadata from JSDoc comments on handler exports.
- `validateEnvelope`, `validateArgs`, `safeHandlerCall`, `formatResponse`, `checkSunset` — dispatcher building blocks.
- `generateOpsModule` — codegen that emits a TypeScript registry module from a directory of operation files.
- `isDbConnectionError` — heuristic detection of DB connection failures, used to surface BACKEND_UNAVAILABLE.
- All `@opencall/types` exports are re-exported for convenience (no need to `import { RequestEnvelope } from "@opencall/types"` separately).

## Quick example

```ts
import { buildRegistry, validateEnvelope, safeHandlerCall } from "@opencall/server"

const { registry } = await buildRegistry({ operationsDir: "./src/operations" })

// Inside your HTTP handler:
const validation = validateEnvelope(rawBody)
if (!validation.ok) {
  // return validation.error
}
const operation = registry.byOp(validation.envelope.op)
const result = await safeHandlerCall(operation.handler, [validation.envelope.args], requestId)
```

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. The `@opencall/types` peer dependency declares the same.

## License

Apache-2.0
