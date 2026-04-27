import { test, expect } from "bun:test"
import { isDbConnectionError } from "@opencall/server"

test("recognizes ECONNREFUSED", () => {
  expect(isDbConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true)
})

test("recognizes connection terminated", () => {
  expect(isDbConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true)
})

test("recognizes connection ended", () => {
  expect(isDbConnectionError(new Error("Connection ended"))).toBe(true)
})

test("recognizes connect timeout", () => {
  expect(isDbConnectionError(new Error("Timeout while trying to connect"))).toBe(true)
})

test("recognizes too many connections", () => {
  expect(isDbConnectionError(new Error("sorry, too many connections"))).toBe(true)
})

test("recognizes PostgreSQL admin shutdown codes", () => {
  for (const code of ["57P01", "57P02", "57P03"]) {
    const err = new Error("server closing")
    Object.assign(err, { code })
    expect(isDbConnectionError(err)).toBe(true)
  }
})

test("rejects unrelated errors", () => {
  expect(isDbConnectionError(new Error("syntax error at or near"))).toBe(false)
  expect(isDbConnectionError(new Error("permission denied"))).toBe(false)
  expect(isDbConnectionError("not an error")).toBe(false)
  expect(isDbConnectionError(null)).toBe(false)
  expect(isDbConnectionError(undefined)).toBe(false)
})
