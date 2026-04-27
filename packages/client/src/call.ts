import type { ResponseEnvelope } from "@opencall/types"

export interface CallContext {
  requestId?: string
  sessionId?: string
  parentId?: string
  idempotencyKey?: string
  timeoutMs?: number
  locale?: string
  traceparent?: string
}

export interface CallOptions {
  /** Base URL of the OpenCALL service (e.g. "https://api.opencall-api.com"). Defaults to globalThis.location.origin if running in a browser, otherwise required. */
  endpoint?: string
  /** Bearer token. If supplied, sent as `Authorization: Bearer <token>`. */
  token?: string | (() => string | Promise<string>)
  /** Override the global fetch (useful for tests, or for routing through a proxy/sigv4 helper). */
  fetch?: typeof globalThis.fetch
  /** Optional defensive parsing — validates the response has `requestId` (string) and a valid `state`.
   * Note: @opencall/types exposes a Zod schema for the REQUEST envelope (RequestEnvelopeSchema) but
   * the RESPONSE envelope is currently a plain TypeScript interface with no Zod schema. We use
   * lightweight structural validation here rather than introducing a new schema dependency. */
  parseResponse?: boolean
}

/** The valid ResponseState values per @opencall/types */
const VALID_STATES = new Set(["complete", "accepted", "pending", "error"])

export async function call(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallOptions,
): Promise<ResponseEnvelope> {
  // Resolve endpoint
  let endpoint = options?.endpoint
  if (!endpoint) {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin
    if (origin) {
      endpoint = origin
    } else {
      throw new Error(
        "call: no endpoint provided and no global location available; supply options.endpoint",
      )
    }
  }

  // Resolve token
  let resolvedToken: string | undefined
  if (options?.token !== undefined) {
    if (typeof options.token === "function") {
      resolvedToken = await options.token()
    } else {
      resolvedToken = options.token
    }
  }

  // Build context with guaranteed requestId
  const resolvedCtx: CallContext & { requestId: string } = {
    ...(ctx ?? {}),
    requestId: ctx?.requestId ?? crypto.randomUUID(),
  }

  // Construct request envelope
  const envelope = { op, args, ctx: resolvedCtx }

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (resolvedToken !== undefined) {
    headers["Authorization"] = `Bearer ${resolvedToken}`
  }

  // Use provided fetch or global fetch
  const fetchFn = options?.fetch ?? globalThis.fetch

  const response = await fetchFn(`${endpoint}/call`, {
    method: "POST",
    headers,
    body: JSON.stringify(envelope),
  })

  const json = await response.json() as unknown

  // Defensive parsing when requested
  if (options?.parseResponse === true) {
    if (
      typeof json !== "object" ||
      json === null ||
      typeof (json as Record<string, unknown>).requestId !== "string" ||
      !VALID_STATES.has((json as Record<string, unknown>).state as string)
    ) {
      throw new Error(
        `call: invalid response envelope — expected { requestId: string, state: "complete"|"accepted"|"pending"|"error" }, got: ${JSON.stringify(json)}`,
      )
    }
  }

  return json as ResponseEnvelope
}
