import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import {verifyDmsBlob} from '@/server/dms-file-verification';
import {
  BATCH_MAX_BYTES, batchAdmissionResultSchema, batchOriginSchema, batchReceiptSchema,
  batchRequestSchema, batchUuid, verifyBatchReceipt, batchMemberRequestSchema, batchMemberUploadResultSchema,
  type BatchAdmissionResult, type BatchBootstrapResult, type BatchCapability,
  type BatchDiscoveryResult, type BatchObjectResult, type BatchOrigin, type BatchReceipt,
  type BatchRequest, type BatchMemberUploadResult,
} from "@/lib/dms/batch-admission";

const DENIED = "The batch or your current access is unavailable. Retain the original request for reconciliation.";
const UNCONFIRMED = "Batch admission is unconfirmed. Retry the retained request to recover its result.";
const INCOMPLETE = "Upload preparation is incomplete. Retain the original request and retry recovery.";
const UNAVAILABLE = "This batch cannot currently continue. Retain its identity for reconciliation.";
const OBJECT_UNAVAILABLE = "The uploaded object could not be verified. Retain the original file and retry verification.";
const rpcEnvelope = z.object({receipt: batchReceiptSchema, replayed: z.boolean()}).strict();
const eligibilitySchema = z.object({eligible: z.boolean(), positions: z.array(z.number().int().min(0).max(9)).max(10)}).strict();
const signedSchema = z.object({path: z.string(), token: z.string().min(1), signedUrl: z.string().url()}).strict();
const metadataSchema = z.object({id: batchUuid, version: z.string().min(1), name: z.string(),
  bucketId: z.literal("dms-temp"), size: z.number().int().positive().max(BATCH_MAX_BYTES)});
type Member = BatchReceipt["members"][number];
type Storage = ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>;

// Local waiting bounds, not a promise to cancel an SDK request or revoke a URL.
class Deadline {
  private readonly end = Date.now() + 120_000;
  async wait<T>(start: () => PromiseLike<T>, limit = 10_000): Promise<T> {
    const remaining = Math.min(limit, this.end - Date.now());
    if (remaining <= 0) throw new Error("deadline");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(start),
        new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("deadline")), remaining);}),
      ]);
    } finally { clearTimeout(timer); }
  }
}
class AccessUnavailable extends Error { readonly code="42501"; }
class WorkUnavailable extends Error {}

async function currentOrigin(deadline: Deadline): Promise<BatchOrigin | null> {
  const ctx = await deadline.wait(() => getAuthContext());
  if (!canUseApplication(ctx) || !ctx.profile) return null;
  const parsed = batchOriginSchema.safeParse({authUserId: ctx.profile.auth_user_id, profileId: ctx.profile.id});
  return parsed.success ? parsed.data : null;
}
function sameOrigin(left: BatchOrigin | null, right: BatchOrigin): boolean {
  return left?.authUserId === right.authUserId && left.profileId === right.profileId;
}
export async function bootstrapBatchOrigin(): Promise<BatchBootstrapResult> {
  try {
    const origin = await currentOrigin(new Deadline());
    return origin ? {success: true, origin} : {success: false, error: DENIED};
  } catch { return {success: false, error: DENIED}; }
}

type Bound = {client: SupabaseClient; deadline: Deadline; origin: BatchOrigin; request: BatchRequest; receipt: BatchReceipt};

/** Read-only binding; never admission, eligibility or Storage. */
export async function bindBatchAdmission(input:BatchRequest):Promise<Bound>{
  const request=batchRequestSchema.parse(input);
  const deadline=new Deadline();
  const origin=await currentOrigin(deadline);
  if(!origin)throw new AccessUnavailable();
  const client=await deadline.wait(()=>createClient());
  const result=await deadline.wait(()=>client.rpc("read_dms_upload_batch_admission",{p_operation:request.contract.operationId}));
  if(result.error)throw result.error;
  const receipt=await verifyBatchReceipt(result.data,request,origin);
  if(!receipt)throw new Error("Unverified admission response");
  if(!sameOrigin(await currentOrigin(deadline),origin))throw new AccessUnavailable();
  return {client,deadline,origin,request,receipt};
}
export async function refreshBatchAdmission(bound:Bound):Promise<void>{
  const {deadline,client,origin,request,receipt}=bound;
  if(!sameOrigin(await currentOrigin(deadline),origin))throw new AccessUnavailable();
  const read=await deadline.wait(()=>client.rpc("read_dms_upload_batch_admission",{p_operation:request.contract.operationId}));
  if(read.error)throw read.error;
  const current=await verifyBatchReceipt(read.data,request,origin);
  if(!current||JSON.stringify(current)!==JSON.stringify(receipt))throw new Error("Unverified admission response");
  if(!sameOrigin(await currentOrigin(deadline),origin))throw new AccessUnavailable();
}
async function selectedFresh(bound:Bound,position:number):Promise<void>{
  if(!(await fresh(bound)).includes(position))throw new WorkUnavailable();
  if(!sameOrigin(await currentOrigin(bound.deadline),bound.origin))throw new AccessUnavailable();
}

async function fresh(bound: Bound): Promise<number[]> {
  try {
    const {deadline, client, origin, request, receipt} = bound;
    if (!sameOrigin(await currentOrigin(deadline), origin)) throw new AccessUnavailable();
    const read = await deadline.wait(() => client.rpc("read_dms_upload_batch_admission", {p_operation: request.contract.operationId}));
    if (read.error) throw new AccessUnavailable();
    const current = await verifyBatchReceipt(read.data, request, origin);
    if (!current || JSON.stringify(current) !== JSON.stringify(receipt)) throw new AccessUnavailable();
    const result = await deadline.wait(() => client.rpc("dms_upload_batch_eligibility", {p_operation: request.contract.operationId}));
    const eligible = eligibilitySchema.safeParse(result.data);
    if (result.error || !eligible.success) throw new AccessUnavailable();
    const {positions} = eligible.data;
    if (new Set(positions).size !== positions.length || positions.some(p => p >= receipt.members.length) ||
      (!eligible.data.eligible && positions.length > 0)) throw new AccessUnavailable();
    if (!eligible.data.eligible) throw new WorkUnavailable();
    return positions;
  } catch (error) {
    if (error instanceof WorkUnavailable) throw error;
    throw new AccessUnavailable();
  }
}

function objectAbsent(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error) || !("statusCode" in error)) return false;
  if (error.status === 404 && error.statusCode === "NoSuchKey") return true;
  // Storage API 1.54.1's object-info endpoint returns this exact legacy
  // SDK shape for an absent object. A generic HTTP/bucket/access error is
  // still unavailable; both caller authority and eligibility are rechecked.
  return error.status === 400 && error.statusCode === "404" &&
    "name" in error && error.name === "StorageApiError" &&
    "message" in error && error.message === "Object not found";
}
function metadata(raw: unknown, member: Member) {
  const parsed = metadataSchema.safeParse(raw);
  if (!parsed.success || parsed.data.name !== member.path || parsed.data.size !== member.size) throw new Error("object metadata");
  return parsed.data;
}

// Never await the SDK's Blob builder: the stream is counted before hashing and
// no file body is accumulated. Cleanup never waits on an unresponsive source.
async function hashObject(storage: Storage, member: Member, deadline: Deadline,parse=false): Promise<void> {
  const controller = new AbortController();
  const end = Date.now() + 30_000;
  let stream: ReadableStream<Uint8Array> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = (body: ReadableStream<Uint8Array>) => {
    try { void body.cancel().catch(() => undefined); } catch { /* best effort, bounded */ }
  };
  try {
    const result = await deadline.wait(() => {
      const pending = Promise.resolve(storage.download(member.path, {}, {signal: controller.signal, cache: "no-store"}).asStream());
      void pending.then(result => {
        if (controller.signal.aborted && result?.data instanceof ReadableStream) cancel(result.data);
      }, () => undefined).catch(() => undefined);
      return pending;
    }, end - Date.now());
    if (result.data instanceof ReadableStream) stream = result.data;
    if (result.error || !stream) throw new Error("object stream");
    reader = stream.getReader();
    const hash = createHash("sha256");
    const parts:Uint8Array<ArrayBuffer>[]=[];
    let count = 0;
    for (;;) {
      const chunk = await deadline.wait(() => reader!.read(), end - Date.now());
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new Error("object chunk");
      count += chunk.value.byteLength;
      if (count > member.size || count > BATCH_MAX_BYTES) throw new Error("object overflow");
      hash.update(chunk.value);
      if(parse)parts.push(Uint8Array.from(chunk.value));
    }
    if (count !== member.size || hash.digest("hex") !== member.sha256) throw new Error("object digest");
    if(parse)await verifyDmsBlob(new Blob(parts),{name:member.name,mime:member.mime,size:member.size,sha256:member.sha256});
  } finally {
    controller.abort();
    if (reader) {
      try { void reader.cancel().catch(() => undefined); } catch { /* best effort, bounded */ }
      try { reader.releaseLock(); } catch { /* a pending read may still own the lock */ }
    } else if (stream) cancel(stream);
  }
}

async function observe(bound: Bound, storage: Storage, member: Member, selected=false,parse=false): Promise<"present" | "absent"> {
  const check=()=>selected?selectedFresh(bound,member.position):fresh(bound);
  await check();
  const first = await bound.deadline.wait(() => storage.info(member.path));
  if (first.error) {
    if (!objectAbsent(first.error) || first.data !== null) throw new Error("object info");
    await check();
    return "absent";
  }
  const before = metadata(first.data, member);
  await check();
  await hashObject(storage, member, bound.deadline,parse);
  await check();
  const second = await bound.deadline.wait(() => storage.info(member.path));
  if (second.error || JSON.stringify(metadata(second.data, member)) !== JSON.stringify(before)) throw new Error("object changed");
  await check();
  return "present";
}

function withheld(receipt: BatchReceipt, unavailable: boolean, issued: boolean): BatchAdmissionResult {
  return {state: "admitted", receipt, capabilityState: unavailable ? "unavailable" : "incomplete",
    capabilities: [], presentPositions: [], issuance_may_be_partial: issued, error: unavailable ? UNAVAILABLE : INCOMPLETE};
}
function rollback(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string") return false;
  const code = error.code;
  // 40003 is completion-unknown; preserve only enumerated class-40 aborts.
  return code.length === 5 && (/^(?:22|23|42|PT)[0-9A-Z]{3}$/.test(code) || ["40000", "40001", "40002", "40P01", "55P03"].includes(code));
}

export async function admitBatch(input: BatchRequest): Promise<BatchAdmissionResult> {
  const parsed = batchRequestSchema.safeParse(input);
  if (!parsed.success) return {state: "rejected", error: "Invalid batch request."};
  const request = parsed.data;
  const deadline = new Deadline();
  let bound: Bound;
  try {
    const origin = await currentOrigin(deadline);
    if (!origin) return {state: "rejected", error: DENIED};
    const client = await deadline.wait(() => createClient());
    const result = await deadline.wait(() => client.rpc("admit_dms_upload_batch", {
      p_operation: request.contract.operationId,
      p_request: {...request.manifest, revision: request.contract.revision},
    }));
    if (result.error) {
      const rejected = rollback(result.error);
      return {state: rejected ? "rejected" : "unconfirmed", error: rejected ? DENIED : UNCONFIRMED};
    }
    const envelope = rpcEnvelope.safeParse(result.data);
    const receipt = envelope.success ? await verifyBatchReceipt(envelope.data.receipt, request, origin) : null;
    if (!receipt) return {state: "unconfirmed", error: UNCONFIRMED};
    bound = {client, deadline, origin, request, receipt};
  } catch { return {state: "unconfirmed", error: UNCONFIRMED}; }

  let issued = false;
  try {
    await fresh(bound);
    const storage = createAdminClient().storage.from("dms-temp");
    const capabilities: BatchCapability[] = [];
    const presentPositions: number[] = [];
    for (const member of bound.receipt.members) {
      if (await observe(bound, storage, member) === "present") {
        presentPositions.push(member.position);
        continue;
      }
      const positions = await fresh(bound);
      if (!positions.includes(member.position)) throw new WorkUnavailable();
      const signed = await deadline.wait(() => {
        issued = true; // Includes lost/late responses; these bearers cannot be revoked here.
        return storage.createSignedUploadUrl(member.path, {upsert: false});
      });
      const value = signedSchema.safeParse(signed.data);
      if (signed.error || !value.success || value.data.path !== member.path) throw new Error("signing");
      const url = new URL(value.data.signedUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("signing URL");
      capabilities.push({position: member.position, sessionId: member.id, ...value.data});
    }
    const latest = await fresh(bound);
    if (capabilities.some(c => !latest.includes(c.position))) throw new WorkUnavailable();
    return batchAdmissionResultSchema.parse({state: "admitted", receipt: bound.receipt, capabilityState: "ready",
      capabilities, presentPositions, issuance_may_be_partial: issued});
  } catch (error) {
    // Do not return a stale receipt after a failed current-authority/identity read.
    if (error instanceof AccessUnavailable) return {state: "unconfirmed", error: DENIED};
    try { await fresh(bound); }
    catch (current) {
      if (current instanceof AccessUnavailable) return {state: "unconfirmed", error: DENIED};
      return withheld(bound.receipt, true, issued);
    }
    return withheld(bound.receipt, error instanceof WorkUnavailable, issued);
  }
}


/** Chosen-member continuation, deliberately separate from the complete plan. */
export async function recoverBatchMemberUpload(input:{request:BatchRequest;position:number}):Promise<BatchMemberUploadResult>{
  let issued=false;
  try{
    const parsed=batchMemberRequestSchema.safeParse(input);
    if(!parsed.success)throw new WorkUnavailable();
    const {request,position}=parsed.data;
    const bound=await bindBatchAdmission(request);
    await selectedFresh(bound,position);
    const member=bound.receipt.members[position];
    const storage=createAdminClient().storage.from("dms-temp");
    const observed=await observe(bound,storage,member,true);
    if(observed==="present"){
      await selectedFresh(bound,position);
      return batchMemberUploadResultSchema.parse({state:"ready",receipt:bound.receipt,position,object:{state:"present"},issuance_may_be_partial:false});
    }
    await selectedFresh(bound,position);
    const signed=await bound.deadline.wait(()=>{
      issued=true;
      return storage.createSignedUploadUrl(member.path,{upsert:false});
    });
    const value=signedSchema.safeParse(signed.data);
    if(signed.error||!value.success||value.data.path!==member.path)throw new WorkUnavailable();
    const url=new URL(value.data.signedUrl);
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.hash)throw new WorkUnavailable();
    await selectedFresh(bound,position);
    return batchMemberUploadResultSchema.parse({state:"ready",receipt:bound.receipt,position,
      object:{state:"upload",capability:{position,sessionId:member.id,...value.data}},issuance_may_be_partial:issued});
  }catch{
    // A failed current read withholds identity too, but cannot revoke an issued URL.
    return {state:"unavailable",error:OBJECT_UNAVAILABLE,issuance_may_be_partial:issued};
  }
}
/** No signing: modern preparation requires actual selected bytes and eligibility. */
export async function verifySelectedBatchUpload(bound:Bound,position:number):Promise<BatchObjectResult>{
  try{
    if(!bound.receipt.members[position])throw new WorkUnavailable();
    await selectedFresh(bound,position);
    const storage=createAdminClient().storage.from("dms-temp");
    return {state:await observe(bound,storage,bound.receipt.members[position],true)};
  }catch{return {state:"unavailable",error:OBJECT_UNAVAILABLE};}
}

export async function discoverBatchAdmissions(): Promise<BatchDiscoveryResult> {
  try {
    const deadline = new Deadline();
    const origin = await currentOrigin(deadline);
    if (!origin) return {success: false, error: DENIED};
    const client = await deadline.wait(() => createClient());
    const result = await deadline.wait(() => client.rpc("discover_dms_upload_batch_admissions", {p_before_id: null}));
    if (result.error || !Array.isArray(result.data) || result.data.length > 20) return {success: false, error: DENIED};
    const receipts: BatchReceipt[] = [];
    const operations = new Set<string>();
    for (const raw of result.data) {
      const parsed = batchReceiptSchema.safeParse(raw);
      if (!parsed.success) return {success: false, error: DENIED};
      const r = parsed.data;
      const request: BatchRequest = {manifest: r.manifest, contract: {operationId: r.operation_id, revision: null}};
      const verified = await verifyBatchReceipt(r, request, origin);
      if (!verified || operations.has(r.operation_id) || (receipts.length && receipts[receipts.length - 1].batch_id <= r.batch_id)) return {success: false, error: DENIED};
      operations.add(r.operation_id);
      receipts.push(verified);
    }
    if (!sameOrigin(await currentOrigin(deadline), origin)) return {success: false, error: DENIED};
    // Historical discovery requires current read authority, not fresh signability.
    // An active Auth identity alone cannot attest that stored-scope grants survived.
    for (const receipt of receipts) {
      const read = await deadline.wait(() => client.rpc("read_dms_upload_batch_admission", {p_operation: receipt.operation_id}));
      const request: BatchRequest = {manifest: receipt.manifest, contract: {operationId: receipt.operation_id, revision: null}};
      const current = !read.error ? await verifyBatchReceipt(read.data, request, origin) : null;
      if (!current || JSON.stringify(current) !== JSON.stringify(receipt)) return {success: false, error: DENIED};
    }
    return {success: true, receipts};
  } catch { return {success: false, error: DENIED}; }
}

export async function verifyBatchUpload(input: {request: BatchRequest; position: number}): Promise<BatchObjectResult> {
  try {
    const parsed = z.object({request: batchRequestSchema, position: z.number().int().min(0).max(9)}).strict().safeParse(input);
    if (!parsed.success || parsed.data.position >= parsed.data.request.manifest.files.length) return {state: "unavailable", error: OBJECT_UNAVAILABLE};
    const {request, position} = parsed.data;
    const deadline = new Deadline();
    const origin = await currentOrigin(deadline);
    if (!origin) return {state: "unavailable", error: OBJECT_UNAVAILABLE};
    const client = await deadline.wait(() => createClient());
    const result = await deadline.wait(() => client.rpc("read_dms_upload_batch_admission", {p_operation: request.contract.operationId}));
    const receipt = !result.error ? await verifyBatchReceipt(result.data, request, origin) : null;
    if (!receipt) return {state: "unavailable", error: OBJECT_UNAVAILABLE};
    const bound = {client, deadline, origin, request, receipt};
    await fresh(bound);
    const storage = createAdminClient().storage.from("dms-temp");
    return {state: await observe(bound, storage, receipt.members[position],false,true)};
  } catch { return {state: "unavailable", error: OBJECT_UNAVAILABLE}; }
}
