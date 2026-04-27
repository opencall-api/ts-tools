import type { ResponseEnvelope } from "@opencall/types"
import { call } from "./call.js"
import type { CallContext, CallOptions } from "./call.js"

export interface CallAndWaitOptions extends CallOptions {
  /** Maximum total wait time in ms before throwing. Default: 5 minutes. */
  maxWaitMs?: number
  /** Floor for the poll interval in ms. The server's `retryAfterMs` is honoured if larger. Default: 0 (use the server's value or 1000ms). */
  minPollMs?: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function resolveToken(token?: string | (() => string | Promise<string>)): Promise<string | undefined> {
  if (token === undefined) return undefined
  if (typeof token === "string") return token
  return await token()
}

export async function callAndWait(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallAndWaitOptions,
): Promise<ResponseEnvelope> {
  // Make the initial call
  const initialResponse = await call(op, args, ctx, options)

  // Terminal states that require no polling
  if (initialResponse.state === "complete" || initialResponse.state === "error") {
    return initialResponse
  }

  // Must be "accepted" or "pending" — start polling
  let currentResponse = initialResponse
  let elapsedMs = 0
  const maxWait = options?.maxWaitMs ?? 5 * 60 * 1000
  const minPoll = options?.minPollMs ?? 0

  // Resolve endpoint and token once
  let endpoint = options?.endpoint
  if (!endpoint) {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin
    if (origin) {
      endpoint = origin
    } else {
      throw new Error(
        "callAndWait: no endpoint provided and no global location available; supply options.endpoint",
      )
    }
  }

  const resolvedToken = await resolveToken(options?.token)

  const fetchFn = options?.fetch ?? globalThis.fetch

  while (currentResponse.state === "accepted" || currentResponse.state === "pending") {
    // Check for location.uri
    if (!currentResponse.location?.uri) {
      throw new Error(
        `callAndWait: state=${currentResponse.state} but no location.uri to poll`,
      )
    }

    // Compute next poll delay
    const retryAfter = currentResponse.retryAfterMs ?? 1000
    const pollDelay = Math.max(retryAfter, minPoll)

    // Check if the next iteration would exceed maxWaitMs
    if (elapsedMs + pollDelay > maxWait) {
      throw new Error(
        `callAndWait: maxWaitMs exceeded; last state was '${currentResponse.state}'`,
      )
    }

    // Sleep
    await sleep(pollDelay)
    elapsedMs += pollDelay

    // Build headers for GET request
    const headers: Record<string, string> = {}
    if (resolvedToken !== undefined) {
      headers["Authorization"] = `Bearer ${resolvedToken}`
    }

    // Fetch the location URI
    const pollResponse = await fetchFn(currentResponse.location.uri, {
      method: "GET",
      headers,
    })

    const pollJson = await pollResponse.json() as unknown
    currentResponse = pollJson as ResponseEnvelope

    // Check for terminal states
    if (currentResponse.state === "complete" || currentResponse.state === "error") {
      return currentResponse
    }
  }

  // Shouldn't reach here, but return current response just in case
  return currentResponse
}
