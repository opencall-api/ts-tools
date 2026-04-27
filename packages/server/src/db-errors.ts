/**
 * Heuristic detection of database connection failures.
 *
 * Recognises common message patterns from the `postgres` driver, the
 * Neon and Hyperdrive runtime errors that surface when a serverless
 * connection times out or is closed, and PostgreSQL admin-shutdown
 * SQLSTATE codes. Returns true for errors that should be surfaced as
 * BACKEND_UNAVAILABLE rather than INTERNAL_ERROR.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const msg = err.message.toLowerCase()
  if (msg.includes("connection refused") || msg.includes("econnrefused")) return true
  if (msg.includes("connection terminated") || msg.includes("connection ended")) return true
  if (msg.includes("timeout") && msg.includes("connect")) return true
  if (msg.includes("too many connections")) return true

  const code = (err as { code?: unknown }).code
  if (typeof code === "string") {
    if (code === "57P01" || code === "57P02" || code === "57P03") return true
  }

  return false
}
