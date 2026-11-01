import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {prepareDocumentQuery,assertSearchPrincipal,SearchClarification} from "./document-query";
import {buildEntityRoute} from "@/lib/ai/common/assistant/route-builder";
import {verifySearchDelivery} from "./security";
import {evidenceSchema} from "@/lib/ai/foundation/contracts";
import {defaultNullRpcGetArgs} from '@/lib/supabase/default-null-rpc-get-args';

export const globalSearchSchema=z.strictObject({query:z.string().trim().min(1).max(500),domains:z.array(z.enum(["organization","branch","party","site","dms_document"])).max(5).default(["organization","branch","party","site","dms_document"]),page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25)});
export async function searchGlobal(raw:unknown,context?:AuthContext,callerSignal?:AbortSignal,admission:"global"|"domain"="global"){
  const parsed=globalSearchSchema.safeParse(raw);if(!parsed.success)return {success:false as const,error:"Invalid global search criteria"};
  const signal=AbortSignal.any([...(callerSignal?[callerSignal]:[]),AbortSignal.timeout(15000)]);
  try{signal.throwIfAborted();const ctx=context??await getAuthContext();assertSearchPrincipal(ctx);
    if(admission==="global"&&!["ai.search.use","ai.search.view","ai.common.admin"].some(p=>hasPermission(ctx,p))&&!ctx.roleCodes.includes("system_admin"))throw Error("Permission denied");
    const db=await createClient(),p=parsed.data;
    const documents=p.domains.includes("dms_document")&&(hasPermission(ctx,"dms.documents.view")||hasPermission(ctx,"dms.admin"))?await prepareDocumentQuery(db,p.query,ctx,{signal}):null;
    const domains=documents?p.domains:p.domains.filter(d=>d!=="dms_document");
    const args={search_text:p.query,domains,document_text:documents?.args.text_query??"",subject_type:documents?.args.subject_type??null,subject_id:documents?.args.subject_id??null,document_type_ids:documents?.args.document_type_ids??[],expiry_state:documents?.args.expiry_state??null};
    let q=db.rpc("ai_mod02_search_global",defaultNullRpcGetArgs(args),{get:true,count:"exact"})
      .order("entity_type").order("entity_id").range((p.page-1)*p.pageSize,p.page*p.pageSize-1);if(signal)q=q.abortSignal(signal);
    let r=await q;signal.throwIfAborted();
    const offset=(p.page-1)*p.pageSize;
    if(offset>0&&r.status===416&&r.error?.code==="PGRST103"){
      const head=await db.rpc("ai_mod02_search_global",defaultNullRpcGetArgs(args),{get:true,head:true,count:"exact"}).select("entity_id").range(0,0).abortSignal(signal);
      if(head.error||head.count===null||!Number.isSafeInteger(head.count)||head.count<0||head.count>offset)throw Error("Unverified global range");
      r={...head,data:[],error:null};
    }
    if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0)throw Error("Global source unavailable");
    const rows=z.array(z.object({entity_type:z.enum(["organization","branch","party","site","dms_document"]),entity_id:z.number().int().positive().safe(),title:z.string(),business_code:z.string().nullable(),source_version:z.string()}).strip()).parse(r.data);
    if(rows.length!==Math.min(p.pageSize,Math.max(0,r.count-(p.page-1)*p.pageSize))||new Set(rows.map(v=>v.entity_type+v.entity_id)).size!==rows.length)throw Error("Incomplete global result");
    await verifySearchDelivery(ctx);
    return {success:true as const,data:{contractVersion:"erp-search/2.1",outcome:r.count?"available":"no_matches",criteria:p,countScope:"exact_authorized",totalCount:r.count,hasMore:p.page*p.pageSize<r.count,
      rows:rows.map(row=>({...row,route:buildEntityRoute(row.entity_type,row.entity_id),provenance:evidenceSchema.parse({reference:{entityType:row.entity_type==="organization"?"company":row.entity_type,entityId:row.entity_id},sourceTable:({organization:"owner_companies",branch:"branches",party:"parties",site:"work_sites",dms_document:"dms_documents"})[row.entity_type],field:null,sourceVersion:row.source_version,businessReference:row.business_code??row.title,accessPurpose:"metadata",fileId:null,page:null,snippet:null,observedAt:new Date().toISOString()})})),asOf:new Date().toISOString()}};
  }catch(e){signal.throwIfAborted();return {success:false as const,code:e instanceof SearchClarification?"clarification_required" as const:"unavailable" as const,error:e instanceof SearchClarification?e.message:e instanceof Error&&e.message==="Permission denied"?e.message:"Global search could not be verified. Please retry."};}
}
