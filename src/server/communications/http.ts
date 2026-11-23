import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isSameOriginAuthRequest } from "@/lib/auth/http-boundary";
import { withMobileToken } from "@/lib/supabase/mobile-request";
import { createClient } from "@/lib/supabase/server";
import { CommunicationAccessError, requireCommunicationActor, type CommunicationActor } from "./access";
import { reserveCommunicationBudget, type CommunicationFeature } from "./budget";

const errors = {
  invalid_request: [400, "Check the request fields and selected file."],
  unauthenticated: [401, "Sign in with your ERP account."],
  permission_denied: [403, "Your account cannot perform this action."],
  unavailable: [404, "The requested item is unavailable."],
  conflict: [409, "The item or original request changed. Refresh before retrying."],
  size_limit: [413, "The request exceeds the supported size."],
  range_unavailable: [416, "The requested byte range is unavailable."],
  rate_limited: [429, "Too many requests. Try again later."],
  temporarily_unavailable: [503, "The service could not confirm this request. Retry using the original operation."],
} as const;
export type CommunicationErrorCode = keyof typeof errors;
export class CommunicationHttpError extends Error {
  readonly status: number;
  constructor(readonly code: CommunicationErrorCode, message: string = errors[code][1]) {
    super(message);
    this.status = errors[code][0];
  }
}
export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", Vary: "Authorization, Cookie",
};
export function communicationJson(data: unknown) {
  return Response.json({ success: true, data }, { headers: privateHeaders });
}
export function rpcFailure(error: { code?: string; message?: string }): never {
  const bySql: Record<string, CommunicationErrorCode> = {
    "22023":"invalid_request","22P02":"invalid_request","22007":"invalid_request","23514":"invalid_request","PT400":"invalid_request",
    "28000":"unauthenticated","PGRST301":"unauthenticated","PGRST303":"unauthenticated","PT401":"unauthenticated",
    "42501":"permission_denied","PT403":"permission_denied","P0002":"unavailable","PT404":"unavailable",
    "54000":"size_limit","23505":"conflict","40001":"conflict","PT409":"conflict","PT413":"size_limit","PT429":"rate_limited",
  };
  throw new CommunicationHttpError(bySql[error.code ?? ""] ?? "temporarily_unavailable");
}
export async function userRpc(name: string, params: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (await createClient()).rpc(name, params);
  if (error) rpcFailure(error);
  return data;
}

export function requireMobileCommunication(request: Request) {
  if (!request.headers.has("authorization") || request.headers.has("sec-fetch-mode") || request.headers.has("origin"))
    throw new CommunicationHttpError("permission_denied");
}

export const webSessionHeader="X-ERP-Communication-Session";
export function hasErpSessionCookie(request:Request) {
  return /(?:^|;\s*)sb-[^;=]+-auth-token(?:\.\d+)?=/.test(request.headers.get("cookie") ?? "");
}
export function checkWebSession(request:Request, actor:CommunicationActor, required:boolean) {
  if (!hasErpSessionCookie(request)) return false;
  const value=request.headers.get(webSessionHeader);
  if (value===null && !required) return false;
  const expected=createHash("sha256").update(actor.authSessionId).digest();
  if (!value || !/^[a-f0-9]{64}$/.test(value) || !timingSafeEqual(expected,Buffer.from(value,"hex")))
    throw new CommunicationHttpError("unauthenticated","This workspace belongs to another ERP session. Reload it.");
  return true;
}

export async function communicationRoute(request: Request, work: (actor: CommunicationActor) => Promise<Response>, binding: "required"|"optional" = "required"): Promise<Response> {
  try {
    const header = request.headers.get("authorization");
    const token = header && header.length <= 8192 && /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(header)?.[1];
    if (header !== null && !token) throw new CommunicationHttpError("unauthenticated");
    const hasAuthCookie = hasErpSessionCookie(request);
    if (!token && !hasAuthCookie) throw new CommunicationHttpError("unauthenticated");
    if (hasAuthCookie && request.method !== "GET" && request.method !== "HEAD" && !isSameOriginAuthRequest(request))
      throw new CommunicationHttpError("permission_denied");
    const cookieActor = hasAuthCookie ? await requireCommunicationActor() : null;
    if (cookieActor) checkWebSession(request,cookieActor,binding==="required");
    if (!token && cookieActor) return await work(cookieActor);
    if (!token) throw new CommunicationHttpError("unauthenticated");
    return await withMobileToken(token, async () => {
      const actor = await requireCommunicationActor();
      if (cookieActor && (cookieActor.profileId !== actor.profileId || cookieActor.authUserId !== actor.authUserId || cookieActor.authSessionId !== actor.authSessionId))
        throw new CommunicationHttpError("unauthenticated");
      return work(actor);
    });
  } catch (error) {
    const failure = error instanceof CommunicationAccessError || error instanceof CommunicationHttpError
      ? error : new CommunicationHttpError("temporarily_unavailable");
    return Response.json({ success: false, error: { code: failure.code, message: failure.message } }, { status: failure.status, headers: privateHeaders });
  }
}

export async function admitOperation(actor: CommunicationActor, feature: CommunicationFeature, operation = randomUUID() as string, retained = false, command?: Record<string,unknown>) {
  const binding = command ? {actorSessionId:actor.authSessionId,command} : undefined;
  const result = await reserveCommunicationBudget({
    feature, scope: "communications", actorId: actor.profileId, operationId: operation,
    upperBoundMicros: BigInt(0), liabilityEndsAt: retained ? null : new Date(Date.now() + 120000),
    ...(binding ? {binding} : {}),
  });
  if (!result.ok) throw new CommunicationHttpError("temporarily_unavailable", "Communications cost control currently holds this operation (" + result.reason + ").");
  return result;
}

export async function paidChatRpc(actor: CommunicationActor, feature: CommunicationFeature, op: string, args: Record<string,unknown>, retained=false) {
  const command={op,args};
  const permit=await admitOperation(actor,feature,undefined,retained,command);
  return userRpc("erp_chat_v1",{p_request:{...command,_budgetPermitId:permit.permitId}});
}

export async function boundedBytes(stream: ReadableStream<Uint8Array> | null, maximum: number, deadlineMs = 60000): Promise<Buffer> {
  if (!stream) throw new CommunicationHttpError("invalid_request");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CommunicationHttpError("temporarily_unavailable")), deadlineMs);
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new CommunicationHttpError("size_limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function readCommunicationJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new CommunicationHttpError("invalid_request");
  const bytes = await boundedBytes(request.body, 256 * 1024);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new CommunicationHttpError("invalid_request"); }
}
