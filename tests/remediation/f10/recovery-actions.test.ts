import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const s=vi.hoisted(()=>({ctx:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/rbac/check',async original=>({...await original<typeof import('@/lib/rbac/check')>(),getAuthContext:s.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:s.rpc})}));
import {inspectNotificationRecovery,retryHeldNotificationEvent} from '@/server/actions/notifications/recovery';
import {notificationReadIdentity} from '@/lib/reads/notifications-schema';
let identity:string;
const operation='b23ec154-aa22-44cc-8fee-2b954e9bf007';
beforeEach(()=>{vi.clearAllMocks();const ctx=syntheticAuthContext(['notifications.manage']);identity=notificationReadIdentity(ctx);s.ctx.mockResolvedValue(ctx);});
it('requires global authority and the exact current account/scope identity',async()=>{
 expect((await inspectNotificationRecovery('old-owner')).success).toBe(false);
 const ctx=syntheticAuthContext(['notifications.manage']);s.ctx.mockResolvedValue({...ctx,globalPermissionCodes:[]});
 expect((await inspectNotificationRecovery(identity)).success).toBe(false);expect((await retryHeldNotificationEvent(identity,1,0,operation)).success).toBe(false);expect(s.rpc).not.toHaveBeenCalled();
});
it('inactive accounts cannot inspect or retry even with cached global codes',async()=>{
 s.ctx.mockResolvedValue({...syntheticAuthContext(['notifications.manage']),isAccountActive:false});expect((await inspectNotificationRecovery(identity)).success).toBe(false);expect(s.rpc).not.toHaveBeenCalled();
});
it('bounded projection strips raw source/recipient data',async()=>{
 s.rpc.mockResolvedValue({data:[{id:1,source_table:'hr_offers',event_type:'offer_changed',state:'held',attempt_count:1,recovery_revision:0,created_at:'2026-10-18',last_outcome:'held',pending_recipients:0,held_recipients:0,omitted_decisions:0,source_snapshot:{salary:999},profile_id:99}],error:null});
 const r=await inspectNotificationRecovery(identity);expect(r.success).toBe(true);expect(JSON.stringify(r)).not.toContain('salary');expect(JSON.stringify(r)).not.toContain('profile_id');
});
it('a failed inspection is not an empty successful queue',async()=>{s.rpc.mockResolvedValue({data:[],error:{message:'PRIVATE'}});expect(await inspectNotificationRecovery(identity)).toEqual({success:false});});
it.each([0,-1,NaN,1.5])('rejects invalid cursor %s without querying',async cursor=>{expect((await inspectNotificationRecovery(identity,cursor)).success).toBe(false);expect(s.rpc).not.toHaveBeenCalled();});
it('only exact event/revision acknowledgement accepts recovery',async()=>{
 for(const data of [{id:2,revision:1,status:'pending'},{id:1,revision:3,status:'pending'},{id:1,revision:1,status:'complete'},null]){
  s.rpc.mockResolvedValue({data,error:null});expect((await retryHeldNotificationEvent(identity,1,0,operation)).success).toBe(false);
 }
 s.rpc.mockResolvedValue({data:{id:1,revision:1,status:'pending'},error:null});expect((await retryHeldNotificationEvent(identity,1,0,operation)).success).toBe(true);
 expect(s.rpc).toHaveBeenLastCalledWith('f10_retry_held_notification_event',{event_id:1,expected_revision:0,operation_id:operation});
});
it('malformed or injected operations never reach the database',async()=>{
 expect((await retryHeldNotificationEvent(identity,1,0,'bad')).success).toBe(false);expect((await retryHeldNotificationEvent(identity,1,-1,operation)).success).toBe(false);expect(s.rpc).not.toHaveBeenCalled();
});
