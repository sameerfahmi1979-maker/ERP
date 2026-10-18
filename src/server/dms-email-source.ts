import 'server-only';
import {z} from 'zod';
import {getAuthContext,getAuthContextForProfileId} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {canUseDmsEmailBridge,requireDmsNoticeAccess,DMS_NOTICE,dmsEmailBridgeState,dmsEmailQueueOutcome,confirmedDeliveryMailbox,type DmsEmailBridgeState} from '@/lib/email/queue/dms-policy';
import {withDeadline} from '@/lib/email/queue/delivery-contract';
import {F09_LIMITS,queryWithin,type AbortableQuery} from '@/lib/email/queue/runtime-limits';
import {queueEmail} from '@/server/actions/notifications/email-queue';
import {createNotification} from '@/server/actions/notifications/notifications';
import {renderNotificationTemplate} from '@/server/actions/notifications/templates';
import {notificationDocumentSubjectsAllowed} from '@/server/notification-document-authority';
const positive=z.number().int().positive().refine(Number.isSafeInteger);
const docSchema=z.object({id:positive,document_no:z.string(),title:z.string(),owner_user_id:positive.nullable(),created_by:positive.nullable(),expiry_date:z.string().nullable(),owning_company_id:positive,owning_branch_id:positive.nullable(),confidentiality_level:z.string(),status:z.string(),is_archived:z.boolean(),expiry_tracking_override:z.string().nullable()}).strip();
export type DmsEmailSourceResult={success:boolean;data?:{dmsNotificationId:number;globalNotificationId?:number;emailQueueId?:number;bridgeStatus:DmsEmailBridgeState;skipped?:boolean;reason?:string};error?:string};
/** Shared producer for both legacy entry points. User RLS chooses the source;
 * global delivery authority is separate. No raw queue DML and no direct send. */
export async function bridgeDmsEmailSource(dmsNotificationId:number,options:{forceEmail?:boolean;dryRun?:boolean}={}):Promise<DmsEmailSourceResult>{
 try{return await withDeadline(F09_LIMITS.preparationMs,signal=>bridgeSource(dmsNotificationId,options,signal));}
 catch{return {success:false,error:'Document notification delivery is unconfirmed. Reconcile the same source; do not create a replacement.'};}
}
async function bridgeSource(dmsNotificationId:number,options:{forceEmail?:boolean;dryRun?:boolean},signal:AbortSignal):Promise<DmsEmailSourceResult>{
 try{
  const query=<T>(q:AbortableQuery<T>)=>queryWithin(q,signal);
  const ctx=await getAuthContext();if(!canUseDmsEmailBridge(ctx))return {success:false,error:'Current DMS and global queue delivery authority are required.'};
  if(!positive.safeParse(dmsNotificationId).success)return {success:false,error:'Invalid notification reference.'};
  const db=await createClient();
  const result=await query(db.from('dms_notification_queue').select(`id,document_id,reminder_id,notification_type,status,recipient_user_id,recipient_email,scheduled_for,bridge_status,global_notification_id,global_email_queue_id,bridge_attempt_count,metadata_json,
    document:dms_documents!document_id(id,document_no,title,owner_user_id,created_by,expiry_date,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived,expiry_tracking_override),
    reminder:dms_expiry_reminders!reminder_id(reminder_days_before,reminder_date)`).eq('id',dmsNotificationId).maybeSingle());
  if(result.error||!result.data)return {success:false,error:'The permitted document notification could not be loaded.'};
  const row=result.data as Record<string,unknown>,document=docSchema.safeParse(row.document);
  if(row.bridge_status==='skipped')return {success:true,data:{dmsNotificationId,bridgeStatus:'skipped',skipped:true,reason:'The existing explicit skip is preserved; no new notification or email was created.'}};
  if(!document.success||document.data.id!==row.document_id)return {success:false,error:'The document source is unavailable or its company/branch identity is incomplete.'};
  const doc=document.data;
  if(row.status!=='pending')return {success:false,error:'The source is terminal or not eligible for bridging. Reconcile its existing intent.'};
  const due=typeof row.scheduled_for==='string'?Date.parse(row.scheduled_for):NaN;
  if(!Number.isFinite(due))return {success:false,error:'The source due time could not be verified.'};
  if(due>Date.now())return {success:true,data:{dmsNotificationId,bridgeStatus:dmsEmailBridgeState(row.bridge_status),skipped:true,reason:'This source is not due. It remains scheduled; no records changed.'}};
  if(doc.is_archived||['archived','superseded','deleted'].includes(doc.status)||doc.expiry_tracking_override==='ignored')return {success:false,error:'The current document lifecycle does not permit delivery.'};
  const cycle=z.object({expiry_date:z.string()}).safeParse(row.metadata_json);
  if(cycle.success&&cycle.data.expiry_date!==doc.expiry_date)return {success:false,error:'The expiry cycle has changed. Review the original reminder; no replacement was created.'};
  const expired=['expired_document','document_expired'].includes(String(row.notification_type));
  // Preserve explicitly assigned people. Never turn an external address into a
  // guessed user or a broadcast; only the existing no-address owner fallback.
  const recipientId=positive.safeParse(row.recipient_user_id??(row.recipient_email?null:doc.owner_user_id));
  if(!recipientId.success)return {success:false,error:'Assign an active ERP recipient before bridging this notification. No recipient mapping was guessed.'};
  const recipient=await getAuthContextForProfileId(recipientId.data);requireDmsNoticeAccess(recipient,doc);
  if(!await notificationDocumentSubjectsAllowed(recipient,doc.id))return {success:false,error:'The assigned recipient cannot access every linked confidential subject.'};
  signal.throwIfAborted();
  const [flag,settings]=await Promise.all([
   query(db.from('erp_email_feature_flags').select('is_enabled').eq('feature_code','DMS_EXPIRY_EMAILS').maybeSingle()),
   query(db.from('dms_notification_settings').select('is_enabled,email_enabled,in_app_enabled').eq('id',1).maybeSingle()),
  ]);
  if(flag.error||settings.error||!settings.data)return {success:false,error:'Delivery settings could not be verified.'};
  if(!settings.data.is_enabled||settings.data.in_app_enabled!==true&&settings.data.email_enabled!==true)return {success:true,data:{dmsNotificationId,bridgeStatus:dmsEmailBridgeState(row.bridge_status),skipped:true,reason:'DMS notification channels are disabled. No records changed.'}};
  const emailEnabled=settings.data.is_enabled&&settings.data.email_enabled&&(flag.data?.is_enabled||options.forceEmail===true);
  let email:string|null=null;
  // In-app authority is not mailbox authority. An email-disabled channel must
  // not fetch a mailbox or prevent an otherwise authorized in-app delivery.
  if(emailEnabled){
   const mailbox=await createAdminClient().auth.admin.getUserById(recipient.profile!.auth_user_id);
   signal.throwIfAborted();email=confirmedDeliveryMailbox(mailbox.data.user);
   if(mailbox.error||!email)return {success:false,error:'The assigned ERP recipient has no active confirmed mailbox. Email remains held.'};
  }
  if(options.dryRun)return {success:true,data:{dmsNotificationId,bridgeStatus:dmsEmailBridgeState(row.bridge_status??'not_bridged'),skipped:true,reason:emailEnabled?'Dry run: source and current recipient verified; no notification or email created.':'Dry run: email remains disabled; no records changed.'}};
  const reminder=row.reminder as {reminder_days_before?:number}|null;
  const variables={document_no:doc.document_no,title:doc.title,expiry_date:doc.expiry_date??'unknown',days_remaining:String(reminder?.reminder_days_before??''),reminder_days_before:String(reminder?.reminder_days_before??''),company_name:'ALGT',action_url:`/dms/documents/record/${doc.id}`};
  let notificationId=positive.safeParse(row.global_notification_id).success?Number(row.global_notification_id):null;
  const code='DMS_BRIDGE_'+dmsNotificationId;
  if(!notificationId){
   const existing=await query(db.from('erp_notifications').select('id').eq('notification_code',code).is('deleted_at',null).maybeSingle());
   if(existing.error)return {success:false,error:'Original notification identity could not be reconciled.'};
   notificationId=existing.data?.id??null;
  }
  if(!notificationId){
   const templateCode=expired?'DMS_DOCUMENT_EXPIRED':'DMS_EXPIRY_REMINDER';
   const rendered=await renderNotificationTemplate(templateCode,variables);
   signal.throwIfAborted();
   if(!rendered.success||!rendered.data)return {success:false,error:'Notification wording is unavailable; existing records are unchanged.'};
   const created=await createNotification({notification_code:code,source_module:'DMS',source_entity_type:'dms_documents',source_entity_id:doc.id,notification_type:String(row.notification_type),severity:expired?'urgent':'warning',title:rendered.data.subject,message:rendered.data.textBody,recipient_user_id:recipientId.data,recipient_email:email,channel_in_app:settings.data.in_app_enabled===true,channel_email:emailEnabled,scheduled_for:typeof row.scheduled_for==='string'?row.scheduled_for:undefined,action_url:`/dms/documents/record/${doc.id}`,action_label:'View document',metadata_json:{dms_notification_id:dmsNotificationId}});
   signal.throwIfAborted();
   if(created.success&&created.data)notificationId=created.data.id;
   else{const retry=await query(db.from('erp_notifications').select('id').eq('notification_code',code).is('deleted_at',null).maybeSingle());if(retry.error||!retry.data)return {success:false,error:'Notification creation unconfirmed. Retry the same source; no new email identity is used.'};notificationId=retry.data.id;}
  }
  if(typeof notificationId!=='number'||!Number.isSafeInteger(notificationId)||notificationId<1)return {success:false,error:'Original notification reference is unconfirmed.'};
  const bound=await query(db.from('erp_notifications').select('id,source_module,source_entity_type,source_entity_id,recipient_user_id').eq('id',notificationId).is('deleted_at',null).maybeSingle());
  if(bound.error||!bound.data||bound.data.source_module!=='DMS'||bound.data.source_entity_type!=='dms_documents'||bound.data.source_entity_id!==doc.id||bound.data.recipient_user_id!==recipientId.data)return {success:false,error:'Existing notification does not match this document and recipient. Review it without creating another intent.'};
  // Establish provenance before queueing. Worker projections may advance delivery
  // state immediately; the producer must never overwrite a later accepted state.
  const linkQuery=db.from('dms_notification_queue').update({global_notification_id:notificationId,bridge_status:'bridged',updated_at:new Date().toISOString()}).eq('id',dmsNotificationId);
  if(row.global_notification_id==null)linkQuery.is('global_notification_id',null);
  else linkQuery.eq('global_notification_id',notificationId).in('bridge_status',['not_bridged','failed']);
  const link=await query(linkQuery.select('id'));
  if(link.error)return {success:false,error:'Notification linkage unconfirmed. Retry the same source.'};
  let linkedState=row.global_notification_id&&!['not_bridged','failed'].includes(String(row.bridge_status))?dmsEmailBridgeState(row.bridge_status):'bridged' as const;
  if(!Array.isArray(link.data)||link.data.length!==1||link.data[0].id!==dmsNotificationId){
   // A successful HTTP response with zero changed rows is not a save receipt.
   // A concurrent worker may already have projected the same original intent;
   // reconcile it without downgrading its accepted/uncertain/terminal state.
   const original=await query(db.from('dms_notification_queue').select('id,global_notification_id,bridge_status').eq('id',dmsNotificationId).maybeSingle());
   if(original.error||original.data?.id!==dmsNotificationId||original.data.global_notification_id!==notificationId)return {success:false,error:'Notification linkage unconfirmed. Retry the same source.'};
   linkedState=dmsEmailBridgeState(original.data.bridge_status);
  }
  if(!emailEnabled)return {success:true,data:{dmsNotificationId,globalNotificationId:notificationId,bridgeStatus:linkedState,reason:'In-app notification retained; email delivery is disabled.'}};
  if(!email)return {success:false,error:'The email channel remains held; its verified mailbox is unavailable.'};
  // Declare and confirm the wanted channel BEFORE publishing a dispatchable
  // queue intent. Otherwise the independent F09 worker could cancel the new
  // queue item while this producer is still trying to set its source marker.
  const marked=await query(db.rpc('f10_enable_legacy_notification_email',{source_id:dmsNotificationId,notification_id:notificationId}));
  if(marked.error||marked.data!==true)return {success:false,error:'Notification marker update unconfirmed. Retry the same source; no new email was queued.'};
  const prior=await query(db.from('erp_email_queue').select('id,notification_id,source_module,source_entity_type,source_entity_id,to_emails,deleted_at,status,delivery_state,paused_at,last_error,sent_at').eq('notification_id',notificationId).limit(2));
  if(prior.error||!Array.isArray(prior.data)||prior.data.length>1)return {success:false,error:'Original email intent is unavailable or ambiguous. Review it before another delivery.'};
  let queueId:number|undefined;
  if(prior.data.length){
   const q=prior.data[0];
   if(q.deleted_at||q.source_module!=='DMS'||!((q.source_entity_type==='dms_documents'&&q.source_entity_id===doc.id)||(q.source_entity_type==='dms_notification'&&q.source_entity_id===notificationId))||q.to_emails?.length!==1||q.to_emails[0].toLowerCase()!==email.toLowerCase())return {success:false,error:'The original email intent no longer matches its current recipient or source. It remains held; do not resend.'};
   queueId=q.id;
  }else{
   const queued=await queueEmail({source_module:'DMS',source_entity_type:'dms_documents',source_entity_id:doc.id,notification_id:notificationId,priority:expired?'high':'normal',to_emails:[email],subject:DMS_NOTICE.subject,text_body:DMS_NOTICE.textBody,max_attempts:3},{autoProcess:false});
   signal.throwIfAborted();
   if(!queued.success||!queued.data)return {success:false,error:'Email queue save unconfirmed. Retry the original notification to reconcile it; do not create a replacement.'};queueId=queued.data.id;
  }
  const tracked=await query(db.from('dms_notification_queue').update({global_email_queue_id:queueId,updated_at:new Date().toISOString()}).eq('id',dmsNotificationId).eq('global_notification_id',notificationId).select('id'));
  if(tracked.error||tracked.data?.length!==1)return {success:false,error:'Email intent retained but tracking update unconfirmed. Retry the same source.'};
  // A compare-and-set prevents overwriting a concurrently projected outcome.
  const queuedState=await query(db.from('dms_notification_queue').update({...dmsEmailQueueOutcome(prior.data[0]??{status:'pending'}),updated_at:new Date().toISOString()}).eq('id',dmsNotificationId).eq('bridge_status','bridged'));
  if(queuedState.error)return {success:false,error:'Email intent retained; refresh its current tracking status.'};
  const current=await query(db.from('dms_notification_queue').select('id,global_notification_id,global_email_queue_id,bridge_status').eq('id',dmsNotificationId).maybeSingle());
  if(current.error||current.data?.id!==dmsNotificationId||current.data.global_notification_id!==notificationId||current.data.global_email_queue_id!==queueId)return {success:false,error:'Tracking read unconfirmed. The same intent is retained.'};
  return {success:true,data:{dmsNotificationId,globalNotificationId:notificationId,emailQueueId:queueId,bridgeStatus:dmsEmailBridgeState(current.data.bridge_status),skipped:prior.data.length>0,reason:prior.data.length?'Original immutable email intent retained; no new email was created.':undefined}};
 }catch{return {success:false,error:'Document notification delivery could not be confirmed. Retry the same source after verifying current access and recipient.'};}
}
