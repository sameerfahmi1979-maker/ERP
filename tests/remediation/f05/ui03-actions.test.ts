import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),admin:vi.fn(),permit:vi.fn(),delivery:vi.fn(),audit:vi.fn(),cache:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:m.permit,hasGlobalPermission:m.permit,hasPermissionInScope:m.permit}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/email/queue/policy',()=>({requireReportDelivery:m.delivery,requireQueuePermission:m.delivery}));
vi.mock('@/lib/report-center/schedule-execution',()=>({calculateNextRunAt:()=> '2099-01-01T03:00:00Z',loadDeliverableSchedule:vi.fn()}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {createReportSchedule,updateReportSchedule} from '@/server/actions/reports/schedules';
import {activateNotificationTemplate,deactivateNotificationTemplate,updateNotificationTemplate} from '@/server/actions/notifications/templates';
import {getEmailAttemptHistory} from '@/server/actions/notifications/email-attempts';
type Result={data:unknown;error?:null|{code?:string;message?:string}};
function database(results:Result[]){
 const writes:unknown[]=[], reads:string[]=[];
 const builder:Record<string,unknown>={};
 for(const name of ['select','eq','is','order','limit','maybeSingle','single'])builder[name]=vi.fn((...args:unknown[])=>{if(name==='select')reads.push(String(args[0]));return builder;});
 for(const name of ['insert','update'])builder[name]=vi.fn((value:unknown)=>{writes.push(value);return builder;});
 builder.then=(ok:(r:Result)=>unknown)=>Promise.resolve(results.shift()??{data:null,error:null}).then(ok);
 return {from:vi.fn(()=>builder),writes,reads};
}
const registry={data:{id:7,required_permissions:[],supports_scheduling:true,document_class:'E'}};
const input={requestId:'81336f9a-2460-4dc2-9540-51e01c878a82',reportCode:'SYNTHETIC',scheduleName:'Synthetic',ownerCompanyId:1,outputFormat:'csv' as const,recipientTo:['qa@example.invalid'],recipientCc:[],frequency:'daily' as const,filtersJson:{},timeOfDay:'07:00',timezone:'Asia/Dubai',isActive:false};
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:5}});m.permit.mockReturnValue(true);m.audit.mockResolvedValue(undefined);m.admin.mockReturnValue(database([registry]));});
it('a failure after a committed schedule insert retains uncertain request identity',async()=>{
 const db=database([{data:{id:12}}]);m.client.mockResolvedValue(db);m.audit.mockRejectedValue(new Error('private audit diagnostic'));
 const result=await createReportSchedule(input);expect(result.success).toBe(false);expect(result.uncertain).toBe(true);expect(result.error).not.toContain('private');expect(db.writes).toHaveLength(1);
});
it('a duplicate request returns the exact existing schedule after response loss',async()=>{
 const first=database([{data:{id:12}}]);m.client.mockResolvedValue(first);await createReportSchedule(input);
 const prior={...first.writes[0] as object,id:12,deleted_at:null,time_of_day:'07:00:00'};
 m.admin.mockReturnValue(database([registry]));const retry=database([{data:null,error:{code:'23505'}},{data:prior}]);m.client.mockResolvedValue(retry);
 expect(await createReportSchedule(input)).toEqual({success:true,data:{id:12}});
});
it('same request with changed payload does not pretend the old save succeeded',async()=>{
 m.client.mockResolvedValue(database([{data:null,error:{code:'23505'}},{data:{id:12,created_by:5,deleted_at:null,schedule_name:'Different'}}]));
 expect(await createReportSchedule(input)).toMatchObject({success:false,uncertain:true});
});
it('denied delivery never reaches a schedule write',async()=>{
 const db=database([]);m.client.mockResolvedValue(db);m.delivery.mockImplementation(()=>{throw Error('denied');});expect((await createReportSchedule(input)).success).toBe(false);expect(db.writes).toHaveLength(0);
});
it('stale client revision is rejected before a schedule update',async()=>{
 const db=database([{data:{id:12,created_by:5,owner_company_id:1,updated_at:'2026-10-01T01:00:00Z',recipient_to:['qa@example.invalid'],recipient_cc:[]}}]);m.client.mockResolvedValue(db);
 expect(await updateReportSchedule({id:12,expectedUpdatedAt:'2026-09-30T01:00:00Z',scheduleName:'New'})).toMatchObject({success:false,error:expect.stringContaining('changed after')});expect(db.writes).toHaveLength(0);
});
it.each([[true,activateNotificationTemplate],[false,deactivateNotificationTemplate]] as const)('template active state %s is actually written',async(active,action)=>{
 const db=database([{data:{id:7}}]);m.client.mockResolvedValue(db);expect((await action(7)).success).toBe(true);expect(db.writes[0]).toMatchObject({is_active:active});
});
it('template zero-row update and database errors never report success',async()=>{
 for(const response of [{data:null},{data:null,error:{message:'private'}}]){m.client.mockResolvedValue(database([response]));expect((await deactivateNotificationTemplate(7)).success).toBe(false);}
 expect(m.audit).not.toHaveBeenCalled();
});
it('template mutation requires permission and strict validated fields',async()=>{
 const db=database([]);m.client.mockResolvedValue(db);m.permit.mockReturnValue(false);expect((await activateNotificationTemplate(7)).success).toBe(false);m.permit.mockReturnValue(true);
 expect((await updateNotificationTemplate(7,{unexpected:'field'} as never)).success).toBe(false);expect((await activateNotificationTemplate(-1)).success).toBe(false);expect(db.writes).toHaveLength(0);
});
it('attempt history rejects unauthorized users before creating an admin client',async()=>{
 m.delivery.mockImplementation(()=>{throw Error('denied');});expect((await getEmailAttemptHistory(12)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it('attempt history exposes only bounded event facts after queue authorization',async()=>{
 const db=database([{data:{id:12}},{data:[{id:1,event:'accepted',attempt_number:1,created_at:'2026-10-01T00:00:00Z'}]}]);m.admin.mockReturnValue(db);
 expect((await getEmailAttemptHistory(12)).success).toBe(true);expect(db.reads).toEqual(['id','id,attempt_number,event,created_at']);expect(db.writes).toHaveLength(0);
});
