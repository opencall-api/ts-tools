#!/usr/bin/env node
/**
 * CLI: Fetch an OpenCALL registry and generate a typed TypeScript module.
 *
 * Usage:
 *   opencall-generate-ops --url <registry-base-url> --client <clientName> [options]
 *   opencall-generate-ops --env <VITE_*_URL> --client <clientName> [options]
 *
 * Options:
 *   --url <url>          Base URL of the OpenCALL worker (e.g. https://auth.stage.seq.im)
 *   --env <var>          Env var name to read URL from .env.staging (e.g. VITE_AUTH_URL)
 *   --client <name>      Client export name in the generated code (e.g. authClient)
 *   --client-import <p>  Import path for the client module (default: ./client)
 *   --types-import <p>   Import path for the types module (default: ./types)
 *   --out <path>         Output file path (default: src/api/ops.generated.ts)
 *   --default-url <url>  Fallback URL if --env var is not set (default: http://localhost:8787)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { generateOpsModule } from "../codegen.js";
import type { RegistryResponse } from "@opencall/types";

interface CliArgs {
  url?: string;
  env?: string;
  client: string;
  clientImport: string;
  typesImport: string;
  out: string;
  defaultUrl: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CliArgs> = {
    clientImport: "./client",
    typesImport: "./types",
    out: "src/api/ops.generated.ts",
    defaultUrl: "http://localhost:8787",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        parsed.url = args[++i];
        break;
      case "--env":
        parsed.env = args[++i];
        break;
      case "--client":
        parsed.client = args[++i];
        break;
      case "--client-import":
        parsed.clientImport = args[++i];
        break;
      case "--types-import":
        parsed.typesImport = args[++i];
        break;
      case "--out":
        parsed.out = args[++i];
        break;
      case "--default-url":
        parsed.defaultUrl = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`Usage: opencall-generate-ops --client <name> [--url <url> | --env <var>] [options]

Options:
  --url <url>          Base URL of the OpenCALL worker
  --env <var>          Env var to read URL from .env.staging (e.g. VITE_AUTH_URL)
  --client <name>      Client export name (e.g. authClient, identityClient)
  --client-import <p>  Import path for client module (default: ./client)
  --types-import <p>   Import path for types module (default: ./types)
  --out <path>         Output file (default: src/api/ops.generated.ts)
  --default-url <url>  Fallback URL (default: http://localhost:8787)`);
        process.exit(0);
    }
  }

  if (!parsed.client) {
    console.error("Error: --client is required (e.g. --client authClient)");
    process.exit(1);
  }

  return parsed as CliArgs;
}

function resolveUrl(args: CliArgs): string {
  // Explicit URL takes priority
  if (args.url) return args.url;

  // Try positional arg (first non-flag argument) for backwards compat
  const positional = process.argv.slice(2).find((a) => !a.startsWith("--") && !process.argv[process.argv.indexOf(a) - 1]?.startsWith("--"));
  if (positional) return positional;

  // Try env var from .env.staging
  if (args.env) {
    try {
      const text = readFileSync(".env.staging", "utf-8");
      const match = text.match(new RegExp(`${args.env}=(.+)`));
      if (match) return match[1]!.trim();
    } catch {
      // .env.staging not found, fall through
    }
  }

  return args.defaultUrl;
}

async function main() {
  const args = parseArgs();
  const baseUrl = resolveUrl(args);
  const url = `${baseUrl.replace(/\/$/, "")}/.well-known/ops`;

  console.log(`Fetching registry from ${url}...`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(
      `Failed to fetch registry: ${res.status} ${res.statusText}`,
    );
    process.exit(1);
  }

  const registry = (await res.json()) as RegistryResponse;
  console.log(
    `Found ${registry.operations.length} operations (v${registry.callVersion})`,
  );

  const code = generateOpsModule({
    registry,
    clientName: args.client,
    clientImportPath: args.clientImport,
    typesImportPath: args.typesImport,
  });

  // Ensure output directory exists
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, code, "utf-8");
  console.log(`Written to ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
