import {beforeEach,expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {NextRequest} from "next/server";
import {deliverMobileDmsV5File,dispatchMobileDmsV5} from "../index";
import {mobileDmsV5Command} from "../contracts";

const f=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),deliver:vi.fn(),record:vi.fn(),life:vi.fn()}));
vi.mock("@/app/api/dms/file/route",()=>({GET:f.deliver}));
vi.mock("@/server/actions/dms/documents",()=>({getDmsDocumentRecordData:f.record}));
vi.mock("@/server/actions/dms/lifecycle-history",()=>({getDmsDocumentLifecycle:f.life}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:f.rpc})}));
vi.mock("@/lib/rbac/check",async original=>({...await original<typeof import("@/lib/rbac/check")>(),getAuthContext:f.auth,canUseApplication:()=>true}));
const actor={profile:{id:7,auth_user_id:"fixture"}} as AuthContext;
const operationId="af539c55-0cbf-48f4-ac4c-0c9a47e9cf00", sourceHash="a".repeat(64);
const original={op:"documentCommentAdd",documentId:8,text:"Example",operationId,sourceHash} as const;
const bound={documentId:8,documentVersionId:2,documentRevision:"1",fileId:null,fileSha256:null,sourceHash};
beforeEach(()=>{vi.resetAllMocks();f.auth.mockResolvedValue(actor);});
it("withholds a committed comment after binding change and can inspect its original from a new login",async()=>{
 let committed=false;
 f.rpc.mockImplementation(async(name,args)=>{
  if(name==="mobile_dms_source")return {data:committed?{...bound,sourceHash:"b".repeat(64)}:bound};
  if(name==="mobile_dms_comment"){committed=true;return {data:{documentId:8,commentId:9,operationId,revision:"1",replayed:false}};}
  expect(name).toBe("mobile_dms_receipt");expect(args.p_command).toBe("comment/add");expect(args.p_data).toEqual({...original,op:undefined});
  return {data:true};
 });
 const failed=await dispatchMobileDmsV5(original,actor);expect(failed.status).toBe(409);
 expect(await failed.json()).toEqual({success:false,error:expect.any(String),code:"source_changed",uncertain:true,operationId});
 const recovered=await dispatchMobileDmsV5(mobileDmsV5Command.parse({op:"documentReceiptLookup",original}),{...actor});
 expect(await recovered.json()).toEqual({success:true,data:{contractVersion:"mobile-dms/5.0",operationId,command:original.op,state:"confirmed"}});
 expect(f.rpc.mock.calls.filter(([n])=>n==="mobile_dms_comment")).toHaveLength(1);
});
it("a source change before comment admission stays definitive",async()=>{
 f.rpc.mockResolvedValue({data:{...bound,sourceHash:"b".repeat(64)}});
 const response=await dispatchMobileDmsV5(original,actor);expect(response.status).toBe(409);
 expect(await response.json()).toEqual({success:false,error:expect.any(String),code:"source_changed",noEffect:true});expect(f.rpc).toHaveBeenCalledTimes(1);
});
it("rejects processing, reads and nested lookups as ordinary receipt originals",()=>{
 for(const wrong of [{op:"processingAction",documentId:8,jobId:5,operationId,sourceHash,action:"cancel"},{op:"documentDetails",documentId:8},{op:"documentReceiptLookup",original}])
  expect(mobileDmsV5Command.safeParse({op:"documentReceiptLookup",original:wrong}).success).toBe(false);
});

it.each([null,{entityType:"employee",entityId:12}])("projects only the ERP-admitted renewal parent %j independently of officer flags",async renewalParent=>{
 f.record.mockResolvedValue({success:true,data:{id:8,title:"Permit",document_no:"P",description:null,expiry_date:null,status:"active",document_type:{name_en:"Permit"}}});
 f.life.mockResolvedValue({success:true,data:{stage:"registered",next:null,owner:null,section:null,blocker:null}});
 f.rpc.mockImplementation(async(name,args)=>{
  if(name==="mobile_dms_source")return {data:bound};
  if(name==="f03_has_document_permission")return {data:false};
  expect(args).toEqual({p_action:"renewal_parent",p_data:{documentId:8,parent:{entityType:"employee",entityId:12}}});
  return {data:renewalParent};
 });
 const response=await dispatchMobileDmsV5({op:"documentDetails",documentId:8,renewalParent:{entityType:"employee",entityId:12}},actor);
 expect((await response.json()).data).toMatchObject({renewalParent,actions:{requestRenewal:!!renewalParent}});
});
it.each(["current","denied","removed-during-delivery"] as const)("fences employee-linked preview bytes at the selected subject for %s",async timing=>{
 let checks=0;
 f.rpc.mockImplementation(async(name,args)=>{
  if(name==="mobile_dms_source"){expect(args.p_caps).toEqual(["dms.documents.preview"]);return {data:{...bound,fileId:3,fileSha256:sourceHash}};}
  expect(name).toBe("mobile_dms_document");expect(args).toEqual({p_action:"employee_link",p_data:{employeeId:12,documentId:8}});
  checks++;return timing==="denied"||timing==="removed-during-delivery"&&checks===2?{error:{code:"PT404"}}:{data:true};
 });
 f.deliver.mockResolvedValue(new Response("PRIVATE PDF"));
 const url="https://erp.invalid/api/mobile/dms/v1/file?fileId=3&expectedEmployeeId=12&expectedDocumentId=8&expectedVersionId=2&expectedSourceHash="+sourceHash+"&disposition=inline";
 const response=await deliverMobileDmsV5File(new NextRequest(url),actor);
 expect(f.deliver).toHaveBeenCalledTimes(timing==="denied"?0:1);
 if(timing==="current"){expect(response.status).toBe(200);expect(await response.text()).toBe("PRIVATE PDF");}
 else{expect(response.status).toBe(404);expect(await response.text()).not.toContain("PRIVATE PDF");}
});
