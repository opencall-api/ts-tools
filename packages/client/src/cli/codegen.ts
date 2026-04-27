#!/usr/bin/env bun
import { writeFile, readFile } from "node:fs/promises"
import { generateClientTypes } from "../codegen.js"

async function main() {
  const args = process.argv.slice(2)
  let from: string | undefined
  let out: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from") from = args[++i]
    else if (args[i] === "--out") out = args[++i]
  }
  if (!from || !out) {
    console.error("Usage: opencall-codegen --from <url-or-file> --out <path>")
    process.exit(1)
  }

  let json: string
  if (from.startsWith("http://") || from.startsWith("https://")) {
    const res = await fetch(from)
    if (!res.ok) {
      console.error(`Failed to fetch ${from}: ${res.status} ${res.statusText}`)
      process.exit(1)
    }
    json = await res.text()
  } else {
    json = await readFile(from, "utf8")
  }

  const registry = JSON.parse(json)
  if (!registry || !Array.isArray(registry.operations)) {
    console.error(`Invalid registry: missing operations array`)
    process.exit(1)
  }

  const ts = generateClientTypes(registry)
  await writeFile(out, ts, "utf8")
  console.log(`wrote ${out}`)
}

if (import.meta.main) {
  await main()
}
