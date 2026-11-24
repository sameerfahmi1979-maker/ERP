import "server-only";
import { boundedChatStorage } from './media-storage';
import { pttCleanupBudget } from './ptt-worker-transport';
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminConfig } from "@/lib/config/server-features";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CommunicationActor } from "./access";
import { decimal, historyMode, id, MAX_CHAT_FILE_BYTES, type CommunicationCommand } from "./contracts";
import { authorizeCommunicationCleanup } from "./budget";
import { admitOperation, boundedBytes, communicationJson, CommunicationHttpError, privateHeaders, rpcFailure, userRpc } from "./http";

const bucket = "erp-ptt-recordings";
const source = { recordingId: id, channelId: id, epoch: id };
const read = { recordingId: id, mode: historyMode };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const operations = {
  "pttRecording.preflight": z.strictObject(source),
  "pttRecording.prepare": z.strictObject(source),
  "pttRecording.fail": z.strictObject(source),
  "pttRecording.liveAuthorize": z.strictObject({...source,mode:z.literal("participant")}),
  "pttRecording.authorize": z.strictObject(read),
  "pttRecording.receipt": z.strictObject({recordingId: id, mode: z.literal("participant"), event: z.enum(["delivered","played"])}),
  "pttRecording.cacheCheck": z.strictObject({channelId:id,mode:historyMode,ids:z.array(id).max(100)}),
  "pttRecording.history": z.strictObject({channelId: id, mode: historyMode, cursor: id.optional()}),
  "pttRecording.recipients": z.strictObject({recordingId: id, mode: z.literal("participant"), afterProfileId: decimal.optional()}),
};
async function admitted(actor: CommunicationActor, op: string, args: Record<string,unknown>, retained = false) {
  const command = { op, args };
  const permit = await admitOperation(actor, "ptt_replay", undefined, retained, command);
  const data = await userRpc("erp_ptt_recording_v1", { p_request: command, p_permit: permit.permitId });
  if (permit.expiresAt.getTime() <= Date.now()) throw new CommunicationHttpError("temporarily_unavailable");
  return data;
}

export async function dispatchPttRecording(command: CommunicationCommand, actor: CommunicationActor) {
  if (!Object.hasOwn(operations,command.op)) throw new CommunicationHttpError("invalid_request");
  const parsed=operations[command.op as keyof typeof operations].safeParse(command.args);
  if (!parsed.success) throw new CommunicationHttpError("invalid_request");
  return admitted(actor,command.op,parsed.data,["pttRecording.preflight","pttRecording.prepare"].includes(command.op));
}

/** Recorder produces one canonical uncompressed little-endian signed PCM16 WAV. */
export function inspectPttWave(bytes: Buffer) {
  const invalid = () => new CommunicationHttpError("invalid_request");
  if (bytes.length <= 44 || bytes.length > MAX_CHAT_FILE_BYTES || bytes.toString("latin1",0,4)!=="RIFF" ||
      bytes.readUInt32LE(4)!==bytes.length-8 || bytes.toString("latin1",8,16)!=="WAVEfmt " ||
      bytes.readUInt32LE(16)!==16 || bytes.readUInt16LE(20)!==1 || bytes.readUInt16LE(34)!==16 ||
      bytes.toString("latin1",36,40)!=="data" || bytes.readUInt32LE(40)!==bytes.length-44) throw invalid();
  const channels=bytes.readUInt16LE(22), rate=bytes.readUInt32LE(24), frame=channels*2;
  if (![1,2].includes(channels) || rate<8000 || rate>192000 || bytes.readUInt32LE(28)!==rate*frame ||
      bytes.readUInt16LE(32)!==frame || (bytes.length-44)%frame!==0) throw invalid();
  const frames=(bytes.length-44)/frame;
  if (frames>rate*60 || frames*1000<rate) throw invalid();
  return {sha256:digest(bytes),byteSize:bytes.length,durationMs:Math.round(frames*1000/rate)};
}
async function readStored(objectId: string, size: number) {
  const { data, error } = await createAdminClient().storage.from(bucket).download(objectId+".wav",{},{
    signal:AbortSignal.timeout(30000),cache:"no-store",
  }).asStream();
  if (error || !data) throw new CommunicationHttpError("temporarily_unavailable");
  const bytes=await boundedBytes(data,size,30000);
  if (bytes.length!==size) throw new CommunicationHttpError("conflict");
  return bytes;
}
export async function uploadPttRecording(request: Request, recordingId: string, actor: CommunicationActor) {
  const args=z.strictObject(source).safeParse({recordingId,epoch:request.headers.get("x-ptt-epoch"),channelId:request.headers.get("x-ptt-channel")});
  const length=Number(request.headers.get("content-length"));
  const expected=request.headers.get("x-ptt-sha256");
  if (!args.success || !expected || !/^[a-f0-9]{64}$/.test(expected) || request.headers.get("content-type")!=="audio/wav" ||
      !Number.isSafeInteger(length) || length<=44) throw new CommunicationHttpError("invalid_request");
  if (length>MAX_CHAT_FILE_BYTES) throw new CommunicationHttpError("size_limit");
  const prepared = z.object({state:z.enum(["ready","sent"])}).parse(await admitted(actor,"pttRecording.prepare",args.data,true));
  if (prepared.state==="sent") return communicationJson(prepared);
  const bytes=await boundedBytes(request.body,length,30000);
  const wave=inspectPttWave(bytes);
  if (wave.byteSize!==length || expected!==wave.sha256) throw new CommunicationHttpError("invalid_request");
  const target=z.union([z.object({objectId:id}),z.object({state:z.literal("sent")})])
    .parse(await admitted(actor,"pttRecording.bind",args.data,true));
  if ("state" in target) return communicationJson(target);
  const key=target.objectId+".wav";
  // The SDK's upload() does not forward AbortSignal. Use the same fixed Storage
  // API and preserve create-only semantics, with a deadline before the stage expires.
  const config=getAdminConfig();
  const response=await fetch(new URL("/storage/v1/object/"+bucket+"/"+key,config.url),{
    method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000),
    headers:{authorization:"Bearer "+config.serviceKey,apikey:config.serviceKey,"content-type":"audio/wav","x-upsert":"false","cache-control":"max-age=0"},
    body:new Uint8Array(bytes),
  });
  await response.body?.cancel();
  if (!response.ok) throw new CommunicationHttpError("temporarily_unavailable");
  await admitted(actor,"pttRecording.prepare",args.data,true);
  const original=await readStored(target.objectId,wave.byteSize);
  const verified=inspectPttWave(original);
  if (verified.sha256!==wave.sha256) throw new CommunicationHttpError("conflict");
  return communicationJson(await admitted(actor,"pttRecording.finalize",{...args.data,objectId:target.objectId,...verified},true));
}
const binding=z.object({id,objectId:id,byteSize:z.number().int().min(45).max(MAX_CHAT_FILE_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export async function replayPttRecording(request: Request, recordingId:string, actor:CommunicationActor) {
  const query=new URL(request.url).searchParams;
  if (Array.from(query.keys()).length!==1 || !query.has("mode")) throw new CommunicationHttpError("invalid_request");
  const args=z.strictObject(read).safeParse({recordingId,mode:query.get("mode")});
  if (!args.success) throw new CommunicationHttpError("invalid_request");
  const verify=async()=>binding.parse(await admitted(actor,"pttRecording.read",args.data));
  const before=await verify();
  const bytes=await readStored(before.objectId,before.byteSize);
  if (inspectPttWave(bytes).sha256!==before.sha256) throw new CommunicationHttpError("conflict");
  const after=await verify();
  if (before.objectId!==after.objectId || before.sha256!==after.sha256 || after.id!==recordingId)
    throw new CommunicationHttpError("conflict");
  return new Response(new Uint8Array(bytes),{headers:{...privateHeaders,"Content-Type":"audio/wav","Content-Length":String(bytes.length)}});
}

export async function cleanupPttRecordings(poll: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const db=createAdminClient(), budget=pttCleanupBudget(signal);
  const item=await db.rpc("erp_ptt_recording_cleanup_v1",{p_done:null,p_poll:poll}).abortSignal(signal);
  if (item.error) rpcFailure(item.error);
  if (item.data===null) return;
  const {objectId,permitId,attemptId}=z.object({objectId:id,permitId:id,attemptId:id}).parse(item.data);
  const attempt={permitId,resourceId:objectId,attemptId,endpoint:"discard_partial_upload" as const};
  const authorized=await authorizeCommunicationCleanup(attempt,budget);
  if (!authorized.ok || !authorized.newAttempt) throw new CommunicationHttpError("temporarily_unavailable");
  const storage=boundedChatStorage(signal).from(bucket);
  const path=objectId+".wav";
  const deleted=await storage.remove([path]);
  if (deleted.error && !storageConfirmsAbsence(deleted.error)) throw new CommunicationHttpError("temporarily_unavailable");
  const checked=await storage.info(path);
  if (!storageConfirmsAbsence(checked.error)) throw new CommunicationHttpError("temporarily_unavailable");
  signal.throwIfAborted();
  const done=await db.rpc("erp_ptt_recording_cleanup_v1",{p_done:objectId,p_poll:null,p_attempt:attemptId,p_absent:true}).abortSignal(signal);
  if (done.error) rpcFailure(done.error);
  if (!z.object({confirmed:z.literal(true)}).safeParse(done.data).success) throw new CommunicationHttpError("temporarily_unavailable");
}

function storageConfirmsAbsence(value:unknown):boolean {
  if (!value || typeof value!=="object") return false;
  const e=value as {status?:unknown;statusCode?:unknown;message?:unknown};
  return e.statusCode==="NoSuchKey" || ((e.statusCode==="404" || e.status===404) && (e.message==="Object not found" || e.message==="The object does not exist"));
}
