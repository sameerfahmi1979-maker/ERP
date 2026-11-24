import { communicationRoute } from "@/server/communications/http";
import { receiveUpload } from "@/server/communications/media";

export const runtime = "nodejs";
export function POST(request: Request, context: { params: Promise<{ uploadId: string }> }) {
  return communicationRoute(request,async actor=>receiveUpload(request,(await context.params).uploadId,actor));
}
