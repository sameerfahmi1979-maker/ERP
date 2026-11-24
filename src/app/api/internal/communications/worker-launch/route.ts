import { claimWorkerLaunch, readSignedWorkerBoot } from "@/server/communications/worker-boot-ticket";
import { launchChatStageWorker } from "@/server/communications/chat-stage-cleanup";
import { launchPttWorker } from "@/server/communications/ptt";

export const runtime = "nodejs";
const response = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// Next's Node adapter may supply an empty stream even for an HTTP request with Content-Length: 0.
async function emptyBody(request: Request): Promise<boolean> {
  if (!request.body) return true;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 1000); });
    return await Promise.race([reader.read().then(first => first.done === true), expired]);
  } catch { return false; }
  finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export async function POST(request: Request) {
  if (request.headers.has("transfer-encoding") || (request.headers.get("content-length") ?? "0") !== "0" ||
      request.headers.has("cookie") || request.headers.has("origin") || request.headers.has("sec-fetch-site")) return response(400);
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ") || auth.length > 4103) return response(403);
  const plan = readSignedWorkerBoot(auth.slice(7));
  if (!plan) return response(403);
  if (!await emptyBody(request)) return response(400);
  if (!await claimWorkerLaunch(plan)) return response(409);
  const started = plan.kind === "chat_stage" ? await launchChatStageWorker(plan) : await launchPttWorker(plan);
  return response(started ? 204 : 503);
}
