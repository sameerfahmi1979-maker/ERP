import "server-only";
import {z} from "zod";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains,literalLike} from "@/lib/reads/search";
import {notificationDeliveryCriteriaSchema,notificationDeliveryPageSchema} from "@/lib/reads/notification-delivery-schema";
const fields=["id","notification_id","email_queue_id","delivery_channel","status","message","duration_ms","attempt_number","error_message","created_at"];
const sorts={id:"id",notificationId:"notification_id",emailQueueId:"email_queue_id",deliveryChannel:"delivery_channel",status:"status",message:"message",durationMs:"duration_ms",attemptNumber:"attempt_number",errorMessage:"error_message",createdAt:"created_at"};
export async function readNotificationDeliveries(input:unknown,context?:AuthContext,signal?:AbortSignal){
 const parsed=notificationDeliveryCriteriaSchema.safeParse(input);
 if(!parsed.success)return {success:false as const,error:"Invalid notification delivery criteria"};
 try{
  signal?.throwIfAborted();const ctx=context??await getAuthContext();signal?.throwIfAborted();
  if(!["notifications.logs.view","notifications.admin"].some(code=>hasPermission(ctx,code)))return {success:false as const,error:"Permission denied"};
  const p=parsed.data,db=await createClient();signal?.throwIfAborted();
  const base=(head=false)=>{
   const q=db.from("perf_notification_delivery_read").select(fields.join(","),{count:"exact",head});if(signal)q.abortSignal(signal);
   if(p.status)q.ilike("status",literalLike(p.status));if(p.deliveryChannel)q.eq("delivery_channel",p.deliveryChannel);
   if(p.search)q.or(["id_search","notification_search","queue_search","attempt_search","duration_search","delivery_channel","status","message","error_message"].map(c=>`${c}.ilike.${literalContains(p.search)}`).join(","));
   return q;
  };
  const offset=(p.page-1)*p.pageSize,q=base();
  for(const s of p.sorting)q.order(sorts[s.id],{ascending:!s.desc,nullsFirst:false});
  if(!p.sorting.some(s=>s.id==="id"))q.order("id",{ascending:true});
  const result=await q.range(offset,offset+p.pageSize-1);signal?.throwIfAborted();
  let rows=result.data,count=result.count,error=result.error;
  if(offset>0&&result.status===416&&error?.code==="PGRST103"){
   const re=await base(true);signal?.throwIfAborted();if(re.error||re.count===null||!Number.isSafeInteger(re.count)||re.count<0||re.count>offset)throw Error("Unverified count");
   rows=[];count=re.count;error=null;
  }
  if(error||!Array.isArray(rows))throw Error("Unverified deliveries");
  const records=z.array(z.record(z.string(),z.unknown())).parse(rows);
  const data=notificationDeliveryPageSchema.parse({page:p.page,pageSize:p.pageSize,totalCount:count,rows:records.map(row=>Object.fromEntries(fields.map(f=>[f.replace(/_([a-z])/g,(_,l:string)=>l.toUpperCase()),row[f]])))});
  return {success:true as const,data,updatedAt:Date.now()};
 }catch{signal?.throwIfAborted();return {success:false as const,error:"Notification deliveries could not be loaded. Please retry."};}
}
