// @vitest-environment jsdom
import {cleanup,renderHook} from '@testing-library/react';
import {StrictMode,type ReactNode} from 'react';
it('W25 remains usable in StrictMode',async()=>{const a=renderHook(()=>usePartyTypeSave(8,'4'), {wrapper:({children}:{children:ReactNode})=><StrictMode>{children}</StrictMode>});expect(await a.result.current(clone(payload))).toMatchObject({success:true});expect(m.save).toHaveBeenCalledTimes(1);});
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({store:null as unknown,save:vi.fn(),owner:'type-save'}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/server/actions/master-data/parties',()=>({savePartyTypeAssignments:m.save}));
import {usePartyTypeSave} from '@/features/master-data/parties/use-party-type-save';
const saveKey='draft:tab:type-save:party-types:8:save';
it.each(['ignore','substitute'])('W25 rejects a silently %s begin write before dispatch',async mode=>{
 const a=mount();const write=store().setViewState.bind(store());const before=store().getViewState(saveKey);
 const replacement=JSON.stringify({id:8,revision:'99',pending:{fingerprint:JSON.stringify(payload),contract:{operationId:'00000000-0000-4000-8000-000000000033',revision:'99'}}});
 vi.spyOn(store(),'setViewState').mockImplementation((key)=>{if(mode==='substitute')write(key,replacement);});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(store().getViewState(saveKey)).toBe(mode==='ignore'?before:replacement);expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();
});
it.each(['ignore','substitute'])('W25 preserves confirmation after silently %s acknowledgement',async mode=>{
 const a=mount();const write=store().setViewState.bind(store());const replacement=JSON.stringify({id:99,revision:'99'});
 m.save.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation(key=>{if(mode==='substitute')write(key,replacement);});return {success:true,data:receipt};});
 expect(await a.result.current(clone(payload))).toMatchObject({success:true,data:receipt});vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.save).toHaveBeenCalledTimes(1);if(mode==='substitute')expect(store().getViewState(saveKey)).toBe(replacement);
});
it.each(['ignore','substitute'])('W25 preserves known rejection after silently %s clearing',async mode=>{
 const a=mount();const write=store().setViewState.bind(store());const replacement=JSON.stringify({id:99,revision:'99'});
 m.save.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation(key=>{if(mode==='substitute')write(key,replacement);});return {success:false,error:'Known rejection'};});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false,uncertain:false,error:'Known rejection'});vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.save).toHaveBeenCalledTimes(1);if(mode==='substitute')expect(store().getViewState(saveKey)).toBe(replacement);
});
it.each(['before','after'])('W25 unchanged pending %s-write failure stops while changed input remains retryable',async when=>{
 m.save.mockRejectedValueOnce(Error('lost'));const a=mount();await a.result.current(clone(payload));
 expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:true});expect(m.save).toHaveBeenCalledTimes(1);
 const original=store().setViewState.bind(store());vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')original(key,value);throw Error('private pending write');});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).toHaveBeenCalledTimes(1);
});
it.each(['missing','replaced','read error'])('W25 confirmed response with %s witness preserves receipt and replacement',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=mount();const first=a.result.current(clone(payload));
 if(kind==='missing')store().clearDraftsForTab('type-save');
 if(kind==='replaced')store().setViewState(saveKey,JSON.stringify({id:8,revision:'99'}));
 if(kind==='read error')vi.spyOn(store(),'getViewState').mockImplementation(()=>{throw Error('private response read');});
 finish({success:true,data:receipt});expect(await first).toMatchObject({success:true,data:receipt});vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.save).toHaveBeenCalledTimes(1);
 if(kind==='missing')expect(store().getViewState(saveKey)).toBeUndefined();if(kind==='replaced')expect(store().getViewState(saveKey)).toBe(JSON.stringify({id:8,revision:'99'}));
});
it('W25 begin readback failure does not dispatch or resume the mutated closure',async()=>{
 const a=mount();const read=store().getViewState.bind(store());const write=store().setViewState.bind(store());let wrote=false;
 vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{write(key,value);wrote=true;});
 vi.spyOn(store(),'getViewState').mockImplementation(key=>{if(wrote)throw Error('private begin read');return read(key);});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();
});
it.each(['owner','store'])('W25 cannot dispatch without an opening %s',async kind=>{
 if(kind==='owner')m.owner='';else m.store=null;
 const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();
});
const store=()=>m.store as ReturnType<typeof createWorkspaceDraftStore>;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const opening={id:8,workspace_revision:4};
const changed={selected:[],primary:null};
const mount=()=>renderHook(({row})=>usePartyTypeSave(row.id,String(row.workspace_revision)),{initialProps:{row:opening,form:'form'}});
it('W25 retains unknown then known through two remounts and exact replay',async()=>{
 m.save.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({success:false,error:'Known rejection'}).mockResolvedValueOnce({success:true,data:{...receipt,replayed:true}});
 const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({uncertain:true});a.unmount();
 const b=mount();b.rerender({row:{...opening,workspace_revision:9},form:'form'});
 expect(await b.result.current(clone(payload))).toMatchObject({success:false,uncertain:true});b.unmount();
 const c=mount();expect(await c.result.current(changed)).toMatchObject({success:false});expect(m.save).toHaveBeenCalledTimes(2);
 expect(await c.result.current(clone(payload))).toMatchObject({success:true,data:{replayed:true}});
 expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);expect(m.save.mock.calls[2]).toEqual(m.save.mock.calls[0]);
});
it('W25 isolates caller fields and the action contract from the retained request',async()=>{
 let finish:(v:unknown)=>void=()=>{};let original:unknown;
 m.save.mockImplementationOnce((...args:unknown[])=>{original=clone(args);const contract=args[3] as {operationId:string;revision:string};contract.operationId='00000000-0000-4000-8000-000000000099';contract.revision='90';return new Promise(resolve=>{finish=resolve;});});
 const a=mount();const input=clone(payload);const first=a.result.current(input);
 input.selected.push(2);expect(m.save.mock.calls[0][1]).toEqual([1]);
 finish({success:false,uncertain:true,error:'Lost'});await first;await a.result.current(clone(payload));
 expect(m.save.mock.calls[1]).toEqual(original);
});
it.each(['owner','store','record','unmount','aba'])('W25 retires deferred confirmation across %s without touching replacements',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const a=mount();const old=a.result.current;const first=old(clone(payload));const originalStore=store();const before=originalStore.getViewState(saveKey);
 if(kind==='owner'||kind==='aba'){m.owner='other';a.rerender({row:opening,form:'form'});if(kind==='aba'){m.owner='type-save';a.rerender({row:opening,form:'form'});}}
 if(kind==='store'){m.store=createWorkspaceDraftStore();a.rerender({row:opening,form:'form'});}
 if(kind==='form')a.rerender({row:opening,form:'other'});
 if(kind==='record')a.rerender({row:{...opening,id:9},form:'form'});
 if(kind==='unmount')a.unmount();
 const replacement='replacement retained bytes';originalStore.setViewState(saveKey,replacement);
 finish({success:true,data:receipt});expect(await first).toMatchObject({success:true,data:receipt});
 expect(originalStore.getViewState(saveKey)).toBe(replacement);expect(await old(clone(payload))).toMatchObject({success:false});expect(m.save).toHaveBeenCalledTimes(1);expect(before).toContain('pending');
});
it.each(['owner','store','record','aba','unmount'])('W25 preserves first known rejection after %s retirement',async kind=>{
 let finish:(v:unknown)=>void=()=>{};m.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const a=mount();const first=a.result.current(clone(payload));const oldStore=store();
 if(kind==='owner'||kind==='aba'){m.owner='other';a.rerender({row:opening,form:'form'});if(kind==='aba'){m.owner='type-save';a.rerender({row:opening,form:'form'});}}
 if(kind==='store'){m.store=createWorkspaceDraftStore();a.rerender({row:opening,form:'form'});}
 if(kind==='record')a.rerender({row:{...opening,id:9},form:'form'});
 if(kind==='unmount')a.unmount();
 const pending=oldStore.getViewState(saveKey);finish({success:false,error:'Known rejection'});expect(await first).toMatchObject({success:false,error:'Known rejection'});expect((await first).uncertain).not.toBe(true);expect(oldStore.getViewState(saveKey)).toBe(pending);
});
it.each(['missing','replaced','read error'])('W25 blocks %s witness before dispatch',async kind=>{
 const a=mount();const before=store().getViewState(saveKey);
 if(kind==='missing')store().clearDraftsForTab('type-save');
 if(kind==='replaced')store().setViewState(saveKey,JSON.stringify({id:8,revision:'99'}));
 if(kind==='read error')vi.spyOn(store(),'getViewState').mockImplementation(()=>{throw Error('private read');});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();
 if(kind==='replaced')expect(store().getViewState(saveKey)).toBe(JSON.stringify({id:8,revision:'99'}));expect(before).toBeDefined();
});
it.each(['before','after'])('W25 blocks a failed %s-write begin without dispatch',async when=>{
 const a=mount();const original=store().setViewState.bind(store());
 vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')original(key,value);throw Error('private write');});
 expect(await a.result.current(clone(payload))).toMatchObject({success:false});vi.restoreAllMocks();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();
});
it.each(['before','after','readback'])('W25 confirmed receipt survives %s acknowledgement fault and blocks new dispatch',async when=>{
 const a=mount();const original=store().setViewState.bind(store());let acknowledged=false;
 m.save.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when!=='before')original(key,value);acknowledged=true;if(when!=='readback')throw Error('private ack');});if(when==='readback'){const read=store().getViewState.bind(store());vi.spyOn(store(),'getViewState').mockImplementation(key=>{if(acknowledged)throw Error('private readback');return read(key);});}return {success:true,data:receipt};});
 expect(await a.result.current(clone(payload))).toMatchObject({success:true,data:receipt});vi.restoreAllMocks();
 const next=await a.result.current(changed);expect(next).toMatchObject({success:false,uncertain:false});expect(next.error).toMatch(/confirmed|saved/i);expect(m.save).toHaveBeenCalledTimes(1);
});
it.each(['before','after'])('W25 first-known rejection stays known after %s clearing fault',async when=>{
 const a=mount();const original=store().setViewState.bind(store());m.save.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation((key,value)=>{if(when==='after')original(key,value);throw Error('private clear');});return {success:false,error:'Known rejection'};});
 const result=await a.result.current(clone(payload));expect(result).toMatchObject({success:false,error:'Known rejection'});expect(result.uncertain).not.toBe(true);vi.restoreAllMocks();expect(await a.result.current(changed)).toMatchObject({success:false,uncertain:false});expect(m.save).toHaveBeenCalledTimes(1);
});
it.each(['bad json','extra','null pending','bad uuid','wrong row'])('W25 preserves invalid retained %s without dispatch',async kind=>{
 const raw=kind==='bad json'?'{broken':JSON.stringify(kind==='extra'?{id:8,revision:'4',extra:true}:kind==='null pending'?{id:8,revision:'4',pending:null}:kind==='bad uuid'?{id:8,revision:'4',pending:{fingerprint:JSON.stringify(payload),contract:{operationId:'bad',revision:'4'}}}:{id:9,revision:'4'});
 store().setViewState(saveKey,raw);const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();expect(store().getViewState(saveKey)).toBe(raw);
});
it('W25 keeps legacy pending bytes recoverable with no marker',async()=>{
 const operationId='00000000-0000-4000-8000-000000000018';store().setViewState(saveKey,JSON.stringify({id:8,revision:'4',pending:{fingerprint:JSON.stringify(payload),contract:{operationId,revision:'4'}}}));
 m.save.mockResolvedValueOnce({success:false,error:'Known rejection'});const a=mount();expect(await a.result.current(clone(payload))).toMatchObject({uncertain:true});expect(m.save.mock.calls[0][3]).toEqual({operationId,revision:'4'});expect(store().getViewState(saveKey)).toContain(operationId);
});
it('W25 blocks new dispatch after a changed witness during an unknown response',async()=>{
 let finish:(v:unknown)=>void=()=>{};m.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const a=mount();const first=a.result.current(clone(payload));store().setViewState(saveKey,'replacement');finish({success:false,uncertain:true});await first;expect(await a.result.current(clone(payload))).toMatchObject({success:false});expect(m.save).toHaveBeenCalledTimes(1);expect(store().getViewState(saveKey)).toBe('replacement');
});
const payload={selected:[1],primary:1},receipt={id:8,revision:'5',changed:true,replayed:false};
beforeEach(()=>{vi.restoreAllMocks();vi.resetAllMocks();m.owner='type-save';m.store=createWorkspaceDraftStore();m.save.mockResolvedValue({success:true,data:receipt});});afterEach(cleanup);
it('keeps the opening revision despite a refreshed prop',async()=>{const a=renderHook(({revision})=>usePartyTypeSave(8,revision),{initialProps:{revision:'4'}});a.rerender({revision:'9'});await a.result.current(payload);expect(m.save.mock.calls[0][3].revision).toBe('4');});
it('confirmed receipt advances the next save but conflict does not guess a new revision',async()=>{const a=renderHook(()=>usePartyTypeSave(8,'4'));await a.result.current(payload);m.save.mockResolvedValueOnce({success:false,error:'conflict'});await a.result.current({selected:[],primary:null});await a.result.current(payload);expect(m.save.mock.calls.map(c=>c[3].revision)).toEqual(['4','5','5']);});
it('retains the original request across a tab remount and blocks changed pending input',async()=>{m.save.mockRejectedValueOnce(Error('lost'));const a=renderHook(()=>usePartyTypeSave(8,'4'));expect(await a.result.current(payload)).toMatchObject({uncertain:true});a.unmount();const b=renderHook(()=>usePartyTypeSave(8,'9'));expect((await b.result.current({selected:[],primary:null})).success).toBe(false);expect(m.save).toHaveBeenCalledTimes(1);await b.result.current(payload);expect(m.save.mock.calls[1][3]).toEqual(m.save.mock.calls[0][3]);});
it.each([undefined,{...receipt,id:9},{...receipt,revision:null}])('malformed receipt cannot clear the original attempt %#',async data=>{m.save.mockResolvedValueOnce({success:true,data});const a=renderHook(()=>usePartyTypeSave(8,'4'));expect(await a.result.current(payload)).toMatchObject({success:false,uncertain:true});await a.result.current(payload);expect(m.save.mock.calls[1][3]).toEqual(m.save.mock.calls[0][3]);});
it('admits one simultaneous submission',async()=>{let done:(v:unknown)=>void=()=>{};m.save.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));const a=renderHook(()=>usePartyTypeSave(8,'4'));const first=a.result.current(payload);expect((await a.result.current(payload)).success).toBe(false);expect(m.save).toHaveBeenCalledTimes(1);done({success:true,data:receipt});expect((await first).success).toBe(true);});
