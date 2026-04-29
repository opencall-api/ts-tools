import { z } from "zod/v4";

/**
 * Say goodbye (deprecated, will be removed).
 *
 * @op v1:greeting.farewell
 * @execution sync
 * @timeout 2000
 * @onTimeout escalate
 * @security greet:read
 * @security greet:write
 * @flags sideEffecting deprecated
 * @cache none
 * @idempotency required ttl=86400 header=Idempotency-Key
 * @telemetry span=greeting.farewell
 * @telemetryAttributes name
 * @telemetrySensitive name
 * @sunset 2025-01-01
 * @replacement v1:greeting.goodbye
 */

export const args = z.object({
  name: z.string(),
});

export const result = z.object({
  message: z.string(),
});

export async function handler(input: unknown): Promise<{ state: "complete"; result: unknown }> {
  const parsed = input as z.infer<typeof args>;
  return {
    state: "complete",
    result: { message: `Farewell, ${parsed.name}!` },
  };
}
