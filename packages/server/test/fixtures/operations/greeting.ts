import { z } from "zod/v4";

/**
 * Say hello to someone.
 *
 * @op v1:greeting.hello
 * @execution sync
 * @timeout 3000
 * @security greet:read
 * @cache none
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
    result: { message: `Hello, ${parsed.name}!` },
  };
}
