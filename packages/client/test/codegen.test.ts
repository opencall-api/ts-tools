import { test, expect } from "bun:test"
import { generateClientTypes } from "../src/codegen.js"
import type { RegistryResponse } from "@opencall/types"
import { writeFile, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const fixture: RegistryResponse = {
  callVersion: "2026-02-10",
  schemaHash: "sha256:test",
  endpoints: ["rpc"],
  operations: [
    {
      op: "v1:orders.getItem",
      executionModel: "sync",
      sideEffecting: false,
      argsSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
      resultSchema: { type: "object", properties: { name: { type: "string" }, price: { type: "number" } } },
      authScopes: [],
      sync: { maxMs: 1000, onTimeout: "fail" },
      idempotency: { supported: false, required: false },
      cache: { enabled: false },
      deprecated: true, sunset: "2026-06-01", replacement: "v2:orders.getItem",
    },
    {
      op: "v2:orders.getItem",
      executionModel: "sync",
      sideEffecting: false,
      argsSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
      resultSchema: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, currency: { type: "string" } } },
      authScopes: [],
      sync: { maxMs: 1000, onTimeout: "fail" },
      idempotency: { supported: false, required: false },
      cache: { enabled: false },
    },
  ],
}

test("generateClientTypes emits an Operations map keyed by op name", () => {
  const out = generateClientTypes(fixture)
  expect(out).toContain('"v1:orders.getItem"')
  expect(out).toContain('"v2:orders.getItem"')
  expect(out).toContain("type Operations")
})

test("generated types include args and result subtypes per op", () => {
  const out = generateClientTypes(fixture)
  expect(out).toContain("orderId: string")
  expect(out).toContain("price: number")
})

test("deprecated ops carry @deprecated JSDoc with sunset and replacement", () => {
  const out = generateClientTypes(fixture)
  expect(out).toMatch(/@deprecated/)
  expect(out).toContain("2026-06-01")
  expect(out).toContain("v2:orders.getItem")
})

test("generates a typed call function declaration", () => {
  const out = generateClientTypes(fixture)
  expect(out).toContain("declare function call")
  expect(out).toContain("Op extends keyof Operations")
})

test("opencall-codegen reads a local JSON registry and writes a .d.ts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencall-codegen-"))
  const inFile = join(dir, "ops.json")
  const outFile = join(dir, "out.d.ts")
  await writeFile(inFile, JSON.stringify({
    callVersion: "2026-02-10",
    schemaHash: "sha256:test",
    endpoints: ["rpc"],
    operations: [{
      op: "v1:foo",
      executionModel: "sync",
      sideEffecting: false,
      argsSchema: { type: "object" }, resultSchema: { type: "object" },
      authScopes: [],
      sync: { maxMs: 0, onTimeout: "fail" },
      idempotency: { supported: false, required: false },
      cache: { enabled: false },
    }],
  }))
  const cliPath = resolve(import.meta.dir, "..", "src", "cli", "codegen.ts")
  const r = spawnSync("bun", ["run", cliPath, "--from", inFile, "--out", outFile], { encoding: "utf8" })
  expect(r.status).toBe(0)
  const out = await readFile(outFile, "utf8")
  expect(out).toContain('"v1:foo"')
})
