import 'server-only';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import type {AuthContext} from '@/lib/rbac/check';
import {canUseApplication,hasPermission,hasPermissionInScope,hasGlobalPermission,isGlobalAdmin} from '@/lib/rbac/scope';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';
import {boundedQuery} from '@/lib/email/queue/runtime-limits';
import {notificationDocumentSubjectsAllowed} from '@/server/notification-document-authority';
import {requireDmsNoticeAccess} from '@/lib/email/queue/dms-policy';
const id=z.number().int().positive().refine(Number.isSafeInteger);
const scope={owning_company_id:id.nullable(),owning_branch_id:id.nullable()};
const sessionSchema=z.object({id,uploaded_by:id.nullable(),document_id:id.nullable(),batch_id:id.nullable(),origin_entity_type:z.string().nullable(),origin_entity_id:id.nullable(),...scope});
const reviewCaps=['dms.review_queue.view','dms.review_queue.manage','dms.documents.review_ai','dms.admin'] as const;
/** Prospective F03/F07 upload boundary, with no JWT impersonation. */
export async function notificationUploadReviewAllowed(ctx:AuthContext,sessionId:number,expectedDocumentId:number|null=null):Promise<boolean>{
 if(!canUseApplication(ctx)||!id.safeParse(sessionId).success||!hasPermission(ctx,'notifications.view'))return false;
 const db=createAdminClient();
 const r=await boundedQuery(db.from('dms_upload_sessions').select('id,uploaded_by,document_id,batch_id,origin_entity_type,origin_entity_id,owning_company_id,owning_branch_id').eq('id',sessionId).is('deleted_at',null).maybeSingle());
 if(r.error)throw Error('Upload recipient authority unavailable');if(!r.data)return false;
 const s=sessionSchema.parse(r.data);
 // The review and upload must still refer to the same original source.
 if(s.document_id!==expectedDocumentId)return false;
 if(isGlobalAdmin(ctx))return true;
 let authorityCompany=s.owning_company_id,authorityBranch=s.owning_branch_id;
 if(s.document_id!==null){
  const d=await boundedQuery(db.from('dms_documents').select('owning_company_id,owning_branch_id,confidentiality_level').eq('id',s.document_id).is('deleted_at',null).maybeSingle());
  if(d.error)throw Error('Linked intake authority unavailable');if(!d.data)return false;
  const doc=z.object({owning_company_id:id,owning_branch_id:id.nullable(),confidentiality_level:z.string()}).parse(d.data);
  try{requireDmsNoticeAccess(ctx,doc);}catch{return false;}
  if(!await notificationDocumentSubjectsAllowed(ctx,s.document_id))return false;
  authorityCompany=doc.owning_company_id;authorityBranch=doc.owning_branch_id;
 }
 const permits=(code:string)=>authorityCompany===null?hasGlobalPermission(ctx,code):hasPermissionInScope(ctx,code,authorityCompany,authorityBranch);
 if(!reviewCaps.some(permits)||!(permits('dms.documents.review_ai')||permits('dms.admin')||(s.uploaded_by===ctx.profile?.id&&permits('dms.documents.upload'))))return false;
 let kind=s.origin_entity_type,subject=s.origin_entity_id;
 if(kind===null&&s.batch_id!==null){
  const b=await boundedQuery(db.from('dms_upload_batches').select('entity_type,entity_id,owning_company_id,owning_branch_id').eq('id',s.batch_id).is('deleted_at',null).maybeSingle());
  if(b.error)throw Error('Upload origin unavailable');if(!b.data||b.data.owning_company_id!==s.owning_company_id||b.data.owning_branch_id!==s.owning_branch_id)return false;
  const parsed=z.object({entity_type:z.string().nullable(),entity_id:id.nullable()}).parse(b.data);kind=parsed.entity_type;subject=parsed.entity_id;
 }
 if(kind===null)return true;
 if(subject===null)return false;
 let company:number|null=null,branch:number|null=null;
 if(kind==='employee'||kind==='employee_dependent'){
  let employee=subject;
  if(kind==='employee_dependent'){
   const d=await boundedQuery(db.from('employee_dependents').select('employee_id').eq('id',subject).eq('is_active',true).is('deleted_at',null).maybeSingle());
   if(d.error)throw Error('Dependent origin unavailable');if(!d.data)return false;employee=id.parse(d.data.employee_id);
  }
  try{const a=await getEmployeeAccess(ctx,employee);if(kind==='employee_dependent'&&!a.allows('hr.compliance.view'))return false;company=a.subject.owner_company_id;branch=a.subject.branch_id;}
  catch(error){if(error instanceof Error&&error.message==='Employee unavailable or access denied')return false;throw error;}
 }else if(kind==='company'||kind==='branch'||kind==='site'){
  if(kind==='site'&&!['common_md.view','common_md.work_sites.view'].some(c=>hasPermission(ctx,c)))return false;
  const q=db.from(kind==='company'?'owner_companies':kind==='branch'?'branches':'work_sites').select(kind==='company'?'id':'owner_company_id,'+(kind==='branch'?'id':'branch_id')).eq('id',subject).eq('status','active');
  if(kind==='site')q.is('deleted_at',null);
  const origin=await boundedQuery(q.maybeSingle());if(origin.error)throw Error('Organizational origin unavailable');if(!origin.data)return false;
  const data=z.record(z.string(),z.unknown()).parse(origin.data);
  company=id.parse(kind==='company'?data.id:data.owner_company_id);branch=kind==='company'?null:id.nullable().parse(kind==='branch'?data.id:data.branch_id);
 }else if(kind==='party'){
  if(!['master_data.parties.view','master_data.party_master.view'].some(c=>hasPermission(ctx,c)))return false;
  const p=await boundedQuery(db.from('parties').select('id').eq('id',subject).eq('is_active',true).eq('is_locked',false).maybeSingle());
  if(p.error)throw Error('Party origin unavailable');return !!p.data;
 }else return false;
 return company!==null&&company===s.owning_company_id&&branch===s.owning_branch_id;
}
