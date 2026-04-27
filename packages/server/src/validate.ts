import type { z } from "zod/v4";
import { RequestEnvelopeSchema, type ResponseEnvelope } from "@opencall/types";
import { protocolError, DomainError, domainError } from "@opencall/types";
import type { OperationModule, OperationResult } from "@opencall/types";

/** Dispatch result returned to the server layer */
export interface DispatchResult {
  status: number;
  body: ResponseEnvelope;
}

/**
 * Validate a raw request body against the OpenCALL envelope schema.
 *
 * Returns the parsed envelope on success, or a DispatchResult with
 * the appropriate error response on failure.
 */
export function validateEnvelope(
  rawBody: unknown
):
  | { ok: true; envelope: z.infer<typeof RequestEnvelopeSchema> }
  | { ok: false; error: DispatchResult } {
  const parseResult = RequestEnvelopeSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const message = parseResult.error.issues
      .map(
        (i) =>
          `${(i.path as (string | number)[]).join(".")}: ${i.message}`
      )
      .join("; ");
    return {
      ok: false,
      error: protocolError(
        "INVALID_ENVELOPE",
        `Invalid request envelope: ${message}`,
        400
      ),
    };
  }

  const envelope = parseResult.data;

  if (!envelope.op) {
    return {
      ok: false,
      error: protocolError(
        "INVALID_ENVELOPE",
        "Missing required field: op",
        400
      ),
    };
  }

  return { ok: true, envelope };
}

/**
 * Validate operation arguments against the operation's Zod schema.
 *
 * Returns the parsed args on success, or a DispatchResult with
 * a SCHEMA_VALIDATION_FAILED error on failure.
 */
export function validateArgs(
  operation: OperationModule,
  args: unknown,
  requestId: string,
  sessionId?: string
):
  | { ok: true; data: unknown }
  | { ok: false; error: DispatchResult } {
  const argsResult = operation.args.safeParse(args);
  if (!argsResult.success) {
    const issues = argsResult.error.issues.map((i) => ({
      path: (i.path as (string | number)[]).join("."),
      message: i.message,
    }));
    return {
      ok: false,
      error: {
        status: 400,
        body: {
          requestId,
          sessionId,
          state: "error",
          error: {
            code: "SCHEMA_VALIDATION_FAILED",
            message: "Invalid operation arguments",
            cause: { issues },
          },
        },
      },
    };
  }

  return { ok: true, data: argsResult.data };
}

/**
 * Check whether an operation has passed its sunset date.
 *
 * Returns undefined if the operation is still active, or a DispatchResult
 * with an OP_REMOVED error if the sunset date has passed.
 */
export function checkSunset(
  operation: OperationModule,
  opName: string,
  requestId: string,
  sessionId?: string
): DispatchResult | undefined {
  if (!operation.sunset) return undefined;

  const sunsetDate = new Date(operation.sunset);
  if (Date.now() > sunsetDate.getTime()) {
    return {
      status: 410,
      body: {
        requestId,
        sessionId,
        state: "error",
        error: {
          code: "OP_REMOVED",
          message: `Operation ${opName} was removed on ${operation.sunset}`,
          cause: {
            removedOp: opName,
            sunset: operation.sunset,
            replacement: operation.replacement,
          },
        },
      },
    };
  }

  return undefined;
}

/**
 * Format an OperationResult into a DispatchResult with the correct HTTP status.
 *
 * - 202 for accepted (async) operations
 * - 303 for redirect responses (location set, no result body)
 * - 200 for normal complete responses
 */
export function formatResponse(
  opResult: OperationResult,
  requestId: string,
  sessionId?: string,
  meta?: Record<string, unknown>,
): DispatchResult {
  const response: ResponseEnvelope = {
    requestId,
    sessionId,
    state: opResult.state,
  };

  if (opResult.result !== undefined) response.result = opResult.result;
  if (opResult.location) response.location = opResult.location;
  if (opResult.retryAfterMs !== undefined)
    response.retryAfterMs = opResult.retryAfterMs;
  if (opResult.expiresAt !== undefined)
    response.expiresAt = opResult.expiresAt;

  let status: number;
  if (opResult.state === "accepted") {
    status = 202;
  } else if (opResult.location && !opResult.result) {
    status = 303;
  } else {
    status = 200;
  }

  const body = meta ? { ...response, meta } : response;

  return { status, body };
}

/**
 * Wrap a handler invocation, catching DomainErrors and unexpected errors
 * and converting them to proper DispatchResult responses.
 */
export async function safeHandlerCall(
  handler: (...args: unknown[]) => Promise<OperationResult>,
  handlerArgs: unknown[],
  requestId: string,
  sessionId?: string
): Promise<DispatchResult> {
  try {
    const opResult = await handler(...handlerArgs);
    return formatResponse(opResult, requestId, sessionId);
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        status: 200,
        body: domainError(requestId, err.code, err.message, err.cause),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      body: domainError(requestId, "INTERNAL_ERROR", message),
    };
  }
}
