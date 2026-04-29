import { z } from "zod/v4";
import {
  readFileSync as nodeReadFileSync,
  readdirSync as nodeReaddirSync,
} from "node:fs";
import { join, extname } from "node:path";
import { createHash as nodeCreateHash } from "node:crypto";
import { parseJSDoc } from "./jsdoc.js";
import type {
  CachePolicy,
  ExecutionModel,
  IdempotencyPolicy,
  MediaSchemaEntry,
  OperationModule,
  RegistryEndpoint,
  RegistryEntry,
  RegistryResponse,
  StreamPolicy,
  SyncPolicy,
  SyncTimeoutPolicy,
  TelemetryPolicy,
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
  /** Invocation forms supported by the service (defaults to ["rpc"]) */
  endpoints?: RegistryEndpoint[];
  /** Optional URL for the server's error catalog */
  errorsUrl?: string;
  /** File extension to scan for (defaults to ".ts") */
  ext?: string;
  /** Override runtime dependencies for non-Node environments */
  runtime?: RuntimeAdapters;
}

/** Inline metadata for a module entry (replaces JSDoc parsing) */
export interface ModuleMeta {
  op: string;
  execution?: ExecutionModel;
  timeout?: number;
  onTimeout?: SyncTimeoutPolicy;
  ttl?: number;
  security?: string;
  cache?: "none" | "server" | "location" | "public" | "private" | "tenant";
  cacheTtl?: number;
  cacheVary?: string[] | string;
  cacheTags?: string[] | string;
  idempotency?: Partial<IdempotencyPolicy>;
  telemetry?: Partial<TelemetryPolicy>;
  stream?: StreamPolicy;
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

interface RegistryModuleShape {
  args: z.ZodType;
  result?: z.ZodType;
  handler: OperationModule["handler"];
  mediaSchema?: MediaSchemaEntry[];
  frameSchema?: z.ZodType;
}

// ── Shared helpers ───────────────────────────────────────────────────────

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "true";
}

function parseSyncPolicy(tags: Record<string, string | undefined>): SyncPolicy {
  return {
    maxMs: tags["timeout"] ? parseInt(tags["timeout"], 10) : 5000,
    onTimeout: (tags["onTimeout"] as SyncTimeoutPolicy | undefined) ?? "fail",
  };
}

function parseIdempotencyPolicy(
  tags: Record<string, string | undefined>,
  sideEffecting: boolean,
): IdempotencyPolicy | undefined {
  const flags = splitList(tags["flags"]);
  const legacyRequired = flags.includes("idempotencyRequired");
  const raw = splitList(tags["idempotency"]);
  const supported =
    raw.length > 0 ||
    legacyRequired ||
    sideEffecting ||
    parseBoolean(tags["idempotencySupported"], false);
  const required =
    legacyRequired ||
    raw.includes("required") ||
    parseBoolean(tags["idempotencyRequired"], false);

  if (!supported && !required) return undefined;

  const ttlToken = raw.find((token) => token.startsWith("ttl="));
  const headerToken = raw.find((token) => token.startsWith("header="));

  return {
    supported: true,
    required,
    ttlSeconds: ttlToken ? parseInt(ttlToken.slice(4), 10) : undefined,
    keyHeader: headerToken?.slice(7),
  };
}

function parseCachePolicy(
  tags: Record<string, string | undefined>,
  authScopes: string[],
): CachePolicy | undefined {
  const legacyCache = tags["cache"];
  if (!legacyCache) return undefined;

  if (legacyCache === "none" || legacyCache === "location") {
    return { enabled: false };
  }

  const scope =
    legacyCache === "server"
      ? (authScopes.length > 0 ? "private" : "public")
      : (legacyCache as "public" | "private" | "tenant");

  const vary = splitList(tags["cacheVary"]);
  const cacheTags = splitList(tags["cacheTags"]);
  const ttl = tags["cacheTtl"]
    ? parseInt(tags["cacheTtl"], 10)
    : tags["ttl"]
      ? parseInt(tags["ttl"], 10)
      : 0;

  return {
    enabled: true,
    ttl,
    scope,
    ...(vary.length > 0 && { vary }),
    ...(cacheTags.length > 0 && { tags: cacheTags }),
  };
}

function parseTelemetryPolicy(
  tags: Record<string, string | undefined>,
): TelemetryPolicy | undefined {
  if (!tags["telemetry"] && !tags["telemetryAttributes"] && !tags["telemetrySensitive"]) {
    return undefined;
  }

  const telemetryTokens = splitList(tags["telemetry"]);
  const spanNameToken = telemetryTokens.find((token) => token.startsWith("span="));
  const attributesToken = telemetryTokens.find((token) => token.startsWith("attrs="));
  const sensitiveToken = telemetryTokens.find((token) => token.startsWith("sensitive="));
  const spanName = spanNameToken?.slice(5) ?? tags["telemetry"] ?? tags["op"]?.split(":")[1];

  if (!spanName) return undefined;

  const attributes = [
    ...splitList(attributesToken?.slice(6)),
    ...splitList(tags["telemetryAttributes"]),
  ];
  const sensitive = [
    ...splitList(sensitiveToken?.slice(10)),
    ...splitList(tags["telemetrySensitive"]),
  ];

  return {
    spanName,
    ...(attributes.length > 0 && { attributes }),
    ...(sensitive.length > 0 && { sensitive }),
  };
}

function parseStreamPolicy(tags: Record<string, string | undefined>): StreamPolicy | undefined {
  const executionModel = (tags["execution"] as ExecutionModel | undefined) ?? "sync";
  if (executionModel !== "stream") return undefined;

  const streamTokens = splitList(tags["stream"]);
  const transportsToken = streamTokens.find((token) => token.startsWith("transports="));
  const encodingsToken = streamTokens.find((token) => token.startsWith("encodings="));
  const ttlToken = streamTokens.find((token) => token.startsWith("ttl="));
  const frameIntegrityToken = streamTokens.find((token) => token.startsWith("frameIntegrity="));

  const supportedTransports = [
    ...splitList(transportsToken?.slice(11)),
    ...splitList(tags["streamTransports"]),
  ];
  const supportedEncodings = [
    ...splitList(encodingsToken?.slice(10)),
    ...splitList(tags["streamEncodings"]),
  ];
  const ttlSeconds = ttlToken
    ? parseInt(ttlToken.slice(4), 10)
    : tags["ttl"]
      ? parseInt(tags["ttl"], 10)
      : 3600;

  return {
    supportedTransports,
    supportedEncodings,
    ttlSeconds,
    ...(frameIntegrityToken !== undefined && {
      frameIntegrity: parseBoolean(frameIntegrityToken.slice(15), false),
    }),
  };
}

/** Build a RegistryEntry from a module's Zod schemas and parsed metadata tags */
function buildEntry(
  mod: RegistryModuleShape,
  tags: Record<string, string | undefined>,
): RegistryEntry {
  const executionModel = (tags["execution"] as ExecutionModel | undefined) ?? "sync";
  const sideEffecting = tags["flags"]?.includes("sideEffecting") ?? false;
  const authScopes = splitList(tags["security"]);
  const cache = parseCachePolicy(tags, authScopes);
  const telemetry = parseTelemetryPolicy(tags);
  const stream = parseStreamPolicy(tags);
  const idempotency = parseIdempotencyPolicy(tags, sideEffecting);

  const entry: RegistryEntry = {
    op: tags["op"]!,
    executionModel,
    sideEffecting,
    argsSchema: z.toJSONSchema(mod.args),
    authScopes,
    ...(mod.result && executionModel !== "stream" && {
      resultSchema: z.toJSONSchema(mod.result),
    }),
    ...(mod.mediaSchema && mod.mediaSchema.length > 0 && { mediaSchema: mod.mediaSchema }),
    ...(mod.frameSchema && { frameSchema: z.toJSONSchema(mod.frameSchema) }),
    ...(executionModel === "sync" && { sync: parseSyncPolicy(tags) }),
    ...(idempotency && { idempotency }),
    ...(cache && { cache }),
    ...(telemetry && { telemetry }),
    ...(stream && { stream }),
  };

  if (executionModel === "async") {
    entry.ttlSeconds = tags["ttl"] ? parseInt(tags["ttl"], 10) : 0;
  }

  if (tags["flags"]?.includes("deprecated")) {
    entry.deprecated = true;
  }
  if (tags["sunset"]) entry.sunset = tags["sunset"];
  if (tags["replacement"]) entry.replacement = tags["replacement"];

  return entry;
}

/** Build an OperationModule with sunset/replacement metadata */
function buildOpModule(
  mod: RegistryModuleShape,
  tags: Record<string, string | undefined>,
): OperationModule {
  const opModule: OperationModule = {
    args: mod.args,
    result: mod.result ?? z.any(),
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
  endpoints: RegistryEndpoint[],
  errorsUrl: string | undefined,
  hashCreate: (algorithm: string) => {
    update(data: string): { digest(encoding: "hex"): string };
  },
): BuildRegistryResult {
  const baseRegistry = {
    callVersion,
    endpoints,
    ...(errorsUrl !== undefined && { errorsUrl }),
    operations: entries,
  };
  const schemaHash = `sha256:${hashCreate("sha256")
    .update(JSON.stringify(baseRegistry))
    .digest("hex")}`;
  const registry: RegistryResponse = { ...baseRegistry, schemaHash };
  const json = JSON.stringify(registry);
  const etag = `"${schemaHash}"`;
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
  const { opsDir, endpoints = ["rpc"], errorsUrl, ext = ".ts" } = options;
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

    const mod = (await import(filePath)) as RegistryModuleShape;

    modules.set(tags["op"], buildOpModule(mod, tags));
    entries.push(buildEntry(mod, tags));
  }

  return finalizeRegistry(entries, modules, callVersion, endpoints, errorsUrl, hashCreate);
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
  options?: {
    callVersion?: string;
    endpoints?: RegistryEndpoint[];
    errorsUrl?: string;
    createHash?: RuntimeAdapters["createHash"];
  },
): BuildRegistryResult {
  const callVersion =
    options?.callVersion ?? process.env.CALL_VERSION ?? "2026-02-10";
  const endpoints = options?.endpoints ?? ["rpc"];
  const errorsUrl = options?.errorsUrl;
  const hashCreate = options?.createHash ?? nodeCreateHash;

  const entries: RegistryEntry[] = [];
  const modules = new Map<string, OperationModule>();

  for (const { module: mod, meta } of moduleEntries) {
    // Convert typed meta to string tags for the shared builder
    const tags: Record<string, string | undefined> = {
      op: meta.op,
      execution: meta.execution,
      timeout: meta.timeout?.toString(),
      onTimeout: meta.onTimeout,
      ttl: meta.ttl?.toString(),
      security: meta.security,
      cache: meta.cache,
      cacheTtl: meta.cacheTtl?.toString(),
      cacheVary: Array.isArray(meta.cacheVary) ? meta.cacheVary.join(",") : meta.cacheVary,
      cacheTags: Array.isArray(meta.cacheTags) ? meta.cacheTags.join(",") : meta.cacheTags,
      idempotency: meta.idempotency
        ? [
            meta.idempotency.required ? "required" : undefined,
            meta.idempotency.ttlSeconds !== undefined
              ? `ttl=${meta.idempotency.ttlSeconds}`
              : undefined,
            meta.idempotency.keyHeader ? `header=${meta.idempotency.keyHeader}` : undefined,
          ]
            .filter(Boolean)
            .join(" ")
        : undefined,
      idempotencySupported: meta.idempotency?.supported?.toString(),
      idempotencyRequired: meta.idempotency?.required?.toString(),
      telemetry: meta.telemetry?.spanName,
      telemetryAttributes: meta.telemetry?.attributes?.join(","),
      telemetrySensitive: meta.telemetry?.sensitive?.join(","),
      stream: meta.stream
        ? [
            `transports=${meta.stream.supportedTransports.join(",")}`,
            `encodings=${meta.stream.supportedEncodings.join(",")}`,
            `ttl=${meta.stream.ttlSeconds}`,
            meta.stream.frameIntegrity !== undefined
              ? `frameIntegrity=${meta.stream.frameIntegrity}`
              : undefined,
          ]
            .filter(Boolean)
            .join(" ")
        : undefined,
      flags: meta.flags,
      sunset: meta.sunset ?? mod.sunset,
      replacement: meta.replacement ?? mod.replacement,
    };

    modules.set(meta.op, buildOpModule(mod, tags));
    entries.push(buildEntry(mod, tags));
  }

  return finalizeRegistry(entries, modules, callVersion, endpoints, errorsUrl, hashCreate);
}
