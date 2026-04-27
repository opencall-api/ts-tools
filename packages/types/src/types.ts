import type { z } from "zod/v4";

/** Result returned from an operation handler */
export interface OperationResult {
  state: "complete" | "accepted";
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
}

/** Interface that each operation module must implement */
export interface OperationModule {
  args: z.ZodType;
  result: z.ZodType;
  handler: (args: unknown, ...rest: unknown[]) => Promise<OperationResult>;
  /** If set, the operation is deprecated. Contains the sunset ISO date. */
  sunset?: string;
  /** If set, the replacement operation name after deprecation */
  replacement?: string;
}

/** A single entry in the operations registry */
export interface RegistryEntry {
  op: string;
  argsSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  sideEffecting: boolean;
  idempotencyRequired: boolean;
  executionModel: "sync" | "async";
  maxSyncMs: number;
  ttlSeconds: number;
  authScopes: string[];
  cachingPolicy: "none" | "server" | "location";
  deprecated?: boolean;
  sunset?: string;
  replacement?: string;
}

/** The full registry response served at /.well-known/ops */
export interface RegistryResponse {
  callVersion: string;
  operations: RegistryEntry[];
}
