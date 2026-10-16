// @vitest-environment jsdom
// BR85-03/04/05: actual F06 forms, real record header and real retained-save hooks.
// Native visual/navigation/action ports are offline doubles. This is mounted
// regression evidence, NOT real-browser, routing or database acceptance.
import '../f05/setup';
import type {ButtonHTMLAttributes,InputHTMLAttributes,ReactNode} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {FinanceReferenceEntity} from '@/lib/master-data/finance-reference-contract';
import type {FinanceReferenceRecord} from '@/features/master-data/finance-basics/reference-form-state';
import type {LookupCategory,LookupValue} from '@/features/master-data/lookups/types';
import type {LookupMutationContract} from '@/features/master-data/lookups/mutation-contract';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({owner:'identity-owner',active:true,store:null as unknown,drafts:{} as Record<string,string>,send:vi.fn(),financeSave:vi.fn(),clear:vi.fn(),reset:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn(),close:vi.fn(),forceClose:vi.fn(),dirty:vi.fn(),route:vi.fn(),rename:vi.fn(),replace:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:m.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>null}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:{id:m.owner},closeTab:m.close,forceCloseActiveTab:m.forceClose,markDirty:m.dirty,updateTabRoute:m.route,renameTab:m.rename,isTabActive:(id:string)=>m.active&&id===m.owner})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-dirty',()=>({useWorkspaceFormDirty:()=>({isDirty:false,resetDirty:m.reset})}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({
 getDraftDefault:(key:string,fallback:unknown)=>Object.hasOwn(m.drafts,key)?m.drafts[key]:fallback,
 getDraftBoolean:(key:string,fallback:boolean)=>Object.hasOwn(m.drafts,key)?['true','on'].includes(m.drafts[key]):fallback,
 getDraftNullableId:(key:string,fallback:unknown)=>Object.hasOwn(m.drafts,key)?m.drafts[key]?Number(m.drafts[key]):null:fallback,
 syncDraft:vi.fn(),writeDraftField:(key:string,value:unknown)=>{m.drafts[key]=String(value??'');},clearDraft:m.clear,restoredFromDraft:false,
})}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:m.replace})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:m.invalidate})}));
vi.mock('@/lib/query/invalidation',()=>Object.fromEntries(['AllLookups','Banks','PaymentTerms','TaxTypes'].map(n=>['invalidate'+n,m.invalidate])));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,warning:m.warning}}));
vi.mock('@/features/master-data/finance-basics/reference-mutations',()=>({saveFinanceReference:m.financeSave}));
vi.mock('@/server/actions/master-data/lookups',()=>Object.fromEntries(['createLookupCategory','updateLookupCategory','toggleLookupCategoryStatus','toggleLookupCategoryLock','createLookupValue','updateLookupValue','toggleLookupValueStatus','toggleLookupValueLock','setDefaultLookupValue'].map(name=>[name,(...args:unknown[])=>m.send(name,args)])));
vi.mock('@/components/ui/input',()=>({Input:(p:InputHTMLAttributes<HTMLInputElement>)=><input {...p}/>}));
vi.mock('@/components/ui/textarea',()=>({Textarea:(p:object)=><textarea {...p}/>}));
vi.mock('@/components/ui/label',()=>({Label:(p:object)=><label {...p}/>}));
vi.mock('@/components/erp/required-label',()=>({RequiredLabel:(p:object)=><label {...p}/>}));
vi.mock('@/components/ui/button',()=>({Button:({variant:_variant,size:_size,...p}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;size?:string})=>{void _variant;void _size;return <button {...p}/>;}}));
vi.mock('@/components/ui/checkbox',()=>({Checkbox:({onCheckedChange,checked,...p}:InputHTMLAttributes<HTMLInputElement>&{onCheckedChange?:(v:boolean)=>void})=><input type="checkbox" {...p} checked={checked} onChange={e=>onCheckedChange?.(e.target.checked)}/>}));
vi.mock('@/components/ui/select',()=>({Select:({children,onValueChange,items:_items,...p}:{children?:ReactNode;onValueChange?:(v:string)=>void;items?:unknown})=>{void _items;return <select {...p} onChange={e=>onValueChange?.(e.target.value)}>{children}</select>;},SelectTrigger:()=>null,SelectValue:()=>null,SelectContent:({children}:{children?:ReactNode})=><>{children}</>,SelectItem:({children,...p}:{children?:ReactNode})=><option {...p}>{children}</option>}));
vi.mock('@/components/ui/card',()=>({Card:({children}:{children?:ReactNode})=><div>{children}</div>,CardContent:({children}:{children?:ReactNode})=><div>{children}</div>}));
vi.mock('@/components/ui/badge',()=>({Badge:({children,variant:_variant,...p}:{children?:ReactNode;variant?:string})=>{void _variant;return <span {...p}>{children}</span>;}}));
vi.mock('@/components/erp/geography',()=>({CountrySelect:({name,value,disabled}:{name:string;value:number|null;disabled:boolean})=><input name={name} value={value??''} disabled={disabled} readOnly/>}));
vi.mock('@/components/erp/lookup-select',()=>({LookupSelect:({name,value,disabled}:{name:string;value:string|null;disabled:boolean})=><input name={name} value={value??''} disabled={disabled} readOnly/>}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children,mode,title,subtitle,recordCode,onSave,onSaveAndClose,isSubmitting}:ERPRecordWorkspaceFormProps)=><div><ERPRecordHeader mode={mode} title={title} subtitle={subtitle} recordCode={recordCode}/>{children}<button type="button" disabled={!onSave||isSubmitting} onClick={()=>void onSave?.()}>Save</button><button type="button" disabled={!onSaveAndClose||isSubmitting} onClick={()=>void onSaveAndClose?.()}>Save and Close</button></div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
import {ERPRecordHeader} from '@/components/workspace/erp-record-header';
import {FinanceReferenceWorkspaceForm} from '@/features/master-data/finance-basics/components/finance-reference-workspace-form';
import {LookupCategoryWorkspaceForm} from '@/features/master-data/lookups/components/lookup-category-workspace-form';
import {LookupValueWorkspaceForm} from '@/features/master-data/lookups/components/lookup-value-workspace-form';
const auth={profile:{id:1},isAccountActive:true,permissionCodes:[],globalPermissionCodes:[],roleCodes:['system_admin'],roleAssignments:[{roleId:1,roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}]} as unknown as AuthContext;
const manager={...auth,roleCodes:[],roleAssignments:[],globalPermissionCodes:['master_data.finance_basics.manage','master_data.lookups.manage']} as AuthContext;
const category={id:8,workspace_revision:6,category_code:'SYNTHETIC_PARENT',category_name_en:'Synthetic parent',category_scope:'GLOBAL',is_active:true,is_locked:false,is_system:false,supports_metadata:false,supports_effective_dates:false} as LookupCategory;
const names={banks:{code:'bank_code',name:'bank_name_en'},payment_terms:{code:'term_code',name:'term_name_en'},tax_types:{code:'tax_code',name:'tax_name_en'}};
const financeRow=(entity:FinanceReferenceEntity)=>({id:71,workspace_revision:4,[names[entity].code]:'SYNTHETIC',[names[entity].name]:'Synthetic finance',is_active:true,is_locked:false,is_system:false,sort_order:0,tax_treatment_code:'NONE',tax_rate:0,effective_from:'2018-01-01',effective_to:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}) as unknown as FinanceReferenceRecord;
const field=(name:string)=>document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const save=(close=false)=>fireEvent.click(screen.getByRole('button',{name:close?'Save and Close':'Save',exact:true}));
type Kind='category'|'value';
const lookupNames={category:{code:'category_code',name:'category_name_en',label:'Category',slug:'categories'},value:{code:'value_code',name:'value_label_en',label:'Value',slug:'values'}};
const lookupUI=(kind:Kind)=>(kind==='category'?<LookupCategoryWorkspaceForm mode="add" authContext={auth}/>:<LookupValueWorkspaceForm mode="add" authContext={auth} categories={[category]}/>);
const fillLookup=(kind:Kind,code='SYNTHETIC_NEW',label='Original synthetic name')=>{fireEvent.change(field(lookupNames[kind].code),{target:{value:code}});fireEvent.change(field(lookupNames[kind].name),{target:{value:label}});};
type Args=unknown[];
function receipt(name:string,args:Args){const c=args.at(-1) as LookupMutationContract,id=typeof args[0]==='number'?args[0]:(args[0] as {id?:number}).id??501,kind=name.includes('Value')?'value':'category';return {success:true,data:{id,revision:c.revision===null?'1':String(BigInt(c.revision)+1n),category_id:c.categoryId??id,category_revision:c.categoryRevision?String(BigInt(c.categoryRevision)+1n):c.revision===null?'1':String(BigInt(c.revision)+1n),kind,action:'save',operation_id:c.operationId,changed:true,replayed:false}};}
const assertNoNavigation=()=>{expect(m.route).not.toHaveBeenCalled();expect(m.rename).not.toHaveBeenCalled();expect(m.replace).not.toHaveBeenCalled();expect(m.forceClose).not.toHaveBeenCalled();};
beforeEach(()=>{vi.resetAllMocks();m.owner='identity-owner';m.active=true;m.store=createWorkspaceDraftStore();m.drafts={};m.clear.mockImplementation(()=>{m.drafts={};});m.send.mockImplementation(receipt);});
afterEach(cleanup);

for(const entity of ['banks','payment_terms','tax_types'] as const)describe('BR85-03 '+entity,()=>{
 const cases=[
  {name:'global administrator explicit View',ctx:auth,locked:false,mode:'view' as const,text:'This record is open in view mode.'},
  {name:'global manager explicit View',ctx:manager,locked:false,mode:'view' as const,text:'This record is open in view mode.'},
  {name:'scoped-only edit denial',ctx:{...manager,globalPermissionCodes:[],permissionCodes:['master_data.finance_basics.manage']},locked:false,mode:'edit' as const,text:'Read only. Changes require global finance catalogue management permission.'},
  {name:'locked record without override',ctx:manager,locked:true,mode:'edit' as const,text:'This record is locked. Ask an authorized administrator to unlock it.'},
  {name:'global administrator View of a locked record',ctx:auth,locked:true,mode:'view' as const,text:'This record is open in view mode.'},
 ];
 it.each(cases)('$name states the actual reason without enabling changes',({ctx,locked,mode,text})=>{render(<FinanceReferenceWorkspaceForm entity={entity} record={{...financeRow(entity),is_locked:locked}} mode={mode} authContext={ctx as AuthContext}/>);expect(screen.getByText(text)).toBeTruthy();expect(field(names[entity].name).disabled).toBe(true);expect((screen.getByRole('button',{name:'Save',exact:true}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole('button',{name:'Save and Close'}) as HTMLButtonElement).disabled).toBe(true);expect((document.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);expect(m.financeSave).not.toHaveBeenCalled();});
 it('authorized unlocked Edit retains enabled controls without a read-only reason',()=>{render(<FinanceReferenceWorkspaceForm entity={entity} record={financeRow(entity)} mode="edit" authContext={auth}/>);expect(screen.queryByText('This record is open in view mode.')).toBeNull();expect(screen.queryByText(/Read only\. Changes require/)).toBeNull();expect(field(names[entity].name).disabled).toBe(false);expect((screen.getByRole('button',{name:'Save',exact:true}) as HTMLButtonElement).disabled).toBe(false);expect(m.financeSave).not.toHaveBeenCalled();});
});

for(const kind of ['category','value'] as const)describe('BR85-04 '+kind,()=>{
 const n=lookupNames[kind],path=`/admin/master-data/lookups/${n.slug}/record/501?mode=edit`;
 it('promotes the real record header/badge/subtitle only after acknowledged creation',async()=>{render(lookupUI(kind));expect(screen.getByRole('heading',{name:'New Lookup '+n.label})).toBeTruthy();expect(screen.getByText('New Record',{exact:true})).toBeTruthy();fillLookup(kind);save();await waitFor(()=>expect(m.send).toHaveBeenCalledOnce());await screen.findByRole('heading',{name:'Edit Lookup '+n.label});expect(screen.getByText('Editing',{exact:true})).toBeTruthy();expect(screen.queryByText('New Record',{exact:true})).toBeNull();expect(screen.getByText('SYNTHETIC_NEW',{exact:true})).toBeTruthy();expect(screen.getByText(`${n.label} Code: SYNTHETIC_NEW`,{exact:true})).toBeTruthy();});
 it('promotes only the owning tab and active URL using admitted immutable identity',async()=>{render(lookupUI(kind));fillLookup(kind,'synthetic_new');save();await waitFor(()=>expect(m.route).toHaveBeenCalledWith('identity-owner',path,501,'edit'));expect(m.rename).toHaveBeenCalledWith('identity-owner','Original synthetic name','SYNTHETIC_NEW');expect(m.route.mock.invocationCallOrder[0]).toBeLessThan(m.rename.mock.invocationCallOrder[0]);expect(m.replace).toHaveBeenCalledWith(path);expect(m.send).toHaveBeenCalledOnce();});
 it('keeps saved identity immutable and next Save updates that same record',async()=>{render(lookupUI(kind));fillLookup(kind);save();await waitFor(()=>expect(m.clear).toHaveBeenCalledOnce());expect(field(n.code).disabled).toBe(true);if(kind==='value')expect((field('category_id') as unknown as HTMLSelectElement).disabled).toBe(true);fireEvent.change(field(n.name),{target:{value:'Updated same record'}});save();await waitFor(()=>expect(m.send).toHaveBeenCalledTimes(2));expect(m.send.mock.calls.map(c=>c[0])).toEqual([kind==='category'?'createLookupCategory':'createLookupValue',kind==='category'?'updateLookupCategory':'updateLookupValue']);expect(m.send.mock.calls[1][1][0]).toMatchObject({id:501});expect(m.send.mock.calls[1][1][0]).not.toHaveProperty(n.code);});
 it.each(['unknown','malformed'] as const)('%s outcome never pretends creation is confirmed',async outcome=>{m.send.mockImplementationOnce((name,args)=>outcome==='unknown'?{success:false,uncertain:true}:({...receipt(name,args),data:{...receipt(name,args).data,id:999,revision:'invalid'}}));render(lookupUI(kind));fillLookup(kind);save();await screen.findByRole('button',{name:'Recover original request'});expect(screen.getByRole('heading',{name:'New Lookup '+n.label})).toBeTruthy();expect(screen.getByText('New Record',{exact:true})).toBeTruthy();assertNoNavigation();expect(m.clear).not.toHaveBeenCalled();});
 it('unacknowledged committed receipt does not navigate or clear a retained request',async()=>{const store=m.store as ReturnType<typeof createWorkspaceDraftStore>,set=store.setViewState.bind(store);vi.spyOn(store,'setViewState').mockImplementation((key,value)=>{if(key.endsWith(':administration-payload')&&value==='null')throw Error('Synthetic acknowledgment failure');set(key,value);});render(lookupUI(kind));fillLookup(kind);save();await waitFor(()=>expect(m.warning).toHaveBeenCalledWith(expect.stringContaining('could not acknowledge')));assertNoNavigation();expect(m.clear).not.toHaveBeenCalled();expect(m.send).toHaveBeenCalledOnce();});
 it('recovered original creation repairs the immutable input and preserves a newer mutable draft',async()=>{
  const diagnostics=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   m.send.mockResolvedValueOnce({success:false,uncertain:true});const first=render(lookupUI(kind));fillLookup(kind);save();await screen.findByRole('button',{name:'Recover original request'});const original=m.send.mock.calls[0];first.unmount();
   m.drafts={[n.code]:'UNSENT_DRAFT_CODE',[n.name]:'Unsent draft name'};render(lookupUI(kind));
   // A real remount must explain the retained request before any footer action.
   expect(screen.getByRole('alert').textContent).toMatch(/unconfirmed.*Recover the original request/i);
   const recover=screen.getByRole('button',{name:'Recover original request'});expect((recover as HTMLButtonElement).disabled).toBe(false);expect(field(n.name).matches(':disabled')).toBe(true);expect(m.send).toHaveBeenCalledOnce();
   fireEvent.click(recover);await waitFor(()=>expect(m.send).toHaveBeenCalledTimes(2));expect(m.send.mock.calls[1]).toEqual(original);
   await waitFor(()=>expect(field(n.code).value).toBe('SYNTHETIC_NEW'));expect(field(n.code).matches(':disabled')).toBe(true);
   expect(field(n.name).value).toBe('Unsent draft name');expect(m.drafts[n.name]).toBe('Unsent draft name');expect(m.clear).not.toHaveBeenCalled();expect(m.reset).not.toHaveBeenCalled();
   expect(m.rename).toHaveBeenCalledWith('identity-owner','Original synthetic name','SYNTHETIC_NEW');expect(m.replace).toHaveBeenCalledWith(path);expect(screen.getByText('SYNTHETIC_NEW',{exact:true})).toBeTruthy();
   expect(diagnostics.mock.calls.flat().join(' ')).not.toMatch(/uncontrolled.*controlled|controlled.*uncontrolled/i);
  }finally{diagnostics.mockRestore();}
 });
 it.each([
  ['add','transport'],['add','malformed'],['edit','transport'],['edit','malformed'],
 ] as const)('BR85-05 %s form exposes recovery after a true remount of a %s failure',async(mode,failure)=>{
  const row={id:71,workspace_revision:4,[n.code]:'SYNTHETIC_EXISTING',[n.name]:'Existing synthetic name',category_id:8,is_active:true,is_locked:false,is_system:false,sort_order:0};
  const ui=()=>mode==='add'?lookupUI(kind):kind==='category'?<LookupCategoryWorkspaceForm category={row as unknown as LookupCategory} mode="edit" authContext={auth}/>:<LookupValueWorkspaceForm value={row as unknown as LookupValue} categories={[category]} mode="edit" authContext={auth}/>;
  if(failure==='transport')m.send.mockRejectedValueOnce(Error('Synthetic response loss'));
  else m.send.mockImplementationOnce((name,args)=>({...receipt(name,args),data:{...receipt(name,args).data,revision:'invalid'}}));
  const first=render(ui());if(mode==='add')fillLookup(kind);else fireEvent.change(field(n.name),{target:{value:'Original synthetic name'}});
  save();await screen.findByRole('button',{name:'Recover original request'});const original=m.send.mock.calls[0];first.unmount();expect(document.querySelector('form')).toBeNull();
  // Only the visible draft adapter is doubled; the original command/session store is real.
  m.drafts={[n.code]:mode==='add'?'SYNTHETIC_NEW':'SYNTHETIC_EXISTING',[n.name]:'Original synthetic name'};render(ui());
  expect(m.send).toHaveBeenCalledOnce();expect(field(n.name).value).toBe('Original synthetic name');expect(field(n.name).matches(':disabled')).toBe(true);
  expect(screen.getByRole('alert').textContent).toMatch(/unconfirmed.*Recover the original request/i);
  const recover=screen.getByRole('button',{name:'Recover original request'});expect((recover as HTMLButtonElement).disabled).toBe(false);fireEvent.click(recover);
  await waitFor(()=>expect(m.send).toHaveBeenCalledTimes(2));expect(m.send.mock.calls[1]).toEqual(original);
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Recover original request'})).toBeNull());expect(screen.queryByRole('alert')).toBeNull();expect(field(n.name).matches(':disabled')).toBe(false);
  fireEvent.change(field(n.name),{target:{value:'Fresh edit after recovery'}});save();await waitFor(()=>expect(m.send).toHaveBeenCalledTimes(3));
  expect(m.send.mock.calls[2][0]).toBe(kind==='category'?'updateLookupCategory':'updateLookupValue');expect(m.send.mock.calls[2][1][0]).toMatchObject({id:mode==='add'?501:71});expect(m.send.mock.calls[2][1].at(-1)).toMatchObject({revision:mode==='add'?'1':'5'});
  expect((m.send.mock.calls[2][1].at(-1) as LookupMutationContract).operationId).not.toBe((original[1].at(-1) as LookupMutationContract).operationId);
 });
 it('a same-owner saved-route remount uses authoritative props and updates the original identity',async()=>{
  const first=render(lookupUI(kind));fillLookup(kind);save();await waitFor(()=>expect(m.clear).toHaveBeenCalledOnce());first.unmount();
  const saved={id:501,workspace_revision:1,[n.code]:'SYNTHETIC_NEW',[n.name]:'Original synthetic name',category_id:8,is_active:true,is_locked:false,is_system:false,sort_order:0};
  render(kind==='category'?<LookupCategoryWorkspaceForm category={saved as unknown as LookupCategory} mode="edit" authContext={auth}/>:<LookupValueWorkspaceForm value={saved as unknown as LookupValue} categories={[{...category,workspace_revision:7}]} mode="edit" authContext={auth}/>);
  expect(screen.getByRole('heading',{name:'Edit Lookup '+n.label})).toBeTruthy();expect(screen.getByText('Editing',{exact:true})).toBeTruthy();expect(field(n.code).value).toBe('SYNTHETIC_NEW');expect(field(n.code).matches(':disabled')).toBe(true);
  fireEvent.change(field(n.name),{target:{value:'Edit from authoritative saved route'}});save();await waitFor(()=>expect(m.send).toHaveBeenCalledTimes(2));expect(m.send.mock.calls[1][0]).toBe(kind==='category'?'updateLookupCategory':'updateLookupValue');expect(m.send.mock.calls[1][1][0]).toMatchObject({id:501});expect(m.send.mock.calls[1][1].at(-1)).toMatchObject({revision:'1'});expect(m.send.mock.calls.filter(c=>c[0].startsWith('create'))).toHaveLength(1);
 });
 it('updates the inactive owning tab metadata without replacing another active URL',async()=>{m.active=false;render(lookupUI(kind));fillLookup(kind);save();await waitFor(()=>expect(m.route).toHaveBeenCalledWith('identity-owner',path,501,'edit'));expect(m.rename).toHaveBeenCalledWith('identity-owner','Original synthetic name','SYNTHETIC_NEW');expect(m.replace).not.toHaveBeenCalled();expect(m.forceClose).not.toHaveBeenCalled();});
 it('retired account/owner completion cannot clear, notify, navigate or close the replacement',async()=>{let finish!:(result:unknown)=>void;m.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=render(lookupUI(kind));fillLookup(kind);save(true);expect(m.send).toHaveBeenCalledOnce();const original=m.send.mock.calls[0];m.owner='replacement-owner';m.store=createWorkspaceDraftStore();view.rerender(lookupUI(kind));await act(async()=>finish(receipt(...original as [string,Args])));expect(m.clear).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();expect(m.error).not.toHaveBeenCalled();expect(m.warning).not.toHaveBeenCalled();assertNoNavigation();});
 it('unmounted completion does not publish feedback or navigation',async()=>{let finish!:(result:unknown)=>void;m.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=render(lookupUI(kind));fillLookup(kind);save();const original=m.send.mock.calls[0];view.unmount();await act(async()=>finish(receipt(...original as [string,Args])));expect(m.clear).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();expect(m.error).not.toHaveBeenCalled();expect(m.warning).not.toHaveBeenCalled();assertNoNavigation();});
 it('Save and Close uses the acknowledged owner without an intermediate active URL replacement',async()=>{render(lookupUI(kind));fillLookup(kind);save(true);await waitFor(()=>expect(m.forceClose).toHaveBeenCalledOnce());expect(m.send).toHaveBeenCalledOnce();expect(m.replace).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Recover original request'})).toBeNull();});
 it('failed local route promotion is terminal for all further edits/dispatch, not another retry',async()=>{m.replace.mockImplementationOnce(()=>{throw Error('Synthetic route failure');});render(lookupUI(kind));fillLookup(kind);save();await waitFor(()=>expect(m.warning).toHaveBeenCalledWith(expect.stringMatching(/Saved.*reopen/i)));expect(m.send).toHaveBeenCalledOnce();expect(screen.getByRole('heading',{name:'Edit Lookup '+n.label})).toBeTruthy();expect(screen.queryByRole('button',{name:'Recover original request'})).toBeNull();expect(field(n.name).matches(':disabled')).toBe(true);expect((screen.getByRole('button',{name:'Save',exact:true}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole('button',{name:'Save and Close'}) as HTMLButtonElement).disabled).toBe(true);save();fireEvent.submit(document.getElementById(kind==='category'?'lookup-category-workspace-form':'lookup-value-workspace-form')!);await act(async()=>{});expect(m.send).toHaveBeenCalledOnce();expect(m.forceClose).not.toHaveBeenCalled();});
 it('a cache-refresh failure cannot hide verified saved identity or offer a mutation retry',async()=>{m.invalidate.mockImplementationOnce(()=>{throw Error('Synthetic cache failure');});render(lookupUI(kind));fillLookup(kind);save();await waitFor(()=>expect(m.warning).toHaveBeenCalledWith(expect.stringMatching(/Saved.*reopen/i)));expect(screen.getByRole('heading',{name:'Edit Lookup '+n.label})).toBeTruthy();expect(m.route).toHaveBeenCalledWith('identity-owner',path,501,'edit');expect(m.replace).toHaveBeenCalledWith(path);expect(screen.queryByRole('button',{name:'Recover original request'})).toBeNull();expect(m.send).toHaveBeenCalledOnce();});
});
