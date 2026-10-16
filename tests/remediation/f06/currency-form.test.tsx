// @vitest-environment node
// Actual currency serializer/controls. Navigation/server are doubles, not DB proof.
import '../f05/setup';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {StrictMode,cloneElement} from 'react';
import {saveCurrencyRecord} from '@/server/currency-save';
const recovery=vi.hoisted(()=>({owner:null as string|null,store:null as ReturnType<typeof createWorkspaceDraftStore>|null,shell:null as ERPRecordWorkspaceFormProps|null,rpc:vi.fn(),revalidate:vi.fn(),tab:null as {id:string}|null,close:vi.fn(),dirty:vi.fn(),route:vi.fn(),replace:vi.fn()}));
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});dom.teardown(globalThis);});
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>recovery.owner?{id:recovery.owner}:null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>recovery.store}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:recovery.rpc,from:()=>{throw Error('Unexpected table access');}})}));
vi.mock('next/cache',()=>({revalidatePath:recovery.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,globalPermissionCodes:['master_data.finance_basics.manage','master_data.geography.manage','master_data.uom.manage'],roleCodes:[],roleAssignments:[]})}));


import {afterEach,beforeEach,expect,it,vi,afterAll} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {Currency} from '@/features/master-data/finance-basics/types';
const auth={profile:{id:1},isAccountActive:true,permissionCodes:['master_data.finance_basics.manage'],globalPermissionCodes:['master_data.finance_basics.manage'],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const mock=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),success:vi.fn(),error:vi.fn(),clearDraft:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/features/master-data/finance-basics/actions',()=>({createCurrency:mock.create,updateCurrency:mock.update}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({})}));
vi.mock('@/lib/query/invalidation',()=>({invalidateCurrencies:mock.invalidate}));
vi.mock('sonner',()=>({toast:{error:mock.error,success:mock.success}}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:recovery.replace}),usePathname:()=>'/currency-test',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:recovery.tab,updateTabRoute:recovery.route,isTabActive:()=>true,closeTab:recovery.close,markDirty:recovery.dirty,forceCloseActiveTab:vi.fn()})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-dirty',()=>({useWorkspaceFormDirty:()=>({isDirty:false,resetDirty:vi.fn()})}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,getDraftBoolean:(_:string,v:unknown)=>v,syncDraft:vi.fn(),clearDraft:mock.clearDraft,writeDraftField:vi.fn(),restoredFromDraft:false})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({
 ERPRecordWorkspaceForm:(props:ERPRecordWorkspaceFormProps)=>{recovery.shell=props;return <div>{props.children}<button disabled={!props.onSave} onClick={()=>void props.onSave?.()}>Test save</button></div>;},ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>,
}));
import {CurrencyWorkspaceForm} from '@/features/master-data/finance-basics/components/currency-workspace-form';
afterEach(cleanup);beforeEach(()=>{vi.resetAllMocks();mock.create.mockResolvedValue({success:true,data:{id:81,revision:'1',replayed:false,changed:true}});mock.update.mockResolvedValue({success:true,data:{id:81,revision:'2',replayed:false,changed:true}});});
for(const mode of ['add','edit'] as const)for(const precision of [0,2,3,4])it(`${mode} preserves ${precision} decimal places at the actual action boundary`,async()=>{
 const currency={id:81,workspace_revision:1,currency_code:'ZZZ',currency_name_en:'Synthetic currency',decimal_places:precision,is_active:false,is_base_currency:false} as Currency;
 render(<CurrencyWorkspaceForm currency={mode==='edit'?currency:null} mode={mode} authContext={auth}/>);
 if(mode==='add'){
  fireEvent.change(document.querySelector('[name="currency_code"]')!,{target:{value:'ZZZ'}});
  fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Synthetic currency'}});
 }
 fireEvent.change(document.querySelector('[name="decimal_places"]')!,{target:{value:String(precision)}});
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));
 const action=mode==='edit'?mock.update:mock.create;
 await waitFor(()=>expect(action).toHaveBeenCalledOnce());
 expect(action.mock.calls[0][0].decimal_places).toBe(precision);
 expect(action.mock.calls[0][0].is_base_currency).toBe(false);
 if(mode==='edit'){expect(action.mock.calls[0][0].is_active).toBe(false);expect(action.mock.calls[0][0]).not.toHaveProperty('currency_code');}
});
const newForm=()=>{
 render(<CurrencyWorkspaceForm mode="add" authContext={auth}/>);
 fireEvent.change(document.querySelector('[name="currency_code"]')!,{target:{value:'ZZZ'}});
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Synthetic currency'}});
};
it('Save twice changes the new form into an edit of its one confirmed identity',async()=>{
 newForm();fireEvent.click(screen.getByRole('button',{name:'Test save'}));
 await waitFor(()=>expect(mock.success).toHaveBeenCalled());
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Edited synthetic currency'}});
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));
 await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());expect(mock.create).toHaveBeenCalledOnce();
 expect(mock.update.mock.calls[0][0].id).toBe(81);expect(mock.update.mock.calls[0][1].revision).toBe('1');
 expect((document.querySelector('[name="currency_code"]') as HTMLInputElement).disabled).toBe(true);
});
it('post-commit response loss retains the operation identity for unchanged retry',async()=>{
 mock.create.mockResolvedValueOnce({success:false,uncertain:true,error:'Save unconfirmed'});newForm();
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.error).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));
 expect(mock.create.mock.calls[0][1]).toHaveProperty('operationId');expect(mock.create.mock.calls[1][1]).toEqual(mock.create.mock.calls[0][1]);
});
it('true no-op shows no-changes feedback',async()=>{
 mock.create.mockResolvedValue({success:true,data:{id:81,revision:'1',replayed:false,changed:false}});newForm();
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.success).toHaveBeenCalledWith('No changes to save'));
});
it('changed values cannot start a new operation while the prior save is unconfirmed',async()=>{
 mock.create.mockResolvedValueOnce({success:false,uncertain:true,error:'Save unconfirmed'});newForm();
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.error).toHaveBeenCalled());
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Different input'}});
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/previous save is unconfirmed/)));expect(mock.create).toHaveBeenCalledOnce();
});
it('duplicate clicks admit one request and preserve newer draft edits during save',async()=>{
 let finish!:(value:unknown)=>void;mock.create.mockReturnValue(new Promise(resolve=>{finish=resolve;}));newForm();
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));fireEvent.click(screen.getByRole('button',{name:'Test save'}));expect(mock.create).toHaveBeenCalledOnce();
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Newer draft'}});
 await act(async()=>finish({success:true,data:{id:81,revision:'1',changed:true,replayed:false}}));
 expect(mock.clearDraft).not.toHaveBeenCalled();expect((document.querySelector('[name="currency_name_en"]') as HTMLInputElement).value).toBe('Newer draft');
});
it('an incomplete success receipt does not clear the draft or invent an edit identity',async()=>{
 mock.create.mockResolvedValueOnce({success:true,data:{id:81}});newForm();fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.clearDraft).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));expect(mock.create.mock.calls[0][1]).toEqual(mock.create.mock.calls[1][1]);expect(mock.update).not.toHaveBeenCalled();
});
for(const field of ['decimal_places','sort_order'])it(`empty ${field} is an error, not a silent default`,async()=>{
 newForm();fireEvent.change(document.querySelector(`[name="${field}"]`)!,{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.create).not.toHaveBeenCalled();
});
it('a cache refresh failure cannot erase a confirmed identity or report the save as unconfirmed',async()=>{
 mock.invalidate.mockImplementationOnce(()=>{throw Error('Synthetic cache failure');});newForm();fireEvent.click(screen.getByRole('button',{name:'Test save'}));
 await waitFor(()=>expect(mock.success).toHaveBeenCalledWith('Currency created'));
 expect(mock.error).toHaveBeenCalledWith(expect.stringMatching(/saved.*refresh/i));
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Updated after refresh failure'}});
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());expect(mock.create).toHaveBeenCalledOnce();
});
it('a receipt for a different existing record cannot resolve an edit',async()=>{
 mock.update.mockResolvedValueOnce({success:true,data:{id:99,revision:'2',changed:true,replayed:false}});
 render(<CurrencyWorkspaceForm mode="edit" currency={{id:81,workspace_revision:1,currency_code:'ZZZ',currency_name_en:'Synthetic currency',decimal_places:0} as Currency} authContext={auth}/>);
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.success).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(2));expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);
});
// W32: actual owned memory session, fail-closed real-helper bridge and local outcomes.
beforeEach(()=>{recovery.owner=null;recovery.store=null;recovery.shell=null;recovery.tab=null;recovery.rpc.mockImplementation(()=>{throw Error('Unexpected business RPC');});});
afterEach(()=>{vi.restoreAllMocks();});
const retainedKey='draft:tab:w32:currency-workspace-form:save';
function owned(){recovery.owner='w32';recovery.tab={id:'w32'};recovery.store=createWorkspaceDraftStore();return recovery.store!;}
function recoveryMount(){const view=render(<CurrencyWorkspaceForm mode="add" authContext={auth}/>);fireEvent.change(document.querySelector('[name="currency_code"]')!,{target:{value:'ZZZ'}});fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Synthetic currency'}});return view;}
async function submitRecovery(){let result:boolean|void;await act(async()=>{result=await recovery.shell!.onSave?.();});return result!;}
const goodReceipt={id:81,revision:'1',changed:true,replayed:false};

it.each(['40003','08007'])('W32 real helper %s then known rejection preserves original request across remounts',async(code)=>{
 const store=owned();mock.create.mockImplementation((payload:object,contract:WorkspaceSaveContract)=>saveCurrencyRecord('save',null,payload,contract));
 recovery.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private-code',details:'private-details',hint:'private-hint'}})
 .mockResolvedValueOnce({data:null,error:{code:'40P01',message:'private-denial'}})
 .mockResolvedValueOnce({data:{...goodReceipt,replayed:true},error:null});
 let view=recoveryMount();await submitRecovery();expect(recovery.rpc).toHaveBeenCalledTimes(1);
 const original=structuredClone(recovery.rpc.mock.calls[0]);expect(original[0]).toBe('save_currency_record');
 expect(original[1]).toMatchObject({p_id:null,p_action:'save',p_revision:null,p_operation:expect.any(String)});
 const bytes=store.getViewState(retainedKey);expect(bytes).toContain('pending');view.unmount();
 view=recoveryMount();await submitRecovery();expect(store.getViewState(retainedKey)).toBe(bytes);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/unconfirmed/i));view.unmount();
 recoveryMount();expect(await submitRecovery()).toBe(true);expect(recovery.rpc.mock.calls).toEqual([original,original,original]);
 expect(JSON.stringify(mock.error.mock.calls)).not.toMatch(/private-code|private-details|private-hint|private-denial/);
});
it('W32 first known rejection permits corrected new operation',async()=>{
 owned();mock.create.mockResolvedValueOnce({success:false,error:'Check values'});recoveryMount();await submitRecovery();
 const original=mock.create.mock.calls[0][1];fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Corrected value'}});
 expect(await submitRecovery()).toBe(true);expect(mock.create.mock.calls[1][1].operationId).not.toBe(original.operationId);
});
it.each(['before','after','ignored','substituted'])('W32 confirmed acknowledgement %s fault remains saved and blocks dispatch',async(kind)=>{
 const store=owned();recoveryMount();const write=store.setViewState.bind(store);
 vi.spyOn(store,'setViewState').mockImplementation((key,value)=>{if(key===retainedKey&&!value.includes('"pending"')){
 if(kind==='after')write(key,value);if(kind==='substituted')write(key,JSON.stringify({id:991,revision:'88'}));
 if(kind==='ignored'||kind==='substituted')return;throw Error('private acknowledgement');}write(key,value);});
 expect(await submitRecovery()).toBe(true);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*local/i));
 await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.update).not.toHaveBeenCalled();
 if(kind==='substituted')expect(store.getViewState(retainedKey)).toBe(JSON.stringify({id:991,revision:'88'}));
});
it.each(['missing','replaced','unreadable'])('W32 first-known %s post-response witness preserves rejection',async(kind)=>{
 const store=owned();let finish!:(value:unknown)=>void;mock.create.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 recoveryMount();let pending!:Promise<unknown>;act(()=>{pending=Promise.resolve(recovery.shell!.onSave!());});
 const original=store.getViewState(retainedKey),read=store.getViewState.bind(store),write=vi.spyOn(store,'setViewState');
 vi.spyOn(store,'getViewState').mockImplementation(key=>{if(key!==retainedKey)return read(key);if(kind==='missing')return undefined;if(kind==='replaced')return '{"id":999,"revision":"9"}';throw Error('private witness');});
 await act(async()=>{finish({success:false,error:'Known rejection'});await pending;});
 expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/rejected.*reopen/i));expect(write).not.toHaveBeenCalled();expect(read(retainedKey)).toBe(original);
 await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);
});
it.each(['before','after','ignored','substituted'])('W32 pending %s write fault stops before business dispatch',async(kind)=>{
 const store=owned();recoveryMount();const write=store.setViewState.bind(store);
 vi.spyOn(store,'setViewState').mockImplementation((key,value)=>{if(key===retainedKey&&value.includes('"pending"')){
 if(kind==='after')write(key,value);if(kind==='substituted')write(key,'{"id":999,"revision":"9"}');
 if(kind==='ignored'||kind==='substituted')return;throw Error('private write');}write(key,value);});
 await submitRecovery();await submitRecovery();expect(mock.create).not.toHaveBeenCalled();expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private write');
});
it('W32 notification failure cannot reverse confirmation or skip independent effects',async()=>{
 owned();recoveryMount();mock.success.mockImplementationOnce(()=>{throw Error('private toast');});
 expect(await submitRecovery()).toBe(true);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*refresh/i));
 expect(mock.invalidate).toHaveBeenCalledOnce();
 expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private toast');
});
it('W32 unmount retires deferred completion without acknowledgements or notifications',async()=>{
 const store=owned();let finish!:(value:unknown)=>void;mock.create.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const view=recoveryMount();let pending!:Promise<unknown>;act(()=>{pending=Promise.resolve(recovery.shell!.onSave!());});const bytes=store.getViewState(retainedKey);view.unmount();
 await act(async()=>{finish({success:true,data:goodReceipt});await pending;});expect(store.getViewState(retainedKey)).toBe(bytes);expect(mock.success).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();
});
it('W32 live StrictMode activation still confirms',async()=>{
 owned();render(<StrictMode><CurrencyWorkspaceForm mode="add" authContext={auth}/></StrictMode>);fireEvent.change(document.querySelector('[name="currency_code"]')!,{target:{value:'ZZZ'}});fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Synthetic currency'}});expect(await submitRecovery()).toBe(true);expect(mock.create).toHaveBeenCalledOnce();
});

it.each(['missing','replaced','unreadable'])('W32 prior unknown then known with %s witness remains unconfirmed',async(kind)=>{
 const store=owned();mock.create.mockResolvedValueOnce({success:false,uncertain:true});recoveryMount();await submitRecovery();
 let finish!:(value:unknown)=>void;mock.create.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 let pending!:Promise<unknown>;act(()=>{pending=Promise.resolve(recovery.shell!.onSave!());});
 const original=store.getViewState(retainedKey),read=store.getViewState.bind(store),write=vi.spyOn(store,'setViewState');
 vi.spyOn(store,'getViewState').mockImplementation(key=>{if(key!==retainedKey)return read(key);if(kind==='missing')return undefined;if(kind==='replaced')return '{"id":999,"revision":"9"}';throw Error('private read');});
 await act(async()=>{finish({success:false,error:'Known rejection'});await pending;});
 expect(JSON.stringify(mock.error.mock.calls)).not.toMatch(/Known rejection|request was rejected|private read/);
 expect(write).not.toHaveBeenCalled();expect(read(retainedKey)).toBe(original);await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(2);
 expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);
});
it.each(['before','after','ignored','substituted'])('W32 exact pending retry with %s persistence failure cannot dispatch',async(kind)=>{
 const store=owned();mock.create.mockResolvedValueOnce({success:false,uncertain:true});recoveryMount();await submitRecovery();
 const write=store.setViewState.bind(store);
 vi.spyOn(store,'setViewState').mockImplementation((key,value)=>{if(key!==retainedKey){write(key,value);return;}
 if(kind==='after')write(key,value);if(kind==='substituted')write(key,'{"id":999,"revision":"9"}');
 if(kind==='ignored'||kind==='substituted')return;throw Error('private pending write');});
 await submitRecovery();await submitRecovery();
 // An ignored exact write leaves the already verified identical bytes intact.
 expect(mock.create).toHaveBeenCalledTimes(kind==='ignored'?2:1);
});
it.each(['missing','replaced','corrupt'])('W32 %s retained bytes before dispatch are never overwritten',async(kind)=>{
 const store=owned();recoveryMount();const read=store.getViewState.bind(store);
 if(kind==='missing')vi.spyOn(store,'getViewState').mockImplementation(key=>key===retainedKey?undefined:read(key));
 else store.setViewState(retainedKey,kind==='corrupt'?'broken-json':'{"id":999,"revision":"9"}');
 const writes=vi.spyOn(store,'setViewState');await submitRecovery();await submitRecovery();expect(mock.create).not.toHaveBeenCalled();expect(writes).not.toHaveBeenCalled();
});
it.each(['owner','store','principal','mode'])('W32 %s A-B-A cannot revive an old handler or continuation',async(kind)=>{
 const store=owned();let finish!:(value:unknown)=>void;mock.create.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const view=recoveryMount(),oldSave=recovery.shell!.onSave!;let pending!:Promise<unknown>;act(()=>{pending=Promise.resolve(oldSave());});
 const original=store.getViewState(retainedKey);
 if(kind==='owner')recovery.owner='other';
 if(kind==='store')recovery.store=createWorkspaceDraftStore();
 const alternate=cloneElement(<CurrencyWorkspaceForm mode="add" authContext={auth}/>,kind==='principal'?{authContext:{...auth,profile:{id:2}}}:kind==='mode'?{mode:'view'}:{});
 view.rerender(alternate);
 if(kind==='owner')recovery.owner='w32';if(kind==='store')recovery.store=store;
 view.rerender(<CurrencyWorkspaceForm mode="add" authContext={auth}/>);
 await act(async()=>{await oldSave();finish({success:true,data:goodReceipt});await pending;});
 expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.success).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();expect(store.getViewState(retainedKey)).toBe(original);
});
it('W32 old finalizer cannot release a fresh remounted flight',async()=>{
 owned();let finishOld!:(value:unknown)=>void,finishNew!:(value:unknown)=>void;
 mock.create.mockReturnValueOnce(new Promise(resolve=>{finishOld=resolve;})).mockReturnValueOnce(new Promise(resolve=>{finishNew=resolve;}));
 const view=recoveryMount();let oldFlight!:Promise<unknown>,newFlight!:Promise<unknown>;
 act(()=>{oldFlight=Promise.resolve(recovery.shell!.onSave!());});view.unmount();recoveryMount();act(()=>{newFlight=Promise.resolve(recovery.shell!.onSave!());});
 await act(async()=>{finishOld({success:true,data:goodReceipt});await oldFlight;});
 expect(recovery.shell!.isSubmitting).toBe(true);await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(2);
 await act(async()=>{finishNew({success:true,data:goodReceipt});await newFlight;});expect(mock.success).toHaveBeenCalledTimes(1);
});
it('W32 throwing success and fallback notifications preserve saved return',async()=>{
 owned();recoveryMount();mock.success.mockImplementationOnce(()=>{throw Error('private success');});mock.error.mockImplementationOnce(()=>{throw Error('private fallback');});
 expect(await submitRecovery()).toBe(true);expect(screen.getByRole('status').textContent).toMatch(/saved.*refresh/i);expect(mock.create).toHaveBeenCalledTimes(1);
});

it('W32 changed input refusal followed by restoration keeps original operation',async()=>{
 owned();mock.create.mockResolvedValueOnce({success:false,uncertain:true});recoveryMount();await submitRecovery();const first=structuredClone(mock.create.mock.calls[0]);
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Changed pending'}});
 await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'Synthetic currency'}});
 expect(await submitRecovery()).toBe(true);expect(mock.create.mock.calls[1]).toEqual(first);
});

it.each(['acknowledged','wrong-id','failed-ack'])('W32 parent create promotion %s preserves only a sound exact identity',async(kind)=>{
 const store=owned(),view=recoveryMount();
 if(kind==='failed-ack'){const write=store.setViewState.bind(store);vi.spyOn(store,'setViewState').mockImplementation((key,value)=>{if(key===retainedKey&&!value.includes('"pending"'))throw Error('ack failure');write(key,value);});}
 expect(await submitRecovery()).toBe(true);
 const targetId=kind==='wrong-id'?999:81;
 view.rerender(<CurrencyWorkspaceForm mode="edit" currency={{id:targetId,workspace_revision:1,currency_code:'ZZZ',currency_name_en:'Synthetic currency',decimal_places:2} as Currency} authContext={auth}/>);
 fireEvent.change(document.querySelector('[name="currency_name_en"]')!,{target:{value:'After parent promotion'}});
 await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);
 if(kind==='acknowledged'){expect(mock.update).toHaveBeenCalledTimes(1);expect(mock.update.mock.calls[0][0]).toMatchObject({id:81});expect(mock.update.mock.calls[0][1].revision).toBe('1');}
 else expect(mock.update).not.toHaveBeenCalled();
});

it.each(["dirty","route","close","replace","invalidate"])('W32 independent display port %s failure preserves save and other effects',async(port)=>{
 owned();recoveryMount();const ports={dirty:recovery.dirty,route:recovery.route,close:recovery.close,replace:recovery.replace,invalidate:mock.invalidate};
 ports[port as keyof typeof ports].mockImplementationOnce(()=>{throw Error('private local effect');});
 await act(async()=>{if(port==='replace')await recovery.shell!.onSave!();else await recovery.shell!.onSaveAndClose!();});
 expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.success).toHaveBeenCalledTimes(1);
 expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*refresh/i));
 expect(mock.invalidate).toHaveBeenCalledTimes(1);
 expect(recovery.dirty).toHaveBeenCalled();expect(recovery.route).toHaveBeenCalled();
 if(port!=='replace')expect(recovery.close).toHaveBeenCalledTimes(1);
});
it('W32 baseline acknowledgement failure stays saved and blocks another mutation',async()=>{
 const store=owned();recoveryMount();mock.clearDraft.mockImplementationOnce(()=>{throw Error('private baseline');});
 expect(await submitRecovery()).toBe(true);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*local/i));
 expect(store.getViewState(retainedKey)).not.toContain('pending');await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.update).not.toHaveBeenCalled();
});
it('W32 callback teardown prevents later route/close and fallback effects',async()=>{
 owned();const view=recoveryMount();
 mock.invalidate.mockImplementationOnce(()=>{view.unmount();throw Error('private teardown');});
 let pending!:Promise<unknown>;await act(async()=>{pending=Promise.resolve(recovery.shell!.onSaveAndClose!());await pending;});
 expect(recovery.close).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();expect(mock.create).toHaveBeenCalledTimes(1);
});
