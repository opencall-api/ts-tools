import { test, expect } from "bun:test"
import { subscribeStream } from "../src/stream.js"

test("subscribeStream returns the stream descriptor on a streaming response", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    requestId: "ggg",
    state: "streaming",
    stream: {
      transport: "wss",
      encoding: "protobuf",
      schema: "device.PositionFrame",
      location: "wss://streams.example.com/s/ggg",
      sessionId: "mission-001",
      expiresAt: 1739282400,
    },
  }))
  const desc = await subscribeStream("v1:device.subscribePosition", { deviceId: "arm-1" }, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  })
  expect(desc.transport).toBe("wss")
  expect(desc.location).toBe("wss://streams.example.com/s/ggg")
  expect(desc.sessionId).toBe("mission-001")
})

test("subscribeStream throws when state is not streaming", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    requestId: "x", state: "complete", result: { unexpected: true },
  }))
  await expect(
    subscribeStream("v1:device.subscribePosition", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/streaming/i)
})

test("subscribeStream throws when stream object is missing", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    requestId: "x", state: "streaming",
  }))
  await expect(
    subscribeStream("v1:device.subscribePosition", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/stream/)
})
