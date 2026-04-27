import { z } from "zod/v4";
import {
  readFileSync as nodeReadFileSync,
  readdirSync as nodeReaddirSync,
} from "node:fs";
import { join, extname } from "node:path";
import { createHash as nodeCreateHash } from "node:crypto";
import { parseJSDoc } from "./jsdoc.js";
import type {
  OperationModule,
  RegistryEntry,
  RegistryResponse,
} from "@opencall/types";

/** Replaceable runtime dependencies for non-Node environments (e.g. Bun, Deno) */
export interface RuntimeAdapters {
  /** Read a file as UTF-8 string. Defaults to node:fs readFileSync. */
  readFileSync?: (path: string, encoding: "utf-8") => string;
  /** List filenames in a directory. Defaults to node:fs readdirSync. */
  readdirSync?: (path: string) => string[];
  /** Create a hash instance. Defaults to node:crypto createHash. */
  createHash?: (algorithm: string) => {
    update(data: string): { digest(encoding: "hex"): string };
  };
}

/** Options for building the operations registry */
export interface BuildRegistryOptions {
  /** Absolute path to the directory containing operation .ts files */
  opsDir: string;
  /** OpenCALL version string (defaults to env CALL_VERSION or "2026-02-10") */
  callVersion?: string;
  /** File extension to scan for (defaults to ".ts") */
  ext?: string;
  /** Override runtime dependencies for non-Node environments */
  runtime?: RuntimeAdapters;
}

/** Inline metadata for a module entry (replaces JSDoc parsing) */
export interface ModuleMeta {
  op: string;
  execution?: "sync" | "async";
  timeout?: number;
  ttl?: number;
  security?: string;
  cache?: "none" | "server" | "location";
  flags?: string;
  sunset?: string;
  replacement?: string;
}

/** A pre-imported module with inline metadata */
export interface ModuleEntry {
  /** The operation module (args, result, handler) */
  module: OperationModule;
  /** Operation metadata — same tags that buildRegistry() parses from JSDoc */
  meta: ModuleMeta;
}

/** Result of building the registry, including modules for dispatch */
export interface BuildRegistryResult {
  /** The serializable registry response (for /.well-known/ops) */
  registry: RegistryResponse;
  /** Map of operation name to its resolved module (args, result, handler) */
  modules: Map<string, OperationModule>;
  /** Pre-serialized JSON string */
  json: string;
  /** ETag hash of the JSON for conditional GET support */
  etag: string;
}

// ── Shared helpers ───────────────────────────────────────────────────────

/** Build a RegistryEntry from a module's Zod schemas and parsed metadata tags */
function buildEntry(
  mod: { args: z.ZodType; result: z.ZodType },
  tags: Record<string, string | undefined>,
): RegistryEntry {
  const entry: RegistryEntry = {
    op: tags["op"]!,
    argsSchema: z.toJSONSchema(mod.args),
    resultSchema: z.toJSONSchema(mod.result),
    sideEffecting: tags["flags"]?.includes("sideEffecting") ?? false,
    idempotencyRequired:
      tags["flags"]?.includes("idempotencyRequired") ?? false,
    executionModel:
      (tags["execution"] as "sync" | "async") ?? "sync",
    maxSyncMs: tags["timeout"] ? parseInt(tags["timeout"], 10) : 5000,
    ttlSeconds: tags["ttl"] ? parseInt(tags["ttl"], 10) : 0,
    authScopes: tags["security"] ? tags["security"].split(/\s+/) : [],
    cachingPolicy:
      (tags["cache"] as "none" | "server" | "location") ?? "none",
  };

  if (tags["flags"]?.includes("deprecated")) {
    entry.deprecated = true;
  }
  if (tags["sunset"]) entry.sunset = tags["sunset"];
  if (tags["replacement"]) entry.replacement = tags["replacement"];

  return entry;
}

/** Build an OperationModule with sunset/replacement metadata */
function buildOpModule(
  mod: { args: z.ZodType; result: z.ZodType; handler: OperationModule["handler"] },
  tags: Record<string, string | undefined>,
): OperationModule {
  const opModule: OperationModule = {
    args: mod.args,
    result: mod.result,
    handler: mod.handler,
  };
  if (tags["sunset"]) opModule.sunset = tags["sunset"];
  if (tags["replacement"]) opModule.replacement = tags["replacement"];
  return opModule;
}

/** Finalize a registry: serialize to JSON and compute ETag */
function finalizeRegistry(
  entries: RegistryEntry[],
  modules: Map<string, OperationModule>,
  callVersion: string,
  hashCreate: (algorithm: string) => {
    update(data: string): { digest(encoding: "hex"): string };
  },
): BuildRegistryResult {
  const registry: RegistryResponse = { callVersion, operations: entries };
  const json = JSON.stringify(registry);
  const etag = `"${hashCreate("sha256").update(json).digest("hex")}"`;
  return { registry, modules, json, etag };
}

// ── buildRegistry (filesystem-based) ─────────────────────────────────────

/**
 * Scan operation files, dynamically import modules, parse JSDoc metadata,
 * and build the operations registry.
 *
 * Each operation file should export:
 * - `args`: a Zod schema for the operation arguments
 * - `result`: a Zod schema for the operation result
 * - `handler`: an async function implementing the operation
 *
 * And include a JSDoc block with at minimum an `@op` tag:
 * ```
 * /** @op v1:catalog.list
 *  *  @execution sync
 *  *  @timeout 5000
 *  *  @security items:browse
 *  *\/
 * ```
 *
 * For non-Node runtimes, pass `runtime` adapters to replace fs/crypto:
 * ```
 * await buildRegistry({
 *   opsDir: "./operations",
 *   runtime: {
 *     readFileSync: Bun.file(path).text,
 *     readdirSync: (dir) => [...new Bun.Glob("*.ts").scanSync(dir)],
 *     createHash: (alg) => new Bun.CryptoHasher(alg),
 *   },
 * });
 * ```
 */
export async function buildRegistry(
  options: BuildRegistryOptions
): Promise<BuildRegistryResult> {
  const { opsDir, ext = ".ts" } = options;
  const callVersion =
    options.callVersion ?? process.env.CALL_VERSION ?? "2026-02-10";

  const readFile = options.runtime?.readFileSync ?? nodeReadFileSync;
  const readDir = options.runtime?.readdirSync ?? nodeReaddirSync;
  const hashCreate = options.runtime?.createHash ?? nodeCreateHash;

  const files = readDir(opsDir).filter((f) => extname(f) === ext);
  const entries: RegistryEntry[] = [];
  const modules = new Map<string, OperationModule>();

  for (const file of files) {
    const filePath = join(opsDir, file);
    const sourceText = readFile(filePath, "utf-8");
    const tags = parseJSDoc(sourceText);

    if (!tags["op"]) continue;

    const mod = await import(filePath);

    modules.set(tags["op"], buildOpModule(mod, tags));
    entries.push(buildEntry(mod, tags));
  }

  return finalizeRegistry(entries, modules, callVersion, hashCreate);
}

// ── buildRegistryFromModules (no filesystem) ─────────────────────────────

/**
 * Build the operations registry from pre-imported modules with inline metadata.
 *
 * Use this in environments without filesystem access (e.g. Cloudflare Workers).
 * The metadata that `buildRegistry()` extracts from JSDoc is provided inline
 * via the `meta` field on each entry.
 *
 * ```
 * import { buildRegistryFromModules } from "@opencall/ts-tools";
 * import * as createProfile from "./operations/identity-create-profile";
 * import * as getProfile from "./operations/identity-get-profile";
 *
 * const { registry, modules, json, etag } = buildRegistryFromModules([
 *   {
 *     module: createProfile,
 *     meta: {
 *       op: "v1:identity.createProfile",
 *       execution: "sync",
 *       timeout: 5000,
 *       security: "identity:write",
 *     },
 *   },
 *   {
 *     module: getProfile,
 *     meta: {
 *       op: "v1:identity.getProfile",
 *       execution: "sync",
 *       timeout: 3000,
 *       security: "identity:read",
 *     },
 *   },
 * ]);
 * ```
 */
export function buildRegistryFromModules(
  moduleEntries: ModuleEntry[],
  options?: { callVersion?: string; createHash?: RuntimeAdapters["createHash"] },
): BuildRegistryResult {
  const callVersion =
    options?.callVersion ?? process.env.CALL_VERSION ?? "2026-02-10";
  const hashCreate = options?.createHash ?? nodeCreateHash;

  const entries: RegistryEntry[] = [];
  const modules = new Map<string, OperationModule>();

  for (const { module: mod, meta } of moduleEntries) {
    // Convert typed meta to string tags for the shared builder
    const tags: Record<string, string | undefined> = {
      op: meta.op,
      execution: meta.execution,
      timeout: meta.timeout?.toString(),
      ttl: meta.ttl?.toString(),
      security: meta.security,
      cache: meta.cache,
      flags: meta.flags,
      sunset: meta.sunset ?? mod.sunset,
      replacement: meta.replacement ?? mod.replacement,
    };

    modules.set(meta.op, buildOpModule(mod, tags));
    entries.push(buildEntry(mod, tags));
  }

  return finalizeRegistry(entries, modules, callVersion, hashCreate);
}
