import "server-only";
import {z} from "zod";
import {AI_CONTRACT_VERSION,validateRegisteredSearch} from "@/lib/ai/foundation/contracts";
import {AI_CAPABILITY_REGISTER} from "@/lib/ai/foundation/capabilities";
import {getAuthContext} from "@/lib/rbac/check";
import {hrReadIdentity} from "@/lib/reads/hr-read-identity";
import {searchDocuments} from "./documents";
import {searchGlobal} from "./global";
import {readHrSearch} from "@/server/reads/hr-search";
import {searchDigest} from "./cursor";
import {semanticSearchDmsDocuments} from "@/server/actions/dms/semantic-search";
import {verifySearchDelivery} from "./security";
import {sharedSearchSchema} from "@/lib/ai/search/vocabulary";
import {assertSearchPrincipal} from "./document-query";
const masterDomains:Record<string,"organization"|"party"|"branch"|"site">={"company.metadata":"organization","party.metadata":"party","branch.metadata":"branch","site.metadata":"site"};
const active=new Set(["dms.metadata","global.search","hr.search",...Object.keys(masterDomains)]);
const one=(values:unknown[])=>{if(values.length!==1)throw Error("Invalid filter cardinality");return values[0];};

/** One public foundation contract and explicit owning adapters. No SQL/table/tool from clients. */
export async function searchErp(raw:unknown,signal?:AbortSignal){
 try{
  const p=validateRegisteredSearch(raw,AI_CAPABILITY_REGISTER);
  if(!active.has(p.capabilityId))return {success:false as const,error:"Invalid or unsupported search capability"};
  const seen=new Set<string>(),fields=new Set<string>();for(const filter of p.filters){const key=filter.field+":"+filter.operator;if(seen.has(key)||fields.has(filter.field)&&!["expiry_date","issue_date"].includes(filter.field))throw Error("Invalid duplicate filter");seen.add(key);fields.add(filter.field);if(filter.operator!=="in")one(filter.values);}
  const ctx=await getAuthContext();assertSearchPrincipal(ctx);
  if(p.capabilityId==="dms.metadata"){
   const filters:Record<string,unknown>={metadata:p.metadataFilters};let subjectType:unknown=p.context?.entityType,subjectId:unknown=p.context?.entityId;
   if(subjectType==="dependent")subjectType="employee_dependent";
   for(const f of p.filters){
    if(f.field==="document_type_id"&&(f.operator==="eq"||f.operator==="in"))filters.documentTypeIds=f.values;
    else if(f.field==="owning_company_id"&&(f.operator==="eq"||f.operator==="in"))filters[f.operator==="in"?"companyIds":"companyId"]=f.operator==="in"?f.values:one(f.values);
    else if(f.field==="owning_branch_id"&&(f.operator==="eq"||f.operator==="in"))filters[f.operator==="in"?"branchIds":"branchId"]=f.operator==="in"?f.values:one(f.values);
    else if(f.field==="expiry_date"&&(f.operator==="gte"||f.operator==="lte"))filters[f.operator==="gte"?"expiryFrom":"expiryTo"]=one(f.values);
    else if(f.field==="issue_date"&&(f.operator==="gte"||f.operator==="lte"))filters[f.operator==="gte"?"issueFrom":"issueTo"]=one(f.values);
    else if(["status","lifecycle"].includes(f.field)&&f.operator==="eq")filters[f.field]=one(f.values);
    else if(f.field==="subject_type"&&f.operator==="eq"){if(subjectType!==undefined)throw Error("Invalid competing subject");subjectType=one(f.values);}
    else if(f.field==="subject_id"&&f.operator==="eq"){if(subjectId!==undefined)throw Error("Invalid competing subject");subjectId=one(f.values);}
    else throw Error("Invalid document filter operation");
   }
   const criteria=sharedSearchSchema.parse({query:p.query,mode:p.mode,pageSize:p.pageSize,cursor:p.cursor,filters,subject:subjectType===undefined&&subjectId===undefined?undefined:{type:subjectType,id:subjectId}});
   if(p.mode==="semantic"){
    if(p.cursor)throw Error("Invalid cursor for bounded semantic preview");
    const candidates=await semanticSearchDmsDocuments(p.query);if(!candidates.success||!candidates.data)return {success:false as const,error:"Semantic search is unavailable or disabled."};
    const checked=await searchDocuments({...criteria,filters:{...filters,candidateIds:candidates.data.map(r=>r.documentId)}},ctx,signal);
    if(!checked.success||checked.data.outcome==="clarification_required")return checked;
    return {success:true as const,data:{...checked.data,contractVersion:AI_CONTRACT_VERSION,outcome:checked.data.rows.length?"available" as const:"partial" as const,countScope:"bounded_preview",nextCursor:null,hasMore:null,complete:false}};
   }
   const result=await searchDocuments(criteria,ctx,signal);
   return result.success?{...result,data:{...result.data,contractVersion:AI_CONTRACT_VERSION}}:result;
  }
  if(p.context||p.metadataFilters?.length)throw Error("Invalid context or metadata for this capability");
  const digest=searchDigest([hrReadIdentity(ctx),{...p,cursor:null},new Date(Date.now()+4*3600000).toISOString().slice(0,10)]);
  let page=1;if(p.cursor){const c=z.strictObject({page:z.number().int().min(1).max(100000),digest:z.string()}).parse(JSON.parse(Buffer.from(p.cursor,"base64url").toString("utf8")));if(c.digest!==digest)throw Error("Invalid search cursor");page=c.page;}
  if(p.mode!=="keyword"&&p.mode!=="ai")throw Error("Invalid mode for this capability");
  if(p.capabilityId==="hr.search"){
   const criteria:Record<string,unknown>={mode:"results",query:p.query,page,pageSize:p.pageSize};
   const names:Record<string,string>={owner_company_id:"ownerCompanyId",branch_id:"branchId",department_id:"departmentId",designation_id:"designationId",status:"status",date_from:"dateFrom",date_to:"dateTo"};
   for(const f of p.filters){if(f.field==="category"&&(f.operator==="eq"||f.operator==="in"))criteria.categories=f.values;else if(Object.hasOwn(names,f.field)&&f.operator==="eq")criteria[names[f.field]]=one(f.values);else throw Error("Invalid HR filter operation");}
   const result=await readHrSearch(criteria,ctx,signal);if(!result.success)return result;
   await verifySearchDelivery(ctx);
   const hasMore="hasMore"in result.data&&result.data.hasMore;
   return {success:true as const,data:{...result.data,contractVersion:AI_CONTRACT_VERSION,consistency:"fresh_authorized_pages",nextCursor:hasMore?Buffer.from(JSON.stringify({page:page+1,digest})).toString("base64url"):null}};
  }
  let domains:unknown=Object.hasOwn(masterDomains,p.capabilityId)?[masterDomains[p.capabilityId]]:undefined;
  for(const f of p.filters){if(p.capabilityId==="global.search"&&f.field==="domain"&&(f.operator==="eq"||f.operator==="in"))domains=f.values;else throw Error("Invalid global/master filter operation");}
  const result=await searchGlobal({query:p.query,domains,page,pageSize:p.pageSize},ctx,signal,p.capabilityId==="global.search"?"global":"domain");
  if(!result.success)return "code"in result&&result.code==="clarification_required"?{success:true as const,data:{contractVersion:AI_CONTRACT_VERSION,outcome:"clarification_required" as const,message:result.error,rows:[],totalCount:null,countScope:"unknown" as const,nextCursor:null}}:result;
  return {success:true as const,data:{...result.data,contractVersion:AI_CONTRACT_VERSION,consistency:"fresh_authorized_pages",nextCursor:result.data.hasMore?Buffer.from(JSON.stringify({page:page+1,digest})).toString("base64url"):null}};
 }catch(error){signal?.throwIfAborted();return {success:false as const,error:error instanceof Error&&(error.message.startsWith("Invalid")||error.message==="Permission denied")?error.message:"Invalid or unavailable shared search request"};}
}
