import { z } from "zod/v4";

/** Request envelope — the body of every POST /call */
export const RequestEnvelopeSchema = z.object({
  op: z.string(),
  args: z.record(z.string(), z.unknown()).optional().default({}),
  ctx: z
    .object({
      requestId: z.uuid().optional(),
      sessionId: z.uuid().optional(),
      parentId: z.uuid().optional(),
      idempotencyKey: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
      locale: z.string().optional(),
      traceparent: z.string().optional(),
    })
    .optional(),
  auth: z
    .object({
      iss: z.string(),
      sub: z.string(),
      credentialType: z.string(),
      credential: z.string().optional(),
    })
    .optional(),
  media: z
    .array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        ref: z.string().optional(),
        part: z.string().optional(),
      })
    )
    .optional(),
});

export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

/** Response envelope states */
export type ResponseState = "complete" | "accepted" | "pending" | "error" | "streaming";

/** Streaming subscription descriptor returned when state is "streaming" */
export interface StreamDescriptor {
  transport: string;
  encoding: string;
  schema: string;
  location: string;
  sessionId: string;
  expiresAt?: number;
  auth?: { credentialType: string; credential: string; expiresAt?: number };
}

/** Canonical response envelope */
export interface ResponseEnvelope {
  requestId: string;
  sessionId?: string;
  state: ResponseState;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    cause?: unknown;
  };
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
  meta?: Record<string, unknown>;
  stream?: StreamDescriptor;
}
