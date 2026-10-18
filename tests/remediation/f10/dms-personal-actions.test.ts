import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const s=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn(),result:{} as Record<string,unknown>,results:[] as Record<string,unknown>[],calls:[] as unknown[][],change:vi.fn(),settings:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:s.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:s.from})}));
vi.mock('@/server/notification-personal-state',()=>({changePersonalDmsNotification:s.change}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('@/server/actions/dms/notification-settings',()=>({getDmsNotificationSettingsForScheduler:s.settings}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {getUnreadDmsNotificationsCount,markDmsNotificationRead,dismissDmsNotification,generateDmsExpiryNotifications} from '@/server/actions/dms/notifications';
beforeEach(()=>{
 vi.clearAllMocks();s.auth.mockResolvedValue(syntheticAuthContext([], {id:7}));s.result={count:0,error:null};s.results=[];s.calls=[];
 s.settings.mockResolvedValue({is_enabled:true,in_app_enabled:true,email_enabled:false,include_document_owner:false,include_document_creator:false,recipient_roles:[],recipient_user_ids:[]});
 s.from.mockImplementation((...args:unknown[])=>{s.calls.push(['from',...args]);const result=s.results.shift()??s.result;const q:Record<string,unknown>={then:(fn:(r:unknown)=>unknown)=>Promise.resolve(result).then(fn)};for(const method of ['select','eq','is','lte','neq','limit','insert','update'])q[method]=(...args:unknown[])=>{s.calls.push([method,...args]);return q;};return q;});
});
it('true zero is confirmed from the same own due in-app global deliveries as the bell',async()=>{
 expect(await getUnreadDmsNotificationsCount()).toEqual({success:true,data:0});expect(s.calls).toContainEqual(['from','erp_notifications']);expect(s.calls).toContainEqual(['eq','recipient_user_id',7]);expect(s.calls).toContainEqual(['eq','source_module','DMS']);expect(s.calls).toContainEqual(['eq','channel_in_app',true]);expect(s.calls).toContainEqual(['is','deleted_at',null]);expect(s.calls.some(c=>c[0]==='lte'&&c[1]==='scheduled_for')).toBe(true);
});
it.each([null,-1,1.5,'0'])('unknown/invalid count %s is not false empty success',async count=>{s.result={count,error:null};expect((await getUnreadDmsNotificationsCount()).success).toBe(false);});
it('backend failure hides raw diagnostics and does not report zero',async()=>{s.result={count:null,error:{message:'PRIVATE_DIAGNOSTIC'}};const r=await getUnreadDmsNotificationsCount();expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain('PRIVATE_DIAGNOSTIC');});
it('inactive session cannot query counts',async()=>{s.auth.mockResolvedValue({...syntheticAuthContext(),isAccountActive:false});expect((await getUnreadDmsNotificationsCount()).success).toBe(false);expect(s.from).not.toHaveBeenCalled();});
it.each(['read','dismissed'] as const)('DMS %s adopts the checked canonical personal RPC',async state=>{
 s.change.mockResolvedValue({success:false,error:'Unconfirmed'});const r=await(state==='read'?markDmsNotificationRead(8):dismissDmsNotification(8));expect(r).toEqual({success:false,error:'Unconfirmed'});expect(s.change).toHaveBeenCalledWith(8,state);
});
it('a supplied business note is not silently discarded as a personal-state update',async()=>{
 expect((await dismissDmsNotification(8,'business note')).success).toBe(false);expect(s.change).not.toHaveBeenCalled();
});
const due={id:1,document_id:7,reminder_days_before:7,document:{id:7,document_no:'Synthetic',title:'Synthetic',expiry_date:'2099-01-01',created_by:2,owner_user_id:2,status:'active',is_archived:false,expiry_tracking_override:null}};
function generator(){s.auth.mockResolvedValue(syntheticAuthContext(['dms.notifications.manage'],{id:7}));s.results=[{data:[due],error:null}];}
it('settings outage never supplies a guessed default owner/creator recipient',async()=>{
 generator();s.settings.mockResolvedValue(null);expect((await generateDmsExpiryNotifications()).success).toBe(false);expect(s.calls.some(c=>c[0]==='insert')).toBe(false);
});
it('empty configured recipients do not fall back to the operator',async()=>{
 generator();expect(await generateDmsExpiryNotifications()).toMatchObject({success:true,data:{created:0,skipped:1,failed:0}});expect(s.calls.some(c=>c[0]==='insert')).toBe(false);
});
it('owner and creator configuration deduplicates the same stored person',async()=>{
 generator();s.settings.mockResolvedValue({is_enabled:true,in_app_enabled:true,email_enabled:false,include_document_owner:true,include_document_creator:true,recipient_roles:[],recipient_user_ids:[]});
 s.results.push({error:null},{data:[{id:1}],error:null},{error:null});expect((await generateDmsExpiryNotifications()).success).toBe(true);
 const inserts=s.calls.filter(c=>c[0]==='insert'&&typeof c[1]==='object'&&c[1]!==null&&'recipient_user_id' in c[1]);expect(inserts).toHaveLength(1);expect(inserts[0][1]).toMatchObject({recipient_user_id:2});
});
it('partial source failure is reported as failure and leaves the reminder incomplete',async()=>{
 generator();s.settings.mockResolvedValue({is_enabled:true,in_app_enabled:true,email_enabled:false,include_document_owner:true,include_document_creator:false,recipient_roles:[],recipient_user_ids:[]});
 s.results.push({error:{message:'PRIVATE'}});const r=await generateDmsExpiryNotifications();expect(r).toMatchObject({success:false,data:{created:0,failed:1}});expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(s.calls.some(c=>c[0]==='update')).toBe(false);
});
it('inactive configured role is not expanded into delivery candidates',async()=>{
 generator();s.settings.mockResolvedValue({is_enabled:true,in_app_enabled:true,email_enabled:false,include_document_owner:false,include_document_creator:false,recipient_roles:['reviewer'],recipient_user_ids:[]});
 s.results.push({data:[{user_profile_id:2,role:{role_code:'reviewer',is_active:false}}],error:null});expect((await generateDmsExpiryNotifications()).data?.created).toBe(0);expect(s.calls.some(c=>c[0]==='insert')).toBe(false);
});
