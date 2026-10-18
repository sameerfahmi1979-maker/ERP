import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
import {saveReportScheduleRecord,removeReportScheduleRecord} from '@/server/report-schedule-save';
const contract={operationId:'00000000-0000-4000-8000-000000000099',revision:'3'};
beforeEach(()=>{vi.resetAllMocks();m.client.mockResolvedValue({rpc:m.rpc});m.rpc.mockResolvedValue({data:{id:7,revision:'4',replayed:false},error:null});});
it('removal retains the original operation identity and original revision',async()=>{
 expect(await removeReportScheduleRecord(7,contract)).toMatchObject({success:true,data:{id:7,revision:'4'}});
 expect(m.rpc).toHaveBeenCalledWith('f09_remove_schedule',{p_operation:contract.operationId,p_id:7,p_revision:'3'});
});
it('replayed removal receipts recover the same committed operation',async()=>{
 m.rpc.mockResolvedValue({data:{id:7,revision:'4',replayed:true},error:null});expect((await removeReportScheduleRecord(7,contract)).success).toBe(true);
});
it.each([{data:null,error:null},{data:{id:99,revision:'4',replayed:false},error:null},{data:{id:7,revision:'bad',replayed:false},error:null},{data:null,error:{code:'08006',message:'PRIVATE'}}])('invalid or lost replies remain uncertain: %j',async result=>{
 m.rpc.mockResolvedValue(result);const r=await removeReportScheduleRecord(7,contract);expect(r).toMatchObject({success:false,uncertain:true});expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it.each(['42501','P0409','40001','22023','23505','40P01'])('definite rejection %s does not report a committed operation',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'PRIVATE'}});const r=await removeReportScheduleRecord(7,contract);expect(r.success).toBe(false);expect(r.uncertain).not.toBe(true);expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it.each([{...contract,revision:null},{...contract,revision:'0'},{...contract,operationId:'bad'}])('invalid contract never reaches persistence: %j',async c=>{
 expect((await removeReportScheduleRecord(7,c)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();
});
it('a thrown transport failure keeps the original operation recoverable',async()=>{
 m.rpc.mockRejectedValue(new Error('PRIVATE'));expect(await removeReportScheduleRecord(7,contract)).toMatchObject({success:false,uncertain:true});
});
it('new schedule creation uses a null original revision, never an edit token',async()=>{
 expect((await saveReportScheduleRecord(null,{schedule_name:'Synthetic'},{...contract,revision:null})).success).toBe(true);
 expect(m.rpc).toHaveBeenCalledWith('f09_save_schedule',{p_operation:contract.operationId,p_id:null,p_revision:null,p_data:{schedule_name:'Synthetic'}});
});
