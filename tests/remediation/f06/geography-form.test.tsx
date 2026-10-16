// @vitest-environment node
// Actual form, serializers and F04 save session; navigation/lookups/actions are doubles.
import '../f05/setup';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {StrictMode,cloneElement} from 'react';
import {saveGeographyInput} from '@/server/geography-save';
import {createCitySchema} from '@/features/master-data/geography/validation';
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
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {GeographyEntity} from '@/lib/master-data/geography-save-contract';
import type {GeographyRecord} from '@/features/master-data/geography/form-state';
const auth={profile:{id:1},isAccountActive:true,permissionCodes:['master_data.geography.manage'],globalPermissionCodes:['master_data.geography.manage'],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const mock=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),success:vi.fn(),error:vi.fn(),clear:vi.fn(),invalidate:vi.fn(),tab:null as {id:string}|null,rename:vi.fn(),route:vi.fn()}));
vi.mock('@/features/master-data/geography/actions',()=>Object.fromEntries(['Country','Emirate','City','AreaZone','Port'].flatMap(name=>[['create'+name,mock.create],['update'+name,mock.update]])));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({})}));
vi.mock('@/lib/query/invalidation',()=>Object.fromEntries(['Countries','Emirates','Cities','Areas','Ports'].map(name=>['invalidate'+name,mock.invalidate])));
vi.mock('sonner',()=>({toast:{success:mock.success,error:mock.error}}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:recovery.replace}),usePathname:()=>'/f06-geography-test',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:recovery.tab??mock.tab,closeTab:recovery.close,markDirty:recovery.dirty,renameTab:mock.rename,updateTabRoute:mock.route,isTabActive:()=>true})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,clearDraft:mock.clear,writeDraftField:vi.fn(),restoredFromDraft:false})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:(props:ERPRecordWorkspaceFormProps)=>{recovery.shell=props;return <div>{props.children}<button disabled={!props.onSave} onClick={()=>void props.onSave?.()}>Test save</button></div>;},ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
type Choice={name:string;value:string|number|null;onValueChange:(v:number|string|null)=>void;disabled?:boolean};
vi.mock('@/components/erp/geography',()=>{
 const Choice=({name,value,onValueChange,disabled}:Choice)=><input name={name} aria-label={name} value={value??''} disabled={disabled} onChange={e=>onValueChange(e.target.value===''?null:Number(e.target.value))}/>;
 return {CountrySelect:Choice,EmirateSelect:Choice,CitySelect:Choice};
});
vi.mock('@/components/erp/lookup-select',()=>({LookupSelect:({name,value,onValueChange,disabled}:Choice)=><input name={name} aria-label={name} value={value??''} disabled={disabled} onChange={e=>onValueChange(e.target.value||null)}/>}));
import {GeographyWorkspaceForm} from '@/features/master-data/geography/components/geography-workspace-form';
const fields:Record<GeographyEntity,Record<string,string>>={countries:{country_code:'ZZ',iso3_code:'ZZZ',nationality_en:'Synthetic'},emirates:{emirate_code:'ZZZ',abbreviation_en:'F06',country_id:'7'},cities:{city_code:'F06_CITY',country_id:'7',emirate_id:'8'},areas_zones:{area_code:'F06_AREA',city_id:'9'},ports:{port_code:'F06_PORT',country_id:'7',emirate_id:'8',port_type_code:'SEA'}};
const change=(key:string,value:string)=>fireEvent.change(document.querySelector(`[name="${key}"]`)!,{target:{value}});
const fill=(entity:GeographyEntity)=>{for(const [key,value]of Object.entries({...fields[entity],name_en:'Synthetic geography'}))change(key,value);};
const clickSave=()=>fireEvent.click(screen.getByRole('button',{name:'Test save'}));
beforeEach(()=>{vi.resetAllMocks();mock.tab=null;mock.create.mockResolvedValue({success:true,data:{id:81,revision:'1',changed:true,replayed:false}});mock.update.mockResolvedValue({success:true,data:{id:81,revision:'2',changed:true,replayed:false}});});
afterEach(cleanup);
for(const entity of Object.keys(fields) as GeographyEntity[])for(const mode of ['add','edit'] as const)it(`${entity} ${mode}: preserves false and zero, and binds one save identity`,async()=>{
 const row={id:81,workspace_revision:1,name_en:'Synthetic geography',is_active:false,is_locked:false,sort_order:0,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',...fields[entity]} as unknown as GeographyRecord;
 render(<GeographyWorkspaceForm entity={entity} record={mode==='edit'?row:null} mode={mode} authContext={auth}/>);
 if(mode==='add'){fill(entity);fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));}
 clickSave();const action=mode==='add'?mock.create:mock.update;await waitFor(()=>expect(action).toHaveBeenCalledOnce());
 expect(action.mock.calls[0][0]).toMatchObject({is_active:false,sort_order:0});expect(action.mock.calls[0][1]).toMatchObject({operationId:expect.any(String),revision:mode==='add'?null:'1'});
 if(mode==='edit')for(const key of Object.keys(fields[entity]).filter(k=>['country_code','iso3_code','emirate_code','city_code','area_code','port_code'].includes(k)))expect(action.mock.calls[0][0]).not.toHaveProperty(key);
});
it('new Save becomes Edit and later saves cannot create another city',async()=>{
 render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');clickSave();await waitFor(()=>expect(mock.success).toHaveBeenCalled());
 change('name_en','Updated synthetic city');clickSave();await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());expect(mock.create).toHaveBeenCalledOnce();expect(mock.update.mock.calls[0][0].id).toBe(81);expect(mock.update.mock.calls[0][1].revision).toBe('1');expect((document.querySelector('[name="city_code"]') as HTMLInputElement).disabled).toBe(true);
});
it('the workspace stops saying New after a confirmed create',async()=>{
 mock.tab={id:'owned-geography-form'};render(<GeographyWorkspaceForm entity="countries" mode="add" authContext={auth}/>);fill('countries');clickSave();
 await waitFor(()=>expect(mock.success).toHaveBeenCalled());expect(mock.rename).toHaveBeenCalledWith('owned-geography-form','Synthetic geography','ZZ');
 expect(mock.route).toHaveBeenCalledWith('owned-geography-form','/admin/master-data/geography/countries/record/81?mode=edit',81,'edit');
});
it('uncertain save freezes values and retries the original operation',async()=>{
 mock.create.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');clickSave();await waitFor(()=>expect(mock.error).toHaveBeenCalled());
 expect((document.querySelector('[name="name_en"]') as HTMLInputElement).disabled).toBe(true);expect(mock.clear).not.toHaveBeenCalled();clickSave();await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);
});
it('missing parent and fractional sort order never reach the action',async()=>{
 render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');change('emirate_id','');clickSave();await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.create).not.toHaveBeenCalled();
 change('emirate_id','8');change('sort_order','1.5');clickSave();await waitFor(()=>expect(mock.error).toHaveBeenCalledTimes(2));expect(mock.create).not.toHaveBeenCalled();
});
it('double submission admits only one in-flight mutation',async()=>{
 mock.create.mockImplementation(()=>new Promise(()=>{}));render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');clickSave();clickSave();await waitFor(()=>expect(mock.create).toHaveBeenCalledOnce());
});
it('receipt failure retains draft and does not turn into another create',async()=>{
 mock.create.mockResolvedValueOnce({success:true,data:{id:81}});render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');clickSave();await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.clear).not.toHaveBeenCalled();clickSave();await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));expect(mock.create.mock.calls[1][1]).toEqual(mock.create.mock.calls[0][1]);
});
it('a receipt for another record freezes editing and preserves the original request',async()=>{
 const row={id:81,workspace_revision:1,name_en:'Synthetic geography',is_active:true,is_locked:false,sort_order:0,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',...fields.cities} as unknown as GeographyRecord;
 mock.update.mockResolvedValueOnce({success:true,data:{id:82,revision:'2',changed:true,replayed:false}});
 render(<GeographyWorkspaceForm entity="cities" record={row} mode="edit" authContext={auth}/>);change('name_en','Edited synthetic geography');clickSave();await waitFor(()=>expect(mock.error).toHaveBeenCalled());
 expect((document.querySelector('[name="name_en"]') as HTMLInputElement).disabled).toBe(true);expect(mock.clear).not.toHaveBeenCalled();expect(mock.success).not.toHaveBeenCalled();
 clickSave();await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(2));expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);
});
it('a lost action response freezes editing, hides raw transport errors and replays safely',async()=>{
 mock.create.mockRejectedValueOnce(new Error('secret-sensitive-transport-detail'));
 render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');clickSave();await waitFor(()=>expect(mock.error).toHaveBeenCalled());
 expect((document.querySelector('[name="name_en"]') as HTMLInputElement).disabled).toBe(true);expect(JSON.stringify(mock.error.mock.calls)).not.toContain('secret-sensitive-transport-detail');expect(mock.clear).not.toHaveBeenCalled();
 clickSave();await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);
});
it('company-only management remains view-only in the global catalogue',()=>{
 render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={{...auth,globalPermissionCodes:[]}}/>);expect((screen.getByRole('button',{name:'Test save'}) as HTMLButtonElement).disabled).toBe(true);
});
it('account change cannot inherit the previous account’s form values',()=>{
 const rendered=render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');
 rendered.rerender(<GeographyWorkspaceForm entity="cities" mode="add" authContext={{...auth,profile:{...auth.profile,id:2} as AuthContext['profile']}}/>);
 expect((document.querySelector('[name="name_en"]') as HTMLInputElement).value).toBe('');
});
it('changing country clears a dependent region but not the rest of the draft',()=>{
 render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');change('country_id','17');expect((document.querySelector('[name="emirate_id"]') as HTMLInputElement).value).toBe('');expect((document.querySelector('[name="name_en"]') as HTMLInputElement).value).toBe('Synthetic geography');
});
// W32: actual owned memory session, fail-closed real-helper bridge and local outcomes.
beforeEach(()=>{recovery.owner=null;recovery.store=null;recovery.shell=null;recovery.tab=null;recovery.rpc.mockImplementation(()=>{throw Error('Unexpected business RPC');});});
afterEach(()=>{vi.restoreAllMocks();});
const retainedKey='draft:tab:w32:city-workspace-form:save';
function owned(){recovery.owner='w32';recovery.tab={id:'w32'};recovery.store=createWorkspaceDraftStore();return recovery.store!;}
function recoveryMount(){const view=render(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);fill('cities');return view;}
async function submitRecovery(){let result:boolean|void;await act(async()=>{result=await recovery.shell!.onSave?.();});return result!;}
const goodReceipt={id:81,revision:'1',changed:true,replayed:false};

it.each(['40003','08007'])('W32 real helper %s then known rejection preserves original request across remounts',async(code)=>{
 const store=owned();mock.create.mockImplementation((payload:object,contract:WorkspaceSaveContract)=>saveGeographyInput('cities','save',payload,createCitySchema,contract));
 recovery.rpc.mockResolvedValueOnce({data:null,error:{code,message:'private-code',details:'private-details',hint:'private-hint'}})
 .mockResolvedValueOnce({data:null,error:{code:'40P01',message:'private-denial'}})
 .mockResolvedValueOnce({data:{...goodReceipt,replayed:true},error:null});
 let view=recoveryMount();await submitRecovery();expect(recovery.rpc).toHaveBeenCalledTimes(1);
 const original=structuredClone(recovery.rpc.mock.calls[0]);expect(original[0]).toBe('save_geography_record');
 expect(original[1]).toMatchObject({p_id:null,p_action:'save',p_revision:null,p_operation:expect.any(String)});
 const bytes=store.getViewState(retainedKey);expect(bytes).toContain('pending');view.unmount();
 view=recoveryMount();await submitRecovery();expect(store.getViewState(retainedKey)).toBe(bytes);expect(mock.error).toHaveBeenLastCalledWith(expect.stringMatching(/unconfirmed/i));view.unmount();
 recoveryMount();expect(await submitRecovery()).toBe(true);expect(recovery.rpc.mock.calls).toEqual([original,original,original]);
 expect(JSON.stringify(mock.error.mock.calls)).not.toMatch(/private-code|private-details|private-hint|private-denial/);
});
it('W32 first known rejection permits corrected new operation',async()=>{
 owned();mock.create.mockResolvedValueOnce({success:false,error:'Check values'});recoveryMount();await submitRecovery();
 const original=mock.create.mock.calls[0][1];fireEvent.change(document.querySelector('[name="name_en"]')!,{target:{value:'Corrected value'}});
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
 owned();render(<StrictMode><GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/></StrictMode>);fill('cities');expect(await submitRecovery()).toBe(true);expect(mock.create).toHaveBeenCalledOnce();
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
 const alternate=cloneElement(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>,kind==='principal'?{authContext:{...auth,profile:{id:2}}}:kind==='mode'?{mode:'view'}:{});
 view.rerender(alternate);
 if(kind==='owner')recovery.owner='w32';if(kind==='store')recovery.store=store;
 view.rerender(<GeographyWorkspaceForm entity="cities" mode="add" authContext={auth}/>);
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
