import { test, expect, describe } from "bun:test";
import { parseJSDoc } from "../src/jsdoc.ts";

describe("parseJSDoc", () => {
  test("extracts single tags", () => {
    const source = `
/** @op v1:catalog.list
 *  @execution sync
 *  @timeout 5000
 *  @onTimeout fail
 */
`;
    const tags = parseJSDoc(source);
    expect(tags.op).toBe("v1:catalog.list");
    expect(tags.execution).toBe("sync");
    expect(tags.timeout).toBe("5000");
    expect(tags.onTimeout).toBe("fail");
  });

  test("accumulates repeated tags with space separator", () => {
    const source = `
/** @op v1:item.get
 *  @security items:read
 *  @security items:browse
 */
`;
    const tags = parseJSDoc(source);
    expect(tags.security).toBe("items:read items:browse");
  });

  test("handles flags with multiple values", () => {
    const source = `
/** @op v1:item.update
 *  @flags sideEffecting idempotencyRequired
 */
`;
    const tags = parseJSDoc(source);
    expect(tags.flags).toContain("sideEffecting");
    expect(tags.flags).toContain("idempotencyRequired");
  });

  test("returns empty object when no JSDoc block exists", () => {
    const source = `// just a comment\nconst x = 1;`;
    expect(parseJSDoc(source)).toEqual({});
  });

  test("returns empty object for JSDoc with no tags", () => {
    const source = `/** Just a description with no tags */`;
    expect(parseJSDoc(source)).toEqual({});
  });

  test("handles all supported OpenCALL tags", () => {
    const source = `
/** @op v1:report.generate
 *  @execution async
 *  @timeout 30000
 *  @ttl 3600
 *  @cache public
 *  @cacheTtl 300
 *  @flags sideEffecting deprecated
 *  @idempotency required ttl=86400 header=Idempotency-Key
 *  @telemetry span=report.generate
 *  @telemetryAttributes reportId,status
 *  @telemetrySensitive accountNumber
 *  @sunset 2025-06-01
 *  @replacement v2:report.generate
 */
`;
    const tags = parseJSDoc(source);
    expect(tags.op).toBe("v1:report.generate");
    expect(tags.execution).toBe("async");
    expect(tags.timeout).toBe("30000");
    expect(tags.ttl).toBe("3600");
    expect(tags.cache).toBe("public");
    expect(tags.cacheTtl).toBe("300");
    expect(tags.idempotency).toBe("required ttl=86400 header=Idempotency-Key");
    expect(tags.telemetry).toBe("span=report.generate");
    expect(tags.telemetryAttributes).toBe("reportId,status");
    expect(tags.telemetrySensitive).toBe("accountNumber");
    expect(tags.flags).toContain("deprecated");
    expect(tags.sunset).toBe("2025-06-01");
    expect(tags.replacement).toBe("v2:report.generate");
  });

  test("only parses the first JSDoc block", () => {
    const source = `
/** @op v1:first.op */

/** @op v1:second.op */
`;
    const tags = parseJSDoc(source);
    expect(tags.op).toBe("v1:first.op");
  });
});
