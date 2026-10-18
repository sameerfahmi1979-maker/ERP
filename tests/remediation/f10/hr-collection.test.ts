import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const s=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:s.auth}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:s.rpc})}));
import {generateHrComplianceExpiryNotifications} from '@/server/actions/hr/hr-compliance-notifications';
beforeEach(()=>{vi.clearAllMocks();s.auth.mockResolvedValue(syntheticAuthContext(['hr.compliance.manage']));s.rpc.mockResolvedValue({data:3,error:null});});
it('manual compatibility entry captures canonical events without claiming notifications sent',async()=>{
 const r=await generateHrComplianceExpiryNotifications();expect(r).toMatchObject({success:true,data:{events_recorded:3}});expect(s.rpc).toHaveBeenCalledWith('f10_collect_hr_expiry_events',{batch_limit:200});expect(r.data?.message).toContain('not a notification or email-delivery confirmation');
});
it('company-only compliance role cannot initiate a global collection',async()=>{
 s.auth.mockResolvedValue({...syntheticAuthContext(['hr.compliance.manage']),globalPermissionCodes:[]});expect((await generateHrComplianceExpiryNotifications()).success).toBe(false);expect(s.rpc).not.toHaveBeenCalled();
});
it.each([{withinDays:91},{withinDays:1},{limit:0},{limit:501},{limit:1.5}])('client cannot change cadence or bounds %j',async options=>{
 expect((await generateHrComplianceExpiryNotifications(options)).success).toBe(false);expect(s.rpc).not.toHaveBeenCalled();
});
it.each([null,-1,1.2,'3'])('malformed collection receipt %s is unconfirmed',async data=>{
 s.rpc.mockResolvedValue({data,error:null});expect((await generateHrComplianceExpiryNotifications()).success).toBe(false);
});
it('failed or lost collection response uses stable cycle reconciliation and hides internals',async()=>{
 s.rpc.mockRejectedValue(Error('PRIVATE_SOURCE'));const r=await generateHrComplianceExpiryNotifications();expect(r.success).toBe(false);expect(r.error).not.toContain('PRIVATE_SOURCE');
});
