import { test, expect } from "bun:test"
import { callAndWait } from "../src/wait.js"

test("callAndWait returns immediately on a complete first response", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ requestId: "x", state: "complete", result: 1 }), { status: 200 })
  const res = await callAndWait("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  })
  expect(res.state).toBe("complete")
})

test("callAndWait polls when state is accepted, terminates on complete", async () => {
  let n = 0
  const fakeFetch: typeof fetch = async (input) => {
    n++
    const url = String(input)
    if (url.endsWith("/call")) {
      return new Response(JSON.stringify({
        requestId: "x",
        state: "accepted",
        location: { uri: "https://api.example.com/ops/x" },
        retryAfterMs: 1,
      }), { status: 202 })
    }
    return new Response(JSON.stringify({ requestId: "x", state: "complete", result: 42 }), { status: 200 })
  }
  const res = await callAndWait("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
    minPollMs: 1,
  })
  expect(res.state).toBe("complete")
  expect((res.result as number)).toBe(42)
  expect(n).toBeGreaterThanOrEqual(2)
})

test("callAndWait throws on maxWaitMs exceeded", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    requestId: "x", state: "accepted", location: { uri: "https://api.example.com/ops/x" }, retryAfterMs: 1,
  }), { status: 202 })
  await expect(
    callAndWait("v1:foo", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
      maxWaitMs: 50,
      minPollMs: 1,
    }),
  ).rejects.toThrow(/maxWaitMs|timed out/i)
})

test("callAndWait returns terminal error state without throwing", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    requestId: "x", state: "error", error: { code: "FOO", message: "nope" },
  }), { status: 200 })
  const res = await callAndWait("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  })
  expect(res.state).toBe("error")
  expect(res.error?.code).toBe("FOO")
})
