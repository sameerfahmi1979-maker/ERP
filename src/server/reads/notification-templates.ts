import "server-only";
import {z} from "zod";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains,literalLike} from "@/lib/reads/search";
import {notificationTemplatesCriteriaSchema,notificationTemplatesPageSchema,notificationTemplateDetailCriteriaSchema,notificationTemplateDetailSchema} from "@/lib/reads/notification-templates-schema";
const fields=["id","template_code","template_name","source_module","notification_type","default_severity","default_channel_in_app","default_channel_email","is_active"];
const detailFields=[...fields,"subject_template","html_template","text_template","is_system","created_at","updated_at"];
const sorts={templateCode:"template_code",templateName:"template_name",sourceModule:"source_module",notificationType:"notification_type",defaultSeverity:"default_severity",isActive:"is_active"};
const allowed=(ctx:AuthContext)=>["notifications.templates.view","notifications.admin"].some(c=>hasPermission(ctx,c));
function camel(rows:unknown,columns:string[]){return z.array(z.record(z.string(),z.unknown())).parse(rows).map(row=>Object.fromEntries(columns.map(f=>[f.replace(/_([a-z])/g,(_,l:string)=>l.toUpperCase()),row[f]])));}
export async function readNotificationTemplates(input:unknown,context?:AuthContext,signal?:AbortSignal){
 const parsed=notificationTemplatesCriteriaSchema.safeParse(input);if(!parsed.success)return {success:false as const,error:"Invalid notification template criteria"};
 try{
  signal?.throwIfAborted();const ctx=context??await getAuthContext();signal?.throwIfAborted();if(!allowed(ctx))return {success:false as const,error:"Permission denied"};
  const db=await createClient(),p=parsed.data;signal?.throwIfAborted();
  const base=(head=false)=>{
   const q=db.from("erp_notification_templates").select(fields.join(","),{count:"exact",head}).is("deleted_at",null);if(signal)q.abortSignal(signal);
   if(p.isActive)q.eq("is_active",p.isActive==="true");if(p.sourceModule)q.ilike("source_module",literalLike(p.sourceModule));if(p.defaultSeverity)q.eq("default_severity",p.defaultSeverity);
   if(p.search)q.or(["template_code","template_name","source_module","notification_type","default_severity"].map(f=>`${f}.ilike.${literalContains(p.search)}`).join(","));
   return q;
  };
  const offset=(p.page-1)*p.pageSize,q=base();for(const s of p.sorting)q.order(sorts[s.id],{ascending:!s.desc,nullsFirst:false});q.order("id",{ascending:true});
  const result=await q.range(offset,offset+p.pageSize-1);signal?.throwIfAborted();let rows=result.data,count=result.count,error=result.error;
  if(offset>0&&result.status===416&&error?.code==="PGRST103"){const re=await base(true);signal?.throwIfAborted();if(re.error||re.count===null||!Number.isSafeInteger(re.count)||re.count<0||re.count>offset)throw Error("Unverified count");rows=[];count=re.count;error=null;}
  if(error)throw Error("Templates unavailable");
  return {success:true as const,updatedAt:Date.now(),data:notificationTemplatesPageSchema.parse({rows:camel(rows,fields),page:p.page,pageSize:p.pageSize,totalCount:count})};
 }catch{signal?.throwIfAborted();return {success:false as const,error:"Notification templates could not be loaded. Please retry."};}
}
export async function readNotificationTemplateDetail(input:unknown,context?:AuthContext,signal?:AbortSignal){
 const p=notificationTemplateDetailCriteriaSchema.safeParse(input);if(!p.success)return {success:false as const,error:"Invalid notification template selection"};
 try{
  signal?.throwIfAborted();const ctx=context??await getAuthContext();signal?.throwIfAborted();
  if(!allowed(ctx)||!["notifications.templates.manage","notifications.admin"].some(c=>hasPermission(ctx,c)))return {success:false as const,error:"Permission denied"};
  const db=await createClient();signal?.throwIfAborted();const q=db.from("erp_notification_templates").select(detailFields.join(","),{count:"exact"}).eq("id",p.data.id).is("deleted_at",null).range(0,0);if(signal)q.abortSignal(signal);
  const r=await q;signal?.throwIfAborted();if(r.error||r.count!==1||!Array.isArray(r.data)||r.data.length!==1)throw Error("Detail unavailable");
  const data=notificationTemplateDetailSchema.parse(camel(r.data,detailFields)[0]);if(data.id!==p.data.id)throw Error("Wrong template");
  return {success:true as const,data,updatedAt:Date.now()};
 }catch{signal?.throwIfAborted();return {success:false as const,error:"Notification template details could not be loaded. Please retry."};}
}
