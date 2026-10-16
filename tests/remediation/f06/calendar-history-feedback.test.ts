import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>db}));
import {saveWorkspaceRecord} from '@/server/workspace-save';
const contract={operationId:'0d028f75-3e6b-4f48-a14a-786bbd88a4cc',revision:'1'};
beforeEach(()=>vi.clearAllMocks());
it.each(['work_calendars','work_shifts'] as const)('%s explains immutable history without leaking database detail',async entity=>{
 db.rpc.mockResolvedValue({data:null,error:{code:'P0601',message:'private employee 987 assignment 654'}});
 const result=await saveWorkspaceRecord(entity,42,{},contract);
 expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(result.error).toContain(entity==='work_calendars'?'new calendar':'new shift');expect(result.error).not.toContain('987');expect(result.error).not.toContain('654');
});
it('does not mislabel a non-calendar failure as employee schedule history',async()=>{
 db.rpc.mockResolvedValue({data:null,error:{code:'P0601',message:'private unexpected detail'}});
 const result=await saveWorkspaceRecord('departments',42,{},contract);expect(result.success).toBe(false);expect(result.uncertain).toBe(false);expect(result.error).not.toContain('assignment');expect(result.error).not.toContain('private');
});
