# @opencall/server

> **Docs:** [https://opencall-api.com](https://opencall-api.com) (human-readable). AI agents may prefer raw markdown at [`/spec`](https://opencall-api.com/spec) — GitHub blocks most non-Copilot bots.

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

Each operation file carries a JSDoc block that drives the registry:

```ts
/**
 * @op v1:orders.getItem
 * @execution sync
 * @timeout 5000
 * @security orders:read
 * @cache server
 * @ttl 300
 */
export const args = z.object({ orderId: z.string(), itemId: z.string() })
export const result = z.object({ id: z.string(), name: z.string(), price: z.number() })
export async function handler(input: unknown): Promise<OperationResult> { ... }
```

`buildRegistry` scans the directory, reads each JSDoc block, and emits a spec-aligned `/.well-known/ops` response — no separate registry file to maintain:

```ts
import { buildRegistry, validateEnvelope, validateArgs, safeHandlerCall } from "@opencall/server"

const { modules } = await buildRegistry({ opsDir: "./src/operations" })

// Inside your HTTP handler:
const envResult = validateEnvelope(rawBody)
if (!envResult.ok) return envResult.error          // { status, body }

const operation = modules.get(envResult.envelope.op)
if (!operation) return { status: 400, body: { ... } }

const argsResult = validateArgs(operation, envResult.envelope.args, requestId)
if (!argsResult.ok) return argsResult.error

const result = await safeHandlerCall(operation.handler, [argsResult.data], requestId)
```

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. The `@opencall/types` peer dependency declares the same.

## License

Apache-2.0
