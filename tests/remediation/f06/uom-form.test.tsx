// @vitest-environment node
// Real UOM form, serializers and F04 save session; actions/lookups/navigation doubled.
import '../f05/setup';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {StrictMode,cloneElement} from 'react';
import {saveUomRecord} from '@/server/uom-save';
const recovery=vi.hoisted(()=>({owner:null as string|null,store:null as ReturnType<typeof createWorkspaceDraftStore>|null,shell:null as ERPRecordWorkspaceFormProps|null,rpc:vi.fn(),revalidate:vi.fn(),tab:null as {id:string}|null,close:vi.fn(),dirty:vi.fn(),route:vi.fn(),replace:vi.fn()}));
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});dom.teardown(globalThis);});
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>recovery.owner?{id:recovery.owner}:null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>recovery.store}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:recovery.rpc,from:()=>{throw Error('Unexpected table access');}})}));
vi.mock('next/cache',()=>({revalidatePath:recovery.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,globalPermissionCodes:['master_data.finance_basics.manage','master_data.geography.manage','master_data.uom.manage'],roleCodes:[],roleAssignments:[]})}));


import {afterEach,beforeEach,it,expect,vi,afterAll} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';import type {AuthContext} from '@/lib/rbac/check';
import type {UomEntity} from '@/lib/master-data/uom-save-contract';
import type {UomRecord} from '@/features/master-data/uom/form-state';
const auth={profile:{id:1},isAccountActive:true,permissionCodes:['master_data.uom.manage'],globalPermissionCodes:['master_data.uom.manage'],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const mock=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),success:vi.fn(),error:vi.fn(),clear:vi.fn(),invalidate:vi.fn(),rename:vi.fn(),route:vi.fn(),tab:null as {id:string}|null}));
vi.mock('@/features/master-data/uom/actions',()=>Object.fromEntries(['UomCategory','UnitOfMeasure','UomConversion'].flatMap(n=>[['create'+n,mock.create],['update'+n,mock.update]])));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({})}));
vi.mock('@/lib/query/invalidation',()=>({invalidateUom:mock.invalidate}));
vi.mock('sonner',()=>({toast:{success:mock.success,error:mock.error}}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:recovery.replace}),usePathname:()=>'/f06-uom-test',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:recovery.tab??mock.tab,closeTab:recovery.close,markDirty:recovery.dirty,renameTab:mock.rename,updateTabRoute:mock.route,isTabActive:()=>true})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,clearDraft:mock.clear,writeDraftField:vi.fn(),restoredFromDraft:false})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:(props:ERPRecordWorkspaceFormProps)=>{recovery.shell=props;return <div>{props.children}<button disabled={!props.onSave} onClick={()=>void props.onSave?.()}>Test save</button></div>;},ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
type Choice={name:string;value:string|number|null;onValueChange:(v:number|string|null)=>void;disabled?:boolean};
vi.mock('@/components/erp/uom/uom-category-select',()=>({UomCategorySelect:({name,value,onValueChange,disabled}:Choice)=><input name={name} aria-label={name} value={value??''} disabled={disabled} onChange={e=>onValueChange(e.target.value===''?null:Number(e.target.value))}/>}));
vi.mock('@/components/erp/uom/unit-of-measure-select',()=>({UnitOfMeasureSelect:({name,value,onValueChange,disabled}:Choice)=><input name={name} aria-label={name} value={value??''} disabled={disabled} onChange={e=>onValueChange(e.target.value===''?null:Number(e.target.value))}/>}));
import {UomWorkspaceForm} from '@/features/master-data/uom/components/uom-workspace-form';
const change=(key:string,value:string)=>fireEvent.change(document.querySelector(`[name="${key}"]`)!,{target:{value}});
const fill=(entity='uom_categories')=>{if(entity==='uom_conversions'){change('from_uom_id','12');change('to_uom_id','13');return;}const prefix=entity==='uom_categories'?'category':'unit';change(prefix+'_code','F_SYNTHETIC');change(prefix+'_name_en','Synthetic unit');if(entity==='units_of_measure')change('uom_category_id','11');};
const save=()=>fireEvent.click(screen.getByRole('button',{name:'Test save'}));
const field=(name:string)=>document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const row=(entity='uom_categories')=>({id:81,workspace_revision:1,category_code:'F_SYNTHETIC',category_name_en:'Synthetic unit',unit_code:'F_SYNTHETIC',unit_name_en:'Synthetic unit',uom_category_id:11,conversion_factor:1,conversion_factor_to_base:1,is_base_unit:false,decimal_places:0,allow_fraction:false,from_uom_id:12,to_uom_id:13,is_bidirectional:false,is_active:false,is_locked:false,sort_order:0,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',...{entity}} as unknown as UomRecord);
beforeEach(()=>{vi.resetAllMocks();mock.tab=null;mock.create.mockResolvedValue({success:true,data:{id:81,revision:'1',changed:true,replayed:false}});mock.update.mockResolvedValue({success:true,data:{id:81,revision:'2',changed:true,replayed:false}});});afterEach(cleanup);
for(const entity of ['uom_categories','units_of_measure','uom_conversions'] as const)for(const mode of ['add','edit'] as const)it(`${entity} ${mode}: false/zero survive and code becomes immutable`,async()=>{
 render(<UomWorkspaceForm entity={entity as UomEntity} mode={mode} record={mode==='edit'?row(entity):null} authContext={auth}/>);
 if(mode==='add'){fill(entity);fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));}save();const action=mode==='add'?mock.create:mock.update;
 await waitFor(()=>expect(action).toHaveBeenCalledOnce());expect(action.mock.calls[0][0]).toMatchObject({is_active:false,sort_order:0});expect(action.mock.calls[0][1]).toMatchObject({operationId:expect.any(String),revision:mode==='add'?null:'1'});
 if(mode==='edit')expect(action.mock.calls[0][0]).not.toHaveProperty(entity==='uom_categories'?'category_code':entity==='units_of_measure'?'unit_code':'from_uom_id');
});
it('Save adopts the created identity, route, title and edit revision',async()=>{
 mock.tab={id:'finance-tab'};render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);fill();save();await waitFor(()=>expect(mock.success).toHaveBeenCalled());
 expect(field('category_code').disabled).toBe(true);expect(mock.rename).toHaveBeenCalledWith('finance-tab','Synthetic unit');expect(mock.route).toHaveBeenCalledWith('finance-tab','/admin/master-data/uom/categories/record/81?mode=edit',81,'edit');
 change('category_name_en','Edited centre');save();await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());expect(mock.create).toHaveBeenCalledOnce();expect(mock.update.mock.calls[0][0].id).toBe(81);expect(mock.update.mock.calls[0][1].revision).toBe('1');
});
it.each(['uncertain','malformed','throws'])('%s response retains operation and freezes fields until recovered',async(kind)=>{
 if(kind==='throws')mock.create.mockRejectedValueOnce(Error('private transport detail'));else mock.create.mockResolvedValueOnce(kind==='malformed'?{success:true,data:{id:81}}:{success:false,uncertain:true,error:'Unconfirmed'});
 render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);fill();save();await waitFor(()=>expect(mock.error).toHaveBeenCalled());
 expect(field('category_name_en').disabled).toBe(true);expect(mock.clear).not.toHaveBeenCalled();expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private transport');save();await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);
});
it('wrong record receipt cannot clear a draft or acknowledge the edit',async()=>{
 mock.update.mockResolvedValueOnce({success:true,data:{id:82,revision:'2',changed:true,replayed:false}});render(<UomWorkspaceForm entity="uom_categories" mode="edit" record={row()} authContext={auth}/>);change('notes','Draft note');save();await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.clear).not.toHaveBeenCalled();expect(field('notes').disabled).toBe(true);
});
it('double submission admits one in-flight request',async()=>{
 mock.create.mockImplementation(()=>new Promise(()=>{}));render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);fill();save();save();expect(mock.create).toHaveBeenCalledOnce();
});
it.each(['','1.5','-1'])('invalid sort order %s does not silently become zero',async(value)=>{
 render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);fill();change('sort_order',value);save();await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.create).not.toHaveBeenCalled();
});

it('account change does not inherit prior account draft',()=>{
 const rendered=render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);fill();rendered.rerender(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={{...auth,profile:{...auth.profile,id:2} as AuthContext['profile']}}/>);expect(field('category_name_en').value).toBe('');
});
it('company-only management and locked records remain read-only',()=>{
 const rendered=render(<UomWorkspaceForm entity="uom_categories" mode="edit" record={row()} authContext={{...auth,globalPermissionCodes:[]}}/>);expect((screen.getByRole('button',{name:'Test save'}) as HTMLButtonElement).disabled).toBe(true);
 rendered.rerender(<UomWorkspaceForm entity="uom_categories" mode="edit" record={{...row(),is_locked:true}} authContext={auth}/>);expect((screen.getByRole('button',{name:'Test save'}) as HTMLButtonElement).disabled).toBe(true);
});
it('fixed-ratio choice requires notes and submits the explicit rule without asking users to code',async()=>{
 render(<UomWorkspaceForm entity="uom_conversions" mode="add" authContext={auth}/>);fill('uom_conversions');
 fireEvent.click(screen.getByRole('combobox',{name:'Conversion rule'}));
 fireEvent.click(await screen.findByRole('option',{name:/Documented fixed ratio/}));
 save();await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.create).not.toHaveBeenCalled();
 change('notes','Synthetic sealed two-unit package; constant ratio specification.');save();
 await waitFor(()=>expect(mock.create).toHaveBeenCalledOnce());expect(mock.create.mock.calls[0][0]).toMatchObject({conversion_formula_code:'FIXED_RATIO',notes:'Synthetic sealed two-unit package; constant ratio specification.'});
});
// W32: actual owned memory session, fail-closed real-helper bridge and local outcomes.
beforeEach(()=>{recovery.owner=null;recovery.store=null;recovery.shell=null;recovery.tab=null;recovery.rpc.mockImplementation(()=>{throw Error('Unexpected business RPC');});});
afterEach(()=>{vi.restoreAllMocks();});
const retainedKey='draft:tab:w32:uom-category-workspace-form:save';
function owned(){recovery.owner='w32';recovery.tab={id:'w32'};recovery.store=createWorkspaceDraftStore();return recovery.store!;}
function recoveryMount(){const view=render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);fill();return view;}
async function submitRecovery(){let result:boolean|void;await act(async()=>{result=await recovery.shell!.onSave?.();});return result!;}
const goodReceipt={id:81,revision:'1',changed:true,replayed:false};

it.each(['40003','08007'])('W32 real helper %s then known rejection preserves original request across remounts',async(code)=>{
 const store=owned();mock.create.mockImplementation((payload:object,contract:WorkspaceSaveContract)=>saveUomRecord('uom_categories','save',null,payload,contract));
 recovery.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private-code',details:'private-details',hint:'private-hint'}})
 .mockResolvedValueOnce({data:null,error:{code:'40P01',message:'private-denial'}})
 .mockResolvedValueOnce({data:{...goodReceipt,replayed:true},error:null});
 let view=recoveryMount();await submitRecovery();expect(recovery.rpc).toHaveBeenCalledTimes(1);
 const original=structuredClone(recovery.rpc.mock.calls[0]);expect(original[0]).toBe('save_uom_record');
 expect(original[1]).toMatchObject({p_id:null,p_action:'save',p_revision:null,p_operation:expect.any(String)});
 const bytes=store.getViewState(retainedKey);expect(bytes).toContain('pending');view.unmount();
 view=recoveryMount();await submitRecovery();expect(store.getViewState(retainedKey)).toBe(bytes);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/unconfirmed/i));view.unmount();
 recoveryMount();expect(await submitRecovery()).toBe(true);expect(recovery.rpc.mock.calls).toEqual([original,original,original]);
 expect(JSON.stringify(mock.error.mock.calls)).not.toMatch(/private-code|private-details|private-hint|private-denial/);
});
it('W32 first known rejection permits corrected new operation',async()=>{
 owned();mock.create.mockResolvedValueOnce({success:false,error:'Check values'});recoveryMount();await submitRecovery();
 const original=mock.create.mock.calls[0][1];fireEvent.change(document.querySelector('[name="category_name_en"]')!,{target:{value:'Corrected value'}});
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
 owned();render(<StrictMode><UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/></StrictMode>);fill();expect(await submitRecovery()).toBe(true);expect(mock.create).toHaveBeenCalledOnce();
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
 const alternate=cloneElement(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>,kind==='principal'?{authContext:{...auth,profile:{id:2}}}:kind==='mode'?{mode:'view'}:{});
 view.rerender(alternate);
 if(kind==='owner')recovery.owner='w32';if(kind==='store')recovery.store=store;
 view.rerender(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth}/>);
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

it.each(["dirty","route","close","replace","rename","invalidate"])('W32 independent display port %s failure preserves save and other effects',async(port)=>{
 owned();recoveryMount();const ports={dirty:recovery.dirty,route:mock.route,close:recovery.close,replace:recovery.replace,rename:mock.rename,invalidate:mock.invalidate};
 ports[port as keyof typeof ports].mockImplementationOnce(()=>{throw Error('private local effect');});
 await act(async()=>{if(port==='replace')await recovery.shell!.onSave!();else await recovery.shell!.onSaveAndClose!();});
 expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.success).toHaveBeenCalledTimes(1);
 expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*refresh/i));
 expect(mock.invalidate).toHaveBeenCalledTimes(1);
 expect(recovery.dirty).toHaveBeenCalled();expect(mock.route).toHaveBeenCalled();
 if(port!=='replace')expect(recovery.close).toHaveBeenCalledTimes(1);
});
it('W32 baseline acknowledgement failure stays saved and blocks another mutation',async()=>{
 const store=owned();recoveryMount();mock.clear.mockImplementationOnce(()=>{throw Error('private baseline');});
 expect(await submitRecovery()).toBe(true);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*local/i));
 expect(store.getViewState(retainedKey)).not.toContain('pending');await submitRecovery();expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.update).not.toHaveBeenCalled();
});
it('W32 callback teardown prevents later route/close and fallback effects',async()=>{
 owned();const view=recoveryMount();
 mock.invalidate.mockImplementationOnce(()=>{view.unmount();throw Error('private teardown');});
 let pending!:Promise<unknown>;await act(async()=>{pending=Promise.resolve(recovery.shell!.onSaveAndClose!());await pending;});
 expect(recovery.close).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();expect(mock.create).toHaveBeenCalledTimes(1);
});

it('W32 UOM parent callback failure remains saved and permits independent close',async()=>{
 owned();const onSuccess=vi.fn(()=>{throw Error('private parent');});
 render(<UomWorkspaceForm entity="uom_categories" mode="add" authContext={auth} onSuccess={onSuccess}/>);fill();
 await act(async()=>{await recovery.shell!.onSaveAndClose!();});expect(onSuccess).toHaveBeenCalledTimes(1);expect(recovery.close).toHaveBeenCalledTimes(1);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/saved.*refresh/i));
});
