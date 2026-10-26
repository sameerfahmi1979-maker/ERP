// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {useNumberedAiApproval} from '@/hooks/use-numbered-ai-approval';
import {input,prepared,contract,receipt} from './dms-ai-approval-fixtures';
const m=vi.hoisted(()=>({store:null as unknown,owner:'owner',dispatch:vi.fn(),recover:vi.fn()}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>m.owner?{id:m.owner}:null}));
const original=()=>({input:{...input,prepared},contract,receipt:null});
const mount=()=>renderHook(({context})=>useNumberedAiApproval(context,m.dispatch,m.recover),{initialProps:{context:'17'}});
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();m.owner='owner';m.recover.mockResolvedValue({success:true,data:original()});m.dispatch.mockResolvedValue({success:true,data:receipt()});});
afterEach(cleanup);
it('restores the exact database request after loss of all tab memory',async()=>{
 const h=mount();expect(h.result.current.loading).toBe(true);await waitFor(()=>expect(h.result.current.loading).toBe(false));
 expect(h.result.current.pendingSessionIds).toEqual([17]);
 await act(async()=>{expect((await h.result.current.run({...input,title:'Changed after reload'})).success).toBe(true);});
 expect(m.dispatch).toHaveBeenCalledOnce();expect(m.dispatch.mock.calls[0][0]).toMatchObject(original().input);expect(m.dispatch.mock.calls[0][1]).toEqual(contract);
});
it('does not dispatch while recovery is still pending',async()=>{
 m.recover.mockReturnValue(new Promise(()=>{}));const h=mount();
 await act(async()=>{expect((await h.result.current.run(input)).success).toBe(false);});expect(m.dispatch).not.toHaveBeenCalled();
});
it.each(['denied','throw','malformed','wrong-source','wrong-receipt'])('%s recovery fails closed instead of creating another request',async kind=>{
 if(kind==='throw')m.recover.mockRejectedValue(Error('lost'));
 else if(kind==='denied')m.recover.mockResolvedValue({success:false,error:'Denied'});
 else if(kind==='malformed')m.recover.mockResolvedValue({success:true,data:{}});
 else if(kind==='wrong-source')m.recover.mockResolvedValue({success:true,data:{...original(),input:{...original().input,uploadSessionId:99}}});
 else m.recover.mockResolvedValue({success:true,data:{...original(),receipt:{...receipt(),operation_id:crypto.randomUUID()}}});
 const h=mount();await waitFor(()=>expect(h.result.current.retentionError).toBe(true));
 await act(async()=>{expect((await h.result.current.run(input)).success).toBe(false);});expect(m.dispatch).not.toHaveBeenCalled();
});
it.each(['account','context','unmount'])('late recovery cannot publish after %s changes',async kind=>{
 let resolve!:(v:unknown)=>void;m.recover.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({success:true,data:null});
 const h=mount();if(kind==='unmount')h.unmount();else{if(kind==='account'){m.store=createWorkspaceDraftStore();m.owner='other';}h.rerender({context:kind==='context'?'99':'17'});}
 await act(async()=>{resolve({success:true,data:original()});});
 expect((m.store as ReturnType<typeof createWorkspaceDraftStore>).getDraft('draft:tab:owner:f06-ai-approvals:17')).toBeUndefined();expect(m.dispatch).not.toHaveBeenCalled();
});
it('resolves a second-tab reservation collision without dispatching its changed values again',async()=>{
 m.recover.mockResolvedValueOnce({success:true,data:null}).mockResolvedValue({success:true,data:original()});
 m.dispatch.mockImplementation(async(i,c)=>!i.prepared?{success:false,prepared:{operation_id:c.operationId,snapshot:prepared}}:{success:false,recoveryRequired:true});
 const h=mount();await waitFor(()=>expect(h.result.current.loading).toBe(false));
 await act(async()=>{expect(await h.result.current.run({...input,title:'Different tab'})).toMatchObject({success:false,error:expect.stringContaining('recovered')});});
 expect(m.dispatch).toHaveBeenCalledTimes(2);expect(m.recover).toHaveBeenCalledTimes(2);
 m.dispatch.mockResolvedValue({success:true,data:receipt()});await act(async()=>{expect((await h.result.current.run(input)).success).toBe(true);});
 expect(m.dispatch.mock.calls[2][1]).toEqual(contract);expect(m.dispatch.mock.calls[2][0].title).toBe(input.title);
});
it('recovered completion returns its verified receipt without resubmitting',async()=>{
 m.recover.mockResolvedValue({success:true,data:{...original(),receipt:receipt()}});const h=mount();await waitFor(()=>expect(h.result.current.loading).toBe(false));
 await act(async()=>{expect(await h.result.current.run(input)).toEqual({success:true,data:receipt()});});expect(m.dispatch).not.toHaveBeenCalled();
});
