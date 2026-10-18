import 'server-only';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {literalContains} from '@/lib/reads/search';
import {reportSchedulesCriteriaSchema,reportSchedulesPageSchema} from '@/lib/reads/report-schedules-schema';
const fields='id,report_id,created_by,owner_company_id,schedule_code,schedule_name,frequency,output_format,recipient_to,next_run_at,last_run_at,last_status,is_active,timezone,updated_at,workspace_revision';
export async function readReportSchedules(input:unknown,signal?:AbortSignal){
 const parsed=reportSchedulesCriteriaSchema.safeParse(input);if(!parsed.success)return {success:false as const,error:'Invalid schedule criteria'};
 try{
  signal?.throwIfAborted();const ctx=await getAuthContext();signal?.throwIfAborted();
  if(!ctx.profile||!['reports.schedule.view','reports.schedule.manage'].some(p=>hasPermission(ctx,p)))return {success:false as const,error:'Permission denied'};
  const p=parsed.data,db=await createClient();signal?.throwIfAborted();
  const query=(head=false)=>{
   const q=db.from('erp_report_schedules').select(fields,{count:'exact',head}).is('deleted_at',null);if(signal)q.abortSignal(signal);
   if(p.frequency)q.eq('frequency',p.frequency);if(p.isActive)q.eq('is_active',p.isActive==='active');if(p.lastStatus)q.eq('last_status',p.lastStatus);
   if(p.search)q.or(['schedule_name','schedule_code'].map(f=>f+'.ilike.'+literalContains(p.search)).join(','));return q;
  };
  const offset=(p.page-1)*p.pageSize,q=query();for(const sort of p.sorting)q.order(sort.id,{ascending:!sort.desc,nullsFirst:false});if(!p.sorting.some(s=>s.id==='id'))q.order('id',{ascending:true});
  const result=await q.range(offset,offset+p.pageSize-1);signal?.throwIfAborted();let {data:rows,count,error}=result;
  if(offset>0&&result.status===416&&error?.code==='PGRST103'){
   const recount=await query(true);signal?.throwIfAborted();if(recount.error||recount.count===null||!Number.isSafeInteger(recount.count)||recount.count<0||recount.count>offset)throw Error('Count unavailable');rows=[];count=recount.count;error=null;
  }
  if(error||!Array.isArray(rows)||rows.length>p.pageSize)throw Error('Page unavailable');
  // Only label hydration for report IDs already admitted by caller RLS. Never
  // collect report data or use the admin client for schedule selection/counts.
  let labels:Array<{id:number;report_code:string;report_name_en:string;module_code:string;supports_scheduling:boolean|null}>=[];
  if(rows.length){
   const ids=[...new Set(rows.map(row=>row.report_id))];
   const labelQuery=createAdminClient().from('erp_report_registry').select('id,report_code,report_name_en,module_code,supports_scheduling').in('id',ids);if(signal)labelQuery.abortSignal(signal);
   const r=await labelQuery;signal?.throwIfAborted();if(r.error||!Array.isArray(r.data)||r.data.some(label=>!ids.includes(label.id)))throw Error('Labels unavailable');labels=r.data;
  }
  const data=reportSchedulesPageSchema.parse({page:p.page,pageSize:p.pageSize,totalCount:count,rows:rows.map(row=>({...row,report:labels.find(label=>label.id===row.report_id)??null}))});
  return {success:true as const,data,updatedAt:Date.now()};
 }catch{signal?.throwIfAborted();return {success:false as const,error:'Report schedules could not be loaded. Retry without changing the current draft.'};}
}
