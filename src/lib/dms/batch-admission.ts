import { z } from "zod";

export const BATCH_MAX_BYTES = 52_428_800;
export const BATCH_REQUEST_BYTES = 262_144;
const safeId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const batchUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform(v => v.toLowerCase());
const mimeByExtension: Readonly<Record<string, string>> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  tif: "image/tiff", tiff: "image/tiff", webp: "image/webp", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const whitespace = /^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$/u;
export function validBatchFilename(name: string): boolean {
  return [...name].length > 0 && [...name].length <= 500 && !whitespace.test(name) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(name) && !/[\ud800-\udfff]/u.test(name);
}
export function effectiveDmsMime(name: string, supplied: string): string | null {
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const canonical = Object.hasOwn(mimeByExtension, extension) ? mimeByExtension[extension] : null;
  if (!canonical) return null;
  const mime = supplied.toLowerCase();
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime === "image/x-tiff" ? "image/tiff" : mime;
  return !mime || mime === "application/octet-stream" || normalized === canonical ? canonical : null;
}
export function batchStorageLeaf(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 200) || "file";
}
export const dmsFileMetadataSchema = z.object({
  original_filename: z.string().refine(validBatchFilename, "Invalid file name"),
  mime_type: z.string(), file_size_bytes: safeId.max(BATCH_MAX_BYTES),
  sha256_hash: z.string().regex(/^[0-9a-f]{64}$/i).transform(v => v.toLowerCase()),
}).strict().superRefine((v, ctx) => {
  if (!effectiveDmsMime(v.original_filename, v.mime_type)) ctx.addIssue({code: "custom", message: "File type and extension must match", path: ["mime_type"]});
}).transform(v => ({...v, mime_type: effectiveDmsMime(v.original_filename, v.mime_type)!}));
export const batchContextSchema = z.object({type: z.literal("party"), id: safeId}).strict().nullable();
export const batchFileSchema = z.object({
  position: z.number().int().min(0).max(9), original_filename: z.string().refine(validBatchFilename),
  mime_type: z.string(), file_size_bytes: safeId.max(BATCH_MAX_BYTES),
  sha256_hash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().refine(v => effectiveDmsMime(v.original_filename, v.mime_type) === v.mime_type, "Noncanonical MIME");
export const batchManifestSchema = z.object({version: z.literal(1), context: batchContextSchema,
  files: z.array(batchFileSchema).min(1).max(10),
}).strict().refine(v => v.files.every((f, i) => f.position === i), "Positions must be dense and ordered");
export const batchContractSchema = z.object({operationId: batchUuid, revision: z.null()}).strict();
export const batchRequestSchema = z.object({manifest: batchManifestSchema, contract: batchContractSchema}).strict()
  .refine(v => new TextEncoder().encode(JSON.stringify(v)).length <= BATCH_REQUEST_BYTES, "Request too large");
export type BatchManifest = z.infer<typeof batchManifestSchema>;
export type BatchRequest = z.infer<typeof batchRequestSchema>;
export const batchOriginSchema = z.object({authUserId: batchUuid, profileId: safeId}).strict();
export type BatchOrigin = z.infer<typeof batchOriginSchema>;
export function canonicalBatchManifest(manifest: BatchManifest): string {
  const v = batchManifestSchema.parse(manifest);
  return JSON.stringify(["dms-batch-admission/v1", v.context ? ["party", v.context.id] : null,
    v.files.map(f => [f.position, f.original_filename, f.mime_type, f.file_size_bytes, f.sha256_hash])]);
}
export async function batchFingerprint(manifest: BatchManifest): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBatchManifest(manifest));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
export const batchMemberSchema = z.object({position: z.number().int().min(0).max(9), id: safeId,
  code: z.string().regex(/^[0-9A-F]{32}$/), bucket: z.literal("dms-temp"), path: z.string().min(1).max(250),
  name: z.string(), mime: z.string(), size: safeId.max(BATCH_MAX_BYTES), sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export const batchReceiptSchema = z.object({version: z.literal(1), operation_id: batchUuid,
  auth_user_id: batchUuid, profile_id: safeId, fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  manifest: batchManifestSchema, batch_id: safeId, batch_code: z.string().regex(/^B[0-9A-F]{32}$/),
  company_id: safeId.nullable(), branch_id: safeId.nullable(), members: z.array(batchMemberSchema).min(1).max(10),
}).strict().superRefine((v, ctx) => {
  if (v.branch_id !== null && v.company_id === null) ctx.addIssue({code: "custom", message: "Invalid scope"});
  if (v.members.length !== v.manifest.files.length || new Set(v.members.map(m => m.id)).size !== v.members.length ||
    new Set(v.members.map(m => m.path)).size !== v.members.length || new Set(v.members.map(m => m.code)).size !== v.members.length ||
    v.members.some((m, i) => {const f = v.manifest.files[i]; return !f || m.position !== i || m.name !== f.original_filename || m.mime !== f.mime_type || m.size !== f.file_size_bytes || m.sha256 !== f.sha256_hash || m.path !== `sessions/${m.code}/${batchStorageLeaf(f.original_filename)}`;}))
    ctx.addIssue({code: "custom", message: "Incomplete admission graph"});
});
export type BatchReceipt = z.infer<typeof batchReceiptSchema>;
export const batchCapabilitySchema = z.object({position: z.number().int().min(0).max(9), sessionId: safeId,
  path: z.string(), token: z.string().min(1), signedUrl: z.string().url(),
}).strict();
export type BatchCapability = z.infer<typeof batchCapabilitySchema>;

export const batchMemberRequestSchema=z.object({request:batchRequestSchema,position:z.number().int().min(0).max(9)}).strict()
  .refine(v=>v.position<v.request.manifest.files.length,"Position is not in this admission");
export const batchMemberUploadResultSchema=z.discriminatedUnion("state",[
  z.object({state:z.literal("unavailable"),error:z.string().min(1),issuance_may_be_partial:z.boolean()}).strict(),
  z.object({state:z.literal("ready"),receipt:batchReceiptSchema,position:z.number().int().min(0).max(9),
    object:z.discriminatedUnion("state",[
      z.object({state:z.literal("present")}).strict(),
      z.object({state:z.literal("upload"),capability:batchCapabilitySchema}).strict(),
    ]),issuance_may_be_partial:z.boolean()}).strict(),
]).superRefine((v,ctx)=>{
  if(v.state!=="ready")return;
  const member=v.receipt.members[v.position];
  if(!member||v.object.state==="upload"&&(v.object.capability.position!==v.position||v.object.capability.sessionId!==member.id||v.object.capability.path!==member.path))
    ctx.addIssue({code:"custom",message:"Unbound member capability"});
});
export type BatchMemberUploadResult=z.infer<typeof batchMemberUploadResultSchema>;

export const batchAdmissionResultSchema = z.discriminatedUnion("state", [
  z.object({state: z.literal("rejected"), error: z.string().min(1)}).strict(),
  z.object({state: z.literal("unconfirmed"), error: z.string().min(1)}).strict(),
  z.object({state: z.literal("admitted"), receipt: batchReceiptSchema,
    capabilityState: z.enum(["ready", "incomplete", "unavailable"]),
    capabilities: z.array(batchCapabilitySchema).max(10), presentPositions: z.array(z.number().int().min(0).max(9)).max(10),
    issuance_may_be_partial: z.boolean(), error: z.string().optional(),
  }).strict(),
]).superRefine((v, ctx) => {
  if (v.state !== "admitted") return;
  const positions = [...v.presentPositions, ...v.capabilities.map(c => c.position)];
  if (new Set(positions).size !== positions.length || positions.some(p => p >= v.receipt.members.length) ||
    v.capabilities.some(c => {const m = v.receipt.members[c.position]; return !m || c.sessionId !== m.id || c.path !== m.path;}) ||
    (v.capabilityState === "ready" ? positions.length !== v.receipt.members.length : v.capabilities.length !== 0 || v.presentPositions.length !== 0))
    ctx.addIssue({code: "custom", message: "Incomplete capability plan"});
});
export type BatchAdmissionResult = z.infer<typeof batchAdmissionResultSchema>;
export const batchRetainedAttemptSchema = z.object({request: batchRequestSchema, origin: batchOriginSchema,
  uncertain: z.boolean(), receipt: batchReceiptSchema.optional(),
}).strict();
export type BatchRetainedAttempt = z.infer<typeof batchRetainedAttemptSchema>;
export type BatchBootstrapResult = {success: true; origin: BatchOrigin} | {success: false; error: string};
export type BatchDiscoveryResult = {success: true; receipts: BatchReceipt[]} | {success: false; error: string};
export type BatchObjectResult = {state: "present" | "absent"} | {state: "unavailable"; error: string};
export async function verifyBatchReceipt(raw: unknown, request: BatchRequest, origin: BatchOrigin): Promise<BatchReceipt | null> {
  const parsed = batchReceiptSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return r.operation_id === request.contract.operationId && r.auth_user_id === origin.authUserId && r.profile_id === origin.profileId &&
    canonicalBatchManifest(r.manifest) === canonicalBatchManifest(request.manifest) && r.fingerprint === await batchFingerprint(request.manifest) ? r : null;
}
