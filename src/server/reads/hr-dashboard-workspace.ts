import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasPermission,hasPermissionInScope,hasGlobalPermission,type AuthContext} from '@/lib/rbac/check';
import {collectCompletePages} from '@/lib/reads/complete-pages';
import {readPayrollReadinessFacts} from './payroll-readiness-facts';
import {hrDashboardCalendar,HR_ACTIVE_CANDIDATE_STATES,HR_PENDING_ONBOARDING_STATES,HR_OPEN_EOS_STATES,HR_OPEN_ACTION_STATES} from '@/lib/hr/dashboard-metrics';
import {DASHBOARD_DEFINITIONS,dashboardRequestSchema,dashboardResponseSchema,type DashboardDefinition,type DashboardMetric,type DashboardRow,type DashboardResponse} from '@/lib/hr/dashboard-workspace';

type Result={data:unknown;error:unknown;count:number|null};
interface Query extends PromiseLike<Result> {
 eq(key:string,value:unknown):Query;neq(key:string,value:unknown):Query;is(key:string,value:null):Query;
 in(key:string,values:readonly unknown[]):Query;lt(key:string,value:unknown):Query;lte(key:string,value:unknown):Query;gte(key:string,value:unknown):Query;
 or(value:string):Query;order(key:string):Query;range(from:number,to:number):Query;abortSignal(signal:AbortSignal):Query;
}
const id=z.number().int().positive().refine(Number.isSafeInteger);
const rowSchema=z.object({id}).catchall(z.unknown());
type Row=z.infer<typeof rowSchema>;
const employeeSchema=z.object({id,employee_code:z.string().nullable(),full_name_en:z.string(),employee_status:z.string(),joining_date:z.string().nullable(),owner_company_id:id.nullable(),branch_id:id.nullable(),department_id:id.nullable(),employee_category_id:id.nullable(),primary_work_site_id:id.nullable()}).strip();
type Employee=z.infer<typeof employeeSchema>;
const integer=(value:unknown)=>id.parse(value);
const text=(value:unknown)=>typeof value==='string'?value:'';
const chunks=(ids:number[])=>Array.from({length:Math.ceil(ids.length/200)},(_,i)=>ids.slice(i*200,i*200+200));
const emptyOptions={companies:[],branches:[],departments:[],sites:[]};
const ready=(value:number,items:DashboardRow[]=[]):DashboardMetric=>({status:'ready',value,items});
const unavailable=(reason:string):DashboardMetric=>({status:'unavailable',items:[],reason});

/** Read-only authenticated composition. No elevated client, SQL/RLS changes or mutations.
 * Count and drill-down use the very same definition/predicate and validated scope.
 * Collections are count-checked and bounded; overflow/failure is never returned as zero. */
export async function readHrDashboardWorkspace(input:unknown,context?:AuthContext,signal?:AbortSignal):Promise<{success:boolean;data?:DashboardResponse;error?:string}> {
 const parsed=dashboardRequestSchema.safeParse(input);
 if(!parsed.success)return {success:false,error:'Invalid HR dashboard request'};
 const request=parsed.data;
 if(request.mode==='records'&&!DASHBOARD_DEFINITIONS.some(d=>d.key===request.metric))return {success:false,error:'Invalid dashboard metric'};
 try {
  const ctx=context??await getAuthContext();
  const can=(permission:string)=>hasPermission(ctx,`hr.${permission}.view`);
  if(!can('dashboard')&&!can('employees'))return {success:false,error:'Permission denied'};
  const db=await createClient();
  const select=(table:string,columns:string,head=false):Query=>{
   const query=db.from(table).select(columns,{count:'exact',head}) as unknown as Query;
   return signal?query.abortSignal(signal):query;
  };
  const complete=async <S extends z.ZodType<{id:number}>>(query:()=>Query,schema:S)=>collectCompletePages(async(from,to)=>{
   const result=await query().range(from,to);
   if(result.error)throw Error('Dashboard read unavailable');
   return {...result,data:z.array(schema).parse(result.data)};
  },{identity:r=>r.id,maxRows:50000,signal});
  const now=new Date(),scope=request.scope;
  const calendar=hrDashboardCalendar(scope.date?new Date(`${scope.date}T12:00:00+04:00`):now,Number(scope.expiryDays));
  const {today,soon,month}=calendar;
  const result:DashboardResponse={mode:request.mode,scope,asOf:now.toISOString(),page:request.page,metric:request.metric,metrics:{}};
  if(request.mode==='options') {
   const tables=[['companies','owner_companies','company_code',null],['branches','branches','branch_name_en','owner_company_id'],['departments','departments','department_name_en','owner_company_id'],['sites','work_sites','site_name','owner_company_id']] as const;
   const entries=await Promise.all(tables.map(async([key,table,label,parent])=>{
    const rows=await complete(()=>{
     let q=select(table,`id,${label}${parent?`,${parent}`:''}`);
     if(table==='departments'||table==='work_sites')q=q.is('deleted_at',null);
     return q.order('id');
    },rowSchema);
    return [key,rows.map(r=>({id:r.id,label:z.string().parse(r[label]),...(parent?{companyId:id.nullable().parse(r[parent])}:{})}))];
   }));
   result.options={...emptyOptions,...Object.fromEntries(entries)};
   return {success:true,data:dashboardResponseSchema.parse(result)};
  }
  const scopeQuery=(q:Query)=>{
   for(const [key,column] of [['companyId','owner_company_id'],['branchId','branch_id'],['departmentId','department_id']] as const)if(scope[key]!==undefined)q=q.eq(column,scope[key]);
   return q;
  };
  const employees=await complete(()=>{
   let q=scopeQuery(select('employees','id,employee_code,full_name_en,employee_status,joining_date,owner_company_id,branch_id,department_id,employee_category_id,primary_work_site_id').is('deleted_at',null));
   if(scope.siteId!==undefined)q=q.eq('primary_work_site_id',scope.siteId);
   return q.order('id');
  },employeeSchema);
  const active=employees.filter(e=>['active','probation','on_leave'].includes(e.employee_status));
  const employeeMap=new Map(employees.map(e=>[e.id,e]));
  const covers=(permission:string)=>hasGlobalPermission(ctx,`hr.${permission}.view`)||active.every(e=>e.owner_company_id!==null&&hasPermissionInScope(ctx,`hr.${permission}.view`,e.owner_company_id,e.branch_id));
  const scoped=scope.companyId!==undefined||scope.branchId!==undefined||scope.departmentId!==undefined||scope.siteId!==undefined;
  const memo=new Map<string,Promise<Row[]>>();
  const cached=(key:string,read:()=>Promise<Row[]>)=>{if(!memo.has(key))memo.set(key,read());return memo.get(key)!;};
  const requisitions=()=>cached('requisitions',()=>complete(()=>{
   let q=scopeQuery(select('hr_job_requisitions','id').is('deleted_at',null));
   if(scope.siteId!==undefined)q=q.eq('work_site_id',scope.siteId);
   return q.order('id');
  },rowSchema));
  const candidates=()=>cached('candidates',async()=>{
   const batches=scoped?chunks((await requisitions()).map(r=>r.id)):[null];const rows:Row[]=[];
   for(const ids of batches)rows.push(...await complete(()=>{
    let q=select('hr_candidates','id').is('deleted_at',null);
    if(ids)q=q.in('requisition_id',ids);return q.order('id');
   },rowSchema));
   return rows;
  });
  const subjectRows=(table:string,columns:string,modify:(q:Query)=>Query,softDelete=true)=>cached(table+columns,async()=>{
   const rows:Row[]=[];
   for(const ids of chunks(active.map(e=>e.id)))rows.push(...await complete(()=>{
    let q=select(table,`id,employee_id,${columns}`).in('employee_id',ids);
    if(softDelete)q=q.is('deleted_at',null);return modify(q).order('id');
   },rowSchema));
   return rows;
  });
  const employeeItem=(e:Employee,section='profile',detail=e.employee_status):DashboardRow=>({key:`employee-${e.id}`,label:can('employees')?e.full_name_en:'Employee record',reference:can('employees')?e.employee_code??'Employee': 'Employee',detail,date:null,href:`/admin/hr/employees/record/${e.id}?section=${section}`});
  const pageSize=request.mode==='records'?25:5;
  const offset=request.mode==='records'?(request.page-1)*25:0;
  const people=(rows:Employee[],section='profile',detail?:string)=>ready(rows.length,rows.slice(offset,offset+pageSize).map(e=>employeeItem(e,section,detail)));
  const custom=async(d:DashboardDefinition):Promise<DashboardMetric|null>=>{
   if(d.key==='workforce')return people(active);
   if(d.key==='joiners')return people(employees.filter(e=>e.joining_date!==null&&e.joining_date>=month&&e.joining_date<=today));
   if(d.key==='probation')return people(employees.filter(e=>e.employee_status==='probation'));
   if(['attendance_entered','attendance_missing','leave_today','payroll_missing'].includes(d.key)) {
    if(!covers(d.key==='leave_today'?'leave':d.key==='payroll_missing'?'payroll':'attendance'))return unavailable('The selected employee scope is not fully covered by this permission.');
    const rows=d.key==='leave_today'?await subjectRows('employee_leave_requests','start_date,end_date',q=>q.eq('approval_status','approved').lte('start_date',today).gte('end_date',today)):
     d.key==='payroll_missing'?await subjectRows('employee_payroll_profiles','id',q=>q):
     await subjectRows('employee_attendance_daily_summary','attendance_date',q=>q.eq('attendance_date',today),false);
    const ids=new Set(rows.map(r=>integer(r.employee_id)));
    return people(active.filter(e=>['attendance_missing','payroll_missing'].includes(d.key)?!ids.has(e.id):ids.has(e.id)),d.section,d.label);
   }
   if(['wps_ready','wps_incomplete','missing_iban'].includes(d.key)) {
    if(!covers('payroll')||!covers('banking'))return unavailable('Payroll and banking access must cover the selected employees.');
    const facts=await cached('payroll-facts',async()=>{
     const rows:Row[]=[];for(const ids of chunks(active.map(e=>e.id)))rows.push(...(await readPayrollReadinessFacts(db,ids,today)).map(r=>({...r,id:r.employee_id})));return rows;
    });
    const ids=new Set(facts.filter(r=>d.key==='wps_ready'?r.readiness_status==='ready':d.key==='missing_iban'?r.missing_iban===true:r.has_wps_profile===true&&['incomplete','on_hold'].includes(text(r.readiness_status))).map(r=>r.id));
    return people(active.filter(e=>ids.has(e.id)),'payroll',d.label);
   }
   return null;
  };
  const predicate=(q:Query,key:string)=>{
   switch(key) {
    case 'attendance_pending':return q.eq('attendance_date',today).eq('approval_status','pending');
    case 'missing_punches':return q.eq('attendance_date',today).eq('is_missing_punch',true);
    case 'leave_pending':return q.eq('approval_status','pending');
    case 'leave_upcoming':return q.eq('approval_status','approved').gte('start_date',calendar.future(1)).lte('start_date',calendar.future(30));
    case 'overtime':return q.eq('approval_status','pending');
    case 'expired':return q.lt('expiry_date',today);
    case 'expiring':return q.gte('expiry_date',today).lte('expiry_date',soon);
    case 'cards_due':case 'training_due':return q.lte('expiry_date',soon);
    case 'unverified':return q.in('verification_status',['unverified','failed']);
    case 'candidates':return q.in('candidate_status',HR_ACTIVE_CANDIDATE_STATES);
    case 'requisitions':return q.eq('requisition_status','open');
    case 'interviews':return q.eq('interview_status','scheduled').gte('interview_datetime',calendar.weekStartInstant).lt('interview_datetime',calendar.nextWeekInstant);
    case 'offers':return q.eq('offer_status','sent');
    case 'offers_accepted':return q.eq('offer_status','accepted');
    case 'onboarding':return q.in('task_status',HR_PENDING_ONBOARDING_STATES);
    case 'payroll_holds':return q.eq('is_active',true);
    case 'salary_pending':return q.eq('status','pending');
    case 'assignments':return q.eq('assignment_status','active').lte('effective_from',today).or(`effective_to.is.null,effective_to.gte.${today}`);
    case 'blocks':return q.eq('block_status','active').lte('effective_from',today).or(`effective_to.is.null,effective_to.gte.${today}`);
    case 'readiness':return q.neq('readiness_status','ready');
    case 'pro':return q.in('process_status',['draft','requested','in_progress','waiting_for_document','submitted','approved']);
    case 'approvals':return q.eq('request_status','pending');
    case 'clearance':return q.eq('item_status','pending');
    case 'actions':return q.in('action_status',HR_OPEN_ACTION_STATES);
    case 'eos':return q.in('case_status',HR_OPEN_EOS_STATES);
    case 'disciplinary':return q.in('status',['open','under_review']);
    case 'assets':return q.eq('status','issued');
    case 'ppe':return q.lt('expiry_or_replacement_date',today).is('returned_date',null);
    case 'accommodation':return q.eq('status','active');
    default:throw Error('Unknown dashboard predicate');
   }
  };
  const run=async(d:DashboardDefinition):Promise<DashboardMetric>=>{
   if(!d.permission.every(can))return {status:'restricted',items:[]};
   try {
    const value=await custom(d);if(value)return value;
    if(!d.table)throw Error('Dashboard definition missing');
    const base=(head=false)=>{
     const documentColumn=d.table==='employee_identity_documents'?'document_number':d.table==='employee_access_cards'?'card_number':d.table==='employee_training_certificates'?'certificate_number':'';
     const columns=[...new Set([d.idColumn?`id:${d.idColumn}`:'id',d.scope==='employees'||d.scope==='active'?'employee_id':'',d.columns,d.statusColumn,d.dateColumn,documentColumn].filter(Boolean))].join(',');
     let q=select(d.table!,columns,head);
     if(d.softDelete!==false)q=q.is('deleted_at',null);
     if(d.scope==='requisition'||d.scope==='offer')q=scopeQuery(q);
     if(scope.siteId!==undefined&&d.scope==='requisition')q=q.eq('work_site_id',scope.siteId);
     return predicate(q,d.key);
    };
    type Batch={column?:string;ids?:number[];employeeOnly?:boolean};
    let batches:Batch[]=[{}];
    if(d.scope==='employees'||d.scope==='active')batches=chunks((d.scope==='active'?active:employees).map(e=>e.id)).map(ids=>({column:'employee_id',ids}));
    if(scoped&&d.scope==='candidate')batches=chunks((await requisitions()).map(r=>r.id)).map(ids=>({column:'requisition_id',ids}));
    if(scoped&&d.scope==='interview')batches=chunks((await candidates()).map(r=>r.id)).map(ids=>({column:'candidate_id',ids}));
    if(scope.siteId!==undefined&&d.scope==='offer')batches=chunks((await requisitions()).map(r=>r.id)).map(ids=>({column:'requisition_id',ids}));
    if(scoped&&d.scope==='onboarding')batches=[...chunks((await candidates()).map(r=>r.id)).map(ids=>({column:'candidate_id',ids})),...chunks(employees.map(e=>e.id)).map(ids=>({column:'employee_id',ids,employeeOnly:true}))];
    let total=0;const selected:Row[]=[];
    for(const batch of batches) {
     const query=(head=false)=>{let q=base(head);if(batch.column&&batch.ids)q=q.in(batch.column,batch.ids);if(batch.employeeOnly)q=q.is('candidate_id',null);return q.order(d.idColumn??'id');};
     // Stable batch/id order permits true paging without collecting every child record.
     const from=Math.max(0,offset-total),needed=pageSize-selected.length;
     // First-page overview gets both the exact count and preview in one request.
     // Later pages count first, avoiding PostgREST's out-of-range response on skipped batches.
     const preview=offset===0&&needed>0;
     const counted=preview?await query().range(0,needed-1):await query(true);
     if(counted.error||counted.count===null||!Number.isSafeInteger(counted.count)||counted.count<0)throw Error('Count unavailable');
     if(needed>0&&from<counted.count){
      const r=preview?counted:await query().range(from,from+needed-1);
      if(r.error||r.count!==counted.count)throw Error('Records changed while reading');
      const rows=z.array(rowSchema).parse(r.data);
      const expected=Math.min(needed,counted.count-from);
      if(rows.length!==expected||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Partial dashboard page');
      selected.push(...rows);
     }
     total+=counted.count;
     if(!Number.isSafeInteger(total))throw Error('Count overflow');
    }
    const items=selected.map((r):DashboardRow=>{
     const detail=text(r[d.statusColumn??'']).replaceAll('_',' ')||d.label;
     const date=text(r[d.dateColumn??''])||null;
     if(d.scope==='employees'||d.scope==='active') {
      const employee=employeeMap.get(integer(r.employee_id));if(!employee)throw Error('Unmatched dashboard employee');
      const item=employeeItem(employee,d.section,detail);
      return {...item,key:`${d.key}-${r.id}`,date,detail:[text(r.document_number)||text(r.card_number)||text(r.certificate_number)||text(r.approval_type)||text(r.item_title)||text(r.action_title),detail].filter(Boolean).join(' · ')};
     }
     if(d.scope==='candidate')return {key:`candidate-${r.id}`,label:z.string().parse(r.full_name_en),reference:text(r.candidate_code)||'Candidate',detail,date,href:`/admin/hr/recruitment/candidates/record/${r.id}`};
     const candidateId=r.candidate_id==null?null:integer(r.candidate_id);
     const employeeId=r.employee_id==null?null:integer(r.employee_id);
     return {key:`${d.key}-${r.id}`,label:text(r.task_title)||text(r.requisition_title)||d.label,reference:text(r.requisition_code)||d.label,detail,date,
      href:candidateId?`/admin/hr/recruitment/candidates/record/${candidateId}`:employeeId?`/admin/hr/employees/record/${employeeId}?section=hr-actions`:d.scope==='requisition'?'/admin/hr/recruitment/requisitions':'/admin/hr/recruitment/onboarding'};
    });
    return ready(total,items);
   }catch(error){if(signal?.aborted)throw error;return {status:'failed',items:[]};}
  };
  const definitions=request.mode==='records'?DASHBOARD_DEFINITIONS.filter(d=>d.key===request.metric):DASHBOARD_DEFINITIONS;
  // Four concurrent read groups at most; do not flood the shared database.
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,definitions.length)},async()=>{while(cursor<definitions.length){const d=definitions[cursor++];result.metrics[d.key]=await run(d);}}));
  if(request.mode==='overview'&&can('employees')) {
   result.charts=[];
   for(const [key,label,column,table,name] of [['company','Workforce by company','owner_company_id','owner_companies','company_code'],['department','Workforce by department','department_id','departments','department_name_en'],['category','Workforce by category','employee_category_id','hr_employee_categories','name_en'],['site','Workforce by primary site','primary_work_site_id','work_sites','site_name']] as const) {
    try {
     const counts=new Map<number|null,number>();active.forEach(e=>counts.set(e[column],(counts.get(e[column])??0)+1));
     const ids=[...counts.keys()].filter((v):v is number=>v!==null);const names=new Map<number,string>();
     for(const batch of chunks(ids))for(const r of await complete(()=>select(table,`id,${name}`).in('id',batch).order('id'),rowSchema))names.set(r.id,z.string().parse(r[name]));
     result.charts.push({key,label,items:[...counts].map(([id,value])=>({label:id===null?'Not assigned':names.get(id)??'Name unavailable',value})).sort((a,b)=>b.value-a.value)});
    } catch { /* Omit only this failed chart; the UI explicitly reports it unavailable. */ }
   }
  }
  signal?.throwIfAborted();
  return {success:true,data:dashboardResponseSchema.parse(result)};
 }catch{return {success:false,error:'HR dashboard could not be loaded'};}
}
