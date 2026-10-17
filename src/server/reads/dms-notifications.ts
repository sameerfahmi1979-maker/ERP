import "server-only";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains,literalLike} from "@/lib/reads/search";
import {dmsNotificationsCriteriaSchema,dmsNotificationPageSchema} from "@/lib/reads/dms-notifications-schema";
const columns="id,document_id,recipient_user_id,subject,message,channel,status,scheduled_for,read_at,bridge_status,global_notification_id,global_email_queue_id,visible_document_id,document_no";
export async function readDmsNotifications(input:unknown,context?:AuthContext,signal?:AbortSignal){
 const parsed=dmsNotificationsCriteriaSchema.safeParse(input);if(!parsed.success)return {success:false as const,error:"Invalid document notification criteria"};
 try{
  signal?.throwIfAborted();const ctx=context??await getAuthContext();signal?.throwIfAborted();const p=parsed.data;
  if(!ctx.profile||!["dms.notifications.view","dms.notifications.manage","dms.admin"].some(c=>hasPermission(ctx,c)))return {success:false as const,error:"Permission denied"};
  if(p.audience==="all"&&!["dms.notifications.manage","dms.admin"].some(c=>hasPermission(ctx,c)))return {success:false as const,error:"Permission denied"};
  const db=await createClient();signal?.throwIfAborted();
  const base=(head=false)=>{const q=db.from("perf_dms_notification_read").select(columns,{count:"exact",head});if(signal)q.abortSignal(signal);
   if(p.audience==="my")q.eq("recipient_user_id",ctx.profile!.id);if(p.unreadOnly)q.is("read_at",null).neq("status","dismissed");
   if(p.status)q.ilike("status",literalLike(p.status));if(p.channel)q.eq("channel",p.channel);if(p.bridgeStatus)q.ilike("bridge_status",literalLike(p.bridgeStatus));
   if(p.search)q.or(["subject","message","document_no","channel","status","bridge_status"].map(f=>`${f}.ilike.${literalContains(p.search)}`).join(","));
   return q;};
  const offset=(p.page-1)*p.pageSize,q=base();for(const s of p.sorting)q.order(s.id,{ascending:!s.desc,nullsFirst:false});q.order("id",{ascending:true});
  const result=await q.range(offset,offset+p.pageSize-1);signal?.throwIfAborted();let rows=result.data,count=result.count,error=result.error;
  if(offset>0&&result.status===416&&error?.code==="PGRST103"){const r=await base(true);signal?.throwIfAborted();if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||r.count>offset)throw Error("Unverified count");rows=[];count=r.count;error=null;}
  if(error)throw Error("Notification read unavailable");
  const data=dmsNotificationPageSchema.parse({rows,page:p.page,pageSize:p.pageSize,totalCount:count});
  if(p.audience==="my"&&data.rows.some(r=>r.recipient_user_id!==ctx.profile!.id)||data.rows.some(r=>r.visible_document_id!==null&&r.visible_document_id!==r.document_id))throw Error("Notification authority mismatch");
  return {success:true as const,data};
 }catch{signal?.throwIfAborted();return {success:false as const,error:"Document notifications could not be loaded. Please retry."};}
}
