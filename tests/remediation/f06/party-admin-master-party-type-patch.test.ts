import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/server/party-type-save',()=>({savePartyType:m.save}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:vi.fn(),hasGlobalPermission:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {updatePartyType} from '@/server/actions/master-data/party-admin-masters';
const contract={operationId:'5e6a4fad-ad32-4c77-9774-78411fbdb954',revision:'2'};
beforeEach(()=>{vi.resetAllMocks();m.save.mockResolvedValue({success:true});});
it('party-type description-only action does not activate or reorder the row',async()=>{
 await updatePartyType(7,{description:'Changed'},contract);
 expect(m.save).toHaveBeenCalledWith(7,{description:'Changed'},contract);
});
it('party-type empty patch is rejected without an invented mutation',async()=>{
 expect((await updatePartyType(7,{},contract)).success).toBe(false);expect(m.save).not.toHaveBeenCalled();
});
