// @vitest-environment node
// Actual numbering form and F04 memory/save hooks; actions and route shell are doubles.
import '../f05/setup';


import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {StrictMode,cloneElement} from 'react';
import {saveNumberingMutation} from '@/server/numbering-save';
const recovery=vi.hoisted(()=>({owner:null as string|null,store:null as ReturnType<typeof createWorkspaceDraftStore>|null,shell:null as ERPRecordWorkspaceFormProps|null,rpc:vi.fn(),revalidate:vi.fn(),tab:null as {id:string}|null,close:vi.fn(),dirty:vi.fn(),route:vi.fn(),replace:vi.fn()}));
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});dom.teardown(globalThis);});
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>recovery.owner?{id:recovery.owner}:null}));

vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:recovery.rpc,from:()=>{throw Error('Unexpected table access');}})}));
vi.mock('next/cache',()=>({revalidatePath:recovery.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,globalPermissionCodes:['master_data.finance_basics.manage','master_data.geography.manage','master_data.uom.manage'],roleCodes:[],roleAssignments:[]})}));


import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi,afterAll} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import type {AuthContext} from '@/lib/rbac/check';
import type {NumberingRule} from '@/features/numbering/numbering-types';
import type {ReactNode} from 'react';
const mock=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,shell:null as ERPRecordWorkspaceFormProps|null,
 create:vi.fn(),update:vi.fn(),replace:recovery.replace,error:vi.fn(),success:vi.fn(),close:vi.fn(),manage:true,lock:true}));
vi.mock('next/navigation',()=>({usePathname:()=>'/numbering/new',useRouter:()=>({replace:mock.replace})}));
vi.mock('@/lib/rbac/scope',()=>({hasGlobalPermission:(_ctx:unknown,code:string)=>code.endsWith('.lock')?mock.lock:mock.manage}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'numbering',tabs:[{id:'numbering',route:'/numbering/new'}]},dispatch:vi.fn()})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>mock.store}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:recovery.tab??{id:'numbering'},closeTab:recovery.close,markDirty:recovery.dirty,updateTabRoute:recovery.route,isTabActive:()=>true})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@/server/actions/numbering',()=>({createNumberingRule:mock.create,updateNumberingRule:mock.update}));
vi.mock('sonner',()=>({toast:{error:mock.error,success:mock.success}}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:(props:ERPRecordWorkspaceFormProps)=>{mock.shell=props;recovery.shell=props;return <div>{props.children}</div>;},ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
import {NumberingRuleWorkspaceForm} from '@/features/numbering/components/numbering-rule-workspace-form';
const existing={id:77,workspace_revision:9,rule_code:'F06_RULE',rule_name:'F06 rule',module_code:'F06',module_name:'F06',document_type_code:'F06_DOC',document_type_name:'F06 document',document_prefix:'F06',format_template:'{DOC}-{SEQ4}',sequence_length:4,padding_character:'0',starting_sequence_number:1,current_sequence_number:0,next_sequence_number:1,reset_policy:'never',is_active:false,is_locked:false,created_at:'2026-10-03T00:00:00Z',updated_at:'2026-10-03T00:00:00Z'} as NumberingRule;
beforeEach(()=>{vi.resetAllMocks();mock.manage=true;mock.lock=true;mock.store=createWorkspaceDraftStore();mock.create.mockResolvedValue({success:true,data:{id:77,revision:'1',replayed:false,changed:true}});mock.update.mockResolvedValue({success:true,data:{id:77,revision:'10',replayed:false,changed:true}});});
afterEach(cleanup);
function mount(mode:'add'|'edit'|'view'='add',overrides:Partial<NumberingRule>={}){return render(<NumberingRuleWorkspaceForm mode={mode} rule={mode==='add'?null:{...existing,...overrides}} authContext={{}as AuthContext}/>);}
function input(name:string,value:string){fireEvent.change(document.querySelector(`[name="${name}"]`)!,{target:{value}});}
function fill(){for(const key of ['rule_code','rule_name','module_code','module_name','document_type_code','document_type_name','document_prefix']as const)input(key,existing[key]);}
async function save(){await act(async()=>{await mock.shell?.onSave?.();});}
it('create preserves inactive and becomes edit for the second save',async()=>{
 mount();fill();fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));await save();expect(mock.create).toHaveBeenCalledOnce();
 expect(mock.create.mock.calls[0][0].is_active).toBe(false);expect(mock.shell?.mode).toBe('edit');expect(mock.replace).toHaveBeenCalledWith('/admin/settings/numbering/record/77?mode=edit');
 input('notes','Second save');await save();expect(mock.update).toHaveBeenCalledOnce();expect(mock.update.mock.calls[0][0]).toMatchObject({id:77,rule_code:'F06_RULE',is_active:false});expect(mock.update.mock.calls[0][1].revision).toBe('1');
});
it('editing a disabled immutable code still sends the original identity',async()=>{mount('edit');input('notes','Changed');await save();expect(mock.update.mock.calls[0][0].rule_code).toBe('F06_RULE');expect(mock.update.mock.calls[0][1].revision).toBe('9');});
it('response loss keeps exactly the same operation and payload on retry',async()=>{mock.create.mockResolvedValueOnce({success:false,uncertain:true});mount();fill();await save();await save();expect(mock.create.mock.calls[0]).toEqual(mock.create.mock.calls[1]);});
it('changed entries cannot replace a still-unconfirmed operation',async()=>{mock.create.mockResolvedValue({success:false,uncertain:true});mount();fill();await save();input('notes','Changed');await save();expect(mock.create).toHaveBeenCalledOnce();expect(mock.error).toHaveBeenLastCalledWith(expect.stringContaining('unconfirmed'));});
it('double submission calls only one mutation',async()=>{let resolve!:(r:unknown)=>void;mock.create.mockImplementation(()=>new Promise(r=>{resolve=r;}));mount();fill();await act(async()=>{const a=mock.shell!.onSave!(),b=mock.shell!.onSave!();resolve({success:true,data:{id:77,revision:'1',changed:true,replayed:false}});await Promise.all([a,b]);});expect(mock.create).toHaveBeenCalledOnce();});
it('invalid tokens and reversed dates are rejected before mutation',async()=>{mount();fill();input('format_template','{DOC}-{SEQ4}-{BOGUS}');await save();expect(mock.create).not.toHaveBeenCalled();input('format_template','{DOC}-{SEQ4}');input('effective_from','2027-01-01T00:00');input('effective_to','2026-01-01T00:00');await save();expect(mock.create).not.toHaveBeenCalled();});
it('truthful no-op success does not claim an update',async()=>{mock.update.mockResolvedValue({success:true,data:{id:77,revision:'9',changed:false,replayed:false}});mount('edit');await save();expect(mock.success).toHaveBeenCalledWith('No changes to save');});
it('unrelated edits preserve exact stored effective instants instead of truncating to a date',async()=>{
 const effective_from='2026-09-01T12:30:45.123456+04:00',effective_to='2026-11-01T19:20:31.234567+04:00';
 mount('edit',{effective_from,effective_to});input('notes','Keep the time');await save();
 expect(mock.update.mock.calls[0][0]).toMatchObject({effective_from,effective_to});
});
it('view and denied management do not expose saves',()=>{mock.manage=false;mount('edit');expect(mock.shell?.onSave).toBeUndefined();expect(mock.shell?.mode).toBe('view');});
it('a manager without lock capability cannot change the lock checkbox',()=>{mock.lock=false;mount('edit');const box=screen.getByRole('checkbox',{name:'Locked'});expect(box.getAttribute('aria-disabled')).toBe('true');fireEvent.click(box);expect(box.getAttribute('aria-checked')).toBe('false');});
// W32: actual owned memory session, fail-closed real-helper bridge and local outcomes.
beforeEach(()=>{recovery.owner='numbering';recovery.store=null;recovery.shell=null;recovery.tab=null;recovery.rpc.mockImplementation(()=>{throw Error('Unexpected business RPC');});});
afterEach(()=>{vi.restoreAllMocks();});
const retainedKey='draft:tab:w32:numbering-rule-workspace-form:save';
function owned(){recovery.owner='w32';recovery.tab={id:'w32'};mock.store=createWorkspaceDraftStore();return mock.store!;}
function recoveryMount(){const view=render(<NumberingRuleWorkspaceForm mode="add" authContext={{profile:{id:1}} as AuthContext}/>);fill();return view;}
async function submitRecovery(){let result:boolean|void;await act(async()=>{result=await recovery.shell!.onSave?.();});return result!;}
const goodReceipt={id:77,revision:'1',changed:true,replayed:false};

it.each(['40003','08007'])('W32 real helper %s then known rejection preserves original request across remounts',async(code)=>{
 const store=owned();mock.create.mockImplementation((payload:object,contract:WorkspaceSaveContract)=>saveNumberingMutation(null,'save',payload,contract));
 recovery.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private-code',details:'private-details',hint:'private-hint'}})
 .mockResolvedValueOnce({data:null,error:{code:'40P01',message:'private-denial'}})
 .mockResolvedValueOnce({data:{...goodReceipt,replayed:true},error:null});
 let view=recoveryMount();await submitRecovery();expect(recovery.rpc).toHaveBeenCalledTimes(1);
 const original=structuredClone(recovery.rpc.mock.calls[0]);expect(original[0]).toBe('save_numbering_rule');
 expect(original[1]).toMatchObject({p_id:null,p_action:'save',p_revision:null,p_operation:expect.any(String)});
 const bytes=store.getViewState(retainedKey);expect(bytes).toContain('pending');view.unmount();
 view=recoveryMount();await submitRecovery();expect(store.getViewState(retainedKey)).toBe(bytes);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/unconfirmed/i));view.unmount();
 recoveryMount();expect(await submitRecovery()).toBe(true);expect(recovery.rpc.mock.calls).toEqual([original,original,original]);
 expect(JSON.stringify(mock.error.mock.calls)).not.toMatch(/private-code|private-details|private-hint|private-denial/);
});
it('W32 first known rejection permits corrected new operation',async()=>{
 owned();mock.create.mockResolvedValueOnce({success:false,error:'Check values'});recoveryMount();await submitRecovery();
 const original=mock.create.mock.calls[0][1];fireEvent.change(document.querySelector('[name="rule_name"]')!,{target:{value:'Corrected value'}});
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

 expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private toast');
});
it('W32 unmount retires deferred completion without acknowledgements or notifications',async()=>{
 const store=owned();let finish!:(value:unknown)=>void;mock.create.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const view=recoveryMount();let pending!:Promise<unknown>;act(()=>{pending=Promise.resolve(recovery.shell!.onSave!());});const bytes=store.getViewState(retainedKey);view.unmount();
 await act(async()=>{finish({success:true,data:goodReceipt});await pending;});expect(store.getViewState(retainedKey)).toBe(bytes);expect(mock.success).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();
});
it('W32 live StrictMode activation still confirms',async()=>{
 owned();render(<StrictMode><NumberingRuleWorkspaceForm mode="add" authContext={{profile:{id:1}} as AuthContext}/></StrictMode>);fill();expect(await submitRecovery()).toBe(true);expect(mock.create).toHaveBeenCalledOnce();
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
 if(kind==='store')mock.store=createWorkspaceDraftStore();
 const alternate=cloneElement(<NumberingRuleWorkspaceForm mode="add" authContext={{profile:{id:1}} as AuthContext}/>,kind==='principal'?{authContext:{profile:{id:2}}}:kind==='mode'?{mode:'view'}:{});
 view.rerender(alternate);
 if(kind==='owner')recovery.owner='w32';if(kind==='store')mock.store=store;
 view.rerender(<NumberingRuleWorkspaceForm mode="add" authContext={{profile:{id:1}} as AuthContext}/>);
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
 fireEvent.change(document.querySelector('[name="rule_name"]')!,{target:{value:'Changed pending'}});
 await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);
 fireEvent.change(document.querySelector('[name="rule_name"]')!,{target:{value:'F06 rule'}});
 expect(await submitRecovery()).toBe(true);expect(mock.create.mock.calls[1]).toEqual(first);
});

it.each([{id:77},{id:77,revision:'0',changed:true,replayed:false},{id:Number.MAX_SAFE_INTEGER+1,revision:'1',changed:true,replayed:false},{id:77,revision:'1',changed:'yes',replayed:false}])('W32 rejects malformed numbering receipt %j without acknowledgement',async(receipt)=>{
 const store=owned();mock.create.mockResolvedValueOnce({success:true,data:receipt});recoveryMount();expect(await submitRecovery()).toBe(false);
 expect(store.getViewState(retainedKey)).toContain('pending');expect(mock.success).not.toHaveBeenCalled();expect(await submitRecovery()).toBe(true);expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);
});
it('W32 wrong numbering edit receipt cannot acknowledge another ID',async()=>{
 owned();mock.update.mockResolvedValueOnce({success:true,data:{...goodReceipt,id:78}});mount('edit');expect(await submitRecovery()).toBe(false);
 expect(mock.success).not.toHaveBeenCalled();expect(await submitRecovery()).toBe(true);expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);
});

it.each(['acknowledged','wrong-id','failed-ack'])('W32 parent create promotion %s preserves only a sound exact identity',async(kind)=>{
 const store=owned(),view=recoveryMount();
 if(kind==='failed-ack'){const write=store.setViewState.bind(store);vi.spyOn(store,'setViewState').mockImplementation((key,value)=>{if(key===retainedKey&&!value.includes('"pending"'))throw Error('ack failure');write(key,value);});}
 expect(await submitRecovery()).toBe(true);
 const targetId=kind==='wrong-id'?999:77;
 view.rerender(<NumberingRuleWorkspaceForm mode="edit" rule={{...existing,id:targetId,workspace_revision:1}} authContext={{profile:{id:1}} as AuthContext}/>);
 fireEvent.change(document.querySelector('[name="rule_name"]')!,{target:{value:'After parent promotion'}});
 await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);
 if(kind==='acknowledged'){expect(mock.update).toHaveBeenCalledTimes(1);expect(mock.update.mock.calls[0][0]).toMatchObject({id:77});expect(mock.update.mock.calls[0][1].revision).toBe('1');}
 else expect(mock.update).not.toHaveBeenCalled();
});

it.each(["dirty","route","close","replace"])('W32 independent display port %s failure preserves save and other effects',async(port)=>{
 owned();recoveryMount();const ports={dirty:recovery.dirty,route:recovery.route,close:recovery.close,replace:recovery.replace};
 ports[port as keyof typeof ports].mockImplementationOnce(()=>{throw Error('private local effect');});
 await act(async()=>{if(port==='replace')await recovery.shell!.onSave!();else await recovery.shell!.onSaveAndClose!();});
 expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.success).toHaveBeenCalledTimes(1);
 expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*refresh/i));

 expect(recovery.dirty).toHaveBeenCalled();expect(recovery.route).toHaveBeenCalled();
 if(port!=='replace')expect(recovery.close).toHaveBeenCalledTimes(1);
});
it('W32 baseline acknowledgement failure stays saved and blocks another mutation',async()=>{
 const store=owned();recoveryMount();vi.spyOn(store,'clearDraft').mockImplementationOnce(()=>{throw Error('private baseline');});
 expect(await submitRecovery()).toBe(true);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*local/i));
 expect(store.getViewState(retainedKey)).not.toContain('pending');await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.update).not.toHaveBeenCalled();
});
it('W32 callback teardown prevents later route/close and fallback effects',async()=>{
 owned();const view=recoveryMount();
 recovery.dirty.mockImplementationOnce(()=>{view.unmount();throw Error('private teardown');});
 let pending!:Promise<unknown>;await act(async()=>{pending=Promise.resolve(recovery.shell!.onSaveAndClose!());await pending;});
 expect(recovery.close).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();expect(mock.create).toHaveBeenCalledTimes(1);
});

it('W32 numbering unchanged FormData retries original hidden values after rule refresh',async()=>{
 owned();mock.lock=false;mock.update.mockResolvedValueOnce({success:false,uncertain:true});
 const originalRule={...existing,effective_from:'2026-10-03T12:15:30.123+04:00',effective_to:null};
 const view=render(<NumberingRuleWorkspaceForm mode="edit" rule={originalRule} authContext={{profile:{id:1}} as AuthContext}/>);
 await submitRecovery();const original=structuredClone(mock.update.mock.calls[0]);
 expect(original[0]).toMatchObject({is_locked:false,effective_from:originalRule.effective_from});expect(original[1].revision).toBe('9');
 view.rerender(<NumberingRuleWorkspaceForm mode="edit" rule={{...originalRule,workspace_revision:99,is_locked:true,effective_from:'2026-10-03T08:15:30.123Z'}} authContext={{profile:{id:1}} as AuthContext}/>);
 expect(await submitRecovery()).toBe(true);expect(mock.update.mock.calls).toEqual([original,original]);
});
