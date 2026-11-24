import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { isSameOriginAuthRequest } from "@/lib/auth/http-boundary";
import type { CommunicationActor } from "./access";
import { decimal } from "./contracts";
import { checkWebSession, hasErpSessionCookie, CommunicationHttpError, userRpc } from "./http";
import { communicationFeatureEnabled } from "./providers/config";

const caps = z.object({ profileId: decimal, isGlobalSystemAdmin: z.boolean(), canCreateGroup:z.boolean(), canReviewHistory:z.boolean() });

function webCache(request:Request | undefined,actor:CommunicationActor) {
  if (!request || request.headers.has("authorization") || !hasErpSessionCookie(request)) return {};
  const held=(reason:string)=>({webCache:{version:1,wrappingKey:null,reason}});
  if (!isSameOriginAuthRequest(request) || !checkWebSession(request,actor,false)) return held("session_binding_required");
  const secret=process.env.ERP_COMM_WEB_CACHE_SECRET;
  if (!secret || Buffer.byteLength(secret,"utf8")<32 || secret.trim()!==secret) return held("secret_unconfigured");
  const key=createHmac("sha256",secret).update("algt/erp/communications/web-cache-wrap/v1\0").update(actor.authUserId.toLowerCase()).digest("base64url");
  return {webCache:{version:1,wrappingKey:key,reason:"available"}};
}

/** Read-only navigation status. Each content/provider operation performs its own admission. */
export async function communicationProfile(args: Record<string,unknown>, actor: CommunicationActor,request?:Request) {
  if (Object.keys(args).length) throw new CommunicationHttpError("invalid_request");
  const [chat,ptt,budget] = await Promise.all([
    userRpc("erp_chat_v1",{p_request:{op:"communications.profile",args:{}}}),
    userRpc("erp_ptt_v1",{p_request:{op:"ptt.capabilities",args:{}}}),
    userRpc("erp_comm_budget_operator",{p_profile:actor.profileId,p_session:actor.authSessionId,
      p_op:"budget.status",p_args:{scope:"communications"}}).catch(()=>null),
  ]);
  const flags=caps.parse(chat);
  const creation=z.object({profileId:decimal,canCreatePttChannel:z.boolean()}).parse(ptt);
  if (creation.profileId!==actor.profileId) throw new CommunicationHttpError("unauthenticated");
  if (flags.profileId!==actor.profileId || flags.isGlobalSystemAdmin!==actor.isGlobalSystemAdmin)
    throw new CommunicationHttpError("unauthenticated");
  const workspace=(feature:"chat"|"ptt_live")=>{
    const configured=communicationFeatureEnabled(feature);
    return { eligible:true, configured, availability:configured ? "requiresAdmission" : "held",
      reason:configured ? "operation_admission_required" : "feature_disabled" };
  };
  const budgetAccess=z.object({scope:z.literal("communications"),canMonitor:z.boolean()}).safeParse(budget);
  const refreshMode = process.env.ERP_COMM_CHAT_PILOT_MANUAL_REFRESH_ENABLED === "true" ? "manual" : "live";
  return { ...flags, ...webCache(request,actor), canCreatePttChannel:creation.canCreatePttChannel,
    chat:{...workspace("chat"),refreshMode}, ptt:workspace("ptt_live"),budget:{eligible:budgetAccess.success&&budgetAccess.data.canMonitor} };
}
