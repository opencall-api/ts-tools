# Changelog

## 0.2.0 — 2026-04-27

First public release on npm. Extracted from the previously-private `@opencall/ts-tools` codebase, retargeted onto `@opencall/types` for canonical schemas.

### Added
- `BackendUnavailableError` is re-exported from `@opencall/types`.
- `isDbConnectionError(err)` heuristic for postgres connection failures.
- `safeHandlerCall` now returns HTTP 503 with `BACKEND_UNAVAILABLE` for `BackendUnavailableError` throws and for errors recognised by `isDbConnectionError`.
- `OperationModule.requiresAuth` field is honored.
- All `@opencall/types` exports are re-exported (consumers can import envelope types from this package directly).

### Changed
- Imports from `./envelope`, `./errors`, `./types` are now `from "@opencall/types"`.
- Package renamed from the unpublished `@opencall/ts-tools` to `@opencall/server`.

## 0.1.0 — 2026-02-20 (private; never published)

Original local release as `@opencall/ts-tools`.
