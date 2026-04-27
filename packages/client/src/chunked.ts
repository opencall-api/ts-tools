import type { CallOptions } from "./call.js"

export interface ChunkResponse {
  state: "pending" | "complete" | "error"
  chunk: { checksum: string; checksumPrevious: string | null }
  data: string
  cursor?: string
  error?: { code: string; message: string; cause?: unknown }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function base64Decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"))
}

export async function retrieveChunked(
  requestId: string,
  options: CallOptions,
): Promise<Uint8Array> {
  // Resolve endpoint
  let endpoint = options.endpoint
  if (!endpoint) {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin
    if (origin) {
      endpoint = origin
    } else {
      throw new Error(
        "retrieveChunked: no endpoint provided and no global location available; supply options.endpoint",
      )
    }
  }

  // Resolve token
  let resolvedToken: string | undefined
  if (options.token !== undefined) {
    if (typeof options.token === "function") {
      resolvedToken = await options.token()
    } else {
      resolvedToken = options.token
    }
  }

  // Build headers
  const headers: Record<string, string> = {}
  if (resolvedToken !== undefined) {
    headers["Authorization"] = `Bearer ${resolvedToken}`
  }

  const fetchFn = options.fetch ?? globalThis.fetch

  const chunks: Uint8Array[] = []
  let previousChecksum: string | null = null
  let cursor: string | undefined

  while (true) {
    const url =
      `${endpoint}/ops/${encodeURIComponent(requestId)}/chunks` +
      (cursor !== undefined ? `?cursor=${encodeURIComponent(cursor)}` : "")

    const response = await fetchFn(url, { headers })
    const res = (await response.json()) as ChunkResponse

    // Handle error state
    if (res.state === "error") {
      const err = res.error
      throw new Error(err ? `${err.code}: ${err.message}` : "retrieveChunked: unknown error")
    }

    // Validate chain
    if (res.chunk.checksumPrevious !== previousChecksum) {
      throw new Error(
        `retrieveChunked: chain break — expected checksumPrevious "${previousChecksum}" but got "${res.chunk.checksumPrevious}"`,
      )
    }

    // Decode data and verify hash
    const bytes = base64Decode(res.data)
    const actualHex = await sha256Hex(bytes)
    const actualChecksum = `sha256:${actualHex}`
    if (actualChecksum !== res.chunk.checksum) {
      throw new Error(
        `retrieveChunked: checksum mismatch — expected "${res.chunk.checksum}" but computed "${actualChecksum}"`,
      )
    }

    chunks.push(bytes)
    previousChecksum = res.chunk.checksum

    if (res.state === "complete") {
      break
    }

    // Non-terminal state must have a cursor
    if (!res.cursor) {
      throw new Error("retrieveChunked: non-terminal state without cursor")
    }
    cursor = res.cursor
  }

  // Concatenate all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
