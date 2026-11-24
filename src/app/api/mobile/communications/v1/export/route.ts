import { serveChatExport } from "@/server/communications/chat-export";
import { communicationRoute, readCommunicationJson } from "@/server/communications/http";

export const runtime = "nodejs";
export function POST(request: Request) {
  return communicationRoute(request,async actor=>serveChatExport(await readCommunicationJson(request),actor));
}
