import{beforeEach,expect,it,vi}from'vitest';
const m=vi.hoisted(()=>({ctx:vi.fn(),rpc:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.ctx,canUseApplication:(c:{isAccountActive:boolean})=>c.isAccountActive}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
import{prepareNotificationOpen,completeNotificationOpen}from'@/server/actions/notifications/open';
const token='b23ec154-aa22-44cc-8fee-2b954e9bf007';
it('accepts only the exact positive review-item target, not a generic queue or injected query',async()=>{
 for(const path of ['/dms/review-queue?item_id=7','/dms/review-queue','/dms/review-queue?item_id=0','/dms/review-queue?item_id=7&redirect=evil']){
  m.rpc.mockResolvedValue({error:null,data:{id:2,token,path}});expect((await prepareNotificationOpen(2)).success).toBe(path==='/dms/review-queue?item_id=7');
 }
});
beforeEach(()=>{vi.clearAllMocks();m.ctx.mockResolvedValue({isAccountActive:true});m.client.mockResolvedValue({rpc:m.rpc});});
for(const path of ['/dms/documents/record/7','/admin/hr/employees/record/8','/admin/hr/recruitment/candidates/record/9','/admin/reports/templates/governance?template_id=10'])it('accepts exact canonical target '+path,async()=>{m.rpc.mockResolvedValue({error:null,data:{id:2,token,path}});expect((await prepareNotificationOpen(2)).success).toBe(true);expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.rpc).toHaveBeenCalledWith('f10_prepare_notification_open',{notification_id:2});});
for(const path of ['https://evil.invalid','//evil.invalid','/dms/documents/record/7?redirect=https://evil.invalid','/dashboard','/admin/hr/employees/record/0','/admin/reports/templates/governance?template_id=1&extra=x'])it('rejects unknown/changed target '+path,async()=>{m.rpc.mockResolvedValue({error:null,data:{id:2,token,path}});expect((await prepareNotificationOpen(2)).success).toBe(false);});
it('does not turn missing/denied target into read success',async()=>{m.rpc.mockResolvedValue({error:{code:'42501'},data:null});expect((await prepareNotificationOpen(2)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalledWith('f10_complete_notification_open',expect.anything());});
it('checks exact returned notification identity',async()=>{m.rpc.mockResolvedValue({error:null,data:{id:3,token,path:'/dms/documents/record/7'}});expect((await prepareNotificationOpen(2)).success).toBe(false);});
it('inactive accounts do not create or complete intents',async()=>{m.ctx.mockResolvedValue({isAccountActive:false});expect((await prepareNotificationOpen(2)).success).toBe(false);expect((await completeNotificationOpen(token,'/dms/documents/record/7')).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
for(const result of [{error:null,data:false},{error:{code:'42501'},data:true},{error:null,data:null},{error:null,data:'true'}])it('only exact verified completion is acknowledged '+JSON.stringify(result),async()=>{m.rpc.mockResolvedValue(result);expect((await completeNotificationOpen(token,'/dms/documents/record/7')).success).toBe(false);});
it('successful completion is a separate explicit call',async()=>{m.rpc.mockResolvedValue({error:null,data:true});expect(await completeNotificationOpen(token,'/dms/documents/record/7')).toEqual({success:true});});
