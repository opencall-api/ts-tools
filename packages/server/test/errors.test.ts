import { test, expect, describe } from "bun:test";
import {
  DomainError,
  domainError,
  protocolError,
  BackendUnavailableError,
} from "../src/index.ts";

describe("DomainError", () => {
  test("creates error with code and message", () => {
    const err = new DomainError("NOT_FOUND", "Item not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Item not found");
    expect(err.name).toBe("DomainError");
    expect(err).toBeInstanceOf(Error);
  });

  test("creates error with cause", () => {
    const cause = { id: "123" };
    const err = new DomainError("NOT_FOUND", "Item not found", cause);
    expect(err.cause).toEqual(cause);
  });
});

describe("domainError", () => {
  test("returns response envelope with state=error", () => {
    const resp = domainError("req-1", "ITEM_NOT_FOUND", "Not found");
    expect(resp.requestId).toBe("req-1");
    expect(resp.state).toBe("error");
    expect(resp.error?.code).toBe("ITEM_NOT_FOUND");
    expect(resp.error?.message).toBe("Not found");
  });

  test("includes cause when provided", () => {
    const resp = domainError("req-1", "FAIL", "oops", { detail: "x" });
    expect(resp.error?.cause).toEqual({ detail: "x" });
  });

  test("omits cause when not provided", () => {
    const resp = domainError("req-1", "FAIL", "oops");
    expect(resp.error?.cause).toBeUndefined();
  });
});

describe("protocolError", () => {
  test("returns status and error body", () => {
    const resp = protocolError("INVALID_ENVELOPE", "Bad request", 400);
    expect(resp.status).toBe(400);
    expect(resp.body.state).toBe("error");
    expect(resp.body.error?.code).toBe("INVALID_ENVELOPE");
  });

  test("generates a requestId", () => {
    const resp = protocolError("ERR", "msg", 500);
    expect(resp.body.requestId).toBeTruthy();
    // Should be a valid UUID format
    expect(resp.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("BackendUnavailableError", () => {
  test("BackendUnavailableError carries service and retriable", () => {
    const err = new BackendUnavailableError("postgres", "connection refused");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BackendUnavailableError);
    expect(err.name).toBe("BackendUnavailableError");
    expect(err.service).toBe("postgres");
    expect(err.retriable).toBe(true);
    expect(err.message).toBe("connection refused");
  });

  test("BackendUnavailableError preserves cause", () => {
    const cause = new Error("ECONNREFUSED 127.0.0.1:5432");
    const err = new BackendUnavailableError("postgres", "down", cause);
    expect(err.cause).toBe(cause);
  });
});
