import { readCommunicationAvatar } from "@/server/communications/access";
import { admitOperation, communicationRoute } from "@/server/communications/http";

export const runtime = "nodejs";
export function GET(request: Request, context: { params: Promise<{ profileId: string }> }) {
  return communicationRoute(request,async actor=>{
    await admitOperation(actor,"media_download");
    return readCommunicationAvatar((await context.params).profileId,actor);
  },"optional");
}
