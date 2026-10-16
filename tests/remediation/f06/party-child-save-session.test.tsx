// @vitest-environment jsdom
// Existing F04 session and actual shared child dialog; server actions doubled.
import '../f05/setup';
import {cleanup,renderHook,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useLayoutEffect} from 'react';
it('W35 fresh StrictMode setup can retry while disposed setup cannot settle or release its flight',async()=>{
 const finishes:((v:unknown)=>void)[]=[],requests:Promise<unknown>[]=[];
 m.updateAction.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));
 const a=renderHook(()=>{
  const save=usePartyChildSave('form',editRow,m);
  useLayoutEffect(()=>{requests.push(save(payload));},[save]);
  return save;
 },{reactStrictMode:true});
 expect(m.updateAction).toHaveBeenCalledTimes(2);expect(m.updateAction.mock.calls[1]).toEqual(m.updateAction.mock.calls[0]);
 const pending=ownedStore().getViewState(pendingKey);finishes[0]({success:true,data:receipt});await requests[0];expect(ownedStore().getViewState(pendingKey)).toBe(pending);
 expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.updateAction).toHaveBeenCalledTimes(2);
 finishes[1]({success:false,uncertain:true});await requests[1];m.updateAction.mockResolvedValueOnce({success:true,data:receipt});expect(await a.result.current(payload)).toMatchObject({success:true});expect(m.updateAction.mock.calls[2]).toEqual(m.updateAction.mock.calls[0]);
});
const ownedStore=()=>m.store as ReturnType<typeof createWorkspaceDraftStore>;
const editRow={id:8,workspace_revision:4};
const pendingKey='draft:tab:child-save:party-child:form:8:4:save';
it.each(['before','after'])('W35 first-known %s clearing fault stays known and blocks further writes',async fault=>{
 const a=recoveryMount();const write=ownedStore().setViewState.bind(ownedStore());
 m.updateAction.mockImplementationOnce(async()=>{vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);throw Error('private clear');});return {success:false,error:'Known rejection'};});
 expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:false,error:'Known rejection'});vi.restoreAllMocks();expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:false});expect(m.updateAction).toHaveBeenCalledTimes(1);
});
it.each(['before','after'])('W35 exact pending %s write fault stops but changed-input refusal stays retryable',async fault=>{
 m.updateAction.mockRejectedValueOnce(Error('lost'));const a=recoveryMount();await a.result.current(payload);expect(await a.result.current({...payload,notes:'changed'})).toMatchObject({uncertain:true});
 const write=ownedStore().setViewState.bind(ownedStore());vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);throw Error('private pending');});
 expect(await a.result.current(payload)).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.updateAction).toHaveBeenCalledTimes(1);
});
it.each(['missing','replaced','read'])('W35 blocks a %s namespace witness before another dispatch',async fault=>{
 const a=recoveryMount();if(fault==='missing')ownedStore().clearDraftsForTab('child-save');
 if(fault==='replaced')ownedStore().setViewState(pendingKey,JSON.stringify({id:8,revision:'99'}));
 if(fault==='read')vi.spyOn(ownedStore(),'getViewState').mockImplementation(()=>{throw Error('private read');});
 expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.updateAction).not.toHaveBeenCalled();vi.restoreAllMocks();
});
const recoveryMount=()=>renderHook(({row})=>usePartyChildSave('form',row,m),{initialProps:{row:editRow}});
it('W35 discovers an older pending revision through unknown then known and two remounts',async()=>{
 m.updateAction.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({success:false,error:'Known rejection'}).mockResolvedValueOnce({success:true,data:{...receipt,replayed:true}});
 const a=recoveryMount();expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();
 const b=recoveryMount();b.rerender({row:{...editRow,workspace_revision:9}});expect(await b.result.current(payload)).toMatchObject({uncertain:true});b.unmount();
 const c=renderHook(()=>usePartyChildSave('form',{...editRow,workspace_revision:9},m));
 expect(await c.result.current({...payload,notes:'changed'})).toMatchObject({success:false});expect(m.updateAction).toHaveBeenCalledTimes(2);
 expect(await c.result.current(payload)).toMatchObject({success:true,data:{replayed:true}});
 expect(m.updateAction.mock.calls[1]).toEqual(m.updateAction.mock.calls[0]);expect(m.updateAction.mock.calls[2]).toEqual(m.updateAction.mock.calls[0]);
 expect(ownedStore().getViewState(pendingKey.replace(':4:save',':9:save'))).toBeUndefined();
});
it('W35 deep copies input and the contract given to the action',async()=>{
 let finish:(v:unknown)=>void=()=>{};let original:unknown;
 m.updateAction.mockImplementationOnce((...args:unknown[])=>{original=JSON.parse(JSON.stringify(args));(args[1] as {revision:string}).revision='99';return new Promise(resolve=>{finish=resolve;});});
 const a=recoveryMount();const input={...payload,extra:{items:[1]}};const first=a.result.current(input);input.extra.items.push(2);expect(m.updateAction.mock.calls[0][0].extra.items).toEqual([1]);
 finish({success:false,uncertain:true});await first;await a.result.current({...payload,extra:{items:[1]}} as typeof payload);expect(m.updateAction.mock.calls[1]).toEqual(original);
});
it.each(['owner','store','record','aba','unmount'])('W35 retires %s and preserves confirmation without changing replacement bytes',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.updateAction.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=recoveryMount();const old=a.result.current;const first=old(payload);const oldStore=ownedStore();
 if(kind==='owner'||kind==='aba'){m.owner='other';a.rerender({row:editRow});if(kind==='aba'){m.owner='child-save';a.rerender({row:editRow});}}
 if(kind==='store'){m.store=createWorkspaceDraftStore();a.rerender({row:editRow});}
 if(kind==='record')a.rerender({row:{...editRow,id:9}});
 if(kind==='unmount')a.unmount();
 oldStore.setViewState(pendingKey,'replacement');finish({success:true,data:receipt});expect(await first).toMatchObject({success:true});expect(oldStore.getViewState(pendingKey)).toBe('replacement');expect(await old(payload)).toMatchObject({success:false});expect(m.updateAction).toHaveBeenCalledTimes(1);
});
it.each(['before','after','ignore','substitute'])('W35 blocks %s begin persistence failure before dispatch',async fault=>{
 const a=recoveryMount();const write=ownedStore().setViewState.bind(ownedStore());
 vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);if(fault==='substitute')write(key,JSON.stringify({id:8,revision:'99'}));if(fault==='before'||fault==='after')throw Error('private begin');});
 expect(await a.result.current(payload)).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.updateAction).not.toHaveBeenCalled();
});
it.each(['before','after','ignore','substitute'])('W35 keeps confirmation after %s acknowledgement failure',async fault=>{
 const a=recoveryMount();const write=ownedStore().setViewState.bind(ownedStore());
 m.updateAction.mockImplementationOnce(async()=>{vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);if(fault==='substitute')write(key,JSON.stringify({id:8,revision:'99'}));if(fault==='before'||fault==='after')throw Error('private ack');});return {success:true,data:receipt};});
 expect(await a.result.current(payload)).toMatchObject({success:true});vi.restoreAllMocks();expect(await a.result.current({...payload,notes:'new'})).toMatchObject({success:false,uncertain:false});expect(m.updateAction).toHaveBeenCalledTimes(1);
});
it('W35 blocks a new competing pending namespace entry during response',async()=>{
 let finish:(v:unknown)=>void=()=>{};m.updateAction.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=recoveryMount();const first=a.result.current(payload);const pending=ownedStore().getViewState(pendingKey)!;
 ownedStore().setViewState(pendingKey.replace(':4:save',':9:save'),pending);finish({success:true,data:receipt});expect(await first).toMatchObject({success:true});expect(ownedStore().getViewState(pendingKey)).toBe(pending);expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.updateAction).toHaveBeenCalledTimes(1);
});
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({owner:'child-save',store:null as unknown,createAction:vi.fn(),updateAction:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
import {usePartyChildSave,PartyChildSaveDialog} from '@/features/master-data/parties/party-child-save-dialog';
const payload={party_id:4,remarks:'Synthetic',is_active:false,renewal_notice_days:0};
const row={id:8,workspace_revision:4},receipt={id:8,revision:'5',changed:true,replayed:false};
beforeEach(()=>{vi.resetAllMocks();m.owner='child-save';m.store=createWorkspaceDraftStore();m.updateAction.mockResolvedValue({success:true,data:receipt});m.createAction.mockResolvedValue({success:true,data:{id:8,document_code:'F06-8',revision:'1',replayed:false}});});afterEach(cleanup);
it('new openings create independent numbered children, not an edit of the prior created child',async()=>{
 const a=renderHook(()=>usePartyChildSave('documents',null,m));expect((await a.result.current(payload)).success).toBe(true);a.unmount();
 const b=renderHook(()=>usePartyChildSave('documents',null,m));await b.result.current({...payload,remarks:'Second'});
 expect(m.createAction).toHaveBeenCalledTimes(2);expect(m.updateAction).not.toHaveBeenCalled();expect(m.createAction.mock.calls[0][1].operationId).not.toBe(m.createAction.mock.calls[1][1].operationId);
});
it('captures opening revision despite refreshed record props',async()=>{
 const a=renderHook(({record})=>usePartyChildSave('contacts',record,m),{initialProps:{record:row}});a.rerender({record:{...row,workspace_revision:9}});await a.result.current(payload);expect(m.updateAction.mock.calls[0][1].revision).toBe('4');
});
it('separate entities and rows never inherit pending identity',async()=>{
 m.updateAction.mockResolvedValue({success:false,uncertain:true});const a=renderHook(()=>usePartyChildSave('contacts',row,m));await a.result.current(payload);a.unmount();
 const b=renderHook(()=>usePartyChildSave('notes',{id:9,workspace_revision:2},m));await b.result.current(payload);
 expect(m.updateAction.mock.calls[1][0].id).toBe(9);expect(m.updateAction.mock.calls[1][1].revision).toBe('2');expect(m.updateAction.mock.calls[1][1].operationId).not.toBe(m.updateAction.mock.calls[0][1].operationId);
});
it.each([false,true])('lost response for edit=%s retains operation across remount and blocks changed values',async editing=>{
 const action=editing?m.updateAction:m.createAction;action.mockRejectedValueOnce(Error('lost'));
 const a=renderHook(()=>usePartyChildSave('same-form',editing?row:null,m));expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();
 const b=renderHook(()=>usePartyChildSave('same-form',editing?row:null,m));expect(await b.result.current({...payload,remarks:'Different'})).toMatchObject({success:false,uncertain:true});expect(action).toHaveBeenCalledTimes(1);
 expect((await b.result.current(payload)).success).toBe(true);expect(action.mock.calls[1]).toEqual(action.mock.calls[0]);
});
it.each([{success:true},{success:true,data:{...receipt,id:9}},{success:true,data:{...receipt,revision:null}}])('incomplete or wrong-record receipt preserves pending operation %#',async result=>{
 m.updateAction.mockResolvedValueOnce(result);const a=renderHook(()=>usePartyChildSave('form',row,m));expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:true});await a.result.current(payload);expect(m.updateAction.mock.calls[1][1]).toEqual(m.updateAction.mock.calls[0][1]);
});
it('known rejection releases pending identity but does not adopt a newer opening revision',async()=>{
 m.updateAction.mockResolvedValueOnce({success:false,error:'Conflict'});const a=renderHook(()=>usePartyChildSave('form',row,m));await a.result.current(payload);await a.result.current({...payload,remarks:'Corrected'});expect(m.updateAction.mock.calls.map(c=>c[1].revision)).toEqual(['4','4']);expect(m.updateAction.mock.calls[1][1].operationId).not.toBe(m.updateAction.mock.calls[0][1].operationId);
});
it('confirmed edit advances next operation revision',async()=>{
 const a=renderHook(()=>usePartyChildSave('form',row,m));await a.result.current(payload);await a.result.current({...payload,remarks:'Next'});expect(m.updateAction.mock.calls.map(c=>c[1].revision)).toEqual(['4','5']);
});
it('same-frame double submission dispatches only one request',async()=>{
 let finish:(r:unknown)=>void=()=>{};m.updateAction.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const a=renderHook(()=>usePartyChildSave('form',row,m));const first=a.result.current(payload);expect((await a.result.current(payload)).success).toBe(false);expect(m.updateAction).toHaveBeenCalledTimes(1);finish({success:true,data:receipt});expect((await first).success).toBe(true);
});
it('no-op is truthful and false/zero survive the adapter',async()=>{
 m.updateAction.mockResolvedValueOnce({success:true,data:{...receipt,revision:'4',changed:false}});const a=renderHook(()=>usePartyChildSave('form',row,m));expect(await a.result.current(payload)).toMatchObject({success:true,data:{changed:false}});expect(m.updateAction.mock.calls[0][0]).toMatchObject(payload);
});
it('actual shared dialog keeps retry usable and closing disabled after response loss',async()=>{
 m.updateAction.mockResolvedValueOnce({success:false,uncertain:true,error:'Unknown outcome'});
 render(<PartyChildSaveDialog open title="Synthetic child" mode="edit" formId="dialog" record={row} createAction={m.createAction} updateAction={m.updateAction} onOpenChange={vi.fn()} onSubmit={async save=>{await save(payload);}}><p>Test fields</p></PartyChildSaveDialog>);
 fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true));expect(screen.getByRole('alert').textContent).toContain('not confirmed');
 expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(m.updateAction).toHaveBeenCalledTimes(2));expect(m.updateAction.mock.calls[1]).toEqual(m.updateAction.mock.calls[0]);await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(false));
});
