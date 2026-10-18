import {beforeEach,expect,it,vi} from 'vitest';
const s=vi.hoisted(()=>({rpc:vi.fn(),result:{} as {data?:unknown;error?:unknown},tables:[] as string[],queries:[] as string[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:s.rpc,from:(table:string)=>{s.tables.push(table);const q:Record<string,unknown>={};for(const m of ['eq','is'])q[m]=()=>q;q.select=(fields:string)=>{s.queries.push(fields);return q;};q.maybeSingle=async()=>s.result;return q;}})}));
import {readNotificationTaskContext} from '@/server/notification-task-context';
const parent='/admin/hr/employees/record/7';
beforeEach(()=>{vi.clearAllMocks();s.tables=[];s.queries=[];s.result={data:{id:12,approval_status:'approved'},error:null};s.rpc.mockResolvedValue({data:parent+'?task=leave&task_id=12',error:null});});
it('loads exact currently authorized leaf and its current state, not notification metadata',async()=>{
 expect(await readNotificationTaskContext(parent,'leave','12')).toMatchObject({id:12,label:'Leave request',section:'time',status:'approved',path:parent+'?task=leave&task_id=12'});
 expect(s.tables).toEqual(['employee_leave_requests']);expect(s.queries).toEqual(['id,approval_status']);
});
it('a changed parent relationship or revoked authority cannot be acknowledged',async()=>{
 s.rpc.mockResolvedValue({data:'/admin/hr/employees/record/8?task=leave&task_id=12',error:null});expect(await readNotificationTaskContext(parent,'leave','12')).toBe(null);expect(s.tables).toEqual([]);
});
it.each([['__proto__','12'],['salary','0'],['leave','12&redirect=x'],['unknown','12'],['leave','9007199254740992']])('rejects unsupported source or malformed id %s %s',async(task,id)=>{
 expect(await readNotificationTaskContext(parent,task,id)).toBe(null);expect(s.rpc).not.toHaveBeenCalled();
});
it('missing or unreadable leaf is not successful opening',async()=>{
 for(const result of [{data:null,error:null},{data:{id:13,approval_status:'approved'},error:null},{data:{id:12,approval_status:'approved'},error:{code:'42501'}}]){s.result=result;expect(await readNotificationTaskContext(parent,'leave','12')).toBe(null);}
});
it('salary context never selects salary values or personal reasons',async()=>{
 s.rpc.mockResolvedValue({data:parent+'?task=salary&task_id=12',error:null});s.result={data:{id:12},error:null};
 expect(await readNotificationTaskContext(parent,'salary','12')).toMatchObject({status:'recorded',section:'payroll'});expect(s.queries).toEqual(['id']);
});
