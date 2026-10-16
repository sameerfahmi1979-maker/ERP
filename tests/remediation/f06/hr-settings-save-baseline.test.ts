// Existing action behavior: the database is doubled to expose acceptance bugs.
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({audit:vi.fn(),update:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:1}}),hasPermission:()=>true,hasGlobalPermission:()=>true}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {updateHrGrade} from '@/server/actions/hr/settings';
beforeEach(()=>{vi.clearAllMocks();const query={eq:()=>query,is:()=>Promise.resolve({data:[],error:null})};m.update.mockReturnValue(query);m.client.mockResolvedValue({from:()=>({update:m.update})});});
it('does not report success for an unversioned missing-record update',async()=>{expect((await updateHrGrade(999999,{name_en:'Missing'})).success).toBe(false);expect(m.audit).not.toHaveBeenCalled();});
it('does not send protected identity fields directly to the database',async()=>{await updateHrGrade(1,{id:2,created_by:99,name_en:'Protected'} as never);expect(m.update).not.toHaveBeenCalled();});
it('does not send a whitespace-only name or fractional sort order to the database',async()=>{await updateHrGrade(1,{name_en:'  ',sort_order:1.5});expect(m.update).not.toHaveBeenCalled();});
