import { commandEnvelope } from "@/server/communications/contracts";
import { communicationProfile } from "@/server/communications/profile";
import { dispatchChat } from "@/server/communications/chat";
import { dispatchBudget } from "@/server/communications/budget";
import { communicationJson, communicationRoute, checkWebSession, CommunicationHttpError, requireMobileCommunication, readCommunicationJson } from "@/server/communications/http";

export const runtime = "nodejs";
export function POST(request: Request) {
  return communicationRoute(request,async actor=>{
    const input=commandEnvelope.safeParse(await readCommunicationJson(request));
    if (!input.success) throw new CommunicationHttpError("invalid_request");
    const command=input.data;
    if (command.op==="communications.profile") return communicationJson(await communicationProfile(command.args,actor,request));
    checkWebSession(request,actor,true);
    if (command.op.startsWith("chat.")) return communicationJson(await dispatchChat(command,actor));
    if (command.op.startsWith("pttRecording.")) {
      requireMobileCommunication(request);
      const {dispatchPttRecording}=await import("@/server/communications/ptt-recordings");
      return communicationJson(await dispatchPttRecording(command,actor));
    }
    if (command.op.startsWith("ptt.")) {
      requireMobileCommunication(request);
      const { dispatchPtt }=await import("@/server/communications/ptt");
      return communicationJson(await dispatchPtt(command,actor));
    }
    if (command.op.startsWith("notifications.")) {
      const native=request.headers.has("authorization");
      if (native || ["notifications.registerDevice","notifications.unregisterDevice","notifications.preview"].includes(command.op)) requireMobileCommunication(request);
      const {dispatchNotifications}=await import("@/server/communications/notifications");
      return communicationJson(await dispatchNotifications(command,actor,native));
    }
    if (command.op.startsWith("sos.")) {
      requireMobileCommunication(request);
      const {dispatchSos}=await import("@/server/communications/sos");
      return communicationJson(await dispatchSos(command,actor));
    }
    if (command.op.startsWith("policy.")) {
      const {dispatchPolicy}=await import("@/server/communications/policy");
      return communicationJson(await dispatchPolicy(command,actor));
    }
    if (command.op.startsWith("budget.")) return communicationJson(await dispatchBudget(command,actor));
    throw new CommunicationHttpError("invalid_request");
  },"optional");
}
