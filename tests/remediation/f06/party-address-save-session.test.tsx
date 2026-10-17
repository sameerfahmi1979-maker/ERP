// @vitest-environment jsdom
import {cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useLayoutEffect} from 'react';
it('W35 fresh StrictMode setup can retry while disposed setup cannot settle or release its flight',async()=>{
 const finishes:((v:unknown)=>void)[]=[],requests:Promise<unknown>[]=[];
 m.update.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));
 const a=renderHook(()=>{
  const save=usePartyAddressSave('form',editRow);
  useLayoutEffect(()=>{requests.push(save(payload));},[save]);
  return save;
 },{reactStrictMode:true});
 expect(m.update).toHaveBeenCalledTimes(2);expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);
 const pending=ownedStore().getViewState(pendingKey);finishes[0]({success:true,data:receipt});await requests[0];expect(ownedStore().getViewState(pendingKey)).toBe(pending);
 expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(2);
 finishes[1]({success:false,uncertain:true});await requests[1];m.update.mockResolvedValueOnce({success:true,data:receipt});expect(await a.result.current(payload)).toMatchObject({success:true});expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
});
const ownedStore=()=>m.store as ReturnType<typeof createWorkspaceDraftStore>;
const editRow={id:8,workspace_revision:4} as PartyAddress;
const pendingKey='draft:tab:address-save:party-address:form:8:4:save';
it.each(['before','after'])('W35 first-known %s clearing fault stays known and blocks further writes',async fault=>{
 const a=recoveryMount();const write=ownedStore().setViewState.bind(ownedStore());
 m.update.mockImplementationOnce(async()=>{vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);throw Error('private clear');});return {success:false,error:'Known rejection'};});
 expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:false,error:'Known rejection'});vi.restoreAllMocks();expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:false});expect(m.update).toHaveBeenCalledTimes(1);
});
it.each(['before','after'])('W35 exact pending %s write fault stops but changed-input refusal stays retryable',async fault=>{
 m.update.mockRejectedValueOnce(Error('lost'));const a=recoveryMount();await a.result.current(payload);expect(await a.result.current({...payload,notes:'changed'})).toMatchObject({uncertain:true});
 const write=ownedStore().setViewState.bind(ownedStore());vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);throw Error('private pending');});
 expect(await a.result.current(payload)).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(1);
});
it.each(['missing','replaced','read'])('W35 blocks a %s namespace witness before another dispatch',async fault=>{
 const a=recoveryMount();if(fault==='missing')ownedStore().clearDraftsForTab('address-save');
 if(fault==='replaced')ownedStore().setViewState(pendingKey,JSON.stringify({id:8,revision:'99'}));
 if(fault==='read')vi.spyOn(ownedStore(),'getViewState').mockImplementation(()=>{throw Error('private read');});
 expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();vi.restoreAllMocks();
});
const recoveryMount=()=>renderHook(({row})=>usePartyAddressSave('form',row),{initialProps:{row:editRow}});
it('W35 discovers an older pending revision through unknown then known and two remounts',async()=>{
 m.update.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({success:false,error:'Known rejection'}).mockResolvedValueOnce({success:true,data:{...receipt,replayed:true}});
 const a=recoveryMount();expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();
 const b=recoveryMount();b.rerender({row:{...editRow,workspace_revision:9}});expect(await b.result.current(payload)).toMatchObject({uncertain:true});b.unmount();
 const c=renderHook(()=>usePartyAddressSave('form',{...editRow,workspace_revision:9}));
 expect(await c.result.current({...payload,notes:'changed'})).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(2);
 expect(await c.result.current(payload)).toMatchObject({success:true,data:{replayed:true}});
 expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
 expect(ownedStore().getViewState(pendingKey.replace(':4:save',':9:save'))).toBeUndefined();
});
it('W35 deep copies input and the contract given to the action',async()=>{
 let finish:(v:unknown)=>void=()=>{};let original:unknown;
 m.update.mockImplementationOnce((...args:unknown[])=>{original=JSON.parse(JSON.stringify(args));(args[1] as {revision:string}).revision='99';return new Promise(resolve=>{finish=resolve;});});
 const a=recoveryMount();const input={...payload,extra:{items:[1]}};const first=a.result.current(input);input.extra.items.push(2);expect(m.update.mock.calls[0][0].extra.items).toEqual([1]);
 finish({success:false,uncertain:true});await first;await a.result.current({...payload,extra:{items:[1]}} as typeof payload);expect(m.update.mock.calls[1]).toEqual(original);
});
it.each(['owner','store','record','aba','unmount'])('W35 retires %s and preserves confirmation without changing replacement bytes',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=recoveryMount();const old=a.result.current;const first=old(payload);const oldStore=ownedStore();
 if(kind==='owner'||kind==='aba'){m.owner='other';a.rerender({row:editRow});if(kind==='aba'){m.owner='address-save';a.rerender({row:editRow});}}
 if(kind==='store'){m.store=createWorkspaceDraftStore();a.rerender({row:editRow});}
 if(kind==='record')a.rerender({row:{...editRow,id:9}});
 if(kind==='unmount')a.unmount();
 oldStore.setViewState(pendingKey,'replacement');finish({success:true,data:receipt});expect(await first).toMatchObject({success:true});expect(oldStore.getViewState(pendingKey)).toBe('replacement');expect(await old(payload)).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(1);
});
it.each(['before','after','ignore','substitute'])('W35 blocks %s begin persistence failure before dispatch',async fault=>{
 const a=recoveryMount();const write=ownedStore().setViewState.bind(ownedStore());
 vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);if(fault==='substitute')write(key,JSON.stringify({id:8,revision:'99'}));if(fault==='before'||fault==='after')throw Error('private begin');});
 expect(await a.result.current(payload)).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it.each(['before','after','ignore','substitute'])('W35 keeps confirmation after %s acknowledgement failure',async fault=>{
 const a=recoveryMount();const write=ownedStore().setViewState.bind(ownedStore());
 m.update.mockImplementationOnce(async()=>{vi.spyOn(ownedStore(),'setViewState').mockImplementation((key,value)=>{if(fault==='after')write(key,value);if(fault==='substitute')write(key,JSON.stringify({id:8,revision:'99'}));if(fault==='before'||fault==='after')throw Error('private ack');});return {success:true,data:receipt};});
 expect(await a.result.current(payload)).toMatchObject({success:true});vi.restoreAllMocks();expect(await a.result.current({...payload,notes:'new'})).toMatchObject({success:false,uncertain:false});expect(m.update).toHaveBeenCalledTimes(1);
});
it('W35 blocks a new competing pending namespace entry during response',async()=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=recoveryMount();const first=a.result.current(payload);const pending=ownedStore().getViewState(pendingKey)!;
 ownedStore().setViewState(pendingKey.replace(':4:save',':9:save'),pending);finish({success:true,data:receipt});expect(await first).toMatchObject({success:true});expect(ownedStore().getViewState(pendingKey)).toBe(pending);expect(await a.result.current(payload)).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(1);
});
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {PartyAddress} from '@/features/master-data/parties/party-types';
const m=vi.hoisted(()=>({owner:'address-save',store:null as unknown,create:vi.fn(),update:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/server/actions/master-data/party-addresses',()=>({createPartyAddress:m.create,updatePartyAddress:m.update}));
import {usePartyAddressSave} from '@/features/master-data/parties/use-party-address-save';
const payload={party_id:4,country_id:1,address_type_id:1,is_active:false,is_primary:false,is_billing_address:false,is_shipping_address:false,is_site_address:false,latitude:0,longitude:0};
const address={id:8,workspace_revision:4} as PartyAddress;
const receipt={id:8,revision:'5',changed:true,replayed:false};
beforeEach(()=>{vi.resetAllMocks();m.owner='address-save';m.store=createWorkspaceDraftStore();m.update.mockResolvedValue({success:true,data:receipt});m.create.mockResolvedValue({success:true,data:{id:8,address_code:'F06-8',revision:'1',replayed:false}});});afterEach(cleanup);
it('new openings create independent addresses, never edit the prior added address',async()=>{
 const a=renderHook(()=>usePartyAddressSave('form'));await a.result.current(payload);a.unmount();
 const b=renderHook(()=>usePartyAddressSave('form'));await b.result.current({...payload,address_name:'Second'});
 expect(m.create).toHaveBeenCalledTimes(2);expect(m.update).not.toHaveBeenCalled();expect(m.create.mock.calls[0][1].operationId).not.toBe(m.create.mock.calls[1][1].operationId);
});
it('captures the opening revision despite a later cache refresh',async()=>{
 const a=renderHook(({row})=>usePartyAddressSave('form',row),{initialProps:{row:address}});a.rerender({row:{...address,workspace_revision:9}});await a.result.current(payload);expect(m.update.mock.calls[0][1].revision).toBe('4');
});
it('separate edited rows never share revision or pending operation',async()=>{
 m.update.mockResolvedValue({success:false,uncertain:true});const a=renderHook(()=>usePartyAddressSave('form',address));await a.result.current(payload);a.unmount();
 const b=renderHook(()=>usePartyAddressSave('form',{...address,id:9,workspace_revision:2}));await b.result.current(payload);
 expect(m.update.mock.calls[1][0].id).toBe(9);expect(m.update.mock.calls[1][1].revision).toBe('2');expect(m.update.mock.calls[1][1].operationId).not.toBe(m.update.mock.calls[0][1].operationId);
});
it.each([false,true])('lost %s response survives remount and blocks changed values',async edit=>{
 const action=edit?m.update:m.create;action.mockRejectedValueOnce(Error('lost'));
 const a=renderHook(()=>usePartyAddressSave('form',edit?address:null));expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();
 const b=renderHook(()=>usePartyAddressSave('form',edit?address:null));expect(await b.result.current({...payload,notes:'different'})).toMatchObject({success:false,uncertain:true});expect(action).toHaveBeenCalledTimes(1);
 expect((await b.result.current(payload)).success).toBe(true);expect(action.mock.calls[1]).toEqual(action.mock.calls[0]);
});
it.each([{success:true},{success:true,data:{...receipt,id:9}},{success:true,data:{...receipt,revision:null}}])('malformed/wrong record receipt keeps the original request %#',async result=>{
 m.update.mockResolvedValueOnce(result);const a=renderHook(()=>usePartyAddressSave('form',address));expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:true});await a.result.current(payload);expect(m.update.mock.calls[1][1]).toEqual(m.update.mock.calls[0][1]);
});
it('known rejection releases only the operation, not its opening revision',async()=>{
 m.update.mockResolvedValueOnce({success:false,error:'Conflict'});const a=renderHook(()=>usePartyAddressSave('form',address));await a.result.current(payload);await a.result.current({...payload,notes:'corrected'});expect(m.update.mock.calls.map(c=>c[1].revision)).toEqual(['4','4']);expect(m.update.mock.calls[1][1].operationId).not.toBe(m.update.mock.calls[0][1].operationId);
});
it('confirmed edit advances only the next request revision',async()=>{
 const a=renderHook(()=>usePartyAddressSave('form',address));await a.result.current(payload);await a.result.current({...payload,notes:'Next'});expect(m.update.mock.calls.map(c=>c[1].revision)).toEqual(['4','5']);
});
it('same-frame duplicate submission dispatches once',async()=>{
 let finish:(r:unknown)=>void=()=>{};m.update.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const a=renderHook(()=>usePartyAddressSave('form',address));const first=a.result.current(payload);expect((await a.result.current(payload)).success).toBe(false);expect(m.update).toHaveBeenCalledTimes(1);finish({success:true,data:receipt});expect((await first).success).toBe(true);
});
it('truthfully returns a no-op result and preserves false and zero payload values',async()=>{
 m.update.mockResolvedValueOnce({success:true,data:{...receipt,revision:'4',changed:false}});const a=renderHook(()=>usePartyAddressSave('form',address));expect(await a.result.current(payload)).toMatchObject({success:true,data:{changed:false}});expect(m.update.mock.calls[0][0]).toMatchObject(payload);
});
