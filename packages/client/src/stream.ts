import type { ResponseEnvelope, StreamDescriptor } from "@opencall/types"
import { call } from "./call.js"
import type { CallContext, CallOptions } from "./call.js"

export async function subscribeStream(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallOptions,
): Promise<StreamDescriptor> {
  const res: ResponseEnvelope = await call(op, args, ctx, options)
  if (res.state !== "streaming") {
    throw new Error(
      `subscribeStream: expected state="streaming" but got "${res.state}"${
        res.error ? ` (error ${res.error.code}: ${res.error.message})` : ""
      }`,
    )
  }
  if (!res.stream) {
    throw new Error(
      "subscribeStream: response had state=streaming but no stream descriptor",
    )
  }
  return res.stream
}
