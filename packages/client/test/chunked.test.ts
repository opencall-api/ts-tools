import { test, expect } from "bun:test"
import { retrieveChunked } from "../src/chunked.js"

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}
function b64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64") }

test("single-chunk complete retrieval returns the decoded bytes", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5])
  const checksum = `sha256:${await sha256Hex(bytes)}`
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    state: "complete",
    chunk: { checksum, checksumPrevious: null },
    data: b64(bytes),
  }))
  const out = await retrieveChunked("req-1", { endpoint: "https://api.example.com", fetch: fakeFetch })
  expect(Array.from(out)).toEqual([1, 2, 3, 4, 5])
})

test("two chunks concatenate when chain is valid", async () => {
  const c1 = new Uint8Array([1, 2, 3])
  const c2 = new Uint8Array([4, 5, 6])
  const h1 = `sha256:${await sha256Hex(c1)}`
  const h2 = `sha256:${await sha256Hex(c2)}`
  let n = 0
  const fakeFetch: typeof fetch = async () => {
    n++
    if (n === 1) {
      return new Response(JSON.stringify({
        state: "pending",
        chunk: { checksum: h1, checksumPrevious: null },
        data: b64(c1),
        cursor: "1",
      }))
    }
    return new Response(JSON.stringify({
      state: "complete",
      chunk: { checksum: h2, checksumPrevious: h1 },
      data: b64(c2),
    }))
  }
  const out = await retrieveChunked("req-1", { endpoint: "https://api.example.com", fetch: fakeFetch })
  expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6])
})

test("chain break throws", async () => {
  const c1 = new Uint8Array([1])
  const c2 = new Uint8Array([2])
  const h1 = `sha256:${await sha256Hex(c1)}`
  const h2 = `sha256:${await sha256Hex(c2)}`
  let n = 0
  const fakeFetch: typeof fetch = async () => {
    n++
    if (n === 1) return new Response(JSON.stringify({ state: "pending", chunk: { checksum: h1, checksumPrevious: null }, data: b64(c1), cursor: "1" }))
    return new Response(JSON.stringify({ state: "complete", chunk: { checksum: h2, checksumPrevious: "sha256:WRONG" }, data: b64(c2) }))
  }
  await expect(
    retrieveChunked("req-1", { endpoint: "https://api.example.com", fetch: fakeFetch }),
  ).rejects.toThrow(/chain/i)
})

test("hash mismatch throws", async () => {
  const c1 = new Uint8Array([1, 2, 3])
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    state: "complete",
    chunk: { checksum: "sha256:WRONG", checksumPrevious: null },
    data: b64(c1),
  }))
  await expect(
    retrieveChunked("req-1", { endpoint: "https://api.example.com", fetch: fakeFetch }),
  ).rejects.toThrow(/checksum|mismatch/i)
})

test("error state throws with the error code", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    state: "error",
    chunk: { checksum: "sha256:0", checksumPrevious: null },
    data: "",
    error: { code: "INTERNAL_ERROR", message: "boom" },
  }))
  await expect(
    retrieveChunked("req-1", { endpoint: "https://api.example.com", fetch: fakeFetch }),
  ).rejects.toThrow(/INTERNAL_ERROR|boom/)
})
