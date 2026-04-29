import { test, expect, describe } from "bun:test";
import {
  RequestEnvelopeSchema,
  type OperationResult,
  type ResponseEnvelope,
  type StreamDescriptor,
} from "../src/index.ts";

describe("RequestEnvelopeSchema", () => {
  test("accepts minimal envelope with just op", () => {
    const result = RequestEnvelopeSchema.safeParse({ op: "v1:test.op" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.op).toBe("v1:test.op");
      expect(result.data.args).toEqual({});
    }
  });

  test("accepts full envelope with all fields", () => {
    const input = {
      op: "v1:test.op",
      args: { name: "test", count: 5 },
      ctx: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        sessionId: "660e8400-e29b-41d4-a716-446655440000",
        parentId: "770e8400-e29b-41d4-a716-446655440000",
        idempotencyKey: "abc-123",
        timeoutMs: 5000,
        locale: "en-AU",
        traceparent: "00-abc123-def456-01",
      },
      auth: {
        iss: "auth.example.com",
        sub: "user:42",
        credentialType: "bearer",
        credential: "tok_secret",
      },
      media: [
        { name: "photo.jpg", mimeType: "image/jpeg", ref: "https://example.com/photo.jpg" },
      ],
    };
    const result = RequestEnvelopeSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toEqual({ name: "test", count: 5 });
      expect(result.data.ctx?.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.data.ctx?.parentId).toBe("770e8400-e29b-41d4-a716-446655440000");
      expect(result.data.ctx?.timeoutMs).toBe(5000);
      expect(result.data.ctx?.locale).toBe("en-AU");
      expect(result.data.ctx?.traceparent).toBe("00-abc123-def456-01");
      expect(result.data.auth?.iss).toBe("auth.example.com");
      expect(result.data.auth?.sub).toBe("user:42");
      expect(result.data.auth?.credentialType).toBe("bearer");
      expect(result.data.auth?.credential).toBe("tok_secret");
      expect(result.data.media).toHaveLength(1);
    }
  });

  test("accepts auth without credential (transport-carried)", () => {
    const result = RequestEnvelopeSchema.safeParse({
      op: "v1:test.op",
      auth: {
        iss: "auth.example.com",
        sub: "device:1234",
        credentialType: "mTLS",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth?.credential).toBeUndefined();
    }
  });

  test("rejects auth missing required iss field", () => {
    const result = RequestEnvelopeSchema.safeParse({
      op: "v1:test.op",
      auth: { sub: "user:1", credentialType: "bearer" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative timeoutMs", () => {
    const result = RequestEnvelopeSchema.safeParse({
      op: "v1:test.op",
      ctx: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        timeoutMs: -100,
      },
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-integer timeoutMs", () => {
    const result = RequestEnvelopeSchema.safeParse({
      op: "v1:test.op",
      ctx: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        timeoutMs: 2.5,
      },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid ctx.parentId (not a UUID)", () => {
    const result = RequestEnvelopeSchema.safeParse({
      op: "v1:test.op",
      ctx: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        parentId: "not-a-uuid",
      },
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing op field", () => {
    const result = RequestEnvelopeSchema.safeParse({ args: {} });
    expect(result.success).toBe(false);
  });

  test("rejects invalid ctx.requestId (not a UUID)", () => {
    const result = RequestEnvelopeSchema.safeParse({
      op: "v1:test.op",
      ctx: { requestId: "not-a-uuid" },
    });
    expect(result.success).toBe(false);
  });

  test("defaults args to empty object when omitted", () => {
    const result = RequestEnvelopeSchema.safeParse({ op: "v1:test.op" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toEqual({});
    }
  });
});

test("RequestEnvelopeSchema accepts ctx without requestId", () => {
  const result = RequestEnvelopeSchema.safeParse({
    op: "v1:foo",
    args: {},
    ctx: { sessionId: "00000000-0000-0000-0000-000000000000" },
  })
  expect(result.success).toBe(true)
})

test("RequestEnvelopeSchema accepts empty ctx object", () => {
  const result = RequestEnvelopeSchema.safeParse({
    op: "v1:foo",
    args: {},
    ctx: {},
  })
  expect(result.success).toBe(true)
})

test("RequestEnvelopeSchema still validates the requestId UUID format when supplied", () => {
  const result = RequestEnvelopeSchema.safeParse({
    op: "v1:foo",
    args: {},
    ctx: { requestId: "not-a-uuid" },
  })
  expect(result.success).toBe(false)
})

test("OperationResult allows state: streaming with a stream descriptor", () => {
  const result: OperationResult = {
    state: "streaming",
    stream: {
      transport: "wss",
      encoding: "protobuf",
      schema: "device.PositionFrame",
      location: "wss://streams.example.com/s/x",
      sessionId: "session-1",
    },
  }
  expect(result.state).toBe("streaming")
  expect(result.stream?.transport).toBe("wss")
})

describe("ResponseEnvelope", () => {
  test("ResponseEnvelope accepts an optional meta record", () => {
    const env: ResponseEnvelope = {
      requestId: "00000000-0000-0000-0000-000000000000",
      state: "complete",
      result: { ok: true },
      meta: { serviceStatus: "degraded", region: "ap-southeast-2" },
    };
    expect(env.meta?.serviceStatus).toBe("degraded");
  });

  test("ResponseEnvelope accepts an optional stream descriptor", () => {
    const env: ResponseEnvelope = {
      requestId: "x",
      state: "streaming",
      stream: {
        transport: "wss",
        encoding: "protobuf",
        schema: "device.PositionFrame",
        location: "wss://streams.example.com/s/x",
        sessionId: "session-1",
      },
    }
    expect(env.stream?.transport).toBe("wss")
  });

  test("StreamDescriptor accepts optional auth + expiresAt", () => {
    const desc: StreamDescriptor = {
      transport: "wss",
      encoding: "protobuf",
      schema: "device.PositionFrame",
      location: "wss://streams.example.com/s/x",
      sessionId: "session-1",
      expiresAt: 1739282400,
      auth: { credentialType: "bearer", credential: "short-lived", expiresAt: 1739282400 },
    }
    expect(desc.auth?.credentialType).toBe("bearer")
  });
});
