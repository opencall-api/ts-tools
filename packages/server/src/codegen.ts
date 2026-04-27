/**
 * Code generation from an OpenCALL registry response.
 *
 * Converts JSON Schema operation definitions into a fully typed
 * TypeScript module with an Operations interface, a typed call()
 * function, and a typed unwrapOp() helper.
 *
 * Pure logic — no I/O. The CLI wrapper handles fetching and writing.
 */

import type { RegistryResponse, RegistryEntry } from "@opencall/types";

/** JSON Schema subset that the registry serves */
interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  $ref?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  nullable?: boolean;
  description?: string;
}

/** Options for generating the typed ops module */
export interface GenerateOpsOptions {
  /** The registry response from /.well-known/ops */
  registry: RegistryResponse;
  /** The name of the client export to import (e.g. "authClient", "identityClient") */
  clientName: string;
  /** The import path for the client module (default: "./client") */
  clientImportPath?: string;
  /** The import path for the types module (default: "./types") */
  typesImportPath?: string;
}

/** Convert a JSON Schema to a TypeScript type string */
function jsonSchemaToTs(schema: JsonSchema, indent = 0): string {
  if (!schema) return "unknown";

  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf)!;
    const nonNull = variants.filter((v) => v.type !== "null");
    const hasNull = variants.some((v) => v.type === "null");
    if (nonNull.length === 1 && hasNull) {
      return `${jsonSchemaToTs(nonNull[0]!, indent)} | null`;
    }
    return variants.map((v) => jsonSchemaToTs(v, indent)).join(" | ");
  }

  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const itemType = schema.items
        ? jsonSchemaToTs(schema.items, indent)
        : "unknown";
      return `${itemType}[]`;
    }
    case "object": {
      if (!schema.properties) return "Record<string, unknown>";
      const pad = "  ".repeat(indent + 1);
      const required = new Set(schema.required || []);
      const fields = Object.entries(schema.properties).map(([key, prop]) => {
        const opt = required.has(key) ? "" : "?";
        return `${pad}${key}${opt}: ${jsonSchemaToTs(prop, indent + 1)}`;
      });
      return `{\n${fields.join("\n")}\n${"  ".repeat(indent)}}`;
    }
    default:
      return "unknown";
  }
}

/**
 * Generate a fully typed TypeScript module from an OpenCALL registry.
 *
 * Returns the source string — the caller writes it to disk.
 */
export function generateOpsModule(options: GenerateOpsOptions): string {
  const {
    registry,
    clientName,
    clientImportPath = "./client",
    typesImportPath = "./types",
  } = options;

  const lines: string[] = [];

  lines.push("// Auto-generated from /.well-known/ops — DO NOT EDIT");
  lines.push(`// Registry version: ${registry.callVersion}`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`import type { CallResult } from '${typesImportPath}'`);
  lines.push(`import { ${clientName}, unwrap } from '${clientImportPath}'`);
  lines.push("");

  // Operations interface
  lines.push("/** Type map for all registered operations */");
  lines.push("export interface Operations {");

  for (const entry of registry.operations) {
    const argsType = jsonSchemaToTs(
      entry.argsSchema as unknown as JsonSchema,
      1,
    );
    const resultType = jsonSchemaToTs(
      entry.resultSchema as unknown as JsonSchema,
      1,
    );

    if (entry.deprecated) {
      lines.push(
        `  /** @deprecated ${entry.replacement ? `Use ${entry.replacement} instead. ` : ""}${entry.sunset ? `Sunset: ${entry.sunset}` : ""} */`,
      );
    }
    lines.push(`  "${entry.op}": {`);
    lines.push(`    args: ${argsType}`);
    lines.push(`    result: ${resultType}`);
    lines.push(`  }`);
  }

  lines.push("}");
  lines.push("");

  // Typed call function
  lines.push(
    "/** Typed OpenCALL call — args and result are inferred from the operation name */",
  );
  lines.push("export async function call<Op extends keyof Operations>(");
  lines.push("  op: Op,");
  lines.push("  args: Operations[Op]['args'],");
  lines.push("): Promise<CallResult> {");
  lines.push(
    `  return ${clientName}.call(op, args as Record<string, unknown>)`,
  );
  lines.push("}");
  lines.push("");

  // Typed unwrap helper
  lines.push("/** Unwrap a successful CallResult with typed result */");
  lines.push(
    "export function unwrapOp<Op extends keyof Operations>(result: CallResult): Operations[Op]['result'] {",
  );
  lines.push("  return unwrap<Operations[Op]['result']>(result)");
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}
