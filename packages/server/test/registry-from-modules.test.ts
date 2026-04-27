import { test, expect, describe } from "bun:test";
import { z } from "zod/v4";
import { buildRegistryFromModules } from "../src/registry.ts";
import type { OperationModule } from "@opencall/types";
import type { ModuleEntry } from "../src/registry.ts";

// ── Fixture modules (simulating pre-imported operation files) ────────────

const greetingModule: OperationModule = {
  args: z.object({ name: z.string() }),
  result: z.object({ message: z.string() }),
  handler: async (input: unknown) => ({
    state: "complete" as const,
    result: { message: `Hello, ${(input as { name: string }).name}!` },
  }),
};

const farewellModule: OperationModule = {
  args: z.object({ name: z.string() }),
  result: z.object({ message: z.string() }),
  handler: async (input: unknown) => ({
    state: "complete" as const,
    result: { message: `Goodbye, ${(input as { name: string }).name}!` },
  }),
  sunset: "2025-01-01",
  replacement: "v2:greeting.farewell",
};

const entries: ModuleEntry[] = [
  {
    module: greetingModule,
    meta: {
      op: "v1:greeting.hello",
      execution: "sync",
      timeout: 3000,
      security: "greet:read",
      cache: "none",
    },
  },
  {
    module: farewellModule,
    meta: {
      op: "v1:greeting.farewell",
      execution: "sync",
      timeout: 2000,
      security: "greet:read greet:write",
      flags: "sideEffecting deprecated",
    },
  },
];

// ── Tests ────────────────────────────────────────────────────────────────

describe("buildRegistryFromModules", () => {
  test("builds registry from inline modules", () => {
    const { registry, modules } = buildRegistryFromModules(entries);

    expect(registry.operations).toHaveLength(2);
    expect(modules.size).toBe(2);

    const opNames = registry.operations.map((e) => e.op).sort();
    expect(opNames).toEqual(["v1:greeting.farewell", "v1:greeting.hello"]);
  });

  test("parses execution model from meta", () => {
    const { registry } = buildRegistryFromModules(entries);
    const hello = registry.operations.find((e) => e.op === "v1:greeting.hello");
    expect(hello?.executionModel).toBe("sync");
  });

  test("parses timeout from meta", () => {
    const { registry } = buildRegistryFromModules(entries);
    const hello = registry.operations.find((e) => e.op === "v1:greeting.hello");
    expect(hello?.maxSyncMs).toBe(3000);
  });

  test("parses auth scopes from meta", () => {
    const { registry } = buildRegistryFromModules(entries);

    const hello = registry.operations.find((e) => e.op === "v1:greeting.hello");
    expect(hello?.authScopes).toEqual(["greet:read"]);

    const farewell = registry.operations.find((e) => e.op === "v1:greeting.farewell");
    expect(farewell?.authScopes).toEqual(["greet:read", "greet:write"]);
  });

  test("parses flags (sideEffecting, deprecated)", () => {
    const { registry } = buildRegistryFromModules(entries);

    const hello = registry.operations.find((e) => e.op === "v1:greeting.hello");
    expect(hello?.sideEffecting).toBe(false);
    expect(hello?.deprecated).toBeUndefined();

    const farewell = registry.operations.find((e) => e.op === "v1:greeting.farewell");
    expect(farewell?.sideEffecting).toBe(true);
    expect(farewell?.deprecated).toBe(true);
  });

  test("picks up sunset/replacement from module when not in meta", () => {
    const { registry, modules } = buildRegistryFromModules(entries);
    const farewell = registry.operations.find((e) => e.op === "v1:greeting.farewell");
    expect(farewell?.sunset).toBe("2025-01-01");
    expect(farewell?.replacement).toBe("v2:greeting.farewell");

    const mod = modules.get("v1:greeting.farewell");
    expect(mod?.sunset).toBe("2025-01-01");
    expect(mod?.replacement).toBe("v2:greeting.farewell");
  });

  test("meta sunset/replacement overrides module values", () => {
    const { registry } = buildRegistryFromModules([
      {
        module: farewellModule,
        meta: {
          op: "v1:greeting.farewell",
          sunset: "2026-06-01",
          replacement: "v3:greeting.farewell",
        },
      },
    ]);
    const farewell = registry.operations.find((e) => e.op === "v1:greeting.farewell");
    expect(farewell?.sunset).toBe("2026-06-01");
    expect(farewell?.replacement).toBe("v3:greeting.farewell");
  });

  test("generates JSON Schema for args and result", () => {
    const { registry } = buildRegistryFromModules(entries);
    const hello = registry.operations.find((e) => e.op === "v1:greeting.hello");

    expect(hello?.argsSchema).toBeDefined();
    expect(hello?.resultSchema).toBeDefined();
    expect((hello?.argsSchema as Record<string, unknown>).type).toBe("object");
    expect((hello?.resultSchema as Record<string, unknown>).type).toBe("object");
  });

  test("uses custom callVersion", () => {
    const { registry } = buildRegistryFromModules(entries, {
      callVersion: "2026-03-01",
    });
    expect(registry.callVersion).toBe("2026-03-01");
  });

  test("generates etag and json", () => {
    const { json, etag } = buildRegistryFromModules(entries);
    expect(json).toBeTruthy();
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);

    const parsed = JSON.parse(json);
    expect(parsed.operations).toBeArray();
    expect(parsed.operations).toHaveLength(2);
  });

  test("etag is deterministic for same input", () => {
    const r1 = buildRegistryFromModules(entries);
    const r2 = buildRegistryFromModules(entries);
    expect(r1.etag).toBe(r2.etag);
  });

  test("modules contain working handlers", () => {
    const { modules } = buildRegistryFromModules(entries);
    const hello = modules.get("v1:greeting.hello");
    expect(hello).toBeDefined();
  });

  test("handles empty module list", () => {
    const { registry, modules, json } = buildRegistryFromModules([]);
    expect(registry.operations).toHaveLength(0);
    expect(modules.size).toBe(0);
    expect(JSON.parse(json).operations).toEqual([]);
  });

  test("defaults unset meta fields", () => {
    const { registry } = buildRegistryFromModules([
      {
        module: greetingModule,
        meta: { op: "v1:minimal.op" },
      },
    ]);
    const op = registry.operations[0];
    expect(op.executionModel).toBe("sync");
    expect(op.maxSyncMs).toBe(5000);
    expect(op.ttlSeconds).toBe(0);
    expect(op.authScopes).toEqual([]);
    expect(op.cachingPolicy).toBe("none");
    expect(op.sideEffecting).toBe(false);
  });

  test("produces same output as buildRegistry for equivalent input", async () => {
    // Import the fixture modules the same way buildRegistry would
    const { buildRegistry } = await import("../src/registry.ts");
    const { join } = await import("node:path");
    const fixturesDir = join(import.meta.dir, "fixtures", "operations");

    const fsResult = await buildRegistry({ opsDir: fixturesDir });

    // Build equivalent from modules — get the actual fixture modules
    const greetMod = await import("./fixtures/operations/greeting.ts");
    const farewellMod = await import("./fixtures/operations/farewell.ts");

    const modResult = buildRegistryFromModules([
      {
        module: greetMod,
        meta: {
          op: "v1:greeting.hello",
          execution: "sync",
          timeout: 3000,
          security: "greet:read",
          cache: "none",
        },
      },
      {
        module: farewellMod,
        meta: {
          op: "v1:greeting.farewell",
          execution: "sync",
          timeout: 2000,
          security: "greet:read greet:write",
          flags: "sideEffecting deprecated",
          sunset: "2025-01-01",
          replacement: "v1:greeting.goodbye",
          cache: "none",
        },
      },
    ]);

    // Registry entries should match
    const sortOps = (ops: typeof fsResult.registry.operations) =>
      [...ops].sort((a, b) => a.op.localeCompare(b.op));

    expect(sortOps(modResult.registry.operations)).toEqual(
      sortOps(fsResult.registry.operations)
    );
  });
});
