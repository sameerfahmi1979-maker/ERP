import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {sharedSearchSchema,matchesSearchText,type SharedSearchRequest} from "@/lib/ai/search/vocabulary";
import {prepareDocumentQuery,SearchClarification,type SharedDocumentQuery} from "./document-query";
import {hrReadIdentity} from "@/lib/reads/hr-read-identity";
import {searchDigest,decodeSearchCursor,encodeSearchCursor} from "./cursor";
import {evidenceSchema} from "@/lib/ai/foundation/contracts";
import {defaultNullRpcGetArgs} from '@/lib/supabase/default-null-rpc-get-args';

const id=z.number().int().positive().safe(), nullable=z.string().nullable();
export const searchDocumentRow=z.object({id,document_no:z.string(),title:z.string(),status:nullable,document_type_id:id.nullable(),
  owning_company_id:id.nullable().optional(),owning_branch_id:id.nullable().optional(),
  issue_date:nullable,expiry_date:nullable,updated_at:z.string(),current_version_id:id.nullable(),
  document_type:z.object({name_en:nullable,type_code:nullable}).nullable(),}).strip();
export type SearchDocumentRow=z.infer<typeof searchDocumentRow>;
export const SEARCH_DOCUMENT_PROJECTION="id,document_no,title,status,document_type_id,owning_company_id,owning_branch_id,issue_date,expiry_date,updated_at,current_version_id,document_type:dms_document_types(name_en,type_code)";
export function constrainDocumentQuery(q:SharedDocumentQuery,p:SharedSearchRequest):SharedDocumentQuery {
  const f=p.filters;
  if(f.companyId)q=q.eq("owning_company_id",f.companyId);if(f.branchId)q=q.eq("owning_branch_id",f.branchId);
  if(f.companyIds)q=f.companyIds.length?q.in("owning_company_id",f.companyIds):q.eq("id",-1);
  if(f.branchIds)q=f.branchIds.length?q.in("owning_branch_id",f.branchIds):q.eq("id",-1);
  if(f.documentTypeIds?.length)q=q.in("document_type_id",f.documentTypeIds);
  if(f.candidateIds!==undefined)q=f.candidateIds.length?q.in("id",f.candidateIds):q.eq("id",-1);
  if(f.status)q=q.eq("status",f.status);
  if(f.categoryId)q=q.eq("category_id",f.categoryId);if(f.confidentiality)q=q.eq("confidentiality_level",f.confidentiality);if(f.riskLevel)q=q.eq("ai_risk_level",f.riskLevel);
  if(f.lifecycle==="current")q=q.eq("is_archived",false).not("status","in",'("archived","superseded","deleted")');
  if(f.lifecycle==="archived")q=q.eq("is_archived",true);
  if(f.issueFrom)q=q.gte("issue_date",f.issueFrom);if(f.issueTo)q=q.lte("issue_date",f.issueTo);
  if(f.expiryFrom)q=q.gte("expiry_date",f.expiryFrom);if(f.expiryTo)q=q.lte("expiry_date",f.expiryTo);
  const today=new Date(Date.now()+4*3600000).toISOString().slice(0,10);
  if(f.expiryState==="expired")q=q.lt("expiry_date",today);
  if(f.expiryState==="expiring_soon")q=q.gte("expiry_date",today).lte("expiry_date",new Date(Date.parse(today)+30*86400000).toISOString().slice(0,10));
  if(f.expiryState==="valid")q=q.gte("expiry_date",today).not("expiry_date","is",null);
  if(f.expiryState==="missing_expiry")q=q.is("expiry_date",null);
  return q;
}
/** Public application service; ordinary user client only, exact native count/page. */
export async function searchDocuments(raw:unknown,context?:AuthContext,callerSignal?:AbortSignal){
  const parsed=sharedSearchSchema.safeParse(raw);if(!parsed.success)return {success:false as const,error:"Invalid shared search criteria"};
  const signal=AbortSignal.any([...(callerSignal?[callerSignal]:[]),AbortSignal.timeout(15000)]);
  try{
    signal.throwIfAborted();const ctx=context??await getAuthContext(),db=await createClient(),p=parsed.data;
    const prepared=await prepareDocumentQuery(db,p.query,ctx,{subject:p.subject,content:p.mode==="content",semantic:p.mode==="semantic",signal,linkedType:p.filters.linkedType,metadataFilters:p.filters.metadata});
    const query=constrainDocumentQuery(prepared.query.select(SEARCH_DOCUMENT_PROJECTION),p);
    if(p.mode==="exact"&&p.query)query.eq("document_no",p.query);
    const digest=searchDigest([hrReadIdentity(ctx),{...p,cursor:null,page:1,offset:0},prepared.args,new Date(Date.now()+4*3600000).toISOString().slice(0,10)]);
    const cursor=p.cursor?decodeSearchCursor(p.cursor,digest):null;
    if(cursor){
      const source=db.rpc("ai_mod02_search_documents",defaultNullRpcGetArgs(prepared.args),{get:true,count:"exact"}) as unknown as SharedDocumentQuery;
      const anchor=await constrainDocumentQuery(source.select("id"),p).eq("id",cursor.anchor.id).eq("updated_at",cursor.anchor.version).range(0,0).abortSignal(signal);
      if(anchor.error||anchor.count!==1)throw Error("Invalid or stale search cursor; restart the search.");
    }
    const offset=cursor?.offset??p.offset??(p.page-1)*p.pageSize;
    let result=await query.order("created_at",{ascending:false,nullsFirst:p.nullsFirst}).order("id",{ascending:false}).range(offset,offset+p.pageSize-1).abortSignal(signal);
    if(offset>0&&result.status===416&&result.error?.code==="PGRST103"){
      const headQuery=constrainDocumentQuery(db.rpc("ai_mod02_search_documents",defaultNullRpcGetArgs(prepared.args),{get:true,head:true,count:"exact"}) as unknown as SharedDocumentQuery,p).select("id");
      if(p.mode==="exact"&&p.query)headQuery.eq("document_no",p.query);
      const head=await headQuery.range(0,0).abortSignal(signal);
      if(head.error||head.count===null||head.count<0||head.count>offset)throw Error("Unverified search range");
      result={...head,data:[],error:null};
    }
    signal.throwIfAborted();if(result.error||result.count===null||!Number.isSafeInteger(result.count)||result.count<0)throw Error("Search read unavailable");
    if(cursor&&cursor.count!==result.count)throw Error("Invalid or stale search cursor; restart the search.");
    const rows=z.array(searchDocumentRow).parse(result.data);
    if(rows.length!==Math.min(p.pageSize,Math.max(0,result.count-offset))||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error("Incomplete search page");
    const excerpts=new Map<number,{excerpt:string;content_version:string|null}>();
    if(p.includeExcerpts&&rows.length&&prepared.args.text_query){
      const read=await db.rpc("ai_mod02_search_excerpts",{document_ids:rows.map(r=>r.id),search_text:prepared.args.text_query}).abortSignal(signal);
      if(read.error)throw Error("Search evidence unavailable");
      const values=z.array(z.object({document_id:id,excerpt:z.string().max(120),document_version:z.string(),content_version:nullable})).max(100).parse(read.data);
      for(const value of values){if(excerpts.has(value.document_id)||!rows.some(r=>r.id===value.document_id&&r.updated_at===value.document_version))throw Error("Search evidence changed");excerpts.set(value.document_id,value);}
    }
    const current=await db.rpc("f03_current_session_valid").abortSignal(signal);if(current.error||current.data!==true)throw Error("Search access changed");
    if(hrReadIdentity(await getAuthContext())!==hrReadIdentity(ctx))throw Error("Search authority changed before delivery");
    return {success:true as const,data:{contractVersion:"erp-search/2.1" as const,outcome:result.count?"available" as const:"no_matches" as const,
      criteria:p,asOf:prepared.asOf,countScope:"exact_authorized" as const,totalCount:result.count,hasMore:offset+rows.length<result.count,
      consistency:"fresh_authorized_pages" as const,
      nextCursor:offset+rows.length<result.count&&rows.length?encodeSearchCursor({v:1,offset:offset+rows.length,count:result.count,digest,anchor:{id:rows.at(-1)!.id,version:rows.at(-1)!.updated_at}}):null,
      subject:prepared.subject??null,rows:rows.map(row=>({...row,route:`/dms/documents/record/${row.id}`,contentExcerpt:excerpts.get(row.id)?.excerpt??null,
        matchSource:excerpts.has(row.id)?matchesSearchText(`${row.title} ${row.document_no}`,prepared.args.text_query)?"both" as const:"content" as const:"metadata" as const,
        provenance:evidenceSchema.parse({reference:{entityType:"dms_document",entityId:row.id},sourceTable:"dms_documents",field:null,sourceVersion:row.updated_at,businessReference:row.document_no,accessPurpose:excerpts.has(row.id)?"content":"metadata",fileId:null,page:null,snippet:excerpts.get(row.id)?.excerpt??null,observedAt:prepared.asOf}),
        evidence:{table:"dms_documents" as const,recordId:row.id,businessCode:row.document_no,sourceVersion:row.updated_at,fileVersionId:row.current_version_id,contentVersion:excerpts.get(row.id)?.content_version??null,observedAt:prepared.asOf}}))}};
  }catch(error){signal.throwIfAborted();if(error instanceof SearchClarification)return {success:true as const,data:{contractVersion:"erp-search/2.1" as const,outcome:"clarification_required" as const,message:error.message,rows:[],totalCount:null,countScope:"unknown" as const}};
    return {success:false as const,error:error instanceof Error&&(error.message==="Permission denied"||error.message.startsWith("Invalid or stale search cursor"))?error.message:"Search could not be completely verified. Please retry."};}
}
