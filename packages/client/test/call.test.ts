import { test, expect } from "bun:test"
import { call } from "../src/call.js"

test("call posts to /call with the envelope", async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(
      JSON.stringify({ requestId: "abc", state: "complete", result: { ok: true } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }
  const res = await call("v1:orders.getItem", { orderId: "1" }, { requestId: "abc" }, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  })
  expect(calls.length).toBe(1)
  expect(calls[0]!.url).toBe("https://api.example.com/call")
  expect(calls[0]!.init.method).toBe("POST")
  const body = JSON.parse(String(calls[0]!.init.body))
  expect(body.op).toBe("v1:orders.getItem")
  expect(body.args).toEqual({ orderId: "1" })
  expect(body.ctx.requestId).toBe("abc")
  expect(res.state).toBe("complete")
  expect((res.result as { ok: boolean }).ok).toBe(true)
})

test("call generates a requestId when not provided", async () => {
  const calls: { body: unknown }[] = []
  const fakeFetch: typeof fetch = async (_input, init) => {
    calls.push({ body: JSON.parse(String(init!.body)) })
    return new Response(JSON.stringify({ requestId: "auto", state: "complete" }), { status: 200 })
  }
  await call("v1:foo.bar", {}, undefined, { endpoint: "https://api.example.com", fetch: fakeFetch })
  const sent = calls[0]!.body as { ctx: { requestId: string } }
  expect(typeof sent.ctx.requestId).toBe("string")
  expect(sent.ctx.requestId.length).toBeGreaterThan(0)
})

test("call sends Authorization header when a static token is supplied", async () => {
  let captured: Headers | undefined
  const fakeFetch: typeof fetch = async (_input, init) => {
    captured = new Headers(init!.headers)
    return new Response(JSON.stringify({ requestId: "x", state: "complete" }), { status: 200 })
  }
  await call("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
    token: "abc.def.ghi",
  })
  expect(captured!.get("authorization")).toBe("Bearer abc.def.ghi")
})

test("call resolves a function token (sync or async)", async () => {
  let captured: string | undefined
  const fakeFetch: typeof fetch = async (_input, init) => {
    captured = new Headers(init!.headers).get("authorization") ?? undefined
    return new Response(JSON.stringify({ requestId: "x", state: "complete" }), { status: 200 })
  }
  await call("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
    token: async () => "dyn-token",
  })
  expect(captured).toBe("Bearer dyn-token")
})

test("call without endpoint throws when no global location is available", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({}), { status: 200 })
  // In Bun's test environment, globalThis.location is typically undefined.
  // The function should throw with a clear message about the missing endpoint.
  await expect(
    call("v1:foo", {}, undefined, { fetch: fakeFetch }),
  ).rejects.toThrow(/endpoint/i)
})

test("parseResponse: true validates the response and rejects malformed payloads", async () => {
  const malformed: typeof fetch = async () =>
    // Missing required `requestId` and `state` per ResponseEnvelopeSchema.
    new Response(JSON.stringify({}), { status: 200 })
  await expect(
    call("v1:foo", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: malformed,
      parseResponse: true,
    }),
  ).rejects.toThrow()
})
