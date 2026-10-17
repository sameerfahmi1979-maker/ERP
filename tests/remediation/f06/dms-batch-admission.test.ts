import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({client: vi.fn(), admin: vi.fn(), auth: vi.fn(), usable: vi.fn(), permission: vi.fn(),
  rpc: vi.fn(), from: vi.fn(), bucket: vi.fn(), info: vi.fn(), download: vi.fn(), stream: vi.fn(), sign: vi.fn(),
  audit: vi.fn(), analysis: vi.fn(), cache: vi.fn()}));
vi.mock("@/lib/supabase/server", () => ({createClient: m.client}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: m.admin}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: m.auth, canUseApplication: m.usable, hasPermission: m.permission}));
vi.mock("next/cache", () => ({revalidatePath: m.cache}));
vi.mock("@/server/actions/audit", () => ({logAudit: m.audit}));
vi.mock("@/server/actions/dms/ai-intake", () => ({startAiIntakeFromUploadSession: m.analysis, retryAiIntake: vi.fn()}));
vi.mock("@/server/actions/dms/standard-file-name", () => ({resolveStandardFileNameForIntakeApprove: vi.fn()}));
vi.mock("@/lib/dms/approve/approve-ai-intake", () => ({runApproveAiIntakeSaga: vi.fn()}));
import {bootstrapDmsBatchOrigin, createDmsUploadBatch, recoverDmsUploadBatch, discoverDmsBatchAdmissions, verifyDmsBatchUpload, recoverDmsBatchMemberUpload} from "@/server/actions/dms/batch-intake";
import {createDmsUploadSession} from "@/server/actions/dms/upload-sessions";
import {
  batchAdmissionResultSchema, batchMemberUploadResultSchema, batchContractSchema, batchFingerprint, batchManifestSchema,
  batchReceiptSchema, batchRequestSchema, batchRetainedAttemptSchema, canonicalBatchManifest,
  dmsFileMetadataSchema, effectiveDmsMime, validBatchFilename, verifyBatchReceipt,
  type BatchManifest, type BatchReceipt, type BatchRequest,
} from "@/lib/dms/batch-admission";

const hash = "a".repeat(64);
const operation = "00000000-0000-4000-8000-000000000001";
const authUserId = "00000000-0000-4000-8000-000000000002";
const file = {position: 0, original_filename: "a.pdf", mime_type: "application/pdf", file_size_bytes: 1, sha256_hash: hash};
const manifest: BatchManifest = {version: 1, context: null, files: [file]};
const request: BatchRequest = {manifest, contract: {operationId: operation, revision: null}};
const origin = {authUserId, profileId: 5};
// Expected bytes are literals from the approved cross-language contract, not
// computed from the implementation's canonicalizer. SQL must match these too.
export const canonicalBatchVectors = [
  {manifest, bytes: '["dms-batch-admission/v1",null,[[0,"a.pdf","application/pdf",1,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]'},
  {manifest: {...manifest, files: [{...file, original_filename: 'a"b\\c.PDF'}]}, bytes: '["dms-batch-admission/v1",null,[[0,"a\\"b\\\\c.PDF","application/pdf",1,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]'},
  {manifest: {...manifest, context: {type: "party" as const, id: 42}, files: [{...file, original_filename: "é-📄.pdf", file_size_bytes: 52428800}]}, bytes: '["dms-batch-admission/v1",["party",42],[[0,"é-📄.pdf","application/pdf",52428800,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]'},
  {manifest: {...manifest, context: {type: "party" as const, id: 42}, files: [{...file, original_filename: "é-📄.pdf", file_size_bytes: 52428800}]}, bytes: '["dms-batch-admission/v1",["party",42],[[0,"é-📄.pdf","application/pdf",52428800,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]'},
  {manifest: {...manifest, files: [{...file, original_filename: "photo.JPEG", mime_type: "image/jpeg", file_size_bytes: 2}, {...file, position: 1, original_filename: "scan.tif", mime_type: "image/tiff", file_size_bytes: 3}]}, bytes: '["dms-batch-admission/v1",null,[[0,"photo.JPEG","image/jpeg",2,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],[1,"scan.tif","image/tiff",3,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]'},
];
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function receipt(): BatchReceipt {
  return {version: 1, operation_id: operation, auth_user_id: authUserId, profile_id: 5,
    fingerprint: digest(canonicalBatchVectors[0].bytes), manifest, batch_id: 6, batch_code: `B${"C".repeat(32)}`,
    company_id: 7, branch_id: 8, members: [{position: 0, id: 9, code: "D".repeat(32), bucket: "dms-temp",
      path: `sessions/${"D".repeat(32)}/a.pdf`, name: "a.pdf", mime: "application/pdf", size: 1, sha256: hash}]};
}

describe("batch canonical parsed-value contract", () => {
  it.each(["constructor", "__proto__"].flatMap(extension => ["", "application/octet-stream"].map(mime => [extension, mime])))("rejects inherited extension %s with fallback MIME %j", (extension, mime) => {
    expect(effectiveDmsMime(`name.${extension}`, mime)).toBeNull();
    expect(dmsFileMetadataSchema.safeParse({original_filename: `name.${extension}`, mime_type: mime, file_size_bytes: 1, sha256_hash: hash}).success).toBe(false);
  });
  it("retains already-rejecting inherited-name and nonmatching-MIME controls", () => {
    for (const extension of ["constructor", "__proto__", "toString"]) {
      expect(effectiveDmsMime(`name.${extension}`, "application/pdf")).toBeNull();
      expect(dmsFileMetadataSchema.safeParse({original_filename: `name.${extension}`, mime_type: "application/pdf", file_size_bytes: 1, sha256_hash: hash}).success).toBe(false);
    }
    for (const mime of ["", "application/octet-stream"]) {
      expect(effectiveDmsMime("name.toString", mime)).toBeNull();
      expect(dmsFileMetadataSchema.safeParse({original_filename: "name.toString", mime_type: mime, file_size_bytes: 1, sha256_hash: hash}).success).toBe(false);
    }
  });
  it.each(canonicalBatchVectors)("matches independent literal UTF-8 bytes $bytes", async v => {
    expect(canonicalBatchManifest(v.manifest)).toBe(v.bytes);
    expect(await batchFingerprint(v.manifest)).toBe(digest(v.bytes));
    expect(Buffer.from(canonicalBatchManifest(v.manifest))).toEqual(Buffer.from(v.bytes));
  });
  it("uses independent WebCrypto and node reference hashing", async () => {
    const actual = Buffer.from(await webcrypto.subtle.digest("SHA-256", Buffer.from(canonicalBatchVectors[0].bytes))).toString("hex");
    expect(await batchFingerprint(manifest)).toBe(actual);
  });
  it.each([
    [0, 132, "1b97f3098fb2e29b43e7641d17a9b6efca8ae3fd284215291a93a4f33cfdf437"],
    [1, 138, "b96fbcdfe330d28438a14e9ee1c8f8264ff0e03be2604f349137e587288d41cc"],
    [2, 153, "d2e231825b2311c7fe0368725bf9de7da795a01bcf83d15357c6ff162576683d"],
    [3, 154, "72ca9b0cd89dd1075bfc61c8dab901513fbe812c4024d61ebac0ce744eb98f0d"],
  ] as const)("matches separately calculated golden vector %s", (index, bytes, sha256) => {
    expect(Buffer.byteLength(canonicalBatchVectors[index].bytes, "utf8")).toBe(bytes);
    expect(digest(canonicalBatchVectors[index].bytes)).toBe(sha256);
  });
  it.each(["", "application/octet-stream", "application/pdf"])("normalizes browser metadata %s before canonical manifest", mime_type => {
    const normalized = dmsFileMetadataSchema.parse({original_filename: "a.pdf", mime_type, file_size_bytes: 1, sha256_hash: hash.toUpperCase()});
    expect(canonicalBatchManifest({...manifest, files: [{position: 0, ...normalized}]})).toBe(canonicalBatchVectors[0].bytes);
  });
  it.each([
    ["pdf", "application/pdf"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"],
    ["tif", "image/tiff"], ["tiff", "image/tiff"], ["webp", "image/webp"], ["doc", "application/msword"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["xls", "application/vnd.ms-excel"], ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ])("canonical extension %s", (ext, mime) => {
    expect(effectiveDmsMime(`name.${ext.toUpperCase()}`, "")).toBe(mime);
    expect(effectiveDmsMime(`name.${ext}`, mime)).toBe(mime);
    expect(effectiveDmsMime(`name.${ext}`, "application/not-allowed")).toBeNull();
  });
  it("normalizes JPEG/TIFF aliases, never changes original name", () => {
    expect(effectiveDmsMime("name.jpg", "image/jpg")).toBe("image/jpeg");
    expect(effectiveDmsMime("name.tif", "image/x-tiff")).toBe("image/tiff");
    expect(effectiveDmsMime("name.pdf", "image/png")).toBeNull();
    expect(effectiveDmsMime("name.exe", "application/pdf")).toBeNull();
  });
  it("does not normalize Unicode or trim original names", () => {
    expect(canonicalBatchManifest(canonicalBatchVectors[2].manifest)).not.toBe(canonicalBatchManifest(canonicalBatchVectors[3].manifest));
    for (const name of [" a.pdf ", "a\u00a0.pdf", "a\u3000.pdf", "a\ufeff.pdf"]) expect(validBatchFilename(name)).toBe(true);
  });
  it.each(["", " ", "\u00a0", "\u1680", "\u2000", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff", "a\0.pdf", "a\n.pdf", "a\u007f.pdf", "a\u009f.pdf", "a\ud800.pdf", "a\udfff.pdf"])("rejects invalid filename %j", name => expect(validBatchFilename(name)).toBe(false));
  it("counts Unicode scalars, not UTF-16 units", () => {
    expect(validBatchFilename("📄".repeat(496) + ".pdf")).toBe(true);
    expect(validBatchFilename("📄".repeat(497) + ".pdf")).toBe(false);
  });
  it.each(["1", "1.0", "1e0"])("same parsed numeric value %s", numeric => {
    const v = JSON.parse(`{"version":1,"context":{"type":"party","id":${numeric}},"files":[{"position":-0,"original_filename":"a.pdf","mime_type":"application/pdf","file_size_bytes":${numeric},"sha256_hash":"${hash}"}]}`);
    expect(canonicalBatchManifest(v)).toBe(`["dms-batch-admission/v1",["party",1],[[0,"a.pdf","application/pdf",1,"${hash}"]]]`);
  });
  it("accepts safe maximum context identity even with raw decimal scale", () => {
    const v = JSON.parse('{"type":"party","id":9007199254740991.0}');
    expect(canonicalBatchManifest({...manifest, context: v})).toContain('["party",9007199254740991]');
  });
  it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, "1", null])("rejects invalid context ID %j", id => expect(batchManifestSchema.safeParse({...manifest, context: {type: "party", id}}).success).toBe(false));
  it.each([0, -1, 1.1, 52428801, Number.MAX_SAFE_INTEGER + 1, "1", null])("rejects invalid file size %j", file_size_bytes => expect(batchManifestSchema.safeParse({...manifest, files: [{...file, file_size_bytes}]}).success).toBe(false));
  it.each(["", "a".repeat(63), "a".repeat(65), "g".repeat(64)])("rejects malformed hash %s", sha256_hash => expect(dmsFileMetadataSchema.safeParse({original_filename: "a.pdf", mime_type: "application/pdf", file_size_bytes: 1, sha256_hash}).success).toBe(false));
  it("accepts ten ordered files and duplicates without hidden deduplication", () => {
    const files = Array.from({length: 10}, (_, position) => ({...file, position}));
    expect(batchManifestSchema.parse({...manifest, files}).files).toHaveLength(10);
    expect(batchManifestSchema.safeParse({...manifest, files: [...files, {...file, position: 10}]}).success).toBe(false);
    expect(batchManifestSchema.safeParse({...manifest, files: []}).success).toBe(false);
    expect(batchManifestSchema.safeParse({...manifest, files: [{...file, position: 1}, file]}).success).toBe(false);
  });
  it("ordered files alter fingerprint only when positions remain valid", () => {
    const v = canonicalBatchVectors[4].manifest;
    const reversed = {...v, files: [...v.files].reverse().map((f, position) => ({...f, position}))};
    expect(canonicalBatchManifest(reversed)).not.toBe(canonicalBatchManifest(v));
  });
  it.each([
    {...request, unknown: true}, {...request, contract: {...request.contract, revision: 1}},
    {...request, contract: {...request.contract, extra: "x"}}, {...request, manifest: {...manifest, extra: true}},
    {...request, manifest: {...manifest, context: {type: "party", id: 1, extra: true}}},
    {...request, manifest: {...manifest, context: {type: "employee", id: 1}}},
    {...request, manifest: {...manifest, files: [{...file, token: "never"}]}},
    {...request, manifest: {...manifest, version: 2}}, {...request, manifest: {...manifest, files: [{...file, mime_type: ""}]}},
  ])("rejects strict nested request mutation %j", value => expect(batchRequestSchema.safeParse(value).success).toBe(false));
  it("accepts reordered object keys, rejects absent revision and broad PostgreSQL UUID spellings", () => {
    expect(batchRequestSchema.parse({...request, contract: {revision: null, operationId: operation.toUpperCase()}})).toEqual(request);
    expect(batchContractSchema.safeParse({operationId: operation}).success).toBe(false);
    expect(batchContractSchema.safeParse({operationId: operation.replaceAll("-", ""), revision: null}).success).toBe(false);
    expect(batchContractSchema.parse({operationId: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", revision: null}).operationId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
  it("rejects overlarge input without weakening strict bounded fields for a padding test", () => {
    expect(batchRequestSchema.safeParse({...request, manifest: {...manifest, files: [{...file, original_filename: "a".repeat(262145)}]}}).success).toBe(false);
  });
});

describe("stable origin, receipt and ephemeral capability contracts", () => {
  it("verifies complete immutable receipt against separately bootstrapped origin", async () => expect(await verifyBatchReceipt(receipt(), request, origin)).toEqual(receipt()));
  it.each([
    {auth_user_id: operation}, {profile_id: 99}, {operation_id: authUserId}, {fingerprint: "b".repeat(64)},
    {members: []}, {branch_id: 8, company_id: null}, {version: 2}, {extra: true},
    {manifest: {...manifest, context: {type: "party", id: 42}}},
  ])("rejects receipt mutation %j", async mutation => expect(await verifyBatchReceipt({...receipt(), ...mutation}, request, origin)).toBeNull());
  it.each([
    {id: 0}, {position: 1}, {code: "bad"}, {bucket: "other"}, {path: "sessions/wrong/a.pdf"},
    {path: `sessions/${"D".repeat(32)}/../a.pdf`}, {path: `sessions/${"D".repeat(32)}/other.pdf`}, {name: "b.pdf"}, {mime: "image/png"}, {size: 2}, {sha256: "b".repeat(64)}, {extra: true},
  ])("rejects member mutation %j", mutation => {
    const r = receipt();expect(batchReceiptSchema.safeParse({...r, members: [{...r.members[0], ...mutation}]}).success).toBe(false);
  });
  it("does not bootstrap the expected origin from a valid-looking first receipt", async () => {
    expect(await verifyBatchReceipt(receipt(), request, {...origin, authUserId: operation})).toBeNull();
    expect(await verifyBatchReceipt(receipt(), request, {...origin, profileId: 99})).toBeNull();
  });
  it("requires full matching ready plan and withholds every partial token", () => {
    const r = receipt();const capability = {position: 0, sessionId: 9, path: r.members[0].path, token: "test-capability", signedUrl: "https://example.invalid/test"};
    const ready = {state: "admitted", receipt: r, capabilityState: "ready", capabilities: [capability], presentPositions: [], issuance_may_be_partial: false};
    expect(batchAdmissionResultSchema.safeParse(ready).success).toBe(true);
    expect(batchAdmissionResultSchema.safeParse({...ready, capabilities: [], presentPositions: [0]}).success).toBe(true);
    for (const v of [{...ready, capabilities: []}, {...ready, presentPositions: [0]}, {...ready, capabilityState: "incomplete"}, {...ready, capabilities: [{...capability, token: ""}]}, {...ready, capabilities: [{...capability, sessionId: 99}]}])
      expect(batchAdmissionResultSchema.safeParse(v).success).toBe(false);
    expect(batchAdmissionResultSchema.safeParse({...ready, capabilityState: "incomplete", capabilities: [], issuance_may_be_partial: true}).success).toBe(true);
  });
  it("retention permits only JSON identity metadata, never capabilities or file bytes", () => {
    const retained = {request, origin, uncertain: true, receipt: receipt()};
    expect(batchRetainedAttemptSchema.safeParse(retained).success).toBe(true);
    expect(batchRetainedAttemptSchema.safeParse({...retained, token: "no"}).success).toBe(false);
    expect(batchRetainedAttemptSchema.safeParse({...retained, receipt: {...receipt(), signedUrl: "no"}}).success).toBe(false);
  });
});

// Offline doubles deliberately expose no privileged business-table/RPC surface.
// Auth bootstrap is mocked; these assertions are not live Auth/Storage evidence.
describe("ordinary-auth atomic batch server adapter", () => {
  let currentRequest: BatchRequest;
  let currentReceipt: BatchReceipt;
  let eligible: number[];
  const absent = {data: null, error: {status: 404, statusCode: "NoSuchKey", message: "private object detail"}};
  const ctx = () => ({profile: {id: 5, auth_user_id: authUserId, must_change_password: false}, isAccountActive: true});
  function fixture(count = 1) {
    const files = Array.from({length: count}, (_, position) => ({...file, position, original_filename: `${position}.pdf`, sha256_hash: digest("x")}));
    currentRequest = {manifest: {...manifest, files}, contract: {...request.contract}};
    currentReceipt = {...receipt(), manifest: currentRequest.manifest,
      fingerprint: digest(JSON.stringify(["dms-batch-admission/v1", null, files.map(f => [f.position, f.original_filename, f.mime_type, f.file_size_bytes, f.sha256_hash])])),
      members: files.map(f => ({position: f.position, id: 9 + f.position, code: String(f.position + 1).repeat(32), bucket: "dms-temp",
        path: `sessions/${String(f.position + 1).repeat(32)}/${f.original_filename}`, name: f.original_filename,
        mime: f.mime_type, size: f.file_size_bytes, sha256: f.sha256_hash}))};
    eligible = files.map(f => f.position);
  }
  function info(position = 0) {
    return {id: `00000000-0000-4000-8000-${String(position + 20).padStart(12, "0")}`, version: "version-1",
      name: currentReceipt.members[position].path, bucketId: "dms-temp", size: 1, ignored: "not returned"};
  }
  function bytes(value: unknown = new Uint8Array([120])) {
    return new ReadableStream({start(controller) {controller.enqueue(value); controller.close();}});
  }
  function present(position = 0) {
    m.info.mockImplementation(async (path: string) => path === currentReceipt.members[position].path ? {data: info(position), error: null} : absent);
  }
  async function rpc(name: string) {
    if (name === "admit_dms_upload_batch") return {data: {receipt: structuredClone(currentReceipt), replayed: false}, error: null};
    if (name === "read_dms_upload_batch_admission") return {data: structuredClone(currentReceipt), error: null};
    if (name === "dms_upload_batch_eligibility") return {data: {eligible: true, positions: [...eligible]}, error: null};
    if (name === "discover_dms_upload_batch_admissions") return {data: [structuredClone(currentReceipt)], error: null};
    throw Error("unexpected RPC");
  }
  beforeEach(() => {
    vi.resetAllMocks(); fixture();
    m.auth.mockImplementation(async () => ctx());
    m.usable.mockImplementation(value => value.isAccountActive === true && value.profile?.must_change_password !== true);
    m.permission.mockReturnValue(true);
    m.client.mockResolvedValue({rpc: m.rpc, from: m.from});
    m.from.mockImplementation(() => {throw Error("forbidden business-table operation");});
    m.rpc.mockImplementation(rpc);
    m.admin.mockReturnValue({storage: {from: m.bucket}, from: () => {throw Error("forbidden admin business read");}, rpc: () => {throw Error("forbidden admin RPC");}});
    m.bucket.mockImplementation((bucket: string) => {
      expect(bucket).toBe("dms-temp");
      return {info: m.info, download: m.download, createSignedUploadUrl: m.sign};
    });
    m.info.mockResolvedValue(absent);
    m.download.mockReturnValue({asStream: m.stream, then: () => {throw Error("Blob buffering is forbidden");}});
    m.stream.mockImplementation(async () => ({data: bytes(), error: null}));
    m.sign.mockImplementation(async (path: string) => ({data: {path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload"}, error: null}));
  });
  afterEach(() => {vi.useRealTimers();});
  const verify = () => verifyDmsBatchUpload({request: currentRequest, position: 0});

  describe("W22 singular chosen-member recovery", () => {
    it("recovers only eligible unfinished sibling with cleaned historical bytes elsewhere", async () => {
      fixture(2); eligible=[1];
      const result=await recoverDmsBatchMemberUpload({request:currentRequest,position:1});
      expect(result).toEqual({state:"ready",receipt:currentReceipt,position:1,object:{state:"upload",capability:{position:1,sessionId:10,path:currentReceipt.members[1].path,token:"test-only-bearer",signedUrl:"https://storage.example.invalid/upload"}},issuance_may_be_partial:true});
      expect(batchMemberUploadResultSchema.safeParse(result).success).toBe(true);
      expect(m.info).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[1].path);
      expect(m.sign).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[1].path,{upsert:false});
      expect(m.rpc.mock.calls.every(([name])=>["read_dms_upload_batch_admission","dms_upload_batch_eligibility"].includes(name))).toBe(true);
      expect(m.analysis).not.toHaveBeenCalled(); expect(m.cache).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
    });
    it("present selected member uses bounded verification without signing siblings",async()=>{
      fixture(2);eligible=[1];present(1);
      expect(await recoverDmsBatchMemberUpload({request:currentRequest,position:1})).toEqual({state:"ready",receipt:currentReceipt,position:1,object:{state:"present"},issuance_may_be_partial:false});
      expect(m.info.mock.calls.map(c=>c[0])).toEqual([currentReceipt.members[1].path,currentReceipt.members[1].path]);
      expect(m.download).toHaveBeenCalledOnce();expect(m.sign).not.toHaveBeenCalled();
      expect(m.download).toHaveBeenCalledWith(currentReceipt.members[1].path,{}, {signal:expect.any(AbortSignal),cache:"no-store"});
      expect(m.rpc.mock.calls.every(([name,args])=>["read_dms_upload_batch_admission","dms_upload_batch_eligibility"].includes(name)&&JSON.stringify(args)===JSON.stringify({p_operation:operation}))).toBe(true);
    });
    it.each(["before-info","after-info","after-hash","after-final-info","after-sign"])("selected eligibility loss %s denies even while a sibling remains eligible",async stage=>{
      fixture(2);
      if(stage==="before-info")eligible=[1];
      else if(stage==="after-sign")m.sign.mockImplementation(async(path:string)=>{eligible=[1];return {data:{path,token:"PRIVATE_BEARER",signedUrl:"https://storage.example.invalid/upload"},error:null};});
      else{
        present();let infoCalls=0;
        m.info.mockImplementation(async()=>{infoCalls++;if(stage==="after-info"||stage==="after-final-info"&&infoCalls===2)eligible=[1];return {data:info(),error:null};});
        if(stage==="after-hash")m.stream.mockImplementation(async()=>{eligible=[1];return {data:bytes(),error:null};});
      }
      const result=await recoverDmsBatchMemberUpload({request:currentRequest,position:0});
      expect(result).toMatchObject({state:"unavailable",issuance_may_be_partial:stage==="after-sign"});
      expect(result).not.toHaveProperty("receipt");expect(JSON.stringify(result)).not.toContain("PRIVATE_BEARER");
      if(stage==="before-info")expect(m.info).not.toHaveBeenCalled();
      if(stage==="after-info")expect(m.download).not.toHaveBeenCalled();
      if(stage==="after-hash")expect(m.info).toHaveBeenCalledOnce();
      expect(m.sign).toHaveBeenCalledTimes(stage==="after-sign"?1:0);expect(m.analysis).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
    });
    it.each(["origin","receipt","denied","throw"])("post-sign %s retains issuance possibility without stale disclosure",async loss=>{
      m.sign.mockImplementation(async(path:string)=>{
        if(loss==="origin")m.auth.mockResolvedValue({...ctx(),profile:{...ctx().profile,id:99}});
        if(loss==="receipt")currentReceipt={...currentReceipt,batch_id:90};
        if(loss==="denied")m.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"PRIVATE_DIAGNOSTIC"}});
        if(loss==="throw")throw Error("PRIVATE_DIAGNOSTIC");
        return {data:{path,token:"PRIVATE_BEARER",signedUrl:"https://storage.example.invalid/upload"},error:null};
      });
      const result=await recoverDmsBatchMemberUpload({request:currentRequest,position:0});
      expect(result).toMatchObject({state:"unavailable",issuance_may_be_partial:true});expect(result).not.toHaveProperty("receipt");expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);expect(m.sign).toHaveBeenCalledOnce();
    });
    it.each([{position:1},{position:-1},{position:0,path:"injected"},{position:0,origin}])("strict selector rejects %j before dispatch",async mutation=>{
      expect(await recoverDmsBatchMemberUpload({request:currentRequest,...mutation})).toMatchObject({state:"unavailable",issuance_may_be_partial:false});
      expect(m.rpc).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
    });

    it.each(["generic-404","bucket-missing","service-error","wrong-bytes","changed-info"])("singular %s never becomes absence/signing",async kind=>{
      fixture(2);eligible=[1];
      if(kind==="wrong-bytes"||kind==="changed-info"){
        present(1);
        if(kind==="wrong-bytes")m.stream.mockImplementation(async()=>({data:bytes(new Uint8Array([121])),error:null}));
        else m.info.mockResolvedValueOnce({data:info(1),error:null}).mockResolvedValueOnce({data:{...info(1),version:"changed"},error:null});
      }else m.info.mockResolvedValue({data:null,error:kind==="generic-404"?{status:404}:kind==="bucket-missing"?{status:404,statusCode:"NoSuchBucket"}:{status:503,statusCode:"NoSuchKey"}});
      expect(await recoverDmsBatchMemberUpload({request:currentRequest,position:1})).toMatchObject({state:"unavailable",issuance_may_be_partial:false});
      expect(m.sign).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
    });
    it.each(["malformed","error-data","timeout"])("singular signer %s withholds possible-issued credentials",async kind=>{
      if(kind==="timeout"){
        vi.useFakeTimers();let resolve!:(v:unknown)=>void;
        m.sign.mockReturnValue(new Promise(done=>{resolve=done;}));
        const pending=recoverDmsBatchMemberUpload({request:currentRequest,position:0});
        await vi.waitFor(()=>expect(m.sign).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(10001);
        const result=await pending;
        expect(result).toMatchObject({state:"unavailable",issuance_may_be_partial:true});
        resolve({data:{path:currentReceipt.members[0].path,token:"W22_PRIVATE_LATE",signedUrl:"https://example.invalid"},error:null});await Promise.resolve();
        expect(JSON.stringify(result)).not.toContain("W22_PRIVATE");expect(result).not.toHaveProperty("receipt");
      }else{
        m.sign.mockResolvedValue({data:{path:kind==="malformed"?"wrong":currentReceipt.members[0].path,token:"W22_PRIVATE_BEARER",signedUrl:"https://example.invalid"},error:kind==="error-data"?{message:"W22_PRIVATE"}:null});
        const result=await recoverDmsBatchMemberUpload({request:currentRequest,position:0});
        expect(result).toMatchObject({state:"unavailable",issuance_may_be_partial:true});expect(JSON.stringify(result)).not.toContain("W22_PRIVATE");expect(result).not.toHaveProperty("receipt");
      }
      expect(m.sign).toHaveBeenCalledOnce();expect(m.analysis).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
    });
    it.each(["info","hash"])("full sibling identity drift during selected %s denies disclosure",async stage=>{
      fixture(2);eligible=[1];present(1);
      const mutate=()=>{currentReceipt={...currentReceipt,members:currentReceipt.members.map((member,i)=>i===0?{...member,id:99}:member)};};
      if(stage==="info")m.info.mockImplementation(async()=>{const value=info(1);mutate();return {data:value,error:null};});
      else m.stream.mockImplementation(async()=>{mutate();return {data:bytes(),error:null};});
      expect(await recoverDmsBatchMemberUpload({request:currentRequest,position:1})).toMatchObject({state:"unavailable",issuance_may_be_partial:false});
      expect(m.sign).not.toHaveBeenCalled();if(stage==="info")expect(m.download).not.toHaveBeenCalled();
    });

    it("unavailable result cannot carry credentials; ready result must bind exact selected capability",()=>{
      const r=receipt();const ready={state:"ready",receipt:r,position:0,object:{state:"upload",capability:{position:0,sessionId:9,path:r.members[0].path,token:"bearer",signedUrl:"https://example.invalid/upload"}},issuance_may_be_partial:true};
      expect(batchMemberUploadResultSchema.safeParse(ready).success).toBe(true);
      for(const value of [{...ready,position:1},{...ready,object:{...ready.object,capability:{...ready.object.capability,position:1}}},{...ready,object:{...ready.object,capability:{...ready.object.capability,sessionId:99}}},{...ready,object:{...ready.object,capability:{...ready.object.capability,path:"wrong"}}},{state:"unavailable",error:"safe",issuance_may_be_partial:true,capability:ready.object.capability}])expect(batchMemberUploadResultSchema.safeParse(value).success).toBe(false);
    });
  });


  it("independently bootstraps only current Auth/profile identity", async () => {
    expect(await bootstrapDmsBatchOrigin()).toEqual({success: true, origin});
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each([null, {id: 5, auth_user_id: "bad"}, {id: 0, auth_user_id: authUserId}, {id: 5, auth_user_id: authUserId, must_change_password: true}])("denies malformed/forced-change bootstrap %j", async profile => {
    m.auth.mockResolvedValue({...ctx(), profile});
    expect(await bootstrapDmsBatchOrigin()).toMatchObject({success: false});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "rejected"});
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled();
  });
  it("denies inactive bootstrap and sanitizes thrown errors", async () => {
    m.auth.mockResolvedValue({...ctx(), isAccountActive: false});
    expect(await bootstrapDmsBatchOrigin()).toMatchObject({success: false});
    m.auth.mockRejectedValue(Error("private auth key"));
    expect(JSON.stringify(await bootstrapDmsBatchOrigin())).not.toContain("private");
  });
  it.each([null, {}, {...request, actor: 5}, {...request, contract: {...request.contract, revision: 1}}])("rejects invalid input before any boundary %j", async input => {
    expect(await createDmsUploadBatch(input as BatchRequest)).toMatchObject({state: "rejected"});
    expect(m.auth).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each([false, true])("projects the exact wire and verifies complete returned plan, replayed=%s", async replayed => {
    m.rpc.mockImplementation(async name => name === "admit_dms_upload_batch" ? {data: {receipt: currentReceipt, replayed}, error: null} : rpc(name));
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "admitted", receipt: currentReceipt, capabilityState: "ready", presentPositions: [], issuance_may_be_partial: true});
    expect(batchAdmissionResultSchema.safeParse(result).success).toBe(true);
    expect(m.rpc.mock.calls[0]).toEqual(["admit_dms_upload_batch", {p_operation: operation, p_request: {...currentRequest.manifest, revision: null}}]);
    expect(m.sign).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[0].path, {upsert: false});
    expect(m.from).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled(); expect(m.analysis).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.every(([name]) => ["admit_dms_upload_batch", "read_dms_upload_batch_admission", "dms_upload_batch_eligibility"].includes(name))).toBe(true);
  });
  it("recovery submits the identical operation and manifest; a new valid session does not change origin", async () => {
    m.auth.mockImplementation(async () => ({...ctx(), sessionMarker: "new-actual-session-double"}));
    await recoverDmsUploadBatch(currentRequest);
    expect(m.rpc.mock.calls[0]).toEqual(["admit_dms_upload_batch", {p_operation: operation, p_request: {...currentRequest.manifest, revision: null}}]);
  });
  it.each(["42501", "22023", "23514", "PT409", "40001", "55P03"])("recognized SQL rollback %s exposes no raw detail", async code => {
    m.rpc.mockResolvedValue({data: null, error: {code, message: "private SQL details"}});
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "rejected"}); expect(JSON.stringify(result)).not.toContain("private"); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each(["57014", "PGRST000", undefined, "42501-invented"])("unknown/cancelled response %s stays uncertain", async code => {
    m.rpc.mockResolvedValue({data: null, error: {code, message: "private"}});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"}); expect(m.admin).not.toHaveBeenCalled();
  });

  it.each(['40003','08007','40ZZZ','57014','PGRST000','XX000',undefined,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01',40001,{}])("W16 admission unknown/malformed code %j never starts capability work", async code => {
    m.rpc.mockResolvedValue({data: null, error: {code, message: "W16_PRIVATE", details: "W16_PRIVATE", hint: "W16_PRIVATE"}});
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "unconfirmed"}); expect(JSON.stringify(result)).not.toMatch(/W16_PRIVATE|rejected|committed/i);
    expect(m.rpc).toHaveBeenCalledOnce(); expect(m.admin).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled(); expect(m.analysis).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
  it.each(["40000", "40001", "40002", "40P01", "55P03"])("W16 admission preserves exact known abort %s", async code => {
    m.rpc.mockResolvedValue({data: null, error: {code}});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "rejected"}); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each(["P0001", "P0002"])("W16 admission does not import numbered-only class %s", async code => {
    m.rpc.mockResolvedValue({data: null, error: {code}});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"});
  });
  it.each(["40003", "08007"])("W16 explicit admission recovery after %s retains original manifest and identity", async code => {
    m.rpc.mockResolvedValueOnce({data: null, error: {code}});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"});
    expect(m.rpc).toHaveBeenCalledOnce(); expect(m.admin).not.toHaveBeenCalled();
    const first = structuredClone(m.rpc.mock.calls[0]);
    m.rpc.mockImplementation(async name => name === "admit_dms_upload_batch" ? {data: {receipt: currentReceipt, replayed: true}, error: null} : rpc(name));
    expect(await recoverDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", receipt: currentReceipt, capabilityState: "ready"});
    expect(m.rpc.mock.calls[1]).toEqual(first);
  });

  it("transport throw retains uncertainty without leaking diagnostics", async () => {
    m.rpc.mockRejectedValue(Error("private transport"));
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "unconfirmed"}); expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([null, {}, {extra: true}, {replayed: "false"}])("malformed wrapper causes zero Storage %j", async mutation => {
    m.rpc.mockResolvedValue({data: mutation === null ? null : {...await rpc("admit_dms_upload_batch").then(v => v.data), ...mutation}, error: null});
    if (mutation && Object.keys(mutation).length === 0) m.rpc.mockResolvedValue({data: {}, error: null});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"}); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each([{auth_user_id: operation}, {profile_id: 99}, {operation_id: authUserId}, {fingerprint: hash}, {members: []}, {company_id: null}, {extra: true}])("wrong first receipt does not establish origin %j", async mutation => {
    m.rpc.mockResolvedValue({data: {receipt: {...currentReceipt, ...mutation}, replayed: false}, error: null});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"}); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each([{batch_id: 88}, {batch_code: `B${"F".repeat(32)}`}, {company_id: 80}, {branch_id: 80}])("full receipt equality rejects later immutable mutation %j", async mutation => {
    m.rpc.mockImplementation(async name => name === "read_dms_upload_batch_admission" ? {data: {...currentReceipt, ...mutation}, error: null} : rpc(name));
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"}); expect(m.admin).not.toHaveBeenCalled();
  });
  it("hidden receipt denies without leaking retained IDs or signing", async () => {
    m.rpc.mockImplementation(async name => name === "read_dms_upload_batch_admission" ? {data: null, error: {code: "42501"}} : rpc(name));
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "unconfirmed"}); expect(result).not.toHaveProperty("receipt"); expect(m.sign).not.toHaveBeenCalled();
  });
  it("cache exception after confirmed identity does not revoke admission", async () => {
    m.cache.mockImplementation(() => {throw Error("private cache");});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "ready"});
  });
  it.each([{eligible: false, positions: []}, {eligible: true, positions: []}])("readable unavailable lifecycle %j never signs", async eligibility => {
    m.rpc.mockImplementation(async name => name === "dms_upload_batch_eligibility" ? {data: eligibility, error: null} : rpc(name));
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "unavailable", capabilities: [], presentPositions: []});
    expect(m.sign).not.toHaveBeenCalled();
  });
  it.each([{eligible: true, positions: [0, 0]}, {eligible: true, positions: [1]}, {eligible: false, positions: [0]}, {eligible: true, positions: ["0"]}, {eligible: true, positions: [0], extra: true}])("malformed eligibility %j fails closed", async eligibility => {
    m.rpc.mockImplementation(async name => name === "dms_upload_batch_eligibility" ? {data: eligibility} : rpc(name));
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"}); expect(m.sign).not.toHaveBeenCalled();
  });
  it("combines historical verified bytes with a capability only for the eligible member", async () => {
    fixture(2); eligible = [1]; present(0);
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "admitted", capabilityState: "ready", presentPositions: [0], capabilities: [{position: 1, sessionId: 10}]});
    expect(m.sign).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[1].path, {upsert: false});
  });
  it("a historical absent member stops the complete plan rather than regenerating it", async () => {
    fixture(2); eligible = [1];
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "unavailable", capabilities: [], presentPositions: []});
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("final eligibility subset must still contain every issued capability", async () => {
    m.sign.mockImplementation(async (path: string) => {eligible = []; return {data: {path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload"}, error: null};});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "unavailable", capabilities: [], presentPositions: [], issuance_may_be_partial: true});
  });
  it.each(["before-first", "after-first", "after-last"])("current origin loss %s prevents further effects and stale receipt disclosure", async boundary => {
    fixture(2);
    if (boundary === "before-first") m.auth.mockResolvedValueOnce(ctx()).mockResolvedValue({...ctx(), profile: {...ctx().profile, id: 99}});
    else m.sign.mockImplementation(async (path: string) => {
      if (boundary === "after-first" || path === currentReceipt.members[1].path) m.auth.mockResolvedValue({...ctx(), profile: {...ctx().profile, auth_user_id: operation}});
      return {data: {path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload"}, error: null};
    });
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "unconfirmed"}); expect(result).not.toHaveProperty("receipt");
    expect(m.sign).toHaveBeenCalledTimes(boundary === "before-first" ? 0 : boundary === "after-first" ? 1 : 2);
  });
  it.each([0, 1])("same-principal read grant loss after signer %s stops disclosure and later effects", async position => {
    fixture(2);
    m.sign.mockImplementation(async (path: string) => {
      if (path === currentReceipt.members[position].path) m.rpc.mockImplementation(async name => name === "read_dms_upload_batch_admission" ? {data: null, error: {code: "42501"}} : rpc(name));
      return {data: {path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload"}, error: null};
    });
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "unconfirmed"}); expect(result).not.toHaveProperty("receipt");
    expect(m.sign).toHaveBeenCalledTimes(position + 1); expect(JSON.stringify(result)).not.toContain("test-only-bearer");
    expect(await m.auth()).toEqual(ctx());
  });
  it("later member identity change is not accepted merely because the manifest still matches", async () => {
    m.sign.mockImplementation(async (path: string) => {
      currentReceipt = {...currentReceipt, members: [{...currentReceipt.members[0], id: 88}]};
      return {data: {path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload"}, error: null};
    });
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "unconfirmed"});
  });
  it.each([0, 1])("signer failure at position %s withholds the entire plan, without compensation", async position => {
    fixture(2);
    m.sign.mockImplementation(async (path: string) => {
      if (path === currentReceipt.members[position].path) throw Error("private signer");
      return {data: {path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload"}, error: null};
    });
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: [], presentPositions: [], issuance_may_be_partial: true});
    expect(JSON.stringify(result)).not.toMatch(/private signer|test-only-bearer/); expect(m.from).not.toHaveBeenCalled();
  });
  it.each([{token: ""}, {token: undefined}, {path: "other"}, {path: undefined}, {signedUrl: "invalid"}, {signedUrl: "ftp://example.invalid/file"}, {signedUrl: "https://user:secret@example.invalid/file"}, {extra: true}])("malformed signed response %j withholds all credentials", async mutation => {
    m.sign.mockResolvedValue({data: {path: currentReceipt.members[0].path, token: "test-only-bearer", signedUrl: "https://storage.example.invalid/upload", ...mutation}, error: null});
    expect(await createDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: [], issuance_may_be_partial: true});
  });
  it("signer service error is safe even if it also supplied credential-shaped data", async () => {
    m.sign.mockResolvedValue({data: {path: currentReceipt.members[0].path, token: "secret", signedUrl: "https://example.invalid"}, error: {message: "private"}});
    const result = await createDmsUploadBatch(currentRequest);
    expect(result).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: []}); expect(JSON.stringify(result)).not.toMatch(/secret|private/);
  });

  it("exact bytes plus stable info verify present, with no admission, signer or analysis", async () => {
    present(); expect(await verify()).toEqual({state: "present"});
    expect(m.info).toHaveBeenCalledTimes(2); expect(m.stream).toHaveBeenCalledOnce();
    expect(m.download).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[0].path, {}, {signal: expect.any(AbortSignal), cache: "no-store"});
    expect(m.download.mock.calls[0][2].signal.aborted).toBe(true);
    expect(m.sign).not.toHaveBeenCalled(); expect(m.analysis).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.some(([name]) => name === "admit_dms_upload_batch")).toBe(false);
  });
  it("true object-specific absence is read-only; statusCode is not inferred from message or code", async () => {
    expect(await verify()).toEqual({state: "absent"}); expect(m.download).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
  it("the observed Storage API legacy object absence verifies and issues a fresh bound upload plan", async () => {
    m.info.mockResolvedValue({data: null, error: {name: "StorageApiError", status: 400, statusCode: "404", message: "Object not found"}});
    expect(await verify()).toEqual({state: "absent"});
    expect(m.download).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
    expect(await recoverDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "ready"});
    expect(m.sign).toHaveBeenCalledOnce();
  });
  it("legacy object absence recovers only the selected eligible sibling", async () => {
    fixture(2); eligible = [1];
    m.info.mockResolvedValue({data: null, error: {name: "StorageApiError", status: 400, statusCode: "404", message: "Object not found"}});
    expect(await recoverDmsBatchMemberUpload({request: currentRequest, position: 1})).toMatchObject({state: "ready", position: 1, object: {state: "upload"}});
    expect(m.info).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[1].path);
    expect(m.sign).toHaveBeenCalledExactlyOnceWith(currentReceipt.members[1].path, {upsert: false});
  });
  it("a legacy absence error with contradictory data remains unavailable and cannot issue an upload token", async () => {
    m.info.mockResolvedValue({data: info(), error: {name: "StorageApiError", status: 400, statusCode: "404", message: "Object not found"}});
    expect(await verify()).toMatchObject({state: "unavailable"});
    expect(await recoverDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: []});
    expect(m.sign).not.toHaveBeenCalled(); expect(m.download).not.toHaveBeenCalled();
  });
  it.each([
    {status: 404}, {status: "404", statusCode: "NoSuchKey"}, {status: 404, code: "NoSuchKey"},
    {status: 404, statusCode: "NoSuchBucket"}, {status: 404, statusCode: "TenantNotFound"},
    {status: 503, statusCode: "404"}, {status: 503, statusCode: "NoSuchKey"}, {status: 403, statusCode: "AccessDenied"},
    {status: 400, statusCode: "404"},
    {name: "StorageApiError", status: 400, statusCode: "404", message: "Bucket not found"},
    {name: "StorageApiError", status: 403, statusCode: "404", message: "Object not found"},
    {name: "StorageApiError", status: 503, statusCode: "404", message: "Object not found"},
    {name: "StorageApiError", status: "400", statusCode: "404", message: "Object not found"},
    {name: "StorageApiError", status: 400, statusCode: 404, message: "Object not found"},
    {name: "OtherError", status: 400, statusCode: "404", message: "Object not found"},
    {name: "StorageApiError", status: 400, statusCode: "AccessDenied", message: "Object not found"},
    {status: 400, statusCode: "404", message: "Object not found"},
    {name: "StorageApiError", status: 400, statusCode: "404"},
    {name: "StorageApiError", status: 400, statusCode: "404", message: "Object not found or permission denied"},
  ])("non-object absence error %j is unavailable, never re-signed", async error => {
    m.info.mockResolvedValue({data: null, error});
    expect(await verify()).toMatchObject({state: "unavailable"});
    expect(await recoverDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: []});
    expect(m.download).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
  it.each([
    {id: undefined}, {id: "bad"}, {version: undefined}, {version: ""}, {name: undefined}, {name: "other"},
    {bucketId: undefined}, {bucketId: "other"}, {size: undefined}, {size: 0}, {size: 2}, {size: 52428801}, {size: "1"}, {size: 1.5},
  ])("invalid metadata %j fails before stream download", async mutation => {
    m.info.mockResolvedValue({data: {...info(), ...mutation}, error: null});
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.download).not.toHaveBeenCalled();
  });
  it("metadata nested fallback is never substituted for missing SDK size", async () => {
    m.info.mockResolvedValue({data: {...info(), size: undefined, metadata: {size: 1}}, error: null});
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.download).not.toHaveBeenCalled();
  });
  it.each([new Uint8Array(), new Uint8Array([120, 120]), new Uint8Array([121]), "x"])("truncated/oversize/wrong/bad chunk %j cannot verify", async value => {
    present(); m.stream.mockImplementation(async () => ({data: bytes(value), error: null}));
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.info).toHaveBeenCalledOnce();
    expect(m.download.mock.calls[0][2].signal.aborted).toBe(true);
  });
  it.each([null, {}, {getReader: () => undefined}])("non-readable body %j fails closed", async data => {
    present(); m.stream.mockResolvedValue({data, error: null});
    expect(await verify()).toMatchObject({state: "unavailable"});
  });
  it("rejected reader and SDK stream errors are safe", async () => {
    present(); m.stream.mockResolvedValue({data: new ReadableStream({start(c) {c.error(Error("private stream"));}}), error: null});
    expect(await verify()).toMatchObject({state: "unavailable"});
    m.stream.mockResolvedValue({data: bytes(), error: {message: "private"}});
    expect(JSON.stringify(await verify())).not.toContain("private");
  });
  it.each([{id: authUserId}, {version: "version-2"}, {name: "other"}, {bucketId: "other"}, {size: 2}])("correct bytes but changed second metadata %j is unavailable", async mutation => {
    m.info.mockResolvedValueOnce({data: info(), error: null}).mockResolvedValueOnce({data: {...info(), ...mutation}, error: null});
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.sign).not.toHaveBeenCalled();
  });
  it("overshoot cancels a non-closing stream without waiting on its cleanup", async () => {
    present(); const cancel = vi.fn(() => new Promise<void>(() => undefined));
    m.stream.mockResolvedValue({data: new ReadableStream({start(c) {c.enqueue(new Uint8Array([120, 120]));}, cancel}), error: null});
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(cancel).toHaveBeenCalledOnce();
  });
  it("stream deadline aborts/cancels without unbounded waiting", async () => {
    vi.useFakeTimers(); present(); const cancel = vi.fn(() => new Promise<void>(() => undefined));
    m.stream.mockResolvedValue({data: new ReadableStream({cancel}), error: null});
    const pending = verify();
    await vi.waitFor(() => expect(m.stream).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toMatchObject({state: "unavailable"}); expect(cancel).toHaveBeenCalledOnce();
    expect(m.download.mock.calls[0][2].signal.aborted).toBe(true);
  });
  it("info timeout is unavailable and consumes its late rejection", async () => {
    vi.useFakeTimers(); let reject!: (error: Error) => void;
    m.info.mockReturnValue(new Promise((_, fail) => {reject = fail;}));
    const pending = verify(); await vi.waitFor(() => expect(m.info).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(10_001); expect(await pending).toMatchObject({state: "unavailable"});
    reject(Error("private late error")); await Promise.resolve(); expect(m.download).not.toHaveBeenCalled();
  });
  it("signer timeout retains admission and possible issuance without appending late credentials", async () => {
    vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    m.sign.mockReturnValue(new Promise(done => {resolve = done;}));
    const pending = createDmsUploadBatch(currentRequest); await vi.waitFor(() => expect(m.sign).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await pending;
    expect(result).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: [], issuance_may_be_partial: true});
    resolve({data: {path: currentReceipt.members[0].path, token: "late-secret", signedUrl: "https://example.invalid"}, error: null});
    await Promise.resolve(); expect(JSON.stringify(result)).not.toContain("late-secret");
  });
  it("admission timeout preserves uncertainty and never dispatches Storage for a late receipt", async () => {
    vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    m.rpc.mockReturnValue(new Promise(done => {resolve = done;}));
    const pending = createDmsUploadBatch(currentRequest); await vi.waitFor(() => expect(m.rpc).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await pending; expect(result).toMatchObject({state: "unconfirmed"});
    resolve({data: {receipt: currentReceipt, replayed: false}, error: null}); await Promise.resolve();
    expect(m.admin).not.toHaveBeenCalled(); expect(result).not.toHaveProperty("receipt");
  });
  it("late stream setup after deadline is cancelled without turning absence into success", async () => {
    vi.useFakeTimers(); present(); let resolve!: (value: unknown) => void;
    m.stream.mockReturnValue(new Promise(done => {resolve = done;}));
    const pending = verify(); await vi.waitFor(() => expect(m.stream).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(30_001); expect(await pending).toMatchObject({state: "unavailable"});
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    resolve({data: new ReadableStream({cancel}), error: null});
    await Promise.resolve(); await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce();
  });
  it("malformed late stream completion is consumed without an unhandled cleanup rejection", async () => {
    vi.useFakeTimers(); present(); let resolve!: (value: unknown) => void;
    m.stream.mockReturnValue(new Promise(done => {resolve = done;}));
    const pending = verify(); await vi.waitFor(() => expect(m.stream).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(30_001); expect(await pending).toMatchObject({state: "unavailable"});
    resolve(null); await Promise.resolve(); await Promise.resolve();
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("a readable body accompanying an SDK error is cancelled, never consumed", async () => {
    present(); const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({cancel});
    m.stream.mockResolvedValue({data: body, error: {message: "private"}});
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(cancel).toHaveBeenCalledOnce();
  });
  it("current read revocation after metadata prevents privileged download", async () => {
    m.info.mockImplementation(async () => {
      m.rpc.mockImplementation(async name => name === "read_dms_upload_batch_admission" ? {data: null, error: {code: "42501"}} : rpc(name));
      return {data: info(), error: null};
    });
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.download).not.toHaveBeenCalled();
  });
  it("current eligibility loss after hashing prevents a present claim", async () => {
    present(); m.stream.mockImplementation(async () => {
      m.rpc.mockImplementation(async name => name === "dms_upload_batch_eligibility" ? {data: {eligible: false, positions: []}, error: null} : rpc(name));
      return {data: bytes(), error: null};
    });
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.info).toHaveBeenCalledOnce();
  });
  it("wrong existing bytes never acquire a replacement signed URL", async () => {
    present(); m.stream.mockImplementation(async () => ({data: bytes(new Uint8Array([121])), error: null}));
    expect(await recoverDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "incomplete", capabilities: [], issuance_may_be_partial: false});
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("fully present historical members need no issuance but still require current shared eligibility", async () => {
    present(); eligible = [];
    expect(await recoverDmsUploadBatch(currentRequest)).toMatchObject({state: "admitted", capabilityState: "ready", capabilities: [], presentPositions: [0], issuance_may_be_partial: false});
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("readonly verification rejects unbound request/position and never admits a missing graph", async () => {
    expect(await verifyDmsBatchUpload({request: currentRequest, position: 1})).toMatchObject({state: "unavailable"}); expect(m.rpc).not.toHaveBeenCalled();
    m.rpc.mockResolvedValue({data: null, error: {code: "42501"}});
    expect(await verify()).toMatchObject({state: "unavailable"}); expect(m.admin).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.every(([name]) => name === "read_dms_upload_batch_admission")).toBe(true);
  });

  it("discovery returns only a verified recent page without Storage", async () => {
    expect(await discoverDmsBatchAdmissions()).toEqual({success: true, receipts: [currentReceipt]});
    expect(m.rpc).toHaveBeenCalledWith("discover_dms_upload_batch_admissions", {p_before_id: null}); expect(m.admin).not.toHaveBeenCalled();
  });
  it.each(["foreign", "duplicate", "too-many", "bad-digest", "ascending", "duplicate-operation", "unknown-key"])("rejects malformed discovery page %s as a whole", async kind => {
    const second = {...currentReceipt, batch_id: 5, operation_id: "00000000-0000-4000-8000-000000000003"};
    const data = kind === "foreign" ? [{...currentReceipt, auth_user_id: operation}] : kind === "duplicate" ? [currentReceipt, currentReceipt] : kind === "too-many" ? Array(21).fill(currentReceipt) : kind === "bad-digest" ? [{...currentReceipt, fingerprint: hash}] : kind === "ascending" ? [second, currentReceipt] : kind === "duplicate-operation" ? [currentReceipt, {...second, operation_id: operation}] : [{...currentReceipt, token: "secret"}];
    m.rpc.mockResolvedValue({data, error: null});
    expect(await discoverDmsBatchAdmissions()).toMatchObject({success: false}); expect(m.admin).not.toHaveBeenCalled();
  });
  it("discovery denies changed current profile instead of exposing a prior page", async () => {
    m.auth.mockResolvedValueOnce(ctx()).mockResolvedValue({...ctx(), profile: {...ctx().profile, id: 99}});
    expect(await discoverDmsBatchAdmissions()).toMatchObject({success: false});
  });
  it("discovery rechecks ordinary read authority after same-active-principal grant loss", async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => {release = resolve;});
    m.rpc.mockImplementation(async name => {
      if (name === "read_dms_upload_batch_admission") {await waiting; return {data: null, error: {code: "42501"}};}
      return rpc(name);
    });
    const pending = discoverDmsBatchAdmissions();
    await vi.waitFor(() => expect(m.rpc).toHaveBeenCalledWith("read_dms_upload_batch_admission", {p_operation: operation}));
    release(); expect(await pending).toMatchObject({success: false});
    expect(m.auth.mock.results.every(result => result.type === "return")).toBe(true);
    expect(m.admin).not.toHaveBeenCalled();
  });
  it("discovery rejects a changed immutable receipt and does not demand historical signability", async () => {
    m.rpc.mockImplementation(async name => name === "read_dms_upload_batch_admission" ? {data: {...currentReceipt, batch_id: 99}, error: null} : rpc(name));
    expect(await discoverDmsBatchAdmissions()).toMatchObject({success: false});
    expect(m.rpc.mock.calls.some(([name]) => name === "dms_upload_batch_eligibility")).toBe(false);
  });

  it.each(["", "application/octet-stream"])("single-file metadata %j normalizes before the unchanged insert/sign lifecycle", async mime_type => {
    const insert = vi.fn(); const single = vi.fn();
    const query = {select: vi.fn(), eq: vi.fn(), is: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), insert, single};
    for (const method of ["select", "eq", "is", "limit", "insert"] as const) query[method].mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({data: null, error: null});
    single.mockImplementation(async () => ({data: {id: 90, ...insert.mock.calls[0][0]}, error: null}));
    m.from.mockReturnValue(query);
    const result = await createDmsUploadSession({original_filename: "a.pdf", mime_type, file_size_bytes: 1, sha256_hash: hash.toUpperCase()});
    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({mime_type: "application/pdf", sha256_hash: hash, status: "uploaded", uploaded_by: 5}));
    expect(m.from.mock.calls.map(([table]) => table)).toEqual(["dms_document_files", "dms_upload_sessions"]);
    expect(m.sign).toHaveBeenCalledExactlyOnceWith(insert.mock.calls[0][0].temp_storage_path);
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(m.sign.mock.invocationCallOrder[0]); expect(m.audit).toHaveBeenCalledOnce();
  });
  it.each(["constructor", "__proto__"])("single-file inherited extension %s fails before any row operation", async extension => {
    expect(await createDmsUploadSession({original_filename: `a.${extension}`, mime_type: "", file_size_bytes: 1, sha256_hash: hash})).toMatchObject({success: false});
    expect(m.from).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
});
