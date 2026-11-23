import { communicationRoute, requireMobileCommunication } from "@/server/communications/http";
import { uploadPttRecording } from "@/server/communications/ptt-recordings";
export const runtime = "nodejs";
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return communicationRoute(request, async actor => {
    requireMobileCommunication(request);
    return uploadPttRecording(request, (await context.params).id, actor);
  });
}
