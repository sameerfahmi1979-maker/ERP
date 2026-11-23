import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CommunicationActor } from "./access";
import { decimal, filename, id, MAX_CHAT_FILE_BYTES, type HistoryMode } from "./contracts";
import { admitOperation, boundedBytes, communicationJson, CommunicationHttpError, privateHeaders, rpcFailure, userRpc } from "./http";
import { verifiedMediaType } from "./media-format";
import { boundedChatStorage } from "./media-storage";

const binding = z.object({
  bucket: z.literal("erp-chat-media"), path: id, filename, mime: z.string().max(150),
  byteLength: z.number().int().min(1).max(MAX_CHAT_FILE_BYTES),
});
const uploadBinding = binding.extend({
  uploadId: id, actorId: decimal, sessionId: id, state: z.enum(["reserved","verified","attached"]),
});
const attachmentBinding = binding.extend({
  id, sha256: z.string().regex(/^[0-9a-f]{64}$/), revision: decimal,
});
type BoundFile = z.infer<typeof binding>;
export type ChatAttachmentBinding = z.infer<typeof attachmentBinding>;

async function readOriginal(plan: BoundFile) {
  const reader = createAdminClient().storage.from(plan.bucket).download(plan.path, {}, {
    signal: AbortSignal.timeout(60000), cache: "no-store",
  }).asStream();
  const { data, error } = await reader;
  if (error || !data) throw new CommunicationHttpError("temporarily_unavailable");
  const bytes = await boundedBytes(data, plan.byteLength);
  if (bytes.length !== plan.byteLength) throw new CommunicationHttpError("conflict");
  return bytes;
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function receiveUpload(request: Request, uploadId: string, actor: CommunicationActor) {
  if (!id.safeParse(uploadId).success) throw new CommunicationHttpError("invalid_request");
  const readBinding = async () => {
    const permit=await admitOperation(actor,"media_upload",undefined,false,{op:"chat.uploadBind",args:{uploadId}});
    const plan = uploadBinding.parse(await userRpc("erp_chat_upload_bind", { p_upload: uploadId, p_permit:permit.permitId }));
    if (plan.uploadId !== uploadId || plan.path !== uploadId || plan.actorId !== actor.profileId || plan.sessionId !== actor.authSessionId)
      throw new CommunicationHttpError("unavailable");
    return plan;
  };
  const plan = await readBinding();
  const length = request.headers.get("content-length");
  if (length && Number(length)>MAX_CHAT_FILE_BYTES) throw new CommunicationHttpError("size_limit");
  if (length && (!/^\d+$/.test(length) || Number(length)!==plan.byteLength)) throw new CommunicationHttpError("invalid_request");
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== plan.mime && contentType!=="application/octet-stream") throw new CommunicationHttpError("invalid_request");
  const permit = await admitOperation(actor, "media_upload", undefined, true);
  const bytes = await boundedBytes(request.body, plan.byteLength, 120000);
  if (bytes.length!==plan.byteLength) throw new CommunicationHttpError("invalid_request");
  const mime = verifiedMediaType(bytes, plan.filename, plan.mime);
  const sha = digest(bytes);
  const fresh = await readBinding();
  if (fresh.filename!==plan.filename || fresh.mime!==plan.mime || fresh.byteLength!==plan.byteLength ||
      permit.expiresAt.getTime()<=Date.now()) throw new CommunicationHttpError("conflict");
  const admin = createAdminClient();
  const principal={p_upload:uploadId,p_actor:actor.profileId,p_session:actor.authSessionId};
  let opened=false, preserveCompetingOriginal=false;
  try {
    if (fresh.state==="reserved") {
      const stagePermit=await admitOperation(actor,"media_upload",undefined,true,{op:"chat.stageOpen",args:{
        uploadId,actorId:actor.profileId,sessionId:actor.authSessionId,
      }});
      const openedResult=await admin.rpc("erp_chat_stage_open",{...principal,p_permit:stagePermit.permitId});
      if (openedResult.error) rpcFailure(openedResult.error);
      const stage=z.object({uploadId:id,bucket:z.literal("erp-chat-media"),path:id,
        state:z.enum(["reserved","verified","attached"]),stageExpiresAt:z.iso.datetime({offset:true}).nullable()}).parse(openedResult.data);
      if (stage.uploadId!==uploadId || stage.path!==uploadId) throw new CommunicationHttpError("conflict");
      if (stage.state==="reserved") {
        opened=true;
        const until=Math.min(Date.parse(stage.stageExpiresAt ?? ""),stagePermit.expiresAt.getTime(),permit.expiresAt.getTime(),Date.now()+120000);
        if (!Number.isFinite(until) || until<=Date.now()) throw new CommunicationHttpError("temporarily_unavailable");
        // SQL has already bound this exact immutable object to funded cleanup. Creation is always insert-only.
        const storage=boundedChatStorage(AbortSignal.timeout(Math.max(1,until-Date.now())));
        try {
          const stored=await storage.from(stage.bucket).upload(stage.path,bytes,{contentType:mime,upsert:false,cacheControl:"0"});
          if (!stored.error && stored.data?.path!==stage.path) throw new CommunicationHttpError("temporarily_unavailable");
        } catch {
          // A lost response may have committed. Independently re-read bytes under the original funded operation.
        }
      }
    }
    const original=await readOriginal(plan);
    if (digest(original)!==sha) {
      preserveCompetingOriginal=true;
      throw new CommunicationHttpError("conflict");
    }
    const current=await readBinding();
    if (permit.expiresAt.getTime()<=Date.now()) throw new CommunicationHttpError("temporarily_unavailable");
    if (current.state!=="reserved") return communicationJson({uploadId,state:current.state});
    const finalPermit=await admitOperation(actor,"media_upload",undefined,true,{op:"chat.uploadVerified",args:{
      uploadId,actorId:actor.profileId,sessionId:actor.authSessionId,byteLength:original.length,mime,sha256:sha,
    }});
    try {
      const result=await admin.rpc("erp_chat_upload_verified",{
        ...principal,p_permit:finalPermit.permitId,p_size:original.length,p_mime:mime,p_sha256:sha,
      });
      if (result.error) rpcFailure(result.error);
      const receipt=z.object({uploadId:id,state:z.enum(["verified","attached"])}).parse(result.data);
      if (receipt.uploadId!==uploadId) throw new CommunicationHttpError("conflict");
      return communicationJson(receipt);
    } catch (error) {
      const recovered=await readBinding();
      if (recovered.state==="verified" || recovered.state==="attached") return communicationJson({uploadId,state:recovered.state});
      throw error;
    }
  } catch (error) {
    // No request ever directly deletes the original. If the hint is lost, the durable expiry still applies.
    if (opened && !preserveCompetingOriginal) {
      try { await admin.rpc("erp_chat_stage_abort",principal); } catch { /* Expiry recovers the lost hint. */ }
    }
    throw error;
  }
}

export async function authorizedAttachment(attachmentId: string, mode: HistoryMode, actor: CommunicationActor) {
  if (!id.safeParse(attachmentId).success) throw new CommunicationHttpError("invalid_request");
  const permit=await admitOperation(actor,"media_download",undefined,false,{op:"chat.attachmentBind",args:{attachmentId,mode}});
  const value = await userRpc("erp_chat_attachment_bind", { p_attachment: attachmentId, p_mode: mode,p_permit:permit.permitId });
  const bound = attachmentBinding.parse(value);
  if (bound.id!==attachmentId) throw new CommunicationHttpError("unavailable");
  return bound;
}
export async function readAttachment(attachmentId: string, mode: HistoryMode, actor: CommunicationActor) {
  const before = await authorizedAttachment(attachmentId,mode,actor);
  const permit = await admitOperation(actor,"media_download");
  const bytes = await readOriginal(before);
  if (digest(bytes)!==before.sha256) throw new CommunicationHttpError("conflict");
  const after = await authorizedAttachment(attachmentId,mode,actor);
  if (JSON.stringify(before)!==JSON.stringify(after)) throw new CommunicationHttpError("conflict");
  if (permit.expiresAt.getTime()<=Date.now()) throw new CommunicationHttpError("temporarily_unavailable");
  return { plan: after, bytes };
}

export function byteRange(header: string | null, size: number) {
  if (header===null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new CommunicationHttpError("range_unavailable");
  const start = match[1] ? Number(match[1]) : Math.max(0, size-Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]),size-1) : size-1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || start>end || start>=size)
    throw new CommunicationHttpError("range_unavailable");
  return { start,end };
}

export async function serveAttachment(request: Request, attachmentId: string, mode: HistoryMode, actor: CommunicationActor) {
  const { plan, bytes } = await readAttachment(attachmentId,mode,actor);
  const range = byteRange(request.headers.get("range"),bytes.length);
  const body = range ? bytes.subarray(range.start,range.end+1) : bytes;
  const encodedName = encodeURIComponent(plan.filename).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16));
  return new Response(new Uint8Array(body), { status: range ? 206 : 200, headers: {
    ...privateHeaders, "Accept-Ranges":"bytes", "Content-Type":plan.mime, "Content-Length":String(body.length),
    "Content-Disposition":"attachment; filename*=UTF-8''"+encodedName,
    ...(range ? {"Content-Range":"bytes "+range.start+"-"+range.end+"/"+bytes.length} : {}),
  } });
}
