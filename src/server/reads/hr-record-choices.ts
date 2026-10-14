import "server-only";
import {getAuthContext,hasPermission} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {HR_RECORD_CHOICE_CONFIG,hrRecordChoiceCriteria,hrRecordChoiceResult} from "@/lib/reads/hr-record-choices-schema";

/** Small reference catalogs only: complete counted batches, explicit size cap,
 * no business child rows. Preserve existing HR setting-read authority and RLS.
 * F06 retains ownership of all catalog mutations and administration screens. */
export async function readHrRecordChoices(input:unknown,signal?:AbortSignal){
 const parsed=hrRecordChoiceCriteria.safeParse(input);if(!parsed.success)return {success:false,error:"Invalid HR choice criteria"};
 try{
  const ctx=await getAuthContext();
  if(!["hr.settings.view","hr.settings.manage","hr.admin","hr.employees.view","hr.compliance.view","hr.payroll.view","hr.leave.view","hr.attendance.view","hr.recruitment.view"].some(p=>hasPermission(ctx,p)))return {success:false,error:"Permission denied"};
  const p=parsed.data,cfg=HR_RECORD_CHOICE_CONFIG[p.kind],db=await createClient();
  const columns="id,code,name_en,name_ar,description,is_active,sort_order,created_at,updated_at,deleted_at"+(cfg.extra?","+cfg.extra:"");
  const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
  const rows=await collectCompletePages((from,to)=>db.from(cfg.table).select(columns,{count:"exact"}).is("deleted_at",null).eq("is_active",true).order("sort_order").order("name_en").order("id").range(from,to).abortSignal(bounded),{signal:bounded,maxRows:2000,identity:r=>(r as unknown as {id:number}).id});
  const totalCount=rows.length;
  if(p.selectedId!==null&&!rows.some(r=>(r as unknown as {id:number}).id===p.selectedId)){
   const selected=await db.from(cfg.table).select(columns).eq("id",p.selectedId).is("deleted_at",null).abortSignal(bounded).maybeSingle();
   if(selected.error)throw Error("Selected choice unavailable");if(selected.data)rows.push(selected.data);
  }
  const data=hrRecordChoiceResult.parse({kind:p.kind,rows,totalCount,selectedId:p.selectedId});
  if(new TextEncoder().encode(JSON.stringify(data)).byteLength>2_000_000)throw Error("Choice catalog too large");
  return {success:true,data};
 }catch{return {success:false,error:"HR choices could not be completely loaded. Please retry or ask an administrator to review the catalog size."};}
}
