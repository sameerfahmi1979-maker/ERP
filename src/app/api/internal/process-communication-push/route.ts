import { authorizeWorker } from "@/lib/email/queue/worker-auth";
import { InvalidWorkerInput, readWorkerInput } from "@/lib/email/queue/runtime-limits";
import { processNotificationTick } from "@/server/communications/notification-scheduler";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  const headers = {"Cache-Control": "private, no-store"};
  if (!authorizeWorker(request.headers.get("authorization"), process.env.INTERNAL_API_SECRET))
    return Response.json({error: "Unauthorized"}, {status: 401, headers});
  if (process.env.ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED !== "true")
    return Response.json({state: "disabled"}, {headers});
  try {
    const result = await processNotificationTick(await readWorkerInput(request));
    const status = result.state === "invalid" ? 400 : result.state === "unconfirmed" ? 503 : 200;
    return Response.json(result, {status, headers});
  } catch (error) {
    return Response.json({error: "Notification tick unavailable"}, {status: error instanceof InvalidWorkerInput ? 400 : 503, headers});
  }
}
