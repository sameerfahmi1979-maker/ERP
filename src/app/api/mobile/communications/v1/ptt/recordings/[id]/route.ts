import { communicationRoute, requireMobileCommunication } from "@/server/communications/http";
import { replayPttRecording } from "@/server/communications/ptt-recordings";
export const runtime = "nodejs";
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return communicationRoute(request, async actor => {
    requireMobileCommunication(request);
    return replayPttRecording(request, (await context.params).id, actor);
  });
}
