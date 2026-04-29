import { test, expect, describe } from "bun:test";
import { z } from "zod/v4";
import {
  DomainError,
  BackendUnavailableError,
  validateEnvelope,
  validateArgs,
  checkSunset,
  formatResponse,
  safeHandlerCall,
  type OperationModule,
  type OperationResult,
} from "../src/index.ts";

// ── Test fixtures ────────────────────────────────────────────────────────

const testOp: OperationModule = {
  args: z.object({ name: z.string(), age: z.number().optional() }),
  result: z.object({ greeting: z.string() }),
  handler: async (input: unknown) => ({
    state: "complete" as const,
    result: { greeting: `Hi ${(input as { name: string }).name}` },
  }),
};

const sunsetOp: OperationModule = {
  ...testOp,
  sunset: "2024-01-01",
  replacement: "v2:test.op",
};

const futureOp: OperationModule = {
  ...testOp,
  sunset: "2099-12-31",
};

// ── validateEnvelope ─────────────────────────────────────────────────────

describe("validateEnvelope", () => {
  test("succeeds with valid envelope", () => {
    const result = validateEnvelope({ op: "v1:test.op", args: { x: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.op).toBe("v1:test.op");
    }
  });

  test("fails with missing op", () => {
    const result = validateEnvelope({ args: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.body.error?.code).toBe("INVALID_ENVELOPE");
    }
  });

  test("fails with empty op string", () => {
    const result = validateEnvelope({ op: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.body.error?.code).toBe("INVALID_ENVELOPE");
    }
  });

  test("fails with non-object body", () => {
    const result = validateEnvelope("not an object");
    expect(result.ok).toBe(false);
  });

  test("fails with invalid ctx.requestId", () => {
    const result = validateEnvelope({
      op: "v1:test",
      ctx: { requestId: "bad" },
    });
    expect(result.ok).toBe(false);
  });
});

// ── validateArgs ─────────────────────────────────────────────────────────

describe("validateArgs", () => {
  test("succeeds with valid args", () => {
    const result = validateArgs(testOp, { name: "Alice" }, "req-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "Alice" });
    }
  });

  test("succeeds with optional fields", () => {
    const result = validateArgs(testOp, { name: "Bob", age: 30 }, "req-1");
    expect(result.ok).toBe(true);
  });

  test("fails with missing required field", () => {
    const result = validateArgs(testOp, {}, "req-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.body.error?.code).toBe("SCHEMA_VALIDATION_FAILED");
    }
  });

  test("fails with wrong type", () => {
    const result = validateArgs(testOp, { name: 123 }, "req-1");
    expect(result.ok).toBe(false);
  });

  test("includes sessionId in error response when provided", () => {
    const result = validateArgs(testOp, {}, "req-1", "sess-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.body.sessionId).toBe("sess-1");
    }
  });

  test("error cause includes issue details", () => {
    const result = validateArgs(testOp, { name: 42 }, "req-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cause = result.error.body.error?.cause as { issues: { path: string; message: string }[] };
      expect(cause.issues).toBeArray();
      expect(cause.issues.length).toBeGreaterThan(0);
      expect(cause.issues[0].path).toBe("name");
    }
  });
});

// ── checkSunset ──────────────────────────────────────────────────────────

describe("checkSunset", () => {
  test("returns undefined for operation with no sunset", () => {
    expect(checkSunset(testOp, "v1:test", "req-1")).toBeUndefined();
  });

  test("returns undefined for future sunset date", () => {
    expect(checkSunset(futureOp, "v1:test", "req-1")).toBeUndefined();
  });

  test("returns 410 for past sunset date", () => {
    const result = checkSunset(sunsetOp, "v1:old.op", "req-1");
    expect(result).toBeDefined();
    expect(result!.status).toBe(410);
    expect(result!.body.error?.code).toBe("OP_REMOVED");
  });

  test("includes replacement in sunset error cause", () => {
    const result = checkSunset(sunsetOp, "v1:old.op", "req-1");
    const cause = result!.body.error?.cause as { replacement: string };
    expect(cause.replacement).toBe("v2:test.op");
  });
});

// ── formatResponse ───────────────────────────────────────────────────────

describe("formatResponse", () => {
  test("returns 200 for complete state", () => {
    const result = formatResponse(
      { state: "complete", result: { data: 1 } },
      "req-1"
    );
    expect(result.status).toBe(200);
    expect(result.body.state).toBe("complete");
    expect(result.body.result).toEqual({ data: 1 });
  });

  test("returns 202 for accepted state", () => {
    const result = formatResponse(
      { state: "accepted", retryAfterMs: 5000 },
      "req-1"
    );
    expect(result.status).toBe(202);
    expect(result.body.retryAfterMs).toBe(5000);
  });

  test("returns 303 for location-only redirect", () => {
    const result = formatResponse(
      { state: "complete", location: { uri: "https://cdn.example.com/file.pdf" } },
      "req-1"
    );
    expect(result.status).toBe(303);
    expect(result.body.location?.uri).toBe("https://cdn.example.com/file.pdf");
  });

  test("returns 200 when both result and location are present", () => {
    const result = formatResponse(
      {
        state: "complete",
        result: { id: "123" },
        location: { uri: "https://cdn.example.com/123" },
      },
      "req-1"
    );
    expect(result.status).toBe(200);
  });

  test("includes sessionId when provided", () => {
    const result = formatResponse(
      { state: "complete", result: {} },
      "req-1",
      "sess-1"
    );
    expect(result.body.sessionId).toBe("sess-1");
  });

  test("attaches meta when provided", () => {
    const result = formatResponse(
      { state: "complete", result: { ok: true } },
      "req-1",
      undefined,
      { serviceStatus: "degraded", region: "us-east-1" }
    );
    expect(result.status).toBe(200);
    expect((result.body as Record<string, unknown>).meta).toEqual({
      serviceStatus: "degraded",
      region: "us-east-1",
    });
  });

  test("omits meta when not provided", () => {
    const result = formatResponse(
      { state: "complete", result: {} },
      "req-1"
    );
    expect((result.body as Record<string, unknown>).meta).toBeUndefined();
  });

  test("meta does not override envelope fields", () => {
    const result = formatResponse(
      { state: "complete", result: { data: 1 } },
      "req-1",
      "sess-1",
      { extra: "info" }
    );
    expect(result.body.requestId).toBe("req-1");
    expect(result.body.sessionId).toBe("sess-1");
    expect(result.body.state).toBe("complete");
    expect(result.body.result).toEqual({ data: 1 });
    expect((result.body as Record<string, unknown>).meta).toEqual({ extra: "info" });
  });

  test("formatResponse maps streaming OperationResult to 202 + state=streaming", () => {
    const opResult: OperationResult = {
      state: "streaming",
      stream: {
        transport: "wss",
        encoding: "protobuf",
        schema: "device.PositionFrame",
        location: "wss://streams.example.com/s/ggg",
        sessionId: "mission-001",
      },
    }
    const res = formatResponse(opResult, "00000000-0000-0000-0000-000000000000")
    expect(res.status).toBe(202)
    expect(res.body.state).toBe("streaming")
    expect(res.body.stream).toEqual(opResult.stream)
  })

  test("formatResponse passes through sessionId for streaming responses", () => {
    const opResult: OperationResult = {
      state: "streaming",
      stream: {
        transport: "wss", encoding: "protobuf", schema: "x",
        location: "wss://x", sessionId: "abc",
      },
    }
    const res = formatResponse(opResult, "00000000-0000-0000-0000-000000000000", "session-1")
    expect(res.body.sessionId).toBe("session-1")
  })

  test("formatResponse throws when streaming result has no stream descriptor", () => {
    const opResult = { state: "streaming" } as OperationResult
    expect(() => formatResponse(opResult, "00000000-0000-0000-0000-000000000000")).toThrow(/stream/i)
  })
});

// ── safeHandlerCall ──────────────────────────────────────────────────────

describe("safeHandlerCall", () => {
  test("returns formatted result on success", async () => {
    const handler = async () => ({
      state: "complete" as const,
      result: { ok: true },
    });
    const result = await safeHandlerCall(handler, [], "req-1");
    expect(result.status).toBe(200);
    expect(result.body.result).toEqual({ ok: true });
  });

  test("catches DomainError and returns 200 state=error", async () => {
    const handler = async () => {
      throw new DomainError("ITEM_NOT_FOUND", "Not found");
    };
    const result = await safeHandlerCall(handler, [], "req-1");
    expect(result.status).toBe(200);
    expect(result.body.state).toBe("error");
    expect(result.body.error?.code).toBe("ITEM_NOT_FOUND");
  });

  test("catches unexpected errors and returns 500", async () => {
    const handler = async () => {
      throw new Error("kaboom");
    };
    const result = await safeHandlerCall(handler, [], "req-1");
    expect(result.status).toBe(500);
    expect(result.body.error?.code).toBe("INTERNAL_ERROR");
    expect(result.body.error?.message).toBe("kaboom");
  });

  test("handles non-Error throws", async () => {
    const handler = async () => {
      throw "string error";
    };
    const result = await safeHandlerCall(handler, [], "req-1");
    expect(result.status).toBe(500);
    expect(result.body.error?.message).toBe("string error");
  });

  test("passes handler args through", async () => {
    const handler = async (a: unknown, b: unknown) => ({
      state: "complete" as const,
      result: { a, b },
    });
    const result = await safeHandlerCall(handler, ["x", "y"], "req-1");
    expect(result.body.result).toEqual({ a: "x", b: "y" });
  });

  test("safeHandlerCall converts BackendUnavailableError into HTTP 503", async () => {
    const handler = async () => {
      throw new BackendUnavailableError("oauth-server", "down for maintenance")
    }
    const res = await safeHandlerCall(handler, [], "00000000-0000-0000-0000-000000000000")
    expect(res.status).toBe(503)
    expect(res.body.state).toBe("error")
    expect(res.body.error?.code).toBe("BACKEND_UNAVAILABLE")
    expect(res.body.error?.message).toBe("down for maintenance")
    expect((res.body.error?.cause as { service: string }).service).toBe("oauth-server")
    expect(res.body.retryAfterMs).toBe(60_000)
  })

  test("safeHandlerCall converts a postgres connection error into HTTP 503", async () => {
    const handler = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432")
    }
    const res = await safeHandlerCall(handler, [], "00000000-0000-0000-0000-000000000000")
    expect(res.status).toBe(503)
    expect(res.body.error?.code).toBe("BACKEND_UNAVAILABLE")
    expect((res.body.error?.cause as { service: string }).service).toBe("postgres")
    expect(res.body.retryAfterMs).toBe(60_000)
  })
});
