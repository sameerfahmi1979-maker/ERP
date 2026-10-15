import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getReadAuthContext} from "./read-context";
import {canUseApplication,hasPermission} from "@/lib/rbac/scope";
import {hrSubjectPermission} from "./hr-subject-access";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {hrLinkedDocumentCriteria,hrLinkedDocuments} from "@/lib/reads/hr-linked-documents-schema";
const id=z.number().int().positive();
const row=z.object({id,document_id:id,document:z.object({id,document_no:z.string().nullable(),title:z.string(),status:z.string(),expiry_date:z.string().nullable(),deleted_at:z.string().nullable(),document_type:z.object({name_en:z.string()}).nullable()}).nullable()}).strip();
export async function readHrLinkedDocuments(input:unknown,signal?:AbortSignal){
 const parsed=hrLinkedDocumentCriteria.safeParse(input);if(!parsed.success)return {success:false,error:"Invalid linked-document subject"};
 try{
  const p=parsed.data,ctx=await getReadAuthContext();
  if(!canUseApplication(ctx)||(!hasPermission(ctx,"dms.documents.view")&&!hasPermission(ctx,"dms.admin")))return {success:false,error:"Permission denied"};
  const db=await createClient(),bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
  const subject=await db.from("employees").select("id").eq("id",p.employeeId).is("deleted_at",null).abortSignal(bounded).maybeSingle();
  if(subject.error)throw Error("Subject read failed");
  if(!subject.data||!await hrSubjectPermission(db,p.employeeId,"hr.compliance.view"))return {success:false,error:"Permission denied"};
  if(p.dependentId!==null){const dependent=await db.from("employee_dependents").select("id").eq("id",p.dependentId).eq("employee_id",p.employeeId).is("deleted_at",null).abortSignal(bounded).maybeSingle();if(dependent.error)throw Error("Dependent read failed");if(!dependent.data)return {success:false,error:"Permission denied"};}
  const links=await collectCompletePages(async(from,to)=>{
   const r=await db.from("dms_document_links").select("id,document_id,document:dms_documents!document_id(id,document_no,title,status,expiry_date,deleted_at,document_type:dms_document_types(name_en))",{count:"exact"})
    .eq("entity_type",p.dependentId===null?"employee":"employee_dependent").eq("entity_id",p.dependentId??p.employeeId).is("deleted_at",null).order("created_at",{ascending:false}).order("id").range(from,to).abortSignal(bounded);
   return {...r,data:r.error?null:z.array(row).parse(r.data)};
  },{maxRows:2000,identity:r=>r.id,signal:bounded});
  const rows=links.flatMap(link=>!link.document||link.document.deleted_at!==null||link.document.status==="deleted"?[]:[{link_id:link.id,document_id:link.document_id,document_no:link.document.document_no??"",title:link.document.title,status:link.document.status,expiry_date:link.document.expiry_date,document_type_name:link.document.document_type?.name_en??null}]);
  return {success:true,data:hrLinkedDocuments.parse({...p,rows})};
 }catch{return {success:false,error:"Linked documents could not be completely loaded. Retry or check access."};}
}
