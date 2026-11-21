import { beforeEach,describe,expect,it,vi } from "vitest";
import { createHash } from "node:crypto";
import { mobileBytes } from "../hr-binary";
import { photoBinding } from "../hr-photo";
import { mobileAccessToken } from "@/lib/supabase/mobile-request";
const m=vi.hoisted(()=>({auth:vi.fn(),allowed:vi.fn(),row:vi.fn(),download:vi.fn(),audit:vi.fn(),state:vi.fn(),load:vi.fn(),hash:vi.fn(),attest:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:m.auth,canUseApplication:(ctx:{isAccountActive:boolean})=>ctx.isAccountActive}));
vi.mock("@/lib/output/issued-file-access",()=>({canAccessIssuedFile:m.allowed}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:m.row})})})})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({storage:{from:()=>({download:m.download})},from:()=>({insert:m.audit})})}));
vi.mock("@/server/hr-photo-source",async orig=>({...await orig<typeof import("@/server/hr-photo-source")>(),currentPhotoState:m.state,loadPhotoSource:m.load}));
const bytes=Buffer.from("%PDF-1.4 synthetic");
const checksum=createHash("sha256").update(bytes).digest("hex");
const doc={id:2,file_name:"original.pdf",storage_path:"fixtures/2",file_size_bytes:bytes.length,checksum,source_record_type:"employee",source_record_id:9,lifecycle_state:"issued",owner_company_id:8,revoked_at:null,archived_at:null,expires_at:null,superseded_by_id:null};
const state={documentId:3,photo:{document_id:3,version_id:4,file_id:5,label:"photo"},canDownload:true,framing:null};
const file={id:5,sha256_hash:checksum,mime_type:"image/png",file_name:"portrait.png"};
const request=(path:string,auth="Bearer a.b.c")=>new Request("https://erp.invalid/"+path,{headers:{Authorization:auth}});
const query="issued-file?employeeId=9&issuanceId=2&checksum="+checksum+"&mode=preview";
const photo=(overrides:Record<string,string>={})=>"photo?"+new URLSearchParams({employeeId:"9",dependentId:"6",documentId:"3",versionId:"4",fileId:"5",mode:"preview",fingerprint:photoBinding(9,6,state,checksum)!.fingerprint,...overrides});
beforeEach(()=>{
 vi.resetAllMocks();
 m.auth.mockImplementation(async()=>({profile:mobileAccessToken()==="a.b.c"?{id:8}:null,isAccountActive:true}));
 m.allowed.mockResolvedValue(true);m.row.mockResolvedValue({data:doc});m.download.mockResolvedValue({data:new Blob([bytes])});m.audit.mockResolvedValue({error:null});
 const chain={eq:()=>chain,is:()=>chain,maybeSingle:m.hash};m.hash.mockResolvedValue({data:{sha256_hash:checksum}});
 m.state.mockResolvedValue({state,client:{from:()=>({select:()=>chain})}});
 m.load.mockResolvedValue({file,source:{documentId:3,versionId:4,fileId:5},bytes,ctx:{profile:{auth_user_id:"a"}},label:"photo",client:{auth:{getClaims:async()=>({data:{claims:{sub:"a",session_id:"s"}}})}},admin:{rpc:m.attest}});
 m.attest.mockResolvedValue({data:1});
});
describe("scoped mobile byte delivery",()=>{
 it("requires a current bearer and rejects duplicate opening parameters",async()=>{
   expect((await mobileBytes(request(query,""),"issued-file")).status).toBe(401);
   expect((await mobileBytes(request(query,"Bearer x.y.z"),"issued-file")).status).toBe(401);
   expect((await mobileBytes(request(query+"&employeeId=9"),"issued-file")).status).toBe(422);
   expect(m.download).not.toHaveBeenCalled();
 });
 it.each([{revoked_at:"2021-01-01"},{expires_at:"2021-01-01"},{archived_at:"2021-01-01"},{superseded_by_id:5},{source_record_id:8}])("blocks unavailable wallet original %j",async change=>{
   m.row.mockResolvedValue({data:{...doc,...change}});
   expect((await mobileBytes(request(query),"issued-file")).status).toBe(404);
   expect(m.download).not.toHaveBeenCalled();
 });
 it("forbidden salary output never reaches storage",async()=>{
   m.allowed.mockResolvedValue(false);expect((await mobileBytes(request(query),"issued-file")).status).toBe(404);
   expect(m.download).not.toHaveBeenCalled();
 });
 it("denies an original when authority changes during download",async()=>{
   m.download.mockImplementation(async()=>{m.allowed.mockResolvedValue(false);return {data:new Blob([bytes])};});
   const r=await mobileBytes(request(query),"issued-file");expect(r.status).toBe(404);expect(m.audit).not.toHaveBeenCalled();
 });
 it("checks returned bytes, retained lifecycle and employee after storage",async()=>{
   m.download.mockResolvedValueOnce({data:new Blob(["different"])});
   expect((await mobileBytes(request(query),"issued-file")).status).toBe(409);
   m.row.mockResolvedValueOnce({data:doc}).mockResolvedValueOnce({data:{...doc,source_record_id:8}});
   expect((await mobileBytes(request(query),"issued-file")).status).toBe(404);
   const r=await mobileBytes(request(query),"issued-file");expect(r.status).toBe(200);expect(r.headers.get("X-HR-Employee-Id")).toBe("9");
   expect(r.headers.get("Content-Disposition")).toMatch(/^inline/);expect(await r.text()).toBe(bytes.toString());
 });
 it("rejects a different photo subject, dependent or tuple before storage",async()=>{
   for(const [key,value] of [["employeeId","10"],["dependentId","7"],["fileId","6"]])
     expect((await mobileBytes(request(photo({[key]:value})),"photo")).status).toBe(409);
   expect(m.load).not.toHaveBeenCalled();
 });
 it("requires matching decoded source and native response attestation after storage",async()=>{
   m.load.mockResolvedValueOnce({...(await m.load()),file:{...file,sha256_hash:"a".repeat(64)}});
   expect((await mobileBytes(request(photo()),"photo")).status).toBe(409);
   m.attest.mockResolvedValueOnce({error:{code:"PT409"}});expect((await mobileBytes(request(photo()),"photo")).status).toBe(409);
   const r=await mobileBytes(request(photo()),"photo");expect(r.status).toBe(200);expect(r.headers.get("X-HR-Photo-Fingerprint")).toBe(photoBinding(9,6,state,checksum)!.fingerprint);
 });
});
