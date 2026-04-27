# OpenCALL TypeScript tooling

Monorepo for the official `@opencall` TypeScript packages. Canonical docs at [https://opencall-api.com/spec](https://opencall-api.com/spec).

## Packages

| Package | Description |
| --- | --- |
| [`@opencall/types`](packages/types/) | Canonical Zod schemas and types — the source of truth for the OpenCALL envelope, registry, and error contract. |
| [`@opencall/server`](packages/server/) | Server-side tooling: registry builder, JSDoc parser, dispatcher helpers, validators, codegen. |
| [`@opencall/client`](packages/client/) | Thin OpenCALL client + `opencall-codegen` CLI. |

## Development

This repo is a Bun workspace.

```bash
bun install
bun test
bun --filter '*' run build
```

## License

Apache-2.0
