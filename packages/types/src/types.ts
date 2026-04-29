import type { z } from "zod/v4";
import type { StreamDescriptor } from "./envelope.js";

export type ExecutionModel = "sync" | "async" | "stream";
export type SyncTimeoutPolicy = "fail" | "retry" | "escalate";
export type RegistryEndpoint = "rpc" | "path";

export interface MediaSchemaEntry {
  name: string;
  required?: boolean;
  acceptedTypes?: string[];
  maxBytes?: number;
}

export interface SyncPolicy {
  maxMs: number;
  onTimeout: SyncTimeoutPolicy;
}

export interface IdempotencyPolicy {
  supported: boolean;
  required: boolean;
  keyHeader?: string;
  ttlSeconds?: number;
}

export interface CachePolicy {
  enabled: boolean;
  ttl?: number;
  scope?: "private" | "public" | "tenant";
  vary?: string[];
  tags?: string[];
}

export interface TelemetryPolicy {
  spanName: string;
  attributes?: string[];
  sensitive?: string[];
}

export interface StreamPolicy {
  supportedTransports: string[];
  supportedEncodings: string[];
  ttlSeconds: number;
  frameIntegrity?: boolean;
}

/** Result returned from an operation handler */
export interface OperationResult {
  state: "complete" | "accepted" | "streaming";
  result?: unknown;
  location?: {
    uri: string;
    auth?: {
      credentialType: string;
      credential: string;
      expiresAt?: number;
    };
  };
  retryAfterMs?: number;
  expiresAt?: number;
  /** Present when state === "streaming". The stream descriptor returned to the caller. */
  stream?: StreamDescriptor;
}

/** Interface that each operation module must implement */
export interface OperationModule {
  args: z.ZodType;
  result: z.ZodType;
  handler: (args: unknown, ...rest: unknown[]) => Promise<OperationResult>;
  /** If true, operation requires authentication; the dispatcher enforces this before calling handler. */
  requiresAuth?: boolean;
  /** If set, the operation is deprecated. Contains the sunset ISO date. */
  sunset?: string;
  /** If set, the replacement operation name after deprecation */
  replacement?: string;
}

/** A single entry in the operations registry */
export interface RegistryEntry {
  op: string;
  executionModel: ExecutionModel;
  sideEffecting: boolean;
  argsSchema: Record<string, unknown>;
  resultSchema?: Record<string, unknown>;
  mediaSchema?: MediaSchemaEntry[];
  frameSchema?: Record<string, unknown>;
  authScopes: string[];
  sync?: SyncPolicy;
  idempotency?: IdempotencyPolicy;
  cache?: CachePolicy;
  telemetry?: TelemetryPolicy;
  stream?: StreamPolicy;
  ttlSeconds?: number;
  deprecated?: boolean;
  sunset?: string;
  replacement?: string;
}

/** The full registry response served at /.well-known/ops */
export interface RegistryResponse {
  callVersion: string;
  schemaHash: string;
  endpoints: RegistryEndpoint[];
  errorsUrl?: string;
  operations: RegistryEntry[];
}
