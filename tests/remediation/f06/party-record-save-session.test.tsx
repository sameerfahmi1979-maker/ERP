// @vitest-environment jsdom
import {cleanup,renderHook} from '@testing-library/react';
import {StrictMode,type ReactNode} from 'react';
it('W25 remains usable in StrictMode',async()=>{const a=renderHook(()=>usePartyRecordSave('strict',opening), {wrapper:({children}:{children:ReactNode})=><StrictMode>{children}</StrictMode>});expect(await a.result.current(clone(payload))).toMatchObject({success:true});expect(m.update).toHaveBeenCalledTimes(1);});
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {Party} from '@/features/master-data/parties/party-types';
const m=vi.hoisted(()=>({owner:'party-save',store:null as unknown,create:vi.fn(),update:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/server/actions/master-data/parties',()=>({createParty:m.create,updateParty:m.update}));
import {usePartyRecordSave} from '@/features/master-data/parties/use-party-record-save';
const payload={display_name:'F06 synthetic',legal_name_en:'F06 synthetic',party_nature_id:1,party_status_id:1,country_id:1,is_active:false};
const saveKey='draft:tab:party-save:numbered-party:form:save';
it.each(['ignore','substitute'])('W25 rejects a silently %s begin write before dispatch',async mode=>{
 const a=mount();const write=store().setViewState.bind(store());const before=store().getViewState(saveKey);
 const replacement=JSON.stringify({id:8,revision:'99',pending:{fingerprint:JSON.stringify(payload),contract:{operationId:'00000000-0000-4000-8000-000000000033',revision:'99'}}});
 vi.spyOn(store(),'setViewState').mockImplementation((key)=>{if(mode==='substitute')write(key,replacement);});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(store().getViewState(saveKey)).toBe(mode==='ignore'?before:replacement);expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it.each(['ignore','substitute'])('W25 preserves confirmation after silently %s acknowledgement',async mode=>{
 const a=mount();const write=store().setViewState.bind(store());const replacement=JSON.stringify({id:99,revision:'99'});
 m.update.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation(key=>{if(mode==='substitute')write(key,replacement);});return {success:true,data:receipt};});
 expect(await a.result.current(clone(payload))).toMatchObject({success:true,data:receipt});vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.update).toHaveBeenCalledTimes(1);if(mode==='substitute')expect(store().getViewState(saveKey)).toBe(replacement);
});
it.each(['ignore','substitute'])('W25 preserves known rejection after silently %s clearing',async mode=>{
 const a=mount();const write=store().setViewState.bind(store());const replacement=JSON.stringify({id:99,revision:'99'});
 m.update.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation(key=>{if(mode==='substitute')write(key,replacement);});return {success:false,error:'Known rejection'};});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false,uncertain:false,error:'Known rejection'});vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.update).toHaveBeenCalledTimes(1);if(mode==='substitute')expect(store().getViewState(saveKey)).toBe(replacement);
});
it.each(['before','after'])('W25 unchanged pending %s-write failure stops while changed input remains retryable',async when=>{
 m.update.mockRejectedValueOnce(Error('lost'));const a=mount();await a.result.current(clone(payload));
 expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:true});expect(m.update).toHaveBeenCalledTimes(1);
 const original=store().setViewState.bind(store());vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')original(key,value);throw Error('private pending write');});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(1);
});
it.each(['missing','replaced','read error'])('W25 confirmed response with %s witness preserves receipt and replacement',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=mount();const first=a.result.current(clone(payload));
 if(kind==='missing')store().clearDraftsForTab('party-save');
 if(kind==='replaced')store().setViewState(saveKey,JSON.stringify({id:8,revision:'99'}));
 if(kind==='read error')vi.spyOn(store(),'getViewState').mockImplementation(()=>{throw Error('private response read');});
 finish({success:true,data:receipt});expect(await first).toMatchObject({success:true,data:receipt});vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.update).toHaveBeenCalledTimes(1);
 if(kind==='missing')expect(store().getViewState(saveKey)).toBeUndefined();if(kind==='replaced')expect(store().getViewState(saveKey)).toBe(JSON.stringify({id:8,revision:'99'}));
});
it('W25 begin readback failure does not dispatch or resume the mutated closure',async()=>{
 const a=mount();const read=store().getViewState.bind(store());const write=store().setViewState.bind(store());let wrote=false;
 vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{write(key,value);wrote=true;});
 vi.spyOn(store(),'getViewState').mockImplementation(key=>{if(wrote)throw Error('private begin read');return read(key);});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it.each(['owner','store'])('W25 cannot dispatch without an opening %s',async kind=>{
 if(kind==='owner')m.owner='';else m.store=null;
 const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
const store=()=>m.store as ReturnType<typeof createWorkspaceDraftStore>;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const opening={id:8,workspace_revision:4} as Party;
const changed={...payload,display_name:'Changed payload'};
const mount=()=>renderHook(({row,form})=>usePartyRecordSave(form,row),{initialProps:{row:opening,form:'form'}});
it('W25 retains unknown then known through two remounts and exact replay',async()=>{
 m.update.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({success:false,error:'Known rejection'}).mockResolvedValueOnce({success:true,data:{...receipt,replayed:true}});
 const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({uncertain:true});a.unmount();
 const b=mount();b.rerender({row:{...opening,workspace_revision:9},form:'form'});
 expect(await b.result.current(clone(payload))).toMatchObject({success:false,uncertain:true});b.unmount();
 const c=mount();expect(await c.result.current(changed)).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(2);
 expect(await c.result.current(clone(payload))).toMatchObject({success:true,data:{replayed:true}});
 expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
});
it('W25 isolates caller fields and the action contract from the retained request',async()=>{
 let finish:(v:unknown)=>void=()=>{};let original:unknown;
 m.update.mockImplementationOnce((...args:unknown[])=>{original=clone(args);const contract=args[1] as {operationId:string;revision:string};contract.operationId='00000000-0000-4000-8000-000000000099';contract.revision='90';return new Promise(resolve=>{finish=resolve;});});
 const a=mount();const input=clone(payload);const first=a.result.current(input);
 input.display_name='MUTATED';expect((original as unknown[][])[0]).toMatchObject({display_name:payload.display_name});
 finish({success:false,uncertain:true,error:'Lost'});await first;await a.result.current(clone(payload));
 expect(m.update.mock.calls[1]).toEqual(original);
});
it.each(['owner','store','form','record','unmount','aba'])('W25 retires deferred confirmation across %s without touching replacements',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const a=mount();const old=a.result.current;const first=old(clone(payload));const originalStore=store();const before=originalStore.getViewState(saveKey);
 if(kind==='owner'||kind==='aba'){m.owner='other';a.rerender({row:opening,form:'form'});if(kind==='aba'){m.owner='party-save';a.rerender({row:opening,form:'form'});}}
 if(kind==='store'){m.store=createWorkspaceDraftStore();a.rerender({row:opening,form:'form'});}
 if(kind==='form')a.rerender({row:opening,form:'other'});
 if(kind==='record')a.rerender({row:{...opening,id:9},form:'form'});
 if(kind==='unmount')a.unmount();
 const replacement='replacement retained bytes';originalStore.setViewState(saveKey,replacement);
 finish({success:true,data:receipt});expect(await first).toMatchObject({success:true,data:receipt});
 expect(originalStore.getViewState(saveKey)).toBe(replacement);expect(await old(clone(payload))).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(1);expect(before).toContain('pending');
});
it.each(['owner','store','record','aba','unmount'])('W25 preserves first known rejection after %s retirement',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const a=mount();const first=a.result.current(clone(payload));const oldStore=store();
 if(kind==='owner'||kind==='aba'){m.owner='other';a.rerender({row:opening,form:'form'});if(kind==='aba'){m.owner='party-save';a.rerender({row:opening,form:'form'});}}
 if(kind==='store'){m.store=createWorkspaceDraftStore();a.rerender({row:opening,form:'form'});}
 if(kind==='record')a.rerender({row:{...opening,id:9},form:'form'});
 if(kind==='unmount')a.unmount();
 const pending=oldStore.getViewState(saveKey);finish({success:false,error:'Known rejection'});expect(await first).toMatchObject({success:false,error:'Known rejection'});expect((await first).uncertain).not.toBe(true);expect(oldStore.getViewState(saveKey)).toBe(pending);
});
it.each(['missing','replaced','read error'])('W25 blocks %s witness before dispatch',async kind=>{
 const a=mount();const before=store().getViewState(saveKey);
 if(kind==='missing')store().clearDraftsForTab('party-save');
 if(kind==='replaced')store().setViewState(saveKey,JSON.stringify({id:8,revision:'99'}));
 if(kind==='read error')vi.spyOn(store(),'getViewState').mockImplementation(()=>{throw Error('private read');});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
 if(kind==='replaced')expect(store().getViewState(saveKey)).toBe(JSON.stringify({id:8,revision:'99'}));expect(before).toBeDefined();
});
it.each(['before','after'])('W25 blocks a failed %s-write begin without dispatch',async when=>{
 const a=mount();const original=store().setViewState.bind(store());
 vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')original(key,value);throw Error('private write');});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it.each(['before','after','readback'])('W25 confirmed receipt survives %s acknowledgement fault and blocks new dispatch',async when=>{
 const a=mount();const original=store().setViewState.bind(store());let acknowledged=false;
 m.update.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when!=='before')original(key,value);acknowledged=true;if(when!=='readback')throw Error('private ack');});if(when==='readback'){const read=store().getViewState.bind(store());vi.spyOn(store(),'getViewState').mockImplementation(key=>{if(acknowledged)throw Error('private readback');return read(key);});}return {success:true,data:receipt};});
 expect(await a.result.current(clone(payload))).toMatchObject({success:true,data:receipt});vi.restoreAllMocks();
 const next=await a.result.current(changed);expect(next).toMatchObject({success:false,uncertain:false});expect(next.error).toMatch(/confirmed|saved/i);expect(m.update).toHaveBeenCalledTimes(1);
});
it.each(['before','after'])('W25 first-known rejection stays known after %s clearing fault',async when=>{
 const a=mount();const original=store().setViewState.bind(store());m.update.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')original(key,value);throw Error('private clear');});return {success:false,error:'Known rejection'};});
 const result=await a.result.current(clone(payload));expect(result).toMatchObject({success:false,error:'Known rejection'});expect(result.uncertain).not.toBe(true);vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.update).toHaveBeenCalledTimes(1);
});
it.each(['bad json','extra','null pending','bad uuid','wrong row'])('W25 preserves invalid retained %s without dispatch',async kind=>{
 const raw=kind==='bad json'?'{broken':JSON.stringify(kind==='extra'?{id:8,revision:'4',extra:true}:kind==='null pending'?{id:8,revision:'4',pending:null}:kind==='bad uuid'?{id:8,revision:'4',pending:{fingerprint:JSON.stringify(payload),contract:{operationId:'bad',revision:'4'}}}:{id:9,revision:'4'});
 store().setViewState(saveKey,raw);const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();expect(store().getViewState(saveKey)).toBe(raw);
});
it('W25 keeps legacy pending bytes recoverable with no marker',async()=>{
 const operationId='00000000-0000-4000-8000-000000000018';store().setViewState(saveKey,JSON.stringify({id:8,revision:'4',pending:{fingerprint:JSON.stringify(payload),contract:{operationId,revision:'4'}}}));
 m.update.mockResolvedValueOnce({success:false,error:'Known rejection'});const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({uncertain:true});expect(m.update.mock.calls[0][1]).toEqual({operationId,revision:'4'});expect(store().getViewState(saveKey)).toContain(operationId);
});
it('W25 blocks new dispatch after a changed witness during an unknown response',async()=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=mount();const first=a.result.current(clone(payload));store().setViewState(saveKey,'replacement');finish({success:false,uncertain:true});await first;expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.update).toHaveBeenCalledTimes(1);expect(store().getViewState(saveKey)).toBe('replacement');
});
const party={id:8,workspace_revision:4} as Party;
it('W25 supplied runtime id cannot retarget an edit',async()=>{
 const a=mount();await a.result.current({...payload,id:99} as typeof payload);expect(m.update.mock.calls[0][0].id).toBe(8);
});
it('W25 deep copies nested JSON-compatible input before dispatch',async()=>{
 let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const a=mount();const input={...payload,extra:{items:[1]}};const first=a.result.current(input);input.extra.items.push(2);expect(m.update.mock.calls[0][0].extra.items).toEqual([1]);finish({success:false,uncertain:true});await first;
 await a.result.current({...payload,extra:{items:[1]}} as typeof payload);expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);
});
it('W25 promotes the acknowledged created id without retiring the usable draft',async()=>{
 const a=renderHook(({row}:{row:Party|null})=>usePartyRecordSave('form',row),{initialProps:{row:null as Party|null}});
 await a.result.current(payload);a.rerender({row:party});await a.result.current(changed);expect(m.create).toHaveBeenCalledTimes(1);expect(m.update).toHaveBeenCalledTimes(1);expect(m.update.mock.calls[0][1].revision).toBe('1');
});
it.each(['before','after'])('W25 acknowledgement-failed creation does not adopt promotion after %s write',async when=>{
 const a=renderHook(({row}:{row:Party|null})=>usePartyRecordSave('form',row),{initialProps:{row:null as Party|null}});const write=store().setViewState.bind(store());
 m.create.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')write(key,value);throw Error('private creation ack');});return {success:true,data:{id:8,revision:'1',replayed:false,party_code:'F06-8'}};});
 expect(await a.result.current(payload)).toMatchObject({success:true,data:{id:8,party_code:'F06-8'}});vi.restoreAllMocks();a.rerender({row:party});expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.update).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalledTimes(1);
});
const receipt={id:8,revision:'5',changed:true,replayed:false};
beforeEach(()=>{vi.restoreAllMocks();vi.resetAllMocks();m.owner='party-save';m.store=createWorkspaceDraftStore();m.update.mockResolvedValue({success:true,data:receipt});m.create.mockResolvedValue({success:true,data:{id:8,party_code:'F06-8',revision:'1',replayed:false}});});afterEach(cleanup);
it('create becomes edit with its confirmed identity and revision, including a remount',async()=>{
 const a=renderHook(()=>usePartyRecordSave('form'));expect((await a.result.current(payload)).success).toBe(true);a.unmount();
 const b=renderHook(()=>usePartyRecordSave('form'));await b.result.current({...payload,display_name:'Changed'});
 expect(m.create).toHaveBeenCalledTimes(1);expect(m.update.mock.calls[0][0]).toMatchObject({id:8,display_name:'Changed'});expect(m.update.mock.calls[0][1].revision).toBe('1');
});
it('filtered-list type is part of creation, but never silently written by later overview edits',async()=>{
 const a=renderHook(()=>usePartyRecordSave('form',undefined,'CUSTOMER'));await a.result.current(payload);a.unmount();
 expect(m.create.mock.calls[0][0]).toMatchObject({initial_type_code:'CUSTOMER'});
 const b=renderHook(()=>usePartyRecordSave('form',undefined,'CUSTOMER'));await b.result.current({...payload,remarks:'Updated'});
 expect(m.update.mock.calls[0][0]).not.toHaveProperty('initial_type_code');expect(m.update.mock.calls[0][0]).not.toHaveProperty('primary_party_type_id');
});
it('a lost creation response binds the initial type across remount and retry',async()=>{
 m.create.mockRejectedValueOnce(Error('lost'));
 const a=renderHook(()=>usePartyRecordSave('form',undefined,'CUSTOMER'));expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();
 const b=renderHook(({code})=>usePartyRecordSave('form',undefined,code),{initialProps:{code:'VENDOR'}});
 expect((await b.result.current(payload)).success).toBe(false);expect(m.create).toHaveBeenCalledTimes(1);
 b.rerender({code:'CUSTOMER'});expect((await b.result.current(payload)).success).toBe(true);expect(m.create.mock.calls[1]).toEqual(m.create.mock.calls[0]);
});
it('opening revision survives a refreshed server prop under an existing draft',async()=>{
 const a=renderHook(({row})=>usePartyRecordSave('form',row),{initialProps:{row:party}});a.rerender({row:{...party,workspace_revision:9}});await a.result.current(payload);expect(m.update.mock.calls[0][1].revision).toBe('4');
});
it('confirmed edit receipt advances only the next operation',async()=>{const a=renderHook(()=>usePartyRecordSave('form',party));await a.result.current(payload);await a.result.current({...payload,display_name:'Next'});expect(m.update.mock.calls.map(c=>c[1].revision)).toEqual(['4','5']);expect(m.update.mock.calls[1][1].operationId).not.toBe(m.update.mock.calls[0][1].operationId);});
it('response loss retains the exact update across navigation and disallows changed payload',async()=>{
 m.update.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({success:true,data:{...receipt,replayed:true}});
 const a=renderHook(()=>usePartyRecordSave('form',party));expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();
 const b=renderHook(()=>usePartyRecordSave('form',party));expect((await b.result.current({...payload,display_name:'Different'})).success).toBe(false);expect(m.update).toHaveBeenCalledTimes(1);
 expect((await b.result.current(payload)).success).toBe(true);expect(m.update.mock.calls[1][1]).toEqual(m.update.mock.calls[0][1]);
});
it.each([{success:true},{success:true,data:{...receipt,id:9}},{success:true,data:{...receipt,revision:null}}])('does not accept a malformed/wrong-identity edit receipt %#',async response=>{
 m.update.mockResolvedValueOnce(response);const a=renderHook(()=>usePartyRecordSave('form',party));expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:true});await a.result.current(payload);expect(m.update.mock.calls[1][1]).toEqual(m.update.mock.calls[0][1]);
});
it('a conflict releases the operation but never adopts a guessed newer revision',async()=>{
 m.update.mockResolvedValueOnce({success:false,error:'conflict'});const a=renderHook(()=>usePartyRecordSave('form',party));await a.result.current(payload);await a.result.current({...payload,display_name:'Corrected'});expect(m.update.mock.calls.map(c=>c[1].revision)).toEqual(['4','4']);expect(m.update.mock.calls[0][1].operationId).not.toBe(m.update.mock.calls[1][1].operationId);
});
it('double submission reaches the action once',async()=>{
 let finish:(r:unknown)=>void=()=>{};m.update.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const a=renderHook(()=>usePartyRecordSave('form',party));const first=a.result.current(payload);expect((await a.result.current(payload)).success).toBe(false);expect(m.update).toHaveBeenCalledTimes(1);finish({success:true,data:receipt});expect((await first).success).toBe(true);
});
it('no-op remains an explicit successful no-change receipt',async()=>{
 m.update.mockResolvedValueOnce({success:true,data:{...receipt,revision:'4',changed:false}});const a=renderHook(()=>usePartyRecordSave('form',party));expect(await a.result.current(payload)).toMatchObject({success:true,data:{changed:false,revision:'4'}});
});
