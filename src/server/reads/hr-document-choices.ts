import "server-only";
import {z} from "zod";
import {getReadAuthContext} from "./read-context";
import {hasPermission,isGlobalAdmin} from "@/lib/rbac/scope";
import {createClient} from "@/lib/supabase/server";
import {hrSubjectPermission} from "./hr-subject-access";
import {isHrAiFeatureEnabled} from "@/lib/hr/ai/feature-flags";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {literalContains} from "@/lib/reads/search";
import {hrDocumentCriteria,hrDocumentPage} from "@/lib/reads/hr-document-choices-schema";
const id=z.number().int().positive().safe();
const nativeRow=z.object({id,title:z.string(),document_no:z.string().nullable(),status:z.string(),issue_date:z.string().nullable(),expiry_date:z.string().nullable(),
 document_type:z.object({name_en:z.string(),type_code:z.string()}).nullable()}).strip();
const flags=z.array(z.object({document_id:id,has_extraction:z.boolean(),has_ocr:z.boolean()}));
/** Ordinary cookie-bound RLS throughout. No extracted identities, file paths,
 * secrets, provider calls or service-role reads in the choice projection. */
export async function readHrDocumentChoices(input:unknown,signal?:AbortSignal){
 const parsed=hrDocumentCriteria.safeParse(input);if(!parsed.success)return {success:false,error:"Invalid HR document criteria"};
 try{
  const p=parsed.data,ctx=await getReadAuthContext();
  if(!hasPermission(ctx,"dms.documents.view")&&!hasPermission(ctx,"dms.admin"))return {success:false,error:"Permission denied"};
  const db=await createClient(),bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
  const subject=await db.from("employees").select("id").eq("id",p.employeeId).is("deleted_at",null).abortSignal(bounded).maybeSingle();
  if(subject.error)throw Error("Subject unavailable");
  if(!subject.data||!await hrSubjectPermission(db,p.employeeId,"hr.compliance.manage"))return {success:false,error:"Permission denied"};
  if(p.dependentId!==null){
   const dependent=await db.from("employee_dependents").select("id").eq("id",p.dependentId).eq("employee_id",p.employeeId).is("deleted_at",null).abortSignal(bounded).maybeSingle();
   if(dependent.error)throw Error("Dependent unavailable");if(!dependent.data)return {success:false,error:"Permission denied"};
  }
  if(p.mode==="wizard"&&!isGlobalAdmin(ctx)&&!await isHrAiFeatureEnabled("ERP_AI_HR_DOCUMENT_TO_RECORD"))return {success:false,error:"Permission denied"};
  // RPC-backed document projections cannot reliably apply PostgREST embedded
  // anti-joins. Read the exact subject's link IDs under ordinary RLS first;
  // never silently truncate the exclusion list.
  const excluded:number[]=[];
  if(p.target==="employee"||p.dependentId!==null){
   const links=await collectCompletePages(async(from,to)=>{
    const result=await db.rpc("read_dms_entity_document_links",
     {target_entity_type:p.target==="employee"?"employee":"employee_dependent",target_entity_id:p.target==="employee"?p.employeeId:p.dependentId!},
     {get:true,count:"exact"}).select("id,document_id")
     .is("deleted_at",null).order("id").range(from,to).abortSignal(bounded);
    return {...result,data:result.error?null:z.array(z.object({id,document_id:id})).parse(result.data)};
   },{maxRows:2000,identity:r=>r.id,signal:bounded});
   excluded.push(...links.map(r=>r.document_id));
  }
  const query=(head=false)=>{
   const q=db.from("dms_documents").select("id,title,document_no,status,issue_date,expiry_date,created_at,document_type:dms_document_types(name_en,type_code)",{count:"exact",head})
    .is("deleted_at",null).neq("status","deleted").order("created_at",{ascending:false}).order("id").abortSignal(bounded);
   if(p.mode==="library"){if(excluded.length)q.not("id","in",`(${[...new Set(excluded)].join(",")})`);}else q.neq("status","archived");
   if(p.search)q.or(`title.ilike.${literalContains(p.search)},document_no.ilike.${literalContains(p.search)}`);
   return q;
  };
  const from=(p.page-1)*50,r=await query().range(from,from+49);let rows:unknown=r.data,count=r.count,error=r.error;
  if(from>0&&r.status===416&&r.error?.code==="PGRST103"){
   const n=await query(true);if(n.error||n.count===null||n.count>from)throw Error("Unverified range");rows=[];count=n.count;error=null;
  }
  if(error)throw Error("Document choices unavailable");
  const documents=z.array(nativeRow).parse(rows), documentIds=new Set(documents.map(d=>d.id));
  if (count===null || !Number.isSafeInteger(count) || count<0 || documentIds.size!==documents.length ||
      documents.length!==Math.min(50,Math.max(0,count-from))) throw Error("Incomplete document choices");
  const byDocument=new Map<number,z.infer<typeof flags>[number]>();
  if (documentIds.size) {
   const r=await db.rpc("hr_document_choice_page_flags",{document_ids:[...documentIds]},{get:true})
    .order("document_id").range(0,documentIds.size-1).abortSignal(bounded);
   if (r.error) throw Error("Document choice flags unavailable");
   for (const item of flags.parse(r.data)) {
    if (!documentIds.has(item.document_id) || byDocument.has(item.document_id)) throw Error("Unverified document choice flags");
    byDocument.set(item.document_id,item);
   }
   if (byDocument.size!==documentIds.size) throw Error("Incomplete document choice flags");
  }
  const values=documents.map(d=>({id:d.id,title:d.title,document_no:d.document_no,status:d.status,issue_date:d.issue_date,expiry_date:d.expiry_date,
   document_type_name:d.document_type?.name_en??null,document_type_code:d.document_type?.type_code??null,
   has_extraction:byDocument.get(d.id)!.has_extraction,has_ocr:byDocument.get(d.id)!.has_ocr,
   extracted_person_name:null,is_linked_to_employee:excluded.includes(d.id)}));
  return {success:true,data:hrDocumentPage.parse({employeeId:p.employeeId,dependentId:p.dependentId,target:p.target,mode:p.mode,page:p.page,pageSize:50,totalCount:count,rows:values})};
 }catch{return {success:false,error:"Document choices could not be loaded. Retry or check access."};}
}
