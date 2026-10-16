// @vitest-environment jsdom
import '../f05/setup';
import {StrictMode} from 'react';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {PartyAddress} from '@/features/master-data/parties/party-types';
import {resolvePartyRevisionOpening,readPartyRevisionSnapshot,assertPartyRevisionSnapshot,withPartyRevisionWrite} from '@/features/master-data/parties/party-revision-recovery';
const m=vi.hoisted(()=>({store:null as unknown,owner:'recovery',create:vi.fn(),update:vi.fn(),toast:vi.fn(),close:vi.fn(),submits:[] as (()=>void|Promise<unknown>)[]}));
vi.mock('@/components/erp/erp-child-dialog-form',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/components/erp/erp-child-dialog-form')>();
 return {...actual,ERPChildDialogForm:(props:import('@/components/erp/erp-child-dialog-form').ERPChildDialogFormProps)=>{
  if(props.onSubmit)m.submits.push(props.onSubmit);
  return <actual.ERPChildDialogForm {...props}/>;
 }};
});
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>m.owner?{id:m.owner}:null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
vi.mock('@/server/actions/master-data/party-addresses',()=>({createPartyAddress:m.create,updatePartyAddress:m.update}));
vi.mock('sonner',()=>({toast:{error:m.toast}}));
import {PartyAddressDialog} from '@/features/master-data/parties/party-address-dialog';
import {PartyChildSaveDialog} from '@/features/master-data/parties/party-child-save-dialog';
const store=()=>m.store as ReturnType<typeof createWorkspaceDraftStore>;
const payload={party_id:4,country_id:1,address_type_id:1,is_active:false,is_primary:false,is_billing_address:false,is_shipping_address:false,is_site_address:false,latitude:0,longitude:0};
const row={id:8,workspace_revision:9} as PartyAddress;
const operationId='00000000-0000-4000-8000-000000000031';
const retained={id:8,revision:'4',pending:{fingerprint:JSON.stringify(payload),contract:{operationId,revision:'4'}}};
const receipt={id:8,revision:'5',changed:true,replayed:true};
type Family='party-address'|'party-child';
const key=(family:Family,revision='4',id='8',form='form',owner='recovery')=>`draft:tab:${owner}:${family}:${form}:${id}:${revision}:save`;
const resolve=(family:Family='party-child',id:number|null=8,revision:number|undefined=9)=>resolvePartyRevisionOpening({store:store(),ownerId:m.owner,family,formId:'form',id,revision});
const seed=(family:Family='party-child',raw=JSON.stringify(retained),revision='4')=>store().setViewState(key(family,revision),raw);
beforeEach(()=>{vi.restoreAllMocks();vi.resetAllMocks();m.submits=[];m.store=createWorkspaceDraftStore();m.owner='recovery';m.update.mockResolvedValue({success:true,data:receipt});m.create.mockResolvedValue({success:true,data:{id:12,revision:'1',replayed:false}});});
afterEach(cleanup);
it.each([0,-1,Number.MAX_SAFE_INTEGER+1])('invalid opening id %s is blocked without writes',id=>{
 const write=vi.spyOn(store(),'setViewState'),uuid=vi.spyOn(crypto,'randomUUID');expect(resolve('party-child',id).ok).toBe(false);expect(write).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});
it.each([0,-1,NaN,Number.MAX_SAFE_INTEGER+1])('invalid opening revision %s is blocked without writes',revision=>{
 const write=vi.spyOn(store(),'setViewState'),uuid=vi.spyOn(crypto,'randomUUID');expect(resolve('party-child',8,revision).ok).toBe(false);expect(write).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});

it('lists only scoped view keys with deterministic fresh snapshots and no emissions',()=>{
 const s=store(),emitted=vi.fn();s.subscribe(emitted);s.setDraft(key('party-child'),{field:'private draft'});emitted.mockClear();
 seed();seed('party-child',JSON.stringify({id:8,revision:'2'}),'2');
 for(const other of [key('party-address'),key('party-child','4','80'),key('party-child','4','8','another'),key('party-child','4','8','form','other')])s.setViewState(other,'unrelated');
 const list=s.listViewStateKeysForTab!('recovery','party-child:form:8:');expect(list).toEqual([key('party-child','2'),key('party-child')]);
 (list as string[]).push('local change');expect(s.listViewStateKeysForTab!('recovery','party-child:form:8:')).toHaveLength(2);expect(emitted).not.toHaveBeenCalled();
 expect(createWorkspaceDraftStore().listViewStateKeysForTab!('recovery','party-child:form:8:')).toEqual([]);
 s.clearDraftsForTab('recovery');expect(s.listViewStateKeysForTab!('recovery','party-child:form:8:')).toEqual([]);expect(s.getDraft(key('party-child'))).toBeUndefined();
});
it.each([['','party-child:'],['recovery',''],['recovery','draft:tab:other:']])('rejects invalid discovery scope %s / %s',(owner,prefix)=>{expect(()=>store().listViewStateKeysForTab!(owner,prefix)).toThrow();});
it('missing discovery, store or owner fails closed rather than looking fresh',()=>{
 const unavailable={...store(),listViewStateKeysForTab:undefined};expect(resolvePartyRevisionOpening({store:unavailable,ownerId:'recovery',family:'party-child',formId:'form',id:8,revision:9}).ok).toBe(false);
 expect(resolvePartyRevisionOpening({store:null,ownerId:'recovery',family:'party-child',formId:'form',id:8}).ok).toBe(false);m.owner='';expect(resolve().ok).toBe(false);
});
it('selects one legacy pending entry alongside settled history without touching bytes',()=>{
 seed();seed('party-child',JSON.stringify({id:8,revision:'2'}),'1');seed('party-child',JSON.stringify({id:8,revision:'3'}),'3');
 const write=vi.spyOn(store(),'setViewState'),uuid=vi.spyOn(crypto,'randomUUID');const r=resolve();expect(r.ok).toBe(true);if(!r.ok)throw Error('expected opening');
 expect(r.opening.key).toBe(key('party-child'));expect(r.opening.initial).toEqual(retained);expect(r.opening.snapshot).toHaveLength(3);expect(write).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});
it('settled history uses a fresh current key while current settled state preserves its advanced revision',()=>{
 seed('party-child',JSON.stringify({id:8,revision:'5'}));let r=resolve();expect(r.ok&&r.opening.key).toBe(key('party-child','9'));expect(r.ok&&r.opening.initial.revision).toBe('9');
 seed('party-child',JSON.stringify({id:8,revision:'10'}),'9');r=resolve();expect(r.ok&&r.opening.initial.revision).toBe('10');
});
it('does not confuse an advanced saved revision with its older opening-key token',()=>{seed('party-child',JSON.stringify({...retained,revision:'6',pending:{...retained.pending,contract:{operationId,revision:'6'}}}));expect(resolve().ok).toBe(true);});
it('multiple pending entries block even when UUIDs match',()=>{seed();seed('party-child',JSON.stringify(retained),'9');expect(resolve().ok).toBe(false);});
it.each([
 ['bad JSON','{broken'],['null pending',JSON.stringify({...retained,pending:null})],['extra field',JSON.stringify({...retained,extra:true})],
 ['bad UUID',JSON.stringify({...retained,pending:{...retained.pending,contract:{operationId:'bad',revision:'4'}}})],
 ['wrong row',JSON.stringify({...retained,id:9})],['incoherent revision',JSON.stringify({...retained,revision:'5'})],
])('blocks %s without repairing any value',(_name,raw)=>{
 seed('party-child',raw);const write=vi.spyOn(store(),'setViewState'),uuid=vi.spyOn(crypto,'randomUUID');expect(resolve().ok).toBe(false);expect(store().getViewState(key('party-child'))).toBe(raw);expect(write).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});
it('one valid pending entry cannot excuse invalid settled history',()=>{seed();seed('party-child','{bad','1');expect(resolve().ok).toBe(false);});
it.each(['4:extra:save','04:save','4:not-save'])('blocks malformed matching key %s',suffix=>{store().setViewState(`draft:tab:recovery:party-child:form:8:${suffix}`,JSON.stringify(retained));expect(resolve().ok).toBe(false);});
it.each(['read','enumeration','disappeared'])('blocks %s discovery failure',fault=>{
 seed();if(fault==='read')vi.spyOn(store(),'getViewState').mockImplementation(()=>{throw Error('private');});
 if(fault==='enumeration')vi.spyOn(store(),'listViewStateKeysForTab').mockImplementation(()=>{throw Error('private');});
 if(fault==='disappeared')vi.spyOn(store(),'getViewState').mockReturnValue(undefined);
 expect(resolve().ok).toBe(false);
});
it('new namespace remains independent and accepts only null identity/revision',()=>{
 const r=resolve('party-child',null);expect(r.ok&&r.opening.key).toBe(key('party-child','new','new'));
 store().setViewState(key('party-child','new','new'),JSON.stringify({id:null,revision:null,pending:{fingerprint:'{}',contract:{operationId,revision:null}}}));
 expect(resolve('party-child',null).ok).toBe(true);store().setViewState(key('party-child','new','new'),JSON.stringify({id:12,revision:'1'}));expect(resolve('party-child',null).ok).toBe(false);
});
it('snapshot comparison detects insertion, removal and replacement; proposed own writes are pure',()=>{
 seed();const r=resolve();if(!r.ok)throw Error('expected opening');const original=r.opening.snapshot;
 const next=withPartyRevisionWrite(r.opening,original,JSON.stringify({id:8,revision:'5'}));expect(store().getViewState(key('party-child'))).toBe(JSON.stringify(retained));expect(()=>assertPartyRevisionSnapshot(r.opening,next)).toThrow();
 store().setViewState(key('party-child','9'),JSON.stringify({id:8,revision:'9'}));expect(()=>assertPartyRevisionSnapshot(r.opening,original)).toThrow();
 store().clearDraftsForTab('recovery');expect(()=>assertPartyRevisionSnapshot(r.opening,original)).toThrow();seed('party-child',JSON.stringify({id:8,revision:'4'}));expect(()=>assertPartyRevisionSnapshot(r.opening,original)).toThrow();
 expect(readPartyRevisionSnapshot(r.opening)).toEqual([[key('party-child'),JSON.stringify({id:8,revision:'4'})]]);
});

const dialog=(family:Family,onSubmit?:(save:(p:typeof payload)=>Promise<{success:boolean}>)=>Promise<void>,strict=false)=>{
 const common={open:true,title:'Recovery editor',mode:'edit' as const,formId:'form',onOpenChange:m.close,onSubmit:onSubmit??(async save=>{await save(payload);}),children:<input aria-label="Retained entry" defaultValue="Keep me"/>};
 const view=family==='party-address'?<PartyAddressDialog {...common} address={row}/>:<PartyChildSaveDialog {...common} record={row} createAction={m.create} updateAction={m.update}/>;
 return render(strict?<StrictMode>{view}</StrictMode>:view,{onCaughtError:vi.fn(),onRecoverableError:vi.fn()});
};
for(const family of ['party-address','party-child'] as const){
 it(`${family} ignores captured retired submit before invalid parent form checks`,async()=>{
  const invalidParent=vi.fn(async()=>{throw Error('parent validation must not run');});
  const ui=dialog(family,invalidParent);const captured=m.submits.at(-1)!;m.owner='other';
  ui.rerender(family==='party-address'?<PartyAddressDialog open title="Recovery editor" mode="edit" formId="form" address={row} onOpenChange={m.close} onSubmit={invalidParent}><p>Fields</p></PartyAddressDialog>:<PartyChildSaveDialog open title="Recovery editor" mode="edit" formId="form" record={row} createAction={m.create} updateAction={m.update} onOpenChange={m.close} onSubmit={invalidParent}><p>Fields</p></PartyChildSaveDialog>);
  await captured();expect(invalidParent).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
 });
it(`${family} stops parent success/close/error branches after confirmed acknowledgement failure`,async()=>{
  const success=vi.fn(),failure=vi.fn(),done=vi.fn();const write=store().setViewState.bind(store());
  m.update.mockImplementationOnce(async()=>{vi.spyOn(store(),'setViewState').mockImplementation((k,v)=>{write(k,v);throw Error('private ack');});return {success:true,data:receipt};});
  dialog(family,async save=>{try{const r=await save(payload);if(r.success){success();m.close(false);}else failure();}finally{done();}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(success).not.toHaveBeenCalled();expect(failure).not.toHaveBeenCalled();expect(m.close).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('confirmed');
 });
 it.each(['owner','aba','unmount'])(`${family} stops retired %s parent continuations`,async change=>{
  let finish:(v:unknown)=>void=()=>{};m.update.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const effect=vi.fn(),done=vi.fn();
  const onSubmit=async(save:(p:typeof payload)=>Promise<{success:boolean}>)=>{try{const result=await save(payload);effect(result);m.close(false);}finally{done();}};
  const ui=dialog(family,onSubmit);fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
  if(change==='unmount')ui.unmount();else{
   const view=()=>family==='party-address'?<PartyAddressDialog open title="Recovery editor" mode="edit" formId="form" address={row} onOpenChange={m.close} onSubmit={onSubmit}><p>Retained</p></PartyAddressDialog>:<PartyChildSaveDialog open title="Recovery editor" mode="edit" formId="form" record={row} createAction={m.create} updateAction={m.update} onOpenChange={m.close} onSubmit={onSubmit}><p>Retained</p></PartyChildSaveDialog>;
   m.owner='other';ui.rerender(view());if(change==='aba'){m.owner='recovery';ui.rerender(view());}
  }
  finish({success:true,data:receipt});await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(effect).not.toHaveBeenCalled();expect(m.close).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();
 });
 it(`${family} locks Cancel/X on first restored render and replays the older request`,async()=>{
  seed(family);dialog(family);expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'Close'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());expect(m.update.mock.calls[0][1]).toEqual({operationId,revision:'4'});expect(store().getViewState(key(family,'9'))).toBeUndefined();
  await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(false));
 });
 it(`${family} blocks corrupt discovery before any initializer write or UUID`,()=>{
  seed(family,'{bad');const write=vi.spyOn(store(),'setViewState'),uuid=vi.spyOn(crypto,'randomUUID');dialog(family);
  expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true);expect((screen.getByLabelText('Retained entry') as HTMLInputElement).value).toBe('Keep me');expect(write).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it(`${family} blocks ambiguous discovery and keeps all historical entries`,()=>{
  seed(family);seed(family,JSON.stringify(retained),'9');const write=vi.spyOn(store(),'setViewState');dialog(family);expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(true);expect(write).not.toHaveBeenCalled();
 });
 it.each(['before','after','ignore','substitute'])(`${family} contains %s initialization persistence faults`,fault=>{
  const write=store().setViewState.bind(store());vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.spyOn(store(),'setViewState').mockImplementation((k,value)=>{if(fault==='after')write(k,value);if(fault==='substitute')write(k,JSON.stringify({id:9,revision:'99'}));if(fault==='before'||fault==='after')throw Error('private init');});
  const uuid=vi.spyOn(crypto,'randomUUID');dialog(family);expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('alert').textContent).toContain('Reconcile');expect(uuid).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it(`${family} contains post-confirmation callback failure without shared unconfirmed toast or another dispatch`,async()=>{
  dialog(family,async save=>{const r=await save(payload);if(r.success)throw Error('private callback');});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('confirmed'));
  expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(true);expect(m.toast).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledOnce();
 });
 it(`${family} accepts its own initialization normalization in StrictMode`,async()=>{
  seed(family,JSON.stringify(retained,null,2));dialog(family,undefined,true);expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());expect(m.update.mock.calls[0][1]).toEqual({operationId,revision:'4'});
 });
 it(`${family} detects a competing entry inserted between preflight and initialization`,()=>{
  seed(family);const read=store().listViewStateKeysForTab!.bind(store());let calls=0;
  vi.spyOn(store(),'listViewStateKeysForTab').mockImplementation((tab,prefix)=>{if(++calls===2)seed(family,JSON.stringify(retained),'9');return read(tab,prefix);});
  vi.spyOn(console,'error').mockImplementation(()=>{});const uuid=vi.spyOn(crypto,'randomUUID');dialog(family);expect(screen.getByRole('button',{name:'Save'}).hasAttribute('disabled')).toBe(true);expect(uuid).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
}
