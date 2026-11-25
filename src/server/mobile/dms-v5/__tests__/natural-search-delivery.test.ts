import {beforeEach,expect,it,vi} from "vitest";
import {getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {askDmsDocumentsQuestion,searchDmsDocumentsByIntent} from "@/server/actions/dms/ai-search";
import {search} from "../search";

vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
vi.mock("@/lib/rbac/check",async original=>({...await original<typeof import("@/lib/rbac/check")>(),getAuthContext:vi.fn()}));
vi.mock("@/server/actions/dms/ai-search",()=>({askDmsDocumentsQuestion:vi.fn(),searchDmsDocumentsByIntent:vi.fn()}));

const view="dms.documents.view",preview="dms.documents.preview";
const actor={profile:{id:7,auth_user_id:"fixture",must_change_password:false},isAccountActive:true,accountStatus:"active",roleCodes:["reader"],permissionCodes:[view,preview],
 roleAssignments:[{roleId:1,roleCode:"reader",ownerCompanyId:1,branchId:2,permissionCodes:[view,preview]}]} as AuthContext;
const subject={entityType:"employee",entityId:22} as const;
const input={op:"documentNaturalSearch",query:"Synthetic work permits",page:1,subject} as const;
const bindings=Array.from({length:25},(_,i)=>({documentId:25-i,versionId:5,sourceHash:"a".repeat(64)}));
const records=bindings.map(({documentId})=>({id:documentId,title:`Permit ${documentId}`,document_no:`DMS-${documentId}`,status:"active",expiry_date:null,document_type:{name_en:"Permit"}})).reverse();
const inFilter=vi.fn();
const dbRpc=vi.fn();
const intent={keywords:["permit"]};
const hits=bindings.map(b=>({documentId:b.documentId,matchSource:"metadata" as const}));
function result(totalCount:number,rows:{documentId:number;matchSource:"metadata"|"content"|"both"}[]=hits){
 vi.mocked(askDmsDocumentsQuestion).mockResolvedValue({success:true,data:{intent,results:rows,totalCount}} as Awaited<ReturnType<typeof askDmsDocumentsQuestion>>);
 vi.mocked(searchDmsDocumentsByIntent).mockResolvedValue({success:true,data:rows,totalCount} as Awaited<ReturnType<typeof searchDmsDocumentsByIntent>>);
}

beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(getAuthContext).mockResolvedValue(actor);
 result(28);
 inFilter.mockReturnValue({is:async()=>({data:records,error:null})});
 vi.mocked(createClient).mockResolvedValue({rpc:dbRpc,from:()=>({select:()=>({in:inFilter})})} as unknown as Awaited<ReturnType<typeof createClient>>);
 dbRpc.mockImplementation(async(name,args)=>{
  if(name==="mobile_dms_document")return {data:true};
  if(name==="mobile_dms_search_sources")return {data:args.p_recheck?true:bindings};
  if(name==="mobile_dms_source")return {data:{documentId:args.p_data.documentId,documentVersionId:5,documentRevision:"1",sourceHash:"a".repeat(64),fileId:null,fileSha256:null}};
  return {error:{code:"fixture_unexpected"}};
 });
});

it("delivers a 25-hit page with two exact source calls and one current identity read",async()=>{
 const result=await search(input,actor);
 expect(result).toMatchObject({outcome:"available",totalCount:28,hasMore:true,rows:bindings.map(({documentId,sourceHash})=>({id:documentId,title:`Permit ${documentId}`,sourceHash,matchSource:"metadata",snippet:null}))});
 expect(inFilter).toHaveBeenCalledExactlyOnceWith("id",bindings.map(b=>b.documentId));
 expect(dbRpc.mock.calls).toEqual([
  ["mobile_dms_document",{p_action:"search_parent",p_data:{parent:subject}}],
  ["mobile_dms_search_sources",{p_sources:bindings.map(({documentId})=>({documentId})),p_recheck:false}],
  ["mobile_dms_search_sources",{p_sources:bindings,p_recheck:true}],
  ["mobile_dms_document",{p_action:"search_parent",p_data:{parent:subject}}],
 ]);
 expect(getAuthContext).toHaveBeenCalledTimes(1);
 expect(askDmsDocumentsQuestion).toHaveBeenCalledTimes(1);
 expect(searchDmsDocumentsByIntent).toHaveBeenCalledExactlyOnceWith(intent,{page:1,pageSize:25},{},{type:"employee",id:22},true);
});

it("withholds every hit when an exact selected source changes before delivery",async()=>{
 dbRpc.mockImplementation(async(name,args)=>name==="mobile_dms_document"?{data:true}:
  name==="mobile_dms_search_sources"?args.p_recheck?{error:{code:"PT409"}}:{data:bindings}:
  {data:{documentId:args.p_data.documentId,documentVersionId:5,documentRevision:"1",sourceHash:"a".repeat(64),fileId:null,fileSha256:null}});
 await expect(search(input,actor)).rejects.toMatchObject({status:409,code:"source_changed"});
});

it("rejects a mismatched ordered source projection before reading summaries",async()=>{
 dbRpc.mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:[...bindings].reverse()});
 await expect(search(input,actor)).rejects.toMatchObject({status:409,code:"source_changed"});
 expect(inFilter).not.toHaveBeenCalled();
});

it("withholds the whole page when an off-page content hit changes the authorized total",async()=>{
 vi.mocked(searchDmsDocumentsByIntent).mockResolvedValueOnce({success:true,totalCount:27,data:hits} as Awaited<ReturnType<typeof searchDmsDocumentsByIntent>>);
 await expect(search(input,actor)).rejects.toMatchObject({status:409,code:"source_changed"});
});

it("rejects a changed content origin even when order, total and source binding stay the same",async()=>{
 const original=hits.map((hit,i)=>({...hit,matchSource:i===0?"both" as const:hit.matchSource}));
 result(28,original);
 vi.mocked(searchDmsDocumentsByIntent).mockResolvedValueOnce({success:true,totalCount:28,data:hits} as Awaited<ReturnType<typeof searchDmsDocumentsByIntent>>);
 await expect(search(input,actor)).rejects.toMatchObject({status:409,code:"source_changed"});
});

it("withholds content and totals when only the exact preview grant is withdrawn at delivery",async()=>{
 result(28,hits.map((hit,i)=>({...hit,matchSource:i===0?"content" as const:hit.matchSource})));
 vi.mocked(getAuthContext).mockResolvedValue({...actor,permissionCodes:[view],roleAssignments:[{...actor.roleAssignments![0],permissionCodes:[view]}]});
 await expect(search(input,actor)).rejects.toMatchObject({status:403,code:"permission_denied"});
 expect(dbRpc).toHaveBeenCalledWith("mobile_dms_search_sources",{p_sources:bindings,p_recheck:true});
});

it("revalidates a zero-result page instead of sending an old empty outcome",async()=>{
 result(0,[]);
 vi.mocked(searchDmsDocumentsByIntent).mockResolvedValueOnce({success:true,totalCount:1,data:[hits[0]]} as Awaited<ReturnType<typeof searchDmsDocumentsByIntent>>);
 await expect(search(input,actor)).rejects.toMatchObject({status:409,code:"source_changed"});
 expect(inFilter).not.toHaveBeenCalled();
});

it("preserves the canonical empty result for an intent with no recognized filters",async()=>{
 result(0,[]);
 vi.mocked(searchDmsDocumentsByIntent).mockResolvedValueOnce({success:true,data:[]});
 expect(await search(input,actor)).toMatchObject({outcome:"no_matches",rows:[],totalCount:0,hasMore:false});
 expect(inFilter).not.toHaveBeenCalled();
});
