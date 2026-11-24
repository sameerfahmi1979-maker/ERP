import { readSignedNotificationTick, runSignedNotificationTick } from "@/server/communications/signed-notification-tick";
import { withDeadline } from "@/lib/email/queue/delivery-contract";

export const runtime = "nodejs";
export const maxDuration = 45;

function reply(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function fixedBody(request: Request) {
  if (!request.body) return false;
  const reader = request.body.getReader();
  try {
    return await withDeadline(1000, async (signal) => {
      let count = 0;
      while (!signal.aborted) {
        const part = await reader.read();
        if (part.done) return count === 2;
        if (count + part.value.byteLength > 2) return false;
        for (const byte of part.value) {
          if (byte !== (count === 0 ? 123 : 125)) return false;
          count++;
        }
      }
      return false;
    });
  } catch {
    return false;
  } finally {
    void reader.cancel().catch(() => {});
  }
}

export async function POST(request: Request) {
  const length = request.headers.get("content-length");
  if ((length !== null && length !== "2") || request.headers.has("transfer-encoding") ||
      request.headers.has("cookie") || request.headers.has("origin") || request.headers.has("sec-fetch-site") ||
      new URL(request.url).search) return reply(400);
  const authorization = request.headers.get("authorization");
  const nonce = request.headers.get("x-erp-notification-nonce");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 4103 || !nonce || nonce.length !== 36) return reply(403);
  const token = authorization.slice(7);
  if (!readSignedNotificationTick(token, nonce)) return reply(403);
  if (!await fixedBody(request)) return reply(400);
  const result = await runSignedNotificationTick(token, nonce);
  return reply(result === "processed" ? 204 : result === "invalid" ? 403 : 503);
}
