import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {createClient} from '@/lib/supabase/server';
import {collectCompletePages} from '@/lib/reads/complete-pages';
import {employeeDate} from '@/lib/hr/employee-contract';
import {hrDashboardCalendar} from '@/lib/hr/dashboard-metrics';

const id=z.number().int().positive().refine(Number.isSafeInteger);
const dated=z.object({id,employee_id:id,expiry_date:employeeDate.nullable(),status:z.string().optional()}).strip();
const block=z.object({id,employee_id:id,block_status:z.string(),effective_from:employeeDate,effective_to:employeeDate.nullable()}).strip();
const check=z.object({id,employee_id:id,readiness_status:z.string(),checked_at:z.string()}).strip();
type Db=Pick<Awaited<ReturnType<typeof createClient>>,'from'>;
/** Read only permitted count/date/status facts, never document numbers, OCR,
 * clinical text, missing-requirement details, salary or account fields. Two
 * complete passes reject changed/capped/duplicate sources before an AI call. */
export async function readHrAiReviewFacts(db:Db,employeeId:number,kind:'compliance'|'readiness',medical=false) {
  id.parse(employeeId);
  const {today,soon}=hrDashboardCalendar();
  const rows=async<S extends z.ZodType<{id:number;employee_id:number}>>(table:string,columns:string,schema:S)=>collectCompletePages(async(from,to)=>{
    const r=await db.from(table).select(columns,{count:'exact'}).eq('employee_id',employeeId).is('deleted_at',null).order('id').range(from,to);
    const parsed=z.array(schema).safeParse(r.data);
    if(r.error||!parsed.success||parsed.data.some(v=>v.employee_id!==employeeId))throw Error('Complete authorized advisory facts unavailable');
    return {data:parsed.data,count:r.count,error:r.error};
  },{identity:r=>r.id,maxRows:10000});
  const load=async()=>kind==='compliance'?{
    kind:'compliance' as const,
    documents:await rows('employee_identity_documents','id,employee_id,expiry_date,status',dated),
    cards:await rows('employee_access_cards','id,employee_id,expiry_date,status',dated),
    training:await rows('employee_training_certificates','id,employee_id,expiry_date,status',dated),
    links:await rows('employee_document_links','id,employee_id',z.object({id,employee_id:id}).strip()),
    insurance:medical?await rows('employee_medical_insurances','id,employee_id,expiry_date,status',dated):null,
  }:{kind:'readiness' as const,blocks:await rows('employee_operational_blocks','id,employee_id,block_status,effective_from,effective_to',block),
    checks:await rows('employee_site_readiness','id,employee_id,readiness_status,checked_at',check)};
  const first=await load(),second=await load();
  if(JSON.stringify(first)!==JSON.stringify(second))throw Error('Advisory source facts changed; refresh before retrying');
  const sourceFingerprint=createHash('sha256').update(JSON.stringify({employeeId,kind,today,medical,first})).digest('hex');
  let text:string,overallStatus:'blocked'|'unknown'='unknown';
  if(first.kind==='compliance'){
    const expired=(r:typeof first.documents)=>r.filter(v=>v.expiry_date!==null&&v.expiry_date<today).length;
    const soonCount=first.documents.filter(v=>v.expiry_date!==null&&v.expiry_date>=today&&v.expiry_date<=soon).length;
    text=`Recorded permitted facts as of ${today} (Asia/Dubai). These are recorded evidence counts, not complete mandatory compliance or medical fitness.\nIdentity Documents: ${first.documents.length} total, ${expired(first.documents)} expired, ${soonCount} expiring within 60 days\nAccess Cards: ${first.cards.length} total, ${expired(first.cards)} expired\nTraining Certificates: ${first.training.length} total, ${expired(first.training)} expired\nDMS links: ${first.links.length}\nMedical Insurance: ${first.insurance===null?'[redacted — no medical permission]':`${first.insurance.length} total, ${expired(first.insurance)} expired`}`;
  }else{
    const active=first.blocks.filter(b=>b.block_status==='active'&&b.effective_from<=today&&(b.effective_to===null||b.effective_to>=today)).length;
    if(active)overallStatus='blocked';
    const counts:Record<string,number>={};for(const r of first.checks)counts[r.readiness_status]=(counts[r.readiness_status]??0)+1;
    text=`Recorded permitted facts as of ${today} (Asia/Dubai). Current active blocks: ${active}. Overall current readiness: ${overallStatus}.\nSaved site checks by recorded status: ${JSON.stringify(counts)}. Saved checks are historical, not current deployment authorization; missing requirements and clinical details are intentionally excluded. Revalidate current rules, evidence and independent deployment approval. Never infer readiness from employment status, absent blocks or saved ready labels.`;
  }
  return {asOf:today,sourceFingerprint,text,overallStatus};
}
