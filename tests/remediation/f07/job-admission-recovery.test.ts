import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({enqueue:vi.fn(),inline:vi.fn(),featureError:false,sessionError:false,enabled:true}));
vi.mock('@/lib/dms/ai-jobs/job-runner',()=>({enqueueUniqueDmsAiJob:state.enqueue}));
vi.mock('@/server/actions/dms/orchestration',()=>({runDmsAiOrchestrationPostDraft:state.inline}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({error:state.featureError?{}:null,data:{is_enabled:state.enabled}})};return{from:()=>q};}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>{const q={select:()=>q,eq:()=>q,is:()=>q,update:()=>q,maybeSingle:async()=>({error:state.sessionError?{}:null,data:{orchestration_status:'pending'}}),then:(resolve:(x:unknown)=>void)=>Promise.resolve({error:null}).then(resolve)};return{from:()=>q};}}));
import {triggerDmsPostApproveOrchestration} from '@/lib/dms/orchestration/post-approve-orchestration';
beforeEach(()=>{vi.clearAllMocks();state.featureError=false;state.sessionError=false;state.enabled=true;});
const input={sessionCode:'synthetic-session',documentId:7,uploadSessionId:8,approveRunId:9,source:'single_file_approve' as const};
describe('T07 admission uncertainty',()=>{
 it('never falls back to inline after lost queue acknowledgement',async()=>{state.enqueue.mockResolvedValue({success:false});expect(await triggerDmsPostApproveOrchestration(input)).toMatchObject({triggered:false,orchestrationStatus:'error'});expect(state.inline).not.toHaveBeenCalled();});
 it('does not interpret failed feature reads as explicit inline mode',async()=>{state.featureError=true;expect((await triggerDmsPostApproveOrchestration(input)).triggered).toBe(false);expect(state.inline).not.toHaveBeenCalled();expect(state.enqueue).not.toHaveBeenCalled();});
 it('does not interpret a failed source read as an unused session',async()=>{state.sessionError=true;expect((await triggerDmsPostApproveOrchestration(input)).triggered).toBe(false);expect(state.inline).not.toHaveBeenCalled();expect(state.enqueue).not.toHaveBeenCalled();});
 it('does not claim that a retained terminal operation was newly queued',async()=>{state.enqueue.mockResolvedValue({success:true,jobId:11,skipped:true});expect(await triggerDmsPostApproveOrchestration(input)).toMatchObject({triggered:false,orchestrationStatus:'skipped',jobId:11});expect(state.inline).not.toHaveBeenCalled();});
});
