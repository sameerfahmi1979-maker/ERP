import {describe,it,expect,vi} from "vitest";
import {POST,GET as fileGet} from "../route";
import {NextRequest} from "next/server";
import {retainFileResponseReceipt} from "@/server/dms-file-response-receipt";
import {getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {GET as canonicalFile} from "@/app/api/dms/file/route";
vi.mock("@/lib/rbac/check",async o=>({...await o<typeof import("@/lib/rbac/check")>(),getAuthContext:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:vi.fn().mockResolvedValue({error:null})})}));
vi.mock("@/app/api/dms/file/route",()=>({GET:vi.fn()}));
import {GET as handoff} from "../../shared/route";
import {parseFileMode} from "@/server/mobile/dms-v5/sharing";

describe("Mobile DMS bearer route",()=>{
 const post=(raw:string,auth?:string)=>POST(new Request("https://erp.algt.net/api/mobile/dms/v1",{method:"POST",headers:{"content-type":"application/json",...(auth?{Authorization:"Bearer "+auth}:{})},body:raw}));
 const token="a.b.c";
 const actor=()=>vi.mocked(getAuthContext).mockResolvedValue({email:"fixture@example.invalid",profile:{id:7,auth_user_id:"07000000-0000-4000-8000-000000000007",must_change_password:false},isAccountActive:true,accountStatus:"active",permissionCodes:[],roleCodes:[]} as unknown as AuthContext);
 it("enforces the streamed JSON ceiling at precisely 262145 bytes",async()=>{
   const body=JSON.stringify({op:"documentDetails",documentId:1});
   const allowed=await post(body.padEnd(262144));expect(allowed.status).toBe(401);
   const tooLarge=await post(body.padEnd(262145));expect(tooLarge.status).toBe(413);
   expect(tooLarge.headers.get("cache-control")).toContain("no-store");
 });
 it("requires bearer authentication on share POST and GET",async()=>{
   const ans=await post(JSON.stringify({op:"documentShareResolve",token:"A".repeat(43)}));expect(ans.status).toBe(401);
   const resp=await fileGet(new NextRequest("https://erp.algt.net/api/mobile/dms/v1?share=1&disposition=inline"));expect(resp.status).toBe(401);
 });
 it("passes an exact favourite removal under the original bearer",async()=>{
   actor();const rpc=vi.fn().mockResolvedValue({data:{documentId:99,value:false},error:null});vi.mocked(createClient).mockResolvedValue({rpc} as unknown as Awaited<ReturnType<typeof createClient>>);
   const res=await post(JSON.stringify({op:"documentFavouriteSet",documentId:99,value:false}),token);expect(res.status).toBe(200);
   expect(await res.json()).toEqual({success:true,data:{contractVersion:"mobile-dms/5.0",documentId:99,value:false}});
   expect(rpc).toHaveBeenCalledWith("mobile_dms_collections",{p_action:"favourite_set",p_data:{documentId:99,value:false}});
 });
 it("recovers exact evidence with the existing bearer and sends no private request fields",async()=>{
   actor();
   const rpc=vi.fn().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({error:{code:"PT404"}});
   vi.mocked(createClient).mockResolvedValue({rpc} as unknown as Awaited<ReturnType<typeof createClient>>);
   const evidence={kind:"missing",parent:{entityType:"employee",entityId:60},requestId:724,revision:3,documentTypeId:9};
   const body=JSON.stringify({op:"documentRequestEvidence",...evidence});
   expect((await post(body)).status).toBe(401);
   expect((await post(JSON.stringify({op:"documentRequestEvidence",...evidence,audience:"parent"}),token)).status).toBe(400);
   expect(rpc).not.toHaveBeenCalled();
   const current=await post(body,token);
   expect(current.status).toBe(200);
   expect(current.headers.get("cache-control")).toBe("private, no-store");
   expect(await current.json()).toEqual({success:true,data:{contractVersion:"mobile-dms/5.0",available:true}});
   expect(rpc).toHaveBeenCalledExactlyOnceWith("mobile_dms_request_evidence",{p_data:evidence});
   const unavailable=await post(body,token);
   expect(unavailable.status).toBe(404);
   expect(await unavailable.json()).toMatchObject({success:false,code:"unavailable"});
 });
 it("withholds the canonical bytes when the recipient link is revoked during storage I/O",async()=>{
   actor();const digest="d".repeat(64);let revoked=false;
   const rpc=vi.fn(async (name:string,args:{p_action?:string})=>{
    if(name==="mobile_dms_shares" && args.p_action){
     if(revoked)return {data:null,error:{code:"PT404"}};
     return {data:{shareId:6,title:"Example",number:"DMS-6",expiresAt:"2027-01-01T00:00:00Z",source:{documentId:2,fileId:3,versionId:4,sourceHash:digest},canPreview:true,canDownload:true},error:null};
    }
    return {data:{documentId:2,documentVersionId:4,documentRevision:"r",fileId:3,fileSha256:null,sourceHash:digest},error:null};
   });vi.mocked(createClient).mockResolvedValue({rpc} as unknown as Awaited<ReturnType<typeof createClient>>);
   vi.mocked(canonicalFile).mockImplementation(async()=>{revoked=true;return retainFileResponseReceipt(new Response("SECRET FILE"),19) as Awaited<ReturnType<typeof canonicalFile>>;});
   const res=await fileGet(new NextRequest("https://erp.algt.net/api/mobile/dms/v1?share=1&disposition=inline",{headers:{Authorization:"Bearer "+token,"X-ALGT-DMS-Share":"A".repeat(43)}}));
   expect(res.status).toBe(404);expect(await res.text()).not.toContain("SECRET FILE");expect(rpc.mock.calls.some(c=>c[1]?.p_action==="delivered")).toBe(true);
 });
});
describe("protected file selection",()=>{
 const input=(query:string,header?:string)=>new Request("https://erp.algt.net/api/mobile/dms/v1?"+query,{headers:header?{"X-ALGT-DMS-Share":header}:{}});
 it("preserves ordinary files and requires every source field for pinned mode",()=>{
  expect(parseFileMode(input("fileId=1&disposition=inline"))).toEqual({mode:"legacy"});
  expect(()=>parseFileMode(input("fileId=1&expectedDocumentId=2"))).toThrow();
  expect(()=>parseFileMode(input("fileId=1&fileId=2"))).toThrow();
 });
 it("accepts share tokens only in the dedicated header and rejects mixed mode",()=>{
  const token="A".repeat(43);
  expect(parseFileMode(input("share=1&disposition=attachment",token))).toEqual({mode:"share",token,disposition:"attachment"});
  expect(()=>parseFileMode(input("share=1&disposition=inline&fileId=4",token))).toThrow();
  expect(()=>parseFileMode(input("token="+token))).toThrow();
  expect(()=>parseFileMode(input("share=1&disposition=inline"))).toThrow();
 });
 it("serves the same no-data fallback and cannot reflect query inputs",async()=>{
  const res=await handoff();const html=await res.text();
  expect(res.headers.get("content-security-policy")).toContain("connect-src 'none'");
  expect(html).toContain("Open in ALGT ERP System");expect(html).not.toContain("fetch(");
 });
});
