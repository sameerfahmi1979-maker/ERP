import "server-only";
import {getAuthContext,hasPermission} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {timeChoiceCriteria,timeChoiceResult} from "@/lib/reads/hr-time-choices-schema";

/** Complete small reference catalogs; F06 owns their writes and admin screens. */
export async function readHrTimeChoices(input:unknown,signal?:AbortSignal){
 const parsed=timeChoiceCriteria.safeParse(input);if(!parsed.success)return {success:false,error:"Invalid time choices"};
 try{
  const p=parsed.data,ctx=await getAuthContext();
  if(!ctx.isAccountActive||ctx.profile?.must_change_password)return {success:false,error:"Permission denied"};
  // Preserve the existing calendar and leave helper permissions. Shift choices
  // additionally require a current business principal; ordinary RLS still decides rows.
  const codes=p.kind==="calendars"?["common_md.view","common_md.work_calendars.view"]:p.kind==="leave-types"?["hr.leave.view","hr.leave.manage","hr.admin"]:[];
  if(codes.length&&!codes.some(code=>hasPermission(ctx,code)))return {success:false,error:"Permission denied"};
  const db=await createClient(),bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
  const cfg=p.kind==="calendars"?{table:"work_calendars",name:"calendar_name",code:"calendar_code"}:p.kind==="shifts"?{table:"work_shifts",name:"shift_name",code:"shift_code"}:{table:"hr_leave_types",name:"name_en",code:"code"};
  const columns=`id,${cfg.name},${cfg.code},is_active${p.kind==="shifts"?",calendar_id":""}`;
  const query=()=>{const q=db.from(cfg.table).select(columns,{count:"exact"}).is("deleted_at",null);if(p.kind==="shifts"&&p.calendarId!==null)q.eq("calendar_id",p.calendarId);return q;};
  const rows=await collectCompletePages((from,to)=>{const q=query().eq("is_active",true);if(p.kind==="leave-types")q.order("sort_order");return q.order(cfg.name).order("id").range(from,to).abortSignal(bounded);},{signal:bounded,maxRows:2000,identity:r=>(r as unknown as {id:number}).id});
  const totalCount=rows.length;
  for(const selectedId of new Set(p.selectedIds))if(!rows.some(r=>(r as unknown as {id:number}).id===selectedId)){
   const selected=await query().eq("id",selectedId).abortSignal(bounded).maybeSingle();if(selected.error)throw Error("Selected time choice unavailable");if(selected.data)rows.push(selected.data);
  }
  const data=timeChoiceResult.parse({...p,totalCount,rows:rows.map(value=>{const r=value as unknown as Record<string,unknown>;return {id:r.id,name:r[cfg.name],code:r[cfg.code],is_active:r.is_active,calendarId:p.kind==="shifts"?r.calendar_id:null};})});
  if(new TextEncoder().encode(JSON.stringify(data)).byteLength>1_000_000)throw Error("Time choices too large");
  return {success:true,data};
 }catch{return {success:false,error:"Time choices could not be completely loaded. Retry or ask an administrator to review the catalog."};}
}
