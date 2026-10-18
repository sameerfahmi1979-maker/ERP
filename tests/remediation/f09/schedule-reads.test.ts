import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const m=vi.hoisted(()=>({ctx:vi.fn(),user:vi.fn(),admin:vi.fn(),userResults:[] as unknown[],labelResults:[] as unknown[],calls:[] as unknown[][]}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.user}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
import {readReportSchedules} from '@/server/reads/report-schedules';
const row={id:7,report_id:2,created_by:1,owner_company_id:1,schedule_code:'SCH-7',schedule_name:'Synthetic schedule',frequency:'daily',output_format:'csv',recipient_to:['synthetic@example.invalid'],next_run_at:'2099-01-01T03:00:00Z',last_run_at:null,last_status:null,is_active:false,timezone:'Asia/Dubai',updated_at:'2026-10-18T00:00:00Z',workspace_revision:1};
const label={id:2,report_code:'SYNTHETIC',report_name_en:'Synthetic report',module_code:'SYSTEM',supports_scheduling:true};
function database(kind:'user'|'label'){
 return {from:(...args:unknown[])=>{m.calls.push([kind,'from',...args]);const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve((kind==='user'?m.userResults:m.labelResults).shift()).then(resolve)};for(const method of ['select','is','eq','or','in','order','range','abortSignal'])q[method]=(...args:unknown[])=>{m.calls.push([kind,method,...args]);return q;};return q;}};
}
beforeEach(()=>{vi.clearAllMocks();m.calls=[];m.userResults=[];m.labelResults=[];m.ctx.mockResolvedValue(syntheticAuthContext(['reports.schedule.view']));m.user.mockResolvedValue(database('user'));m.admin.mockImplementation(()=>database('label'));});
afterEach(()=>{m.userResults=[];m.labelResults=[];});
it('reads a complete scoped page above the old 1000-row ceiling',async()=>{
 m.userResults=[{data:[row],count:1101,error:null}];m.labelResults=[{data:[label],error:null}];const r=await readReportSchedules({page:12,pageSize:100});expect(r.success).toBe(true);expect(r.data?.totalCount).toBe(1101);expect(m.calls).toContainEqual(['user','range',1100,1199]);expect(m.calls).toContainEqual(['label','in','id',[2]]);
});
it('loads catalog labels only for already RLS-admitted rows and excludes form wording',async()=>{
 m.userResults=[{data:[{...row,email_body_template:'PRIVATE',filters_json:{secret:'PRIVATE'}}],count:1,error:null}];m.labelResults=[{data:[label],error:null}];const r=await readReportSchedules({});expect(r.success).toBe(true);expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(String(m.calls.find(c=>c[0]==='user'&&c[1]==='select')?.[2])).not.toMatch(/\*|email_body|filters_json|recipient_cc/);
});
it('filters and sorts before paging with a stable ID tie breaker',async()=>{
 m.userResults=[{data:[],count:0,error:null}];expect((await readReportSchedules({frequency:'weekly',isActive:'inactive',lastStatus:'failed',search:'x%,id.gt.0',sorting:[{id:'next_run_at',desc:false}]})).success).toBe(true);expect(m.calls).toContainEqual(['user','eq','frequency','weekly']);expect(m.calls).toContainEqual(['user','eq','is_active',false]);expect(m.calls).toContainEqual(['user','order','id',{ascending:true}]);expect(m.admin).not.toHaveBeenCalled();
});
it('denied or inactive principals never start schedule or admin reads',async()=>{
 for(const ctx of [syntheticAuthContext([]),{...syntheticAuthContext(['reports.schedule.view']),isAccountActive:false}]){m.ctx.mockResolvedValue(ctx);expect((await readReportSchedules({})).success).toBe(false);}expect(m.user).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
});
it.each([{page:0},{pageSize:101},{search:'x'.repeat(201)},{sorting:[{id:'email_body_template',desc:false}]},{isActive:'true'},{companyId:9}])('rejects invalid criteria before authentication: %j',async input=>{
 expect((await readReportSchedules(input)).success).toBe(false);expect(m.ctx).not.toHaveBeenCalled();expect(m.user).not.toHaveBeenCalled();
});
it.each([{data:[row],count:2,error:null},{data:[row,row],count:2,error:null},{data:null,count:null,error:{message:'PRIVATE'}}])('incomplete pages and errors cannot become successful empty results',async result=>{
 m.userResults=[result];m.labelResults=[{data:[label],error:null}];const r=await readReportSchedules({});expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('label failures remain visible rather than inventing report identities',async()=>{
 m.userResults=[{data:[row],count:1,error:null}];m.labelResults=[{data:null,error:{message:'PRIVATE'}}];expect((await readReportSchedules({})).success).toBe(false);
});
it('a verified out-of-range page recounts with the same criteria',async()=>{
 m.userResults=[{data:null,count:null,status:416,error:{code:'PGRST103'}},{data:null,count:1100,error:null}];const r=await readReportSchedules({page:12,pageSize:100});expect(r).toMatchObject({success:true,data:{totalCount:1100,rows:[]}});expect(m.admin).not.toHaveBeenCalled();
});
it('an unverified recount cannot hide rows that should exist',async()=>{
 m.userResults=[{data:null,count:null,status:416,error:{code:'PGRST103'}},{data:null,count:1101,error:null}];expect((await readReportSchedules({page:12,pageSize:100})).success).toBe(false);
});
it('an aborted request performs no authentication or database work',async()=>{
 const c=new AbortController();c.abort();await expect(readReportSchedules({},c.signal)).rejects.toMatchObject({name:'AbortError'});expect(m.ctx).not.toHaveBeenCalled();
});
