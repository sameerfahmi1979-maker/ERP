import { historyMode } from "@/server/communications/contracts";
import { communicationRoute, CommunicationHttpError } from "@/server/communications/http";
import { serveAttachment } from "@/server/communications/media";

export const runtime = "nodejs";
export function GET(request: Request, context: { params: Promise<{attachmentId:string}> }) {
  return communicationRoute(request,async actor=>{
    const query=new URL(request.url).searchParams;
    const mode=historyMode.safeParse(query.get("mode"));
    if (!mode.success || query.size!==1) throw new CommunicationHttpError("invalid_request");
    return serveAttachment(request,(await context.params).attachmentId,mode.data,actor);
  });
}
