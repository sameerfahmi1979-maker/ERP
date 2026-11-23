import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanupPttRecordings} from '../ptt-recordings';

const mock=vi.hoisted(()=>({rpc:vi.fn(),storage:vi.fn(),remove:vi.fn(),info:vi.fn(),authorize:vi.fn(),confirm:vi.fn(),budget:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../budget',()=>({authorizeCommunicationCleanup:mock.authorize,confirmCommunicationCleanup:mock.confirm}));
vi.mock('../ptt-worker-transport',()=>({pttCleanupBudget:mock.budget}));
vi.mock('../media-storage',()=>({boundedChatStorage:mock.storage}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:(name:string,args:unknown)=>({abortSignal:(signal:AbortSignal)=>mock.rpc(name,args,signal)})})}));
vi.mock('../http',()=>({rpcFailure:()=>{throw Error('claim denied');},CommunicationHttpError:class extends Error{}}));

const poll='00000000-0000-4000-8000-000000000001';
const stage={objectId:poll,permitId:'00000000-0000-4000-8000-000000000002',attemptId:'00000000-0000-4000-8000-000000000003',absent:false};
const original={permitId:stage.permitId,attemptId:stage.attemptId,resourceId:stage.objectId,endpoint:'discard_partial_upload'};
beforeEach(()=>{
  vi.resetAllMocks();
  mock.storage.mockReturnValue({from:()=>({remove:mock.remove,info:mock.info})});
  mock.authorize.mockResolvedValue({ok:true,newAttempt:true});
  mock.confirm.mockResolvedValue({ok:true});
  mock.remove.mockResolvedValue({error:null});
  mock.info.mockResolvedValue({error:{statusCode:'NoSuchKey'}});
  mock.budget.mockReturnValue({store:'bounded-test-transport'});
});
describe('funded recording drain',()=>{
  it('cannot inspect storage without a live, unused paid poll',async()=>{
    await expect(cleanupPttRecordings(poll,AbortSignal.abort())).rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValue({error:{code:'PT503'}});
    await expect(cleanupPttRecordings(poll,new AbortController().signal)).rejects.toThrow();
    expect(mock.storage).not.toHaveBeenCalled();
    expect(mock.authorize).not.toHaveBeenCalled();
  });
  it('uses the same bounded signal for the claim, original allowance, deletion and acknowledgment',async()=>{
    const signal=new AbortController().signal;
    mock.rpc.mockResolvedValueOnce({data:stage}).mockResolvedValueOnce({data:{confirmed:true},error:null});
    await cleanupPttRecordings(poll,signal);
    expect(mock.rpc).toHaveBeenNthCalledWith(1,'erp_ptt_recording_cleanup_v1',{p_done:null,p_poll:poll},signal);
    expect(mock.budget).toHaveBeenCalledWith(signal);
    expect(mock.authorize).toHaveBeenCalledWith(original,{store:'bounded-test-transport'});
    expect(mock.storage).toHaveBeenCalledWith(signal);
    expect(mock.remove).toHaveBeenCalledWith([stage.objectId+'.wav']);
    expect(mock.info).toHaveBeenCalledWith(stage.objectId+'.wav');
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenNthCalledWith(2,'erp_ptt_recording_cleanup_v1',{p_done:stage.objectId,p_poll:null,p_attempt:stage.attemptId,p_absent:true},signal);
  });
  it.each([{data:{size:20},error:null},{error:{status:404,message:'Bucket not found'}},{error:{status:503}}])('withholds the original receipt on uncertain provider absence',async info=>{
    mock.rpc.mockResolvedValue({data:{...stage,absent:true}});
    mock.info.mockResolvedValue(info);
    await expect(cleanupPttRecordings(poll,new AbortController().signal)).rejects.toThrow();
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.confirm).not.toHaveBeenCalled();
  });
  it('withholds success when the protected finish detects competing catalog state',async()=>{
    mock.rpc.mockResolvedValueOnce({data:stage}).mockResolvedValueOnce({data:{confirmed:false}});
    await expect(cleanupPttRecordings(poll,new AbortController().signal)).rejects.toThrow();
    expect(mock.confirm).not.toHaveBeenCalled();
  });
  it('retains the stage when transport aborts before confirmed deletion',async()=>{
    const controller=new AbortController();
    mock.rpc.mockResolvedValue({data:stage});
    mock.remove.mockImplementation(async()=>{controller.abort();controller.signal.throwIfAborted();});
    await expect(cleanupPttRecordings(poll,controller.signal)).rejects.toThrow();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
});
