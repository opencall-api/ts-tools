import type { ResponseEnvelope } from "./envelope.js";

/** Throwable domain error — caught by the dispatcher and returned as HTTP 200 state=error */
export class DomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "DomainError";
    this.code = code;
  }
}

/** Construct a domain error response (HTTP 200, state=error) */
export function domainError(
  requestId: string,
  code: string,
  message: string,
  cause?: unknown
): ResponseEnvelope {
  return {
    requestId,
    state: "error",
    error: { code, message, ...(cause !== undefined && { cause }) },
  };
}

/** Construct a protocol error response (HTTP 4xx/5xx, state=error) */
export function protocolError(
  code: string,
  message: string,
  httpStatus: number,
  cause?: unknown
): { status: number; body: ResponseEnvelope } {
  return {
    status: httpStatus,
    body: {
      requestId: crypto.randomUUID(),
      state: "error",
      error: { code, message, ...(cause !== undefined && { cause }) },
    },
  };
}

/** Throwable when a backend dependency is unreachable. The dispatcher converts this into HTTP 503 with BACKEND_UNAVAILABLE. */
export class BackendUnavailableError extends Error {
  public readonly service: string
  public readonly retriable: boolean

  constructor(service: string, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = "BackendUnavailableError"
    this.service = service
    this.retriable = true
  }
}
