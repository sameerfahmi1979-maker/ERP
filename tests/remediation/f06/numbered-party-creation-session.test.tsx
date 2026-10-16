// @vitest-environment jsdom
import {cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({owner:'first',store:null as unknown}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
import {useNumberedPartyCreation} from '@/features/master-data/parties/use-numbered-party-creation';
const payload={name:'F06 synthetic',active:false,precision:0};
beforeEach(()=>{m.owner='first';m.store=createWorkspaceDraftStore();});afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('retains the same operation across a workspace remount after response loss',async()=>{const action=vi.fn().mockResolvedValueOnce({success:false,uncertain:true}).mockResolvedValueOnce({success:true,data:{id:1}});const a=renderHook(()=>useNumberedPartyCreation('test'));await a.result.current(payload,action);a.unmount();const b=renderHook(()=>useNumberedPartyCreation('test'));await b.result.current(payload,action);expect(action.mock.calls[1][1]).toEqual(action.mock.calls[0][1]);expect(action.mock.calls[0][1].revision).toBeNull();});
it('blocks different values until the previous uncertain operation is reconciled',async()=>{const action=vi.fn().mockRejectedValue(Error('lost'));const a=renderHook(()=>useNumberedPartyCreation('test'));expect(await a.result.current(payload,action)).toMatchObject({uncertain:true});expect((await a.result.current({...payload,name:'different'},action)).success).toBe(false);expect(action).toHaveBeenCalledTimes(1);});
it('known rejection releases the operation for a corrected request',async()=>{const action=vi.fn().mockResolvedValue({success:false,uncertain:false});const a=renderHook(()=>useNumberedPartyCreation('test'));await a.result.current(payload,action);await a.result.current({...payload,name:'corrected'},action);expect(action.mock.calls[1][1].operationId).not.toBe(action.mock.calls[0][1].operationId);});
it('incomplete success does not discard the retained request',async()=>{const action=vi.fn().mockResolvedValueOnce({success:true}).mockResolvedValueOnce({success:true,data:{id:2}});const a=renderHook(()=>useNumberedPartyCreation('test'));expect(await a.result.current(payload,action)).toMatchObject({success:false,uncertain:true});await a.result.current(payload,action);expect(action.mock.calls[1][1]).toEqual(action.mock.calls[0][1]);});
it('simultaneous buttons dispatch one request, before a render can disable controls',async()=>{let finish:(r:object)=>void=()=>{};const action=vi.fn(()=>new Promise<object>(resolve=>{finish=resolve;}));const a=renderHook(()=>useNumberedPartyCreation('test'));const first=a.result.current(payload,action as never);expect((await a.result.current(payload,action as never)).success).toBe(false);expect(action).toHaveBeenCalledTimes(1);finish({success:true,data:{id:1}});expect((await first).success).toBe(true);});
it('separate owners and child form identities do not share a pending operation',async()=>{const action=vi.fn().mockResolvedValue({success:false,uncertain:true});const a=renderHook(()=>useNumberedPartyCreation('contacts:1'));await a.result.current(payload,action);a.unmount();m.owner='second';const b=renderHook(()=>useNumberedPartyCreation('contacts:1'));await b.result.current(payload,action);const c=renderHook(()=>useNumberedPartyCreation('contacts:2'));await c.result.current(payload,action);expect(new Set(action.mock.calls.map(call=>call[1].operationId)).size).toBe(3);});

const saveKey='draft:tab:first:numbered-party:test:save';
const retainedOperation='00000000-0000-4000-8000-000000000091';
const retainedState=()=>({id:null,revision:null,pending:{fingerprint:JSON.stringify(payload),contract:{operationId:retainedOperation,revision:null}}});
const currentStore=()=>m.store as ReturnType<typeof createWorkspaceDraftStore>;
it.each(['42501','40000','40001','40002','40P01'])('W16 party unknown then known %s preserves identity across two remounts',async code=>{
 const action=vi.fn().mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'})
  .mockResolvedValueOnce({success:false,uncertain:false,error:`Rejected ${code}`}).mockResolvedValueOnce({success:true,data:{id:7}});
 const a=renderHook(()=>useNumberedPartyCreation('test'));await a.result.current(payload,action);a.unmount();
 const b=renderHook(()=>useNumberedPartyCreation('test'));expect(await b.result.current(payload,action)).toMatchObject({success:false,uncertain:true});
 expect(await b.result.current({...payload,name:'changed'},action)).toMatchObject({success:false});expect(action).toHaveBeenCalledTimes(2);b.unmount();
 const c=renderHook(()=>useNumberedPartyCreation('test'));expect(await c.result.current(payload,action)).toMatchObject({success:true,data:{id:7}});
 expect(action).toHaveBeenCalledTimes(3);expect(action.mock.calls[1]).toEqual(action.mock.calls[0]);expect(action.mock.calls[2]).toEqual(action.mock.calls[0]);
});
it('W16 same-mount prior unknown is not resolved by later known rejection',async()=>{
 const action=vi.fn().mockResolvedValueOnce({success:false,uncertain:true}).mockResolvedValueOnce({success:false,uncertain:false}).mockResolvedValueOnce({success:true,data:{id:7}});
 const a=renderHook(()=>useNumberedPartyCreation('test'));await a.result.current(payload,action);
 expect(await a.result.current(payload,action)).toMatchObject({uncertain:true});
 expect((await a.result.current({...payload,name:'changed'},action)).success).toBe(false);expect(action).toHaveBeenCalledTimes(2);
 expect((await a.result.current(payload,action)).success).toBe(true);expect(action.mock.calls[2]).toEqual(action.mock.calls[0]);
});
it('W16 legacy F04 pending without a new marker remains a recovering attempt',async()=>{
 currentStore().setViewState(saveKey,JSON.stringify(retainedState()));
 const action=vi.fn().mockResolvedValue({success:false,uncertain:false,error:'Rejected'});
 const a=renderHook(()=>useNumberedPartyCreation('test'));expect(await a.result.current(payload,action)).toMatchObject({uncertain:true});
 expect(action.mock.calls[0][1]).toEqual({operationId:retainedOperation,revision:null});
 expect(JSON.parse(currentStore().getViewState(saveKey)!).pending.contract.operationId).toBe(retainedOperation);
});
it('W16 valid old empty state still permits a first known correction',async()=>{
 currentStore().setViewState(saveKey,JSON.stringify({id:null,revision:null}));
 const action=vi.fn().mockResolvedValue({success:false,uncertain:false});const a=renderHook(()=>useNumberedPartyCreation('test'));
 await a.result.current(payload,action);await a.result.current({...payload,name:'corrected'},action);
 expect(action.mock.calls[1][1].operationId).not.toBe(action.mock.calls[0][1].operationId);
});
it.each(['{',JSON.stringify({...retainedState(),pending:null}),JSON.stringify({...retainedState(),extra:true}),JSON.stringify({...retainedState(),pending:{fingerprint:'x',contract:{operationId:'bad',revision:null}}})])('W16 corrupt retained envelope blocks without overwriting %#',async raw=>{
 currentStore().setViewState(saveKey,raw);const action=vi.fn();const a=renderHook(()=>useNumberedPartyCreation('test'));
 expect((await a.result.current(payload,action)).success).toBe(false);expect(action).not.toHaveBeenCalled();expect(currentStore().getViewState(saveKey)).toBe(raw);
});
it.each(['replace','remove'])('W16 externally %s state before dispatch cannot become fresh',async kind=>{
 const a=renderHook(()=>useNumberedPartyCreation('test'));const action=vi.fn().mockResolvedValue({success:false,uncertain:true});
 await a.result.current(payload,action);const replacement=JSON.stringify({...retainedState(),pending:{...retainedState().pending,contract:{operationId:'00000000-0000-4000-8000-000000000092',revision:null}}});
 if(kind==='replace')currentStore().setViewState(saveKey,replacement);else currentStore().clearDraftsForTab('first');
 const external=currentStore().getViewState(saveKey);expect((await a.result.current(payload,action)).success).toBe(false);
 expect(action).toHaveBeenCalledOnce();expect(currentStore().getViewState(saveKey)).toBe(external);
});
it.each(['owner','store','form','unmount'])('W16 deferred known rejection after %s change cannot resolve opening identity',async kind=>{
 let finish:(value:{success:false;uncertain:false})=>void=()=>{};const action=vi.fn(()=>new Promise<{success:false;uncertain:false}>(resolve=>{finish=resolve;}));
 const original=currentStore();const a=renderHook(({form})=>useNumberedPartyCreation(form),{initialProps:{form:'test'}});
 const pending=a.result.current(payload,action);const retained=original.getViewState(saveKey);
 if(kind==='owner')m.owner='second';if(kind==='store')m.store=createWorkspaceDraftStore();
 if(kind==='unmount')a.unmount();else a.rerender({form:kind==='form'?'other':'test'});
 finish({success:false,uncertain:false});expect(await pending).toMatchObject({success:false,uncertain:true});
 expect(original.getViewState(saveKey)).toBe(retained);
});
it.each(['replace','remove'])('W16 deferred known rejection cannot clear externally %s state',async kind=>{
 let finish:(value:{success:false;uncertain:false})=>void=()=>{};const action=vi.fn(()=>new Promise<{success:false;uncertain:false}>(resolve=>{finish=resolve;}));
 const a=renderHook(()=>useNumberedPartyCreation('test'));const pending=a.result.current(payload,action);
 if(kind==='replace')currentStore().setViewState(saveKey,JSON.stringify(retainedState()));else currentStore().clearDraftsForTab('first');
 const external=currentStore().getViewState(saveKey);finish({success:false,uncertain:false});
 expect(await pending).toMatchObject({success:false,uncertain:true});expect(currentStore().getViewState(saveKey)).toBe(external);
});
it.each(['ack-throw','state-replaced','unmount'])('W16 confirmed success survives %s without permitting another local dispatch',async kind=>{
 let finish:(value:{success:true;data:{id:number}})=>void=()=>{};const action=vi.fn<()=>Promise<{success:true;data:{id:number}}>>().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({success:true,data:{id:8}});
 const a=renderHook(()=>useNumberedPartyCreation('test'));const run=a.result.current;const pending=run(payload,action);
 const original=currentStore().getViewState(saveKey);
 if(kind==='ack-throw')vi.spyOn(currentStore(),'setViewState').mockImplementation(()=>{throw Error('W16_PRIVATE');});
 if(kind==='state-replaced')currentStore().setViewState(saveKey,JSON.stringify(retainedState()));
 if(kind==='unmount')a.unmount();
 finish({success:true,data:{id:7}});expect(await pending).toEqual({success:true,data:{id:7}});
 expect((await run(payload,action)).success).toBe(false);expect(action).toHaveBeenCalledOnce();
 if(kind==='ack-throw')expect(currentStore().getViewState(saveKey)).toBe(original);
 vi.restoreAllMocks();
});
