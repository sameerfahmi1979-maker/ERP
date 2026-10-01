import { signIn } from "@/features/auth/login-action";
import { authResponse as reply, isSameOriginAuthRequest } from "@/lib/auth/http-boundary";

const MAX_BODY_BYTES = 8192;

/** A complete JSON response avoids abandoning a streamed action during hard navigation.
 * Origin validation replaces the Server Action transport's CSRF check; password
 * validation, durable quotas and cookie handling remain in the existing signIn.
 */
export async function POST(request: Request) {
  try {
    if (!isSameOriginAuthRequest(request)) return reply(false, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(false, 415);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return reply(false, 413);
    if (!request.body) return reply(false, 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return reply(false, 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return reply((await signIn(input)).success);
  } catch { return reply(false, 400); }
}
