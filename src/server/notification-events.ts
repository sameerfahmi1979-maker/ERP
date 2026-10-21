import 'server-only';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContextForProfileId,type AuthContext} from '@/lib/rbac/check';
import {canUseApplication,isGlobalAdmin,hasGlobalPermission,hasPermission,hasPermissionInScope} from '@/lib/rbac/scope';
import {eligibleApprovalRecipient} from '@/lib/dms/approval-notification-recipient';
import {requireDmsNoticeAccess} from '@/lib/email/queue/dms-policy';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';
import {brandingPermission} from '@/lib/branding/asset-permissions';
import {boundedQuery} from '@/lib/email/queue/runtime-limits';
import {withDeadline} from '@/lib/email/queue/delivery-contract';
import {notificationDocumentSubjectsAllowed} from '@/server/notification-document-authority';
import {notificationUploadReviewAllowed} from '@/server/notification-upload-authority';

const positive=z.number().int().positive().refine(Number.isSafeInteger);
const hrSources=['employee_leave_requests','employee_attendance_corrections','employee_salary_revisions','employee_payroll_holds','employee_approval_requests','employee_identity_documents','employee_medical_insurances','hr_interviews','hr_offers','hr_onboarding_tasks','hr_candidates'] as const;
const hrProjection:Record<typeof hrSources[number],string>={
 employee_leave_requests:'id,employee_id,approval_status',employee_attendance_corrections:'id,employee_id',
 employee_salary_revisions:'id,employee_id',employee_payroll_holds:'id,employee_id,is_active',
 employee_approval_requests:'id,employee_id,request_status',employee_identity_documents:'id,employee_id,expiry_date,status',
 employee_medical_insurances:'id,employee_id,expiry_date,status',hr_interviews:'id,candidate_id,interviewer_id,interview_status,interview_datetime',
 hr_offers:'id,candidate_id,offer_status',hr_onboarding_tasks:'id,employee_id,candidate_id,assigned_to,due_date,task_status',hr_candidates:'id,candidate_id:id,requisition_id,joining_status,candidate_status,pipeline_stage',
};
const eventSchema=z.object({id:positive,event_key:z.string(),source_table:z.enum(['dms_document_events','dms_notification_queue','dms_review_queue','erp_report_template_events',...hrSources]),
 source_id:positive,event_type:z.string(),actor_id:positive.nullable(),source_snapshot:z.record(z.string(),z.unknown()),lease_token:z.uuid()}).passthrough();
export type NotificationEvent=z.infer<typeof eventSchema>;
type Recipient={profile_id:number;state:'pending'|'created'|'held';outcome?:string|null};
type DB=ReturnType<typeof createAdminClient>;
export class NotificationRoutingHold extends Error {
 constructor(readonly reason='employee_account_link_unresolved'){super('Stored recipient mapping is missing or ambiguous; review required.');this.name='NotificationRoutingHold';}
}
async function recipientContext(id:number){
 try{return await getAuthContextForProfileId(id);}
 catch(error){
  if(error instanceof Error&&(error.name==='AccountDisabledError'||error.message==='Password change required before using the application'))return null;
  throw error; // An authority lookup outage is not proof somebody is ineligible.
 }
}

async function candidates(db:DB):Promise<number[]>{
 const r=await boundedQuery(db.rpc('f10_notification_role_candidates'));
 if(r.error){if(r.error.code==='54000')throw new NotificationRoutingHold('routing_capacity_review_required');throw Error('Recipient inventory unavailable');}
 return z.array(positive).max(20000).parse(r.data);
}
type RoutingOptions={discoverOnly?:boolean;candidateIds?:readonly number[]};
async function documentAllowed(db:DB,ctx:AuthContext,id:number,requiredRole:string|null,needsAction:boolean){
 const r=await boundedQuery(db.from('dms_documents').select('id,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived').eq('id',id).is('deleted_at',null).maybeSingle());
 if(r.error)throw Error('Document authority unavailable');
 const doc=r.data;if(!doc||doc.is_archived||['archived','superseded','deleted'].includes(doc.status))return false;
 if(!eligibleApprovalRecipient(ctx,doc,requiredRole,needsAction))return false;
 if(doc.owning_company_id===null){if(!isGlobalAdmin(ctx))return false;}
 else try{requireDmsNoticeAccess(ctx,{...doc,owning_company_id:doc.owning_company_id});}catch{return false;}
 return notificationDocumentSubjectsAllowed(ctx,id);
}
async function hrRecipients(event:NotificationEvent,db:DB,considered?:Set<number>,options:RoutingOptions={}):Promise<number[]>{
 const snapshot=event.source_snapshot;
 let employeeId=positive.safeParse(snapshot.employee_id).success?Number(snapshot.employee_id):null;
 const candidateId=positive.safeParse(snapshot.candidate_id).success?Number(snapshot.candidate_id):null;
 const candidates=new Set<number>();
 // Follow only stored primary/foreign keys; never infer identity from names or mail.
 if(candidateId!==null){
  const links=await boundedQuery(db.from('employee_recruitment_links').select('employee_id').eq('candidate_id',candidateId).limit(2));
  if(links.error)throw Error('Recruitment relationship unavailable');
  if((links.data?.length??0)>1)throw new NotificationRoutingHold('candidate_employee_link_ambiguous');
  if(employeeId===null&&links.data?.length===1)employeeId=links.data[0].employee_id;
 }
 const assigned=positive.safeParse(snapshot.assigned_to);if(assigned.success)candidates.add(assigned.data);
 let employee:Awaited<ReturnType<typeof getEmployeeAccess>>['subject']|null=null;
 if(employeeId!==null){
  const r=await boundedQuery(db.from('employees').select('id,owner_company_id,branch_id,reporting_manager_id').eq('id',employeeId).is('deleted_at',null).maybeSingle());
  if(r.error)throw Error('Employee relationship unavailable');if(!r.data)return [];
  employee=r.data;
  const ids=[employee.id,...(employee.reporting_manager_id?[employee.reporting_manager_id]:[])];
  const links=await boundedQuery(db.from('erp_user_employee_links').select('user_profile_id,employee_id').in('employee_id',ids).limit(5));
  if(links.error)throw Error('Employee account links unavailable');
  if(ids.some(id=>(links.data??[]).filter(l=>l.employee_id===id).length!==1))throw new NotificationRoutingHold();
  for(const link of links.data??[])candidates.add(link.user_profile_id);
 }
 for(const id of candidates)considered?.add(id);
 const expiry=['employee_identity_documents','employee_medical_insurances'].includes(event.source_table);
 const sourceQuery=db.from(event.source_table).select(hrProjection[event.source_table as typeof hrSources[number]]).eq('id',event.source_id);
 if(!['employee_salary_revisions','employee_attendance_corrections'].includes(event.source_table))sourceQuery.is('deleted_at',null);
 const current=await boundedQuery(sourceQuery.maybeSingle());
 if(current.error)throw Error('HR event source unavailable');if(!current.data)return [];
 const record=z.record(z.string(),z.unknown()).safeParse(current.data);if(!record.success)throw Error('HR source contract unavailable');
 for(const key of ['employee_id','candidate_id','approval_status','request_status','is_active','interview_status','interview_datetime','offer_status','task_status','due_date','joining_status','candidate_status','pipeline_stage']){
  if(key in snapshot&&snapshot[key]!==null&&record.data[key]!==snapshot[key])return [];
 }
 if('assigned_to' in snapshot&&snapshot.assigned_to!==null&&(event.source_table==='hr_interviews'?record.data.interviewer_id:record.data.assigned_to)!==snapshot.assigned_to)return [];
 if(expiry&&(record.data.expiry_date!==snapshot.expiry_date||!['active','expired'].includes(String(record.data.status))))return [];
 if(options.discoverOnly)return [...candidates];
 const result:number[]=[];
 for(const id of candidates){
  if(options.candidateIds&&!options.candidateIds.includes(id))continue;
  const ctx=await recipientContext(id);if(!ctx||!canUseApplication(ctx)||!hasPermission(ctx,'notifications.view'))continue;
  if(employee){
   try{
    const access=await getEmployeeAccess(ctx,employee.id);
    const caps:Record<string,readonly string[]>={employee_salary_revisions:['hr.payroll.view'],employee_payroll_holds:['hr.payroll.view'],
     employee_medical_insurances:['hr.medical.view'],employee_identity_documents:['hr.compliance.view'],
     employee_attendance_corrections:['hr.attendance.view'],employee_approval_requests:['hr.actions.view'],employee_leave_requests:['hr.leave.view','hr.leave.manage']};
    if(caps[event.source_table]&&!caps[event.source_table].some(code=>access.allows(code)))continue;
    if(event.source_table==='hr_onboarding_tasks'&&!['hr.recruitment.view','hr.recruitment.manage'].some(code=>hasPermissionInScope(ctx,code,employee!.owner_company_id,employee!.branch_id)))continue;
   }catch(error){
    if(error instanceof Error&&error.message==='Employee unavailable or access denied')continue;
    throw error;
   }
  }
  if(candidateId!==null){
   const c=await boundedQuery(db.from('hr_candidates').select('requisition_id').eq('id',candidateId).is('deleted_at',null).maybeSingle());
   if(c.error)throw Error('Candidate source unavailable');if(!c.data)continue;
   let allowed=false;
   if(c.data.requisition_id){
    const r=await boundedQuery(db.from('hr_job_requisitions').select('owner_company_id,branch_id').eq('id',c.data.requisition_id).is('deleted_at',null).maybeSingle());
    if(r.error)throw Error('Candidate scope unavailable');
    allowed=!!r.data&&['hr.recruitment.view','hr.recruitment.manage'].some(code=>hasPermissionInScope(ctx,code,r.data!.owner_company_id,r.data!.branch_id));
   }else allowed=['hr.recruitment.view','hr.recruitment.manage'].some(code=>hasGlobalPermission(ctx,code));
   if(!allowed)continue;
  }else if(!employee)continue;
  result.push(id);
 }
 return result;
}
export async function resolveNotificationRecipients(event:NotificationEvent,db:DB,considered?:Set<number>,options:RoutingOptions={}):Promise<number[]>{
 if(hrSources.some(s=>s===event.source_table))return hrRecipients(event,db,considered,options);
 const snapshot=event.source_snapshot,ids=new Set<number>();
 if(event.source_table==='dms_notification_queue'){
  const r=await boundedQuery(db.from('dms_notification_queue').select('id,document_id,reminder_id,recipient_user_id,status,scheduled_for,metadata_json,global_notification_id').eq('id',event.source_id).maybeSingle());
  if(r.error)throw Error('Reminder recipient source unavailable');
  const row=z.object({id:positive,document_id:positive,reminder_id:positive,recipient_user_id:positive,status:z.string(),scheduled_for:z.string(),metadata_json:z.unknown(),global_notification_id:positive.nullable().optional()}).safeParse(r.data);
  if(!row.success||row.data.document_id!==snapshot.document_id||row.data.recipient_user_id!==snapshot.recipient_user_id||
   !(row.data.status==='pending'||['read','dismissed'].includes(row.data.status)&&!!row.data.global_notification_id))return [];
  const reminder=await boundedQuery(db.from('dms_expiry_reminders').select('id,status,document_id').eq('id',row.data.reminder_id).maybeSingle());
  if(reminder.error)throw Error('Reminder eligibility unavailable');if(!reminder.data||reminder.data.status!=='pending'||reminder.data.document_id!==row.data.document_id)return [];
  const due=Date.parse(row.data.scheduled_for);if(!Number.isFinite(due))throw Error('Reminder due time unavailable');if(due>Date.now())return [];
  if(snapshot.channels_resolved!==true||snapshot.channel_in_app!==true&&snapshot.channel_email!==true)return [];
  const d=await boundedQuery(db.from('dms_documents').select('expiry_date,expiry_tracking_override').eq('id',row.data.document_id).is('deleted_at',null).maybeSingle());
  if(d.error)throw Error('Reminder cycle unavailable');if(!d.data||d.data.expiry_tracking_override==='ignored')return [];
  const cycle=z.object({expiry_date:z.string()}).safeParse(row.data.metadata_json);if(cycle.success&&cycle.data.expiry_date!==d.data.expiry_date)return [];
  considered?.add(row.data.recipient_user_id);
  if(options.discoverOnly)return [row.data.recipient_user_id];
  if(options.candidateIds&&!options.candidateIds.includes(row.data.recipient_user_id))return [];
  const ctx=await recipientContext(row.data.recipient_user_id);
  return ctx&&await documentAllowed(db,ctx,row.data.document_id,null,false)?[row.data.recipient_user_id]:[];
 }
 let needsAction=false,requiredRole:string|null=null,docId:number|null=null,uploadSession:number|null=null;
 if(event.source_table==='dms_document_events'){
  docId=positive.parse(snapshot.document_id);
  const d=await boundedQuery(db.from('dms_documents').select('id,submitted_by,owner_user_id,created_by,approval_status').eq('id',docId).is('deleted_at',null).maybeSingle());
  if(d.error)throw Error('Approval source unavailable');if(!d.data)return [];
  const meta=z.record(z.string(),z.unknown()).safeParse(snapshot.metadata_json);
  needsAction=event.event_type==='approval_submitted'||event.event_type==='approval_approved'&&meta.success&&meta.data.approval_status==='pending_approval';
  if(needsAction){
   if(d.data.approval_status!=='pending_approval')return [];
   const approvalId=meta.success?positive.safeParse(meta.data.approval_id):null;
   if(!approvalId?.success)throw Error('Approval event identity unavailable');
   const a=await boundedQuery(db.from('dms_document_approvals').select('id,step_id,is_current').eq('id',approvalId.data).eq('document_id',docId).maybeSingle());
   if(a.error)throw Error('Approval stage unavailable');if(!a.data?.is_current)return [];
   if(a.data.step_id){const s=await boundedQuery(db.from('dms_document_workflow_steps').select('requires_role,is_active').eq('id',a.data.step_id).maybeSingle());if(s.error||!s.data?.is_active)throw Error('Required role unavailable');requiredRole=s.data.requires_role;}
   for(const id of options.candidateIds??await candidates(db))ids.add(id);
  }else for(const id of [d.data.submitted_by,d.data.owner_user_id,d.data.created_by])if(positive.safeParse(id).success)ids.add(id!);
 }else if(event.source_table==='dms_review_queue'){
  docId=positive.nullable().parse(snapshot.document_id);
  const r=await boundedQuery(db.from('dms_review_queue').select('id,assigned_to,status,document_id,upload_session_id').eq('id',event.source_id).is('deleted_at',null).maybeSingle());
  if(r.error)throw Error('Review source unavailable');if(!r.data||['resolved','dismissed','cancelled','completed'].includes(r.data.status)||r.data.document_id!==docId)return [];
  if(snapshot.assigned_to!==r.data.assigned_to)return [];
  if(r.data.assigned_to)ids.add(r.data.assigned_to);else for(const id of options.candidateIds??await candidates(db))ids.add(id);
  uploadSession=positive.safeParse(r.data.upload_session_id).success?r.data.upload_session_id:null;
  const flag=await boundedQuery(db.from('erp_ai_feature_flags').select('is_enabled').eq('feature_code','DMS_AI_REVIEW').maybeSingle());
  if(flag.error)throw Error('Review availability unavailable');if(flag.data?.is_enabled!==true)return [];
  if(docId===null&&uploadSession===null)return [];
 }else for(const id of options.candidateIds??await candidates(db))ids.add(id);
 if(options.discoverOnly)return [...ids].filter(id=>id!==event.actor_id);
 const allowed:number[]=[];
 for(const id of ids){
  if(options.candidateIds&&!options.candidateIds.includes(id))continue;
  considered?.add(id);
  if(id===event.actor_id)continue;
  const ctx=await recipientContext(id);if(!ctx||!canUseApplication(ctx)||!hasPermission(ctx,'notifications.view'))continue;
  if(docId!==null){if(!await documentAllowed(db,ctx,docId,requiredRole,needsAction))continue;
   if(event.source_table==='dms_review_queue'){
    if(!snapshot.assigned_to&&!isGlobalAdmin(ctx))continue;
    const d=await boundedQuery(db.from('dms_documents').select('owning_company_id,owning_branch_id').eq('id',docId).is('deleted_at',null).maybeSingle());
    if(d.error)throw Error('Review scope unavailable');
    if(!d.data||!['dms.review_queue.view','dms.review_queue.manage','dms.documents.review_ai','dms.admin'].some(code=>hasPermissionInScope(ctx,code,d.data!.owning_company_id,d.data!.owning_branch_id)))continue;
    // A review's original intake subject stays authoritative after linking.
    if(uploadSession!==null&&!await notificationUploadReviewAllowed(ctx,uploadSession,docId))continue;
   }
  }else if(event.source_table==='dms_review_queue'){
   if(!snapshot.assigned_to&&!isGlobalAdmin(ctx))continue;
   if(uploadSession===null||!await notificationUploadReviewAllowed(ctx,uploadSession))continue;
  }else{
   const template=await boundedQuery(db.from('erp_report_templates').select('id,branding_profile_id,governance_status').eq('id',positive.parse(snapshot.template_id)).is('deleted_at',null).maybeSingle());
   if(template.error)throw Error('Template source unavailable');if(template.data?.governance_status!=='in_review')continue;
   let company:number|null=null;
   if(template.data.branding_profile_id){const b=await boundedQuery(db.from('erp_report_branding_profiles').select('owner_company_id').eq('id',template.data.branding_profile_id).maybeSingle());if(b.error||!b.data)throw Error('Template owner unavailable');company=b.data.owner_company_id;}
   if(!brandingPermission(ctx,'reports.template.approve',company))continue;
  }
  allowed.push(id);
 }
 return allowed;
}

export interface NotificationEventPorts {
 claim:()=>Promise<unknown>;
 resolve:(event:NotificationEvent)=>Promise<number[]>;
 plan:(event:NotificationEvent,ids:number[])=>Promise<Recipient[]>;
 record:(event:NotificationEvent,profile:number,allowed:boolean)=>Promise<{state:string;outcome?:string}>;
 resumeChannel?:(event:NotificationEvent,profile:number,allowed:boolean)=>Promise<{state:string;outcome?:string}>;
 finish:(event:NotificationEvent,outcome:'complete'|'retry'|'held'|'pending',reason?:string)=>Promise<boolean>;
 canContinue?:()=>boolean;
 recipientLimit?:number;
 prepare?:(event:NotificationEvent)=>Promise<{ready:false}|{ready:true;recipients:Recipient[]}>;
 authorize?:(event:NotificationEvent,profile:number)=>Promise<boolean>;
}
/** Failed resolution never becomes empty success; one recipient cannot erase
 * prior committed recipients. Replays always use the frozen original roster. */
export async function runNotificationEventBatch(ports:NotificationEventPorts){
 const events=z.array(eventSchema).max(100).parse(await ports.claim());
 const results:{id:number;outcome:'complete'|'retry'|'held'|'pending'}[]=[];
 const maximum=ports.recipientLimit??20;
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>100)throw Error('Invalid fan-out limit');
 let remaining=maximum;
 for(const event of events){
  let outcome:'complete'|'retry'|'held'|'pending'='retry';
  let reason:string|undefined;
  try{
   const prepared=await ports.prepare?.(event);
   const current=prepared?[]:[...new Set(await ports.resolve(event))];
   const planned=prepared?(prepared.ready?prepared.recipients:[]):await ports.plan(event,current);
   if(prepared&&!prepared.ready)outcome='pending';
   else if(!planned.length){outcome='held';reason='no_currently_eligible_recipient';}
   else{
    let held=false,yielded=false;
    for(const recipient of planned){
     if(recipient.state==='created'){
      if(['in_app_created_email_held_no_verified_mailbox','email_only_held_no_verified_mailbox'].includes(recipient.outcome??'')&&ports.resumeChannel){
       if(remaining===0||ports.canContinue?.()===false){yielded=true;break;}
       const allowed=ports.authorize?await ports.authorize(event,recipient.profile_id):current.includes(recipient.profile_id);
       const result=await ports.resumeChannel(event,recipient.profile_id,allowed);remaining--;
       held||=result.state!=='created'||!!result.outcome?.includes('_held_');
      }else held||=!!recipient.outcome?.includes('_held_');
      continue;
     }
     if(recipient.state==='held'){held=true;continue;}
     if(remaining===0||ports.canContinue?.()===false){yielded=true;break;}
     const allowed=ports.authorize?await ports.authorize(event,recipient.profile_id):current.includes(recipient.profile_id);
     const r=await ports.record(event,recipient.profile_id,allowed);
     remaining--;
     held||=r.state!=='created'||!!r.outcome?.includes('_held_');
    }
    outcome=yielded?'pending':held?'held':'complete';
    if(outcome==='held')reason='recipient_or_channel_requires_review';
   }
  }catch(error){outcome=error instanceof NotificationRoutingHold?'held':'retry';reason=error instanceof NotificationRoutingHold?error.reason:'authority_or_storage_unconfirmed';}
  if(!await (reason?ports.finish(event,outcome,reason):ports.finish(event,outcome)))throw Error('Event outcome unconfirmed; reconcile original event');
  results.push({id:event.id,outcome});
 }
 return {processed:results.length,results};
}
export async function processNotificationEvents(limit=10){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid event limit');
 return withDeadline(15000,async signal=>{
 const deadline=Date.now()+7000;
 const db=createAdminClient();
 async function rpc(name:string,args:Record<string,unknown>){signal.throwIfAborted();const r=await boundedQuery(db.rpc(name,args));signal.throwIfAborted();if(r.error){if(r.error.code==='54000')throw new NotificationRoutingHold('routing_capacity_review_required');throw Error('Event operation unavailable');}return r.data;}
 const recipient=z.object({profile_id:positive,state:z.enum(['pending','created','held']),outcome:z.string().nullable().optional()}).passthrough();
 const routingWork=z.discriminatedUnion('phase',[
  z.object({phase:z.literal('discover')}),z.object({phase:z.literal('qualify'),profile_id:positive}),
  z.object({phase:z.literal('ready'),recipients:z.array(recipient).max(5000)}),
 ]);
 await rpc('f10_cleanup_expired_open_intents',{batch_limit:500});
 if(process.env.F10_HR_EXPIRY_ENABLED==='true')await rpc('f10_collect_hr_expiry_events',{batch_limit:200});
 return runNotificationEventBatch({
  // Claim one event at a time: do not abandon other leases when the bounded
  // route budget is spent. Large rosters yield without spending failure retries.
  claim:()=>Date.now()<deadline?rpc('f10_claim_notification_events',{batch_limit:1}):Promise.resolve([]),
  canContinue:()=>!signal.aborted&&Date.now()<deadline,
  recipientLimit:20,
  prepare:async event=>{
   // Candidate discovery is frozen once. Each authority decision commits on its
   // own, so timeout/response loss never restarts the full role-group scan.
   for(let examined=0;examined<20&&Date.now()<deadline;examined++){
    const work=routingWork.parse(await rpc('f10_notification_routing_work',{event_id:event.id,lease:event.lease_token}));
    if(work.phase==='ready')return {ready:true,recipients:work.recipients};
    if(work.phase==='discover'){
     const ids=await resolveNotificationRecipients(event,db,undefined,{discoverOnly:true});
     if(await rpc('f10_prepare_notification_routing',{event_id:event.id,lease:event.lease_token,candidates:ids})!==true)throw Error('Recipient cohort unconfirmed');
    }else{
     const ids=await resolveNotificationRecipients(event,db,undefined,{candidateIds:[work.profile_id]});
     if(await rpc('f10_qualify_notification_candidate',{event_id:event.id,lease:event.lease_token,profile_id:work.profile_id,eligible:ids.includes(work.profile_id)})!==true)throw Error('Recipient qualification unconfirmed');
    }
   }
   return {ready:false};
  },
  authorize:async(event,profile)=>(await resolveNotificationRecipients(event,db,undefined,{candidateIds:[profile]})).includes(profile),
  resolve:async event=>{
   const considered=new Set<number>();
   const ids=await resolveNotificationRecipients(event,db,considered);
   if(await rpc('f10_record_resolution_decisions',{event_id:event.id,lease:event.lease_token,considered:[...considered],eligible:ids})!==true)throw Error('Routing audit unconfirmed');
   return ids;
  },
  plan:async(event,ids)=>z.array(recipient).max(5000).parse(await rpc('f10_plan_notification_recipients',{event_id:event.id,lease:event.lease_token,recipients:ids})),
  record:async(event,profile,allowed)=>z.object({state:z.enum(['created','held']),outcome:z.string().optional()}).passthrough().parse(await rpc('f10_record_notification_recipient',{event_id:event.id,lease:event.lease_token,profile_id:profile,recipient_allowed:allowed})),
  resumeChannel:async(event,profile,allowed)=>z.object({state:z.enum(['created','held']),outcome:z.string().optional()}).strip().parse(await rpc('f10_resume_notification_channel',{event_id:event.id,lease:event.lease_token,profile_id:profile,recipient_allowed:allowed})),
  finish:async(event,outcome,reason)=>{
   if(await rpc('f10_note_notification_routing_outcome',{event_id:event.id,lease:event.lease_token,reason:reason??null})!==true)throw Error('Routing outcome unconfirmed');
   return (await rpc('f10_finish_notification_event',{event_id:event.id,lease:event.lease_token,outcome}))===true;
  },
 });
 });
}
