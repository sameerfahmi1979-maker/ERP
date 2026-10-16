// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {WorkspaceDraftStoreApi} from '@/lib/workspace/workspace-draft-types';
const m=vi.hoisted(()=>({owner:'lookup-tab',store:null as unknown,send:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>m.owner?{id:m.owner}:null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/server/actions/master-data/lookups',()=>Object.fromEntries(['createLookupCategory','updateLookupCategory','toggleLookupCategoryStatus','toggleLookupCategoryLock','createLookupValue','updateLookupValue','toggleLookupValueStatus','toggleLookupValueLock','setDefaultLookupValue'].map(name=>[name,(...args:unknown[])=>m.send(name,args)])));
import {useLookupMutation} from '@/features/master-data/lookups/use-lookup-mutation';
import type {LookupCommand,LookupMutationContract} from '@/features/master-data/lookups/mutation-contract';
const command:LookupCommand={kind:'value',action:'default',categoryId:8,categoryRevision:'6',data:{}};
const category:LookupCommand={kind:'category',action:'save',categoryId:null,categoryRevision:null,data:{category_name_en:'Retained original'}};
type Args=unknown[];
function success(name:string,args:Args){const c=args.at(-1) as LookupMutationContract;const id=typeof args[0]==='number'?args[0]:(args[0] as {id?:number}).id??501;
 const kind=name.includes('Value')?'value':'category',action=name.includes('Default')?'default':name.includes('Lock')?'lock':name.includes('Status')?'active':'save';
 return {success:true,data:{id,revision:c.revision===null?'1':String(Number(c.revision)+1),category_id:c.categoryId??id,category_revision:c.categoryRevision?String(Number(c.categoryRevision)+1):(c.revision===null?'1':String(Number(c.revision)+1)),kind,action,operation_id:c.operationId,changed:true,replayed:false}};
}
beforeEach(()=>{m.owner='lookup-tab';m.store=createWorkspaceDraftStore();m.send.mockReset().mockImplementation(success);});
afterEach(()=>cleanup());
it('retains exact parent/target revisions, operation and payload after response loss and remount',async()=>{
 m.send.mockRejectedValueOnce(Error('PRIVATE_TRANSPORT'));const first=renderHook(()=>useLookupMutation('lookup',9,2));
 await act(async()=>{await first.result.current.run(command);});const original=m.send.mock.calls[0];expect(first.result.current.uncertain).toBe(true);first.unmount();
 const next=renderHook(()=>useLookupMutation('lookup',9,99));expect(next.result.current.uncertain).toBe(true);expect(next.result.current.message).toMatch(/unconfirmed.*Recover the original request/i);expect(next.result.current.blocked).toBe(false);expect(m.send).toHaveBeenCalledOnce();
 await act(async()=>{await next.result.current.run({...command,categoryRevision:'100',data:{}});});expect(m.send.mock.calls[1]).toEqual(original);expect(next.result.current.uncertain).toBe(false);expect(next.result.current.message).toBeNull();
});
it('a later known denial after unknown cannot clear the original operation',async()=>{
 m.send.mockResolvedValueOnce({success:false,uncertain:true}).mockResolvedValueOnce({success:false,uncertain:false,error:'Denied now'});
 const h=renderHook(()=>useLookupMutation('lookup',9,2));await act(async()=>{await h.result.current.run(command);});await act(async()=>{await h.result.current.run();});
 expect(h.result.current.uncertain).toBe(true);expect(h.result.current.message).toContain('original outcome remains unconfirmed');await act(async()=>{await h.result.current.run();});expect(m.send.mock.calls[2]).toEqual(m.send.mock.calls[0]);
});
it.each(['id','category_id','category_revision','operation_id','revision','kind','action'])('malformed %s receipt leaves original request recoverable',async key=>{
 m.send.mockImplementationOnce((name,args)=>({...success(name,args),data:{...success(name,args).data,[key]:key.endsWith('id')?999:'invalid'}}));
 const h=renderHook(()=>useLookupMutation('lookup',9,2));await act(async()=>{await h.result.current.run(command);});expect(h.result.current.uncertain).toBe(true);
 await act(async()=>{await h.result.current.run();});expect(m.send.mock.calls[1]).toEqual(m.send.mock.calls[0]);expect(h.result.current.uncertain).toBe(false);
});
it('a known first rejection releases its attempt and permits corrected input with a NEW operation',async()=>{
 m.send.mockResolvedValueOnce({success:false,uncertain:false,error:'Invalid'});const h=renderHook(()=>useLookupMutation('lookup',9,2));
 await act(async()=>{await h.result.current.run(category);});expect(h.result.current.uncertain).toBe(false);await act(async()=>{await h.result.current.run({...category,data:{category_name_en:'Corrected'}});});
 expect((m.send.mock.calls[0][1].at(-1) as LookupMutationContract).operationId).not.toBe((m.send.mock.calls[1][1].at(-1) as LookupMutationContract).operationId);
});
it('double submission dispatches once even before the first state render',async()=>{
 let finish!:(value:unknown)=>void;m.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const h=renderHook(()=>useLookupMutation('lookup',9,2));let pending!:Promise<unknown>;
 await act(async()=>{pending=h.result.current.run(command);await h.result.current.run(command);});expect(m.send).toHaveBeenCalledOnce();await act(async()=>{finish(success(...m.send.mock.calls[0] as [string,Args]));await pending;});
});
it('an account/tab change while a response is in flight cannot accept or clear old state',async()=>{
 let finish!:(value:unknown)=>void;m.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const h=renderHook(()=>useLookupMutation('lookup',9,2));let pending!:Promise<unknown>;
 await act(async()=>{pending=h.result.current.run(command);});const store=m.store as WorkspaceDraftStoreApi;const key=`draft:tab:${m.owner}:lookup:administration-payload`;const before=store.getViewState(key);
 m.owner='another-owner';h.rerender();await act(async()=>{finish(success(...m.send.mock.calls[0] as [string,Args]));await pending;});expect(store.getViewState(key)).toBe(before);
});
it('unmount prevents late acknowledgement and remount retains exact original request',async()=>{
 let finish!:(value:unknown)=>void;m.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const h=renderHook(()=>useLookupMutation('lookup',9,2));let pending!:Promise<unknown>;
 await act(async()=>{pending=h.result.current.run(command);});h.unmount();finish(success(...m.send.mock.calls[0] as [string,Args]));await pending;
 const restored=renderHook(()=>useLookupMutation('lookup',9,4));expect(restored.result.current.uncertain).toBe(true);expect(restored.result.current.message).toMatch(/unconfirmed.*Recover the original request/i);expect(m.send).toHaveBeenCalledOnce();await act(async()=>{await restored.result.current.run();});expect(m.send.mock.calls[1]).toEqual(m.send.mock.calls[0]);expect(restored.result.current.message).toBeNull();
});
it('confirmed creation uses saved ID and revision for subsequent save, not another create',async()=>{
 const h=renderHook(()=>useLookupMutation('lookup',null));await act(async()=>{await h.result.current.run({...category,data:{category_code:'QA_NEW',category_name_en:'Synthetic'}});});
 expect(h.result.current.savedId).toBe(501);await act(async()=>{await h.result.current.run(category);});expect(m.send.mock.calls.map(c=>c[0])).toEqual(['createLookupCategory','updateLookupCategory']);expect(m.send.mock.calls[1][1][0]).toMatchObject({id:501});
});
it('recover() exposes ONLY the retained verified original command for truthful local row state',async()=>{
 const original:LookupCommand={kind:'category',action:'lock',categoryId:null,categoryRevision:null,data:{is_locked:true}};
 m.send.mockResolvedValueOnce({success:false,uncertain:true});const h=renderHook(()=>useLookupMutation('lookup',9,2));await act(async()=>{await h.result.current.run(original);});let recovered:Awaited<ReturnType<typeof h.result.current.run>>|undefined;
 await act(async()=>{recovered=await h.result.current.run();});expect(recovered).toMatchObject({success:true,acknowledged:true,retainedCommand:original});
});
it('corrupt memory request cannot dispatch or replace the saved bytes',async()=>{
 const key=`draft:tab:${m.owner}:lookup:save`;(m.store as WorkspaceDraftStoreApi).setViewState(key,'{');const h=renderHook(()=>useLookupMutation('lookup',9,2));await act(async()=>{await h.result.current.run(command);});expect(m.send).not.toHaveBeenCalled();expect((m.store as WorkspaceDraftStoreApi).getViewState(key)).toBe('{');
});
it('BR85-05 corrupt retained witness remount preserves the specific error without actionable recovery guidance',async()=>{
 m.send.mockResolvedValueOnce({success:false,uncertain:true});const first=renderHook(()=>useLookupMutation('lookup',9,2));await act(async()=>{await first.result.current.run(command);});first.unmount();
 const store=m.store as WorkspaceDraftStoreApi,payloadKey=`draft:tab:${m.owner}:lookup:administration-payload`,saveKey=`draft:tab:${m.owner}:lookup:save`,saved=store.getViewState(saveKey);store.setViewState(payloadKey,'{');
 const restored=renderHook(()=>useLookupMutation('lookup',9,2));expect(restored.result.current.uncertain).toBe(true);expect(restored.result.current.blocked).toBe(true);expect(restored.result.current.message).toBeNull();expect(restored.result.current.recoveryError).toBe('The saved request could not be verified. Reopen the latest record and check whether the change was saved before continuing.');
 await act(async()=>{await restored.result.current.run();});expect(m.send).toHaveBeenCalledOnce();expect(store.getViewState(payloadKey)).toBe('{');expect(store.getViewState(saveKey)).toBe(saved);
});
it('a row-action opener losing local admission cannot dispatch or replace pending witnesses',async()=>{
 const admission=vi.fn(()=>true),h=renderHook(()=>useLookupMutation('lookup',9,2,admission));m.send.mockResolvedValueOnce({success:false,uncertain:true});await act(async()=>{await h.result.current.run(command);});const original=(m.store as WorkspaceDraftStoreApi).getViewState(`draft:tab:${m.owner}:lookup:administration-payload`);admission.mockReturnValue(false);await act(async()=>{await h.result.current.run();});expect(m.send).toHaveBeenCalledOnce();expect((m.store as WorkspaceDraftStoreApi).getViewState(`draft:tab:${m.owner}:lookup:administration-payload`)).toBe(original);expect(h.result.current.blocked).toBe(true);
});
