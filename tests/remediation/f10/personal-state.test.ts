import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
import {changePersonalNotification,changePersonalDmsNotification,markAllPersonalNotificationsRead} from '@/server/notification-personal-state';
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({isAccountActive:true,profile:{id:1,must_change_password:false}});m.client.mockResolvedValue({rpc:m.rpc});});
describe('checked personal notification transitions',()=>{
 for(const state of ['read','dismissed','archived'])it('verifies exact receipt for '+state,async()=>{m.rpc.mockResolvedValue({data:{id:17,status:state},error:null});expect(await changePersonalNotification(17,state)).toEqual({success:true});expect(m.rpc).toHaveBeenCalledWith('f10_transition_my_notification',{notification_id:17,transition:state});});
 for(const id of [null,0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1',NaN])it('rejects invalid ID '+String(id),async()=>{expect((await changePersonalNotification(id,'read')).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 for(const data of [null,{id:18,status:'read'},{id:17,status:'archived'},{id:17,status:'read',extra:true}])it('does not invent success from malformed or mismatched receipt '+JSON.stringify(data),async()=>{m.rpc.mockResolvedValue({data,error:null});expect((await changePersonalNotification(17,'read')).success).toBe(false);});
 it('does not expose raw provider error',async()=>{m.rpc.mockResolvedValue({data:null,error:{message:'private backend secret'}});const r=await changePersonalNotification(17,'read');expect(r.success).toBe(false);expect(r.error).not.toContain('secret');});
 it('lost response remains unconfirmed',async()=>{m.rpc.mockRejectedValue(Error('connection lost'));expect((await changePersonalNotification(17,'read')).success).toBe(false);});
 it('inactive principal cannot call RPC',async()=>{m.auth.mockResolvedValue({isAccountActive:false,profile:{id:1}});expect((await changePersonalNotification(17,'read')).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('stale account/scope identity cannot bulk-read a replacement account',async()=>{
  m.auth.mockResolvedValue({isAccountActive:true,profile:{id:2},roleCodes:[],permissionCodes:[]});
  expect((await markAllPersonalNotificationsRead('old-owner-scope')).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
 });
 for(const count of [0,1,1251])it('all-pages receipt count '+count,async()=>{m.rpc.mockResolvedValue({data:count,error:null});expect(await markAllPersonalNotificationsRead()).toEqual({success:true,data:{count}});});
 for(const data of [null,-1,1.5,'3',NaN,Number.MAX_SAFE_INTEGER+1])it('rejects unverified bulk count '+String(data),async()=>{m.rpc.mockResolvedValue({data,error:null});expect((await markAllPersonalNotificationsRead()).success).toBe(false);});
 it('DMS personal action checks the exact source receipt',async()=>{m.rpc.mockResolvedValue({data:{id:17,status:'dismissed'},error:null});expect(await changePersonalDmsNotification(17,'dismissed')).toEqual({success:true});expect(m.rpc).toHaveBeenCalledWith('f10_transition_my_dms_notification',{dms_notification_id:17,transition:'dismissed'});});
 it('DMS no-match/mismatched receipt cannot become success',async()=>{m.rpc.mockResolvedValue({data:{id:18,status:'read'},error:null});expect((await changePersonalDmsNotification(17,'read')).success).toBe(false);});
});
