// Pure SQL authoring helpers. No runtime, environment, DB, Auth or Storage imports.
import type {Database} from '@/types/database';
export const automaticReminderColumns=['assigned_to','created_at','department_code','dismissal_reason','dismissed_at','dismissed_by','document_id','escalation_level','id','last_notification_at','notification_status','recipients_json','reminder_date','reminder_days_before','retry_count','sent_at','status','updated_at'] as const satisfies readonly (keyof Database['public']['Tables']['dms_expiry_reminders']['Row'])[];
export function automaticReminderSchemaPreflightSql(){return `select jsonb_build_object('reminderColumns',(select coalesce(jsonb_agg(column_name order by column_name),'[]'::jsonb) from information_schema.columns where table_schema='public' and table_name='dms_expiry_reminders'),'profileStateType',(select data_type from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='status'),'profileHasLegacyActive',exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='is_active'))`;}
export function assertAutomaticReminderSchema(value:unknown){
 const row=value as {reminderColumns?:unknown;profileStateType?:unknown;profileHasLegacyActive?:unknown}|null;
 if(!row||JSON.stringify(row.reminderColumns)!==JSON.stringify(automaticReminderColumns)||row.profileStateType!=='text'||row.profileHasLegacyActive!==false)throw Error('Automatic reminder fixture schema differs from the reviewed generated contract');
}
export type ReminderProbeIdentity={documentId:number;sourceId:number;operationId:string};
function id(value:number){if(!Number.isSafeInteger(value)||value<1)throw Error('Exact positive fixture ID required');return value;}
function identity(value:ReminderProbeIdentity){id(value.documentId);id(value.sourceId);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.operationId))throw Error('Exact fixture operation required');return value;}
export function reminderRowsSql(documentId:number){return `(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.dms_expiry_reminders r where r.document_id=${id(documentId)})`;}
export function reminderSnapshotSql(value:ReminderProbeIdentity){
 const {documentId:d,sourceId:s,operationId:o}=identity(value);
 const tables=['dms_document_versions','dms_document_files','dms_document_metadata_values','dms_document_tags','dms_document_links','dms_document_events','dms_expiry_reminders'];
 const arrays=tables.map(table=>`'${table}',(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from public.${table} r where r.document_id=${d})`);
 return `select encode(sha256(convert_to(jsonb_build_object(
 'document',(select to_jsonb(r) from public.dms_documents r where id=${d}),
 'source',(select to_jsonb(r) from public.dms_upload_sessions r where id=${s}),
 'analysis',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dms_ai_extraction_results r where upload_session_id=${s}),
 'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.dms_approve_runs r where upload_session_id=${s}),
 'plan',(select to_jsonb(r) from erp_private.ai_approval_plans r where operation_id='${o}'::uuid),
 'proof',(select to_jsonb(r) from erp_private.ai_approval_verified_copies r where operation_id='${o}'::uuid),
 'reference',(select to_jsonb(r) from public.global_numbering_generated_references r where id=(select reference_id from erp_private.ai_approval_plans where operation_id='${o}'::uuid)),
 'audit',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.audit_logs r where new_values->>'operation_id'='${o}'),
 ${arrays.join(',')})::text,'UTF8')),'hex')`;
}
// Only a previously completed exact synthetic fixture may be made pending inside
// the caller's explicit rollback-only transaction. No committed repair/reset.
export function pendingReminderProbeSql(value:ReminderProbeIdentity,keepReminders=false){
 const {documentId:d,sourceId:s,operationId:o}=identity(value);
 return `do $$begin if not exists(select 1 from erp_private.ai_approval_plans where operation_id='${o}'::uuid and document_id=${d} and upload_session_id=${s} and result is not null) then raise exception 'Completed exact fixture required';end if;end$$;
 update erp_private.ai_approval_plans set result=null,completed_at=null where operation_id='${o}'::uuid and document_id=${d} and upload_session_id=${s};
 ${keepReminders?'':`delete from public.dms_expiry_reminders where document_id=${d};`}`;
}
export function automaticReminderDates(expiry:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry))throw Error('Exact ISO expiry required');
 const date=new Date(expiry+'T00:00:00.000Z');if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==expiry)throw Error('Invalid expiry');
 return [1,7,14,30,60,90].map(days=>({days,date:new Date(date.valueOf()-days*86400000).toISOString().slice(0,10),status:'pending'}));
}
