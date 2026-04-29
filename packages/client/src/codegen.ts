import type { RegistryResponse } from "@opencall/types"

export interface CodegenOptions {
  /** Whether to include the typed `call` overload. Defaults to true. */
  emitCall?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSchema(schema: Record<string, unknown>, indent: string): string {
  if (!schema || typeof schema !== "object") return "unknown"

  // enum type
  if (Array.isArray((schema as any).enum)) {
    const values = (schema as any).enum as unknown[]
    return values
      .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
      .join(" | ")
  }

  const type = (schema as any).type as string | undefined

  if (type === "object") {
    const properties = (schema as any).properties as Record<string, Record<string, unknown>> | undefined
    const required = (schema as any).required as string[] | undefined
    if (!properties || Object.keys(properties).length === 0) {
      return "Record<string, unknown>"
    }
    const lines: string[] = ["{"]
    for (const [key, propSchema] of Object.entries(properties)) {
      const isRequired = required?.includes(key) ?? false
      const tsType = renderSchema(propSchema, indent + "  ")
      if (isRequired) {
        lines.push(`${indent}  ${key}: ${tsType}`)
      } else {
        lines.push(`${indent}  ${key}: ${tsType} | undefined`)
      }
    }
    lines.push(`${indent}}`)
    return lines.join("\n")
  }

  if (type === "string") return "string"
  if (type === "number" || type === "integer") return "number"
  if (type === "boolean") return "boolean"

  if (type === "array") {
    const items = (schema as any).items as Record<string, unknown> | undefined
    if (items) {
      return `Array<${renderSchema(items, indent)}>`
    }
    return "Array<unknown>"
  }

  return "unknown"
}

export function generateClientTypes(
  registry: RegistryResponse,
  options?: CodegenOptions,
): string {
  const emitCall = options?.emitCall !== false

  const lines: string[] = [
    `// Auto-generated from RegistryResponse — do not edit by hand.`,
    `// callVersion: ${registry.callVersion}`,
    ``,
    `type Operations = {`,
  ]

  for (const entry of registry.operations) {
    if (entry.deprecated) {
      lines.push(`  /**`)
      lines.push(`   * @deprecated Sunset: ${entry.sunset ?? "unknown"}. Use ${entry.replacement ?? "N/A"}.`)
      lines.push(`   */`)
    }
    const argsType = renderSchema(entry.argsSchema as Record<string, unknown>, "  ")
    const resultType = renderSchema((entry.resultSchema ?? {}) as Record<string, unknown>, "  ")
    lines.push(`  "${entry.op}": {`)
    lines.push(`    args: ${argsType}`)
    lines.push(`    result: ${resultType}`)
    lines.push(`  }`)
  }

  lines.push(`}`)

  if (emitCall) {
    lines.push(``)
    lines.push(`declare function call<Op extends keyof Operations>(`)
    lines.push(`  op: Op,`)
    lines.push(`  args: Operations[Op]["args"],`)
    lines.push(`  ctx?: import("@opencall/client").CallContext,`)
    lines.push(`  options?: import("@opencall/client").CallOptions,`)
    lines.push(`): Promise<import("@opencall/types").ResponseEnvelope>`)
  }

  lines.push(``)
  lines.push(`export type { Operations }`)
  if (emitCall) {
    lines.push(`export { call }`)
  }

  return lines.join("\n") + "\n"
}
