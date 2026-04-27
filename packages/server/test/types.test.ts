import { test, expect } from "bun:test"
import { z } from "zod/v4"
import type { OperationModule } from "@opencall/types"

test("OperationModule allows requiresAuth: true", () => {
  const op: OperationModule = {
    args: z.object({}),
    result: z.object({}),
    requiresAuth: true,
    handler: async () => ({ state: "complete", result: {} }),
  }
  expect(op.requiresAuth).toBe(true)
})

test("OperationModule allows requiresAuth omitted (undefined)", () => {
  const op: OperationModule = {
    args: z.object({}),
    result: z.object({}),
    handler: async () => ({ state: "complete", result: {} }),
  }
  expect(op.requiresAuth).toBeUndefined()
})
