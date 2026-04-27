/**
 * Extracts JSDoc tags from the first JSDoc block found in a source file.
 *
 * Returns a record mapping tag names to their accumulated values. For tags
 * that can appear multiple times (e.g. @security), values are joined with
 * spaces so they can be split later.
 *
 * Example input:
 * ```
 * /** @op v1:catalog.list
 *  *  @flags sideEffecting
 *  *  @execution sync
 *  *  @timeout 5000
 *  *  @security items:browse
 *  *  @security items:read
 *  *\/
 * ```
 *
 * Returns:
 * ```
 * { op: "v1:catalog.list", flags: "sideEffecting", execution: "sync",
 *   timeout: "5000", security: "items:browse items:read" }
 * ```
 */
export function parseJSDoc(sourceText: string): Record<string, string> {
  const jsdocMatch = sourceText.match(/\/\*\*[\s\S]*?\*\//);
  if (!jsdocMatch) return {};

  const block = jsdocMatch[0];
  const tags: Record<string, string> = {};

  const tagPattern = /@(\w+)\s+(.*?)(?:\s*\*\/|\s*$)/gm;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(block)) !== null) {
    const tagName = match[1]!;
    const tagValue = match[2]!.replace(/\s*\*?\s*$/, "").trim();

    if (tagName in tags) {
      tags[tagName] = `${tags[tagName]} ${tagValue}`;
    } else {
      tags[tagName] = tagValue;
    }
  }

  return tags;
}
