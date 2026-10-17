// @vitest-environment jsdom
// Mounted catalogue editor and real Fluent controls; boundary/router doubles only.
import '../f05/setup';
import {afterEach,beforeEach,describe,expect,it,vi,afterAll} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {StrictMode,useEffect,type ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
const recovery=vi.hoisted(()=>({ackFault:null as null|'before'|'after',ack:vi.fn(),submit:null as null|(()=>void|Promise<unknown>),activate:null as null|(()=>unknown),close:null as null|((open:boolean)=>void)}));
vi.mock('@/components/erp/erp-child-dialog-form',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/components/erp/erp-child-dialog-form')>();
 return {...actual,ERPChildDialogForm:(props:Parameters<typeof actual.ERPChildDialogForm>[0])=>{recovery.submit=props.onSubmit??null;recovery.close=props.onOpenChange;return <actual.ERPChildDialogForm {...props}/>;}};
});
vi.mock('@/components/ui/button',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/components/ui/button')>();
 return {...actual,Button:(props:Parameters<typeof actual.Button>[0])=>{if(props['aria-label']==='Activate record')recovery.activate=()=>props.onClick?.({} as Parameters<NonNullable<typeof props.onClick>>[0]);return <actual.Button {...props}/>;}};
});
vi.mock('@/lib/master-data/party-admin-master-attempt',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/lib/master-data/party-admin-master-attempt')>();
 return {...actual,createPartyAdminMasterAttempt:(...args:Parameters<typeof actual.createPartyAdminMasterAttempt>)=>{const attempt=actual.createPartyAdminMasterAttempt(...args);return {...attempt,acknowledged(){recovery.ack();if(recovery.ackFault==='before')throw Error('private ack');attempt.acknowledged();if(recovery.ackFault==='after')throw Error('private ack');}};}};
});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});});
function Start({start}:{start:()=>void}){useEffect(()=>{start();},[start]);return null;}
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),load:vi.fn(),refresh:vi.fn(),success:vi.fn(),tableMount:0}));
vi.mock('@/server/actions/master-data/party-admin-masters',()=>({createServiceCategory:m.create,updateServiceCategory:m.update,getServiceCategoryAdminById:m.load,createRelationshipType:m.create,updateRelationshipType:m.update,getRelationshipTypeAdminById:m.load}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:vi.fn()}}));
vi.mock('@/components/erp/table/erp-data-table',async()=>{
 const {flexRender}=await import('@tanstack/react-table');
 // Keep real TanStack cell identity semantics: a recreated cell renderer is a
 // new component, so its trigger is replaced, as in the mounted production table.
 return {ERPDataTable:({data,columns}:{data:{id:number;category_name_en?:string;name_en?:string}[];columns:{id?:string;cell?:(p:{row:{original:unknown}})=>ReactNode}[]})=><div>{data.map(row=><section key={`${m.tableMount}:${row.id}`} data-testid={`catalogue-row-${row.id}`}><span>{row.category_name_en??row.name_en}</span>{flexRender(columns.find(c=>c.id==='actions')?.cell,{row:{original:row}})}</section>)}</div>};
});
import {PartyAdminMasterTable} from '@/features/master-data/parties/admin/party-admin-master-table';
import {ServiceCategoriesAdminTable} from '@/features/master-data/parties/admin/service-categories-admin-table';
import {RelationshipTypesAdminTable} from '@/features/master-data/parties/admin/relationship-types-admin-table';
const ctx=(global=true,id=1)=>({profile:{id},isAccountActive:true,permissionCodes:['master_data.parties.manage_services','master_data.parties.manage_relationships'],globalPermissionCodes:global?['master_data.parties.manage_services','master_data.parties.manage_relationships']:[],roleCodes:[],roleAssignments:[]} as unknown as AuthContext);
const base={id:7,workspace_revision:2,description:null,is_system:false,is_active:false,sort_order:0,created_at:'',updated_at:''};
const category={...base,category_code:'TEST',category_name_en:'Synthetic',category_name_ar:null,parent_category_id:null};
const relationship={...base,relationship_code:'TEST',name_en:'Synthetic',name_ar:null};
const receipt={id:7,revision:'3',changed:true,replayed:false};
afterEach(cleanup);
describe.each(['category','relationship'] as const)('%s mounted editor',kind=>{
 const row=kind==='category'?category:relationship;
 const ui=(context=ctx(),revision=2,second=false)=><FluentProvider theme={webLightTheme}>{kind==='category'?<ServiceCategoriesAdminTable rows={[{...category,workspace_revision:revision},...(second?[{...category,id:8,category_code:'SECOND',category_name_en:'Second row'}]:[])]} authContext={context}/>:<RelationshipTypesAdminTable rows={[{...relationship,workspace_revision:revision},...(second?[{...relationship,id:8,relationship_code:'SECOND',name_en:'Second row'}]:[])]} authContext={context}/>}</FluentProvider>;
 const edit=()=>fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
 const save=()=>fireEvent.click(screen.getByRole('button',{name:/^Save$/}));
 beforeEach(()=>{vi.resetAllMocks();recovery.ackFault=null;recovery.submit=null;recovery.activate=null;recovery.close=null;m.tableMount=0;m.create.mockResolvedValue({success:true,data:receipt});m.update.mockResolvedValue({success:true,data:receipt});m.load.mockResolvedValue({success:true,data:{...row,workspace_revision:3,category_name_en:'Confirmed',name_en:'Confirmed'}});});
 it.each(['save','no-op','cancel'] as const)('returns %s focus to the originating row Edit even when the rendered row is replaced',async outcome=>{
  m.update.mockResolvedValue({success:true,data:{...receipt,id:8,changed:outcome!=='no-op'}});
  m.load.mockResolvedValue({success:true,data:{...row,id:8,workspace_revision:3,category_name_en:'Confirmed second',name_en:'Confirmed second'}});
  const view=render(ui(ctx(),2,true));const original=within(screen.getByTestId('catalogue-row-8')).getByRole('button',{name:'Edit record'});
  original.focus();fireEvent.click(original);m.tableMount++;view.rerender(ui(ctx(),2,true));expect(original.isConnected).toBe(false);
  if(outcome==='cancel')fireEvent.click(screen.getByRole('button',{name:'Cancel'}));else save();
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(()=>expect(document.activeElement).toBe(within(screen.getByTestId('catalogue-row-8')).getByRole('button',{name:'Edit record'})));
  expect(document.activeElement).not.toBe(screen.getByRole('button',{name:/Add Category|Add Type/}));
  if(outcome==='cancel')expect(m.update).not.toHaveBeenCalled();
 });
 it('keeps the dirty dialog open until discard, then returns focus to its row',async()=>{
  render(ui());const original=screen.getByRole('button',{name:'Edit record'});original.focus();fireEvent.click(original);
  fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'Unsaved draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(screen.getByRole('textbox',{name:'Name'})).toHaveProperty('value','Unsaved draft');
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit record'})));expect(m.update).not.toHaveBeenCalled();
 });
 it('keeps returned focus when fresh server rows arrive after the dialog closed',async()=>{
  const view=render(ui());const original=screen.getByRole('button',{name:'Edit record'});original.focus();fireEvent.click(original);save();
  await screen.findByText('Confirmed');await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit record'})));
  view.rerender(ui(ctx(),9));await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit record'})));
 });
 it('returns a newly created record to Add rather than an unrelated row',async()=>{
  m.create.mockResolvedValue({success:true,data:{...receipt,id:9}});m.load.mockResolvedValue({success:true,data:{...row,id:9,workspace_revision:3}});
  render(ui());const add=screen.getByRole('button',{name:/Add Category|Add Type/});add.focus();fireEvent.click(add);
  fireEvent.change(screen.getByRole('textbox',{name:'Code'}),{target:{value:'NEW'}});fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'New catalogue record'}});
  fireEvent.click(screen.getByRole('button',{name:/^Add$/}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(document.activeElement).toBe(add));expect(m.create).toHaveBeenCalledTimes(1);
 });
 it.each(['account','permission','unmount'] as const)('cancels queued close focus when the %s ownership changes',async change=>{
  render(<button>Outside catalogue</button>);const view=render(ui());const editButton=screen.getByRole('button',{name:'Edit record'});editButton.focus();fireEvent.click(editButton);
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  if(change==='unmount')view.unmount();else view.rerender(ui(change==='account'?ctx(true,2):ctx(false)));
  const outside=screen.getByRole('button',{name:'Outside catalogue'});outside.focus();
  await act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  expect(document.activeElement).toBe(outside);expect(m.update).not.toHaveBeenCalled();
 });
 it('does not restore the previous row when another dialog is opened before the close frame',async()=>{
  render(ui(ctx(),2,true));const first=within(screen.getByTestId('catalogue-row-8')).getByRole('button',{name:'Edit record'});first.focus();fireEvent.click(first);
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(within(screen.getByTestId('catalogue-row-7')).getByRole('button',{name:'Edit record'}));
  const name=screen.getByRole('textbox',{name:'Name'});name.focus();await act(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  // The shared wrapper owns initial focus (it may choose Close). The catalogue
  // must not move it back to the previous row or out of the new dialog.
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
 });
 it('does not show writes to scoped-only permissions',()=>{render(ui(ctx(false)));expect(screen.queryByRole('button',{name:'Edit record'})).toBeNull();expect(screen.queryByRole('button',{name:/Add Category|Add Type/})).toBeNull();});
 it('preserves false/zero and opening revision, then shows the authoritative read',async()=>{render(ui());edit();save();await screen.findByText('Confirmed');expect(m.update.mock.calls[0][1]).toMatchObject({is_active:false,sort_order:0});expect(m.update.mock.calls[0][2].revision).toBe('2');expect(screen.queryByRole('dialog')).toBeNull();});
 it('shows missing-field focus using the existing F04 dialog',()=>{render(ui());fireEvent.click(screen.getByRole('button',{name:/Add Category|Add Type/}));fireEvent.click(screen.getByRole('button',{name:/^Add$/}));expect(screen.getByRole('alert').textContent).toContain('Code');expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Code'}));expect(m.create).not.toHaveBeenCalled();});
 it.each(['','1.5','-1'])('does not coerce invalid sort order %s to zero',value=>{render(ui());edit();fireEvent.change(screen.getByRole('spinbutton',{name:'Sort Order'}),{target:{value}});save();expect(m.update).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Sort Order');});
 it('freezes uncertain input and retries the same operation',async()=>{m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed test'});render(ui());edit();save();await screen.findByText('Unconfirmed test');const button=screen.getByRole('button',{name:'Retry pending save'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));expect(screen.getByRole('textbox',{name:'Name'}).closest('fieldset')?.disabled).toBe(true);fireEvent.click(button);await screen.findByText('Confirmed');expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit record'})));});
 it('retries only a failed post-commit reload',async()=>{m.load.mockResolvedValueOnce({success:false});render(ui());edit();save();const retry=await screen.findByRole('button',{name:'Reload saved record'});await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));fireEvent.click(retry);await screen.findByText('Confirmed');expect(m.update).toHaveBeenCalledTimes(1);expect(m.load).toHaveBeenCalledTimes(2);});
 it('retains uncertain identity across later denial and same-user permission refresh',async()=>{
  m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost response'}).mockResolvedValueOnce({success:false,error:'Permission denied'});
  const view=render(ui());edit();save();let retry=await screen.findByRole('button',{name:'Retry pending save'});await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));fireEvent.click(retry);await screen.findByText(/earlier.*unconfirmed/i);
  view.rerender(ui(ctx(false)));expect((screen.getByRole('button',{name:'Retry pending save'}) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(ui(ctx()));retry=screen.getByRole('button',{name:'Retry pending save'});await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));fireEvent.click(retry);await screen.findByText('Confirmed');expect(m.update.mock.calls[2]).toEqual(m.update.mock.calls[0]);
 });
 it('preserves dirty form and revision across same-user refresh',async()=>{const view=render(ui());edit();fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'Draft'}});view.rerender(ui(ctx(),9));save();await waitFor(()=>expect(m.update).toHaveBeenCalled());expect(m.update.mock.calls[0][1][kind==='category'?'category_name_en':'name_en']).toBe('Draft');expect(m.update.mock.calls[0][2].revision).toBe('2');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit record'})));});
 it('drops old-user form and suppresses a late success after account change',async()=>{let finish!:(v:unknown)=>void;m.update.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=render(ui());edit();save();view.rerender(ui(ctx(false,2)));await act(async()=>finish({success:true,data:receipt}));expect(screen.queryByRole('dialog')).toBeNull();expect(m.success).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();});
 it.each(['success','failure'] as const)('suppresses late lifecycle %s after unmount',async outcome=>{
  let finish!:(v:unknown)=>void;m.update.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const view=render(ui());fireEvent.click(screen.getByRole('button',{name:'Activate record'}));expect(m.update).toHaveBeenCalledTimes(1);view.unmount();
  await act(async()=>finish(outcome==='success'?{success:true,data:receipt}:{success:false,uncertain:true,error:'Late unconfirmed response'}));
  expect(m.success).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();expect(screen.queryByRole('alert')).toBeNull();
 });
 it('suppresses a confirmed lifecycle reload that finishes after unmount',async()=>{
  let finish!:(v:unknown)=>void;m.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const view=render(ui());fireEvent.click(screen.getByRole('button',{name:'Activate record'}));await waitFor(()=>expect(m.load).toHaveBeenCalledTimes(1));view.unmount();
  await act(async()=>finish({success:true,data:{...row,workspace_revision:3,is_active:true}}));
  expect(m.update).toHaveBeenCalledTimes(1);expect(m.success).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();
 });
 it('accepts a live lifecycle completion after StrictMode setup and cleanup replay',async()=>{
  render(<StrictMode>{ui()}</StrictMode>);fireEvent.click(screen.getByRole('button',{name:'Activate record'}));await screen.findByText('Confirmed');
  expect(m.update).toHaveBeenCalledTimes(1);expect(m.success).toHaveBeenCalledWith('Catalogue record saved');expect(m.refresh).toHaveBeenCalledTimes(1);
 });
 it('duplicate lifecycle clicks send one explicit target state',async()=>{let finish!:(v:unknown)=>void;m.update.mockReturnValue(new Promise(resolve=>{finish=resolve;}));render(ui());const activate=screen.getByRole('button',{name:'Activate record'});fireEvent.click(activate);fireEvent.click(activate);expect(m.update).toHaveBeenCalledTimes(1);expect(m.update.mock.calls[0][1]).toEqual({is_active:true});await act(async()=>finish({success:true,data:receipt}));});
 it('no-op feedback is truthful and refresh failure cannot repeat a mutation',async()=>{m.update.mockResolvedValue({success:true,data:{...receipt,changed:false}});m.refresh.mockImplementation(()=>{throw Error('offline');});render(ui());edit();save();await screen.findByText(/Saved. The list refresh failed/);expect(m.success).toHaveBeenCalledWith('No changes to save');expect(m.update).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:/Retry pending/})).toBeNull();});

 it.each(['edit','create','toggle'] as const)('keeps %s unknown→known recovery frozen through permission restoration',async(mode)=>{
  const fn=mode==='create'?m.create:m.update;fn.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost response'}).mockResolvedValueOnce({success:false,error:'Check fields'});
  const view=render(ui());
  if(mode==='edit'){edit();save();}else if(mode==='create'){fireEvent.click(screen.getByRole('button',{name:/Add Category|Add Type/}));fireEvent.change(screen.getByRole('textbox',{name:'Code'}),{target:{value:'NEW'}});fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'New record'}});fireEvent.click(screen.getByRole('button',{name:/^Add$/}));}else fireEvent.click(screen.getByRole('button',{name:'Activate record'}));
  const label=mode==='toggle'?'Retry pending change':'Retry pending save';
  const retry=await screen.findByRole('button',{name:label});await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));fireEvent.click(retry);await screen.findByText(/earlier.*unconfirmed/i);
  view.rerender(ui(ctx(false)));expect((screen.getByRole('button',{name:label}) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(ui(ctx()));fireEvent.click(screen.getByRole('button',{name:label}));await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());
  expect(fn).toHaveBeenCalledTimes(3);expect(fn.mock.calls[1]).toEqual(fn.mock.calls[0]);expect(fn.mock.calls[2]).toEqual(fn.mock.calls[0]);expect(m.load).toHaveBeenCalledOnce();
 });
 it.each([true,false])('confirmed changed=%s survives a throwing toast, still closes and refreshes',async(changed)=>{
  m.update.mockResolvedValue({success:true,data:{...receipt,changed,replayed:true}});m.success.mockImplementation(()=>{throw Error('private toast');});render(ui());edit();save();
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(m.refresh).toHaveBeenCalledOnce();expect(recovery.ack).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:/Retry pending/})).toBeNull();expect(screen.queryByText(/private/)).toBeNull();
  expect(screen.getByRole('alert').textContent).toMatch(/Saved/);
  edit();save();await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));
 });
 it.each(['before','after'] as const)('acknowledgement %s-throw stays saved and contains independent effects',async(fault)=>{
  recovery.ackFault=fault;render(ui());edit();save();await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());
  expect(m.success).toHaveBeenCalledOnce();expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('alert').textContent).toMatch(/Saved/);expect(screen.queryByText(/private/)).toBeNull();expect(screen.queryByRole('button',{name:/Retry pending/})).toBeNull();
  expect((screen.getByRole('button',{name:/Add Category|Add Type/}) as HTMLButtonElement).disabled).toBe(true);expect(m.update).toHaveBeenCalledOnce();
 });
 it('rejected post-commit read has a named saved-record reload, never a mutation retry',async()=>{
  m.load.mockRejectedValueOnce(Error('private read'));render(ui());edit();save();const reload=await screen.findByRole('button',{name:'Reload saved record'});
  expect(screen.getByRole('alert').textContent).toMatch(/^Saved/);expect(screen.queryByText(/private/)).toBeNull();fireEvent.click(reload);await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.update).toHaveBeenCalledOnce();expect(m.load).toHaveBeenCalledTimes(2);
 });
 it('stale captured submit cannot use permission from an earlier render',async()=>{
  const view=render(ui());edit();const submit=recovery.submit!;view.rerender(ui(ctx(false)));
  await act(async()=>{await submit();});expect(m.update).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
  view.rerender(ui(ctx()));save();await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
 });
 it('checks lifetime after success toast synchronously unmounts the view',async()=>{
  const view=render(ui());m.success.mockImplementation(()=>view.unmount());edit();save();await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.refresh).not.toHaveBeenCalled();
 });
 it.each(['unmount','account ABA'] as const)('retired %s action cannot launch an authoritative read or touch a fresh flight',async(change)=>{
  const finishes:Array<(v:unknown)=>void>=[];m.update.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));const view=render(ui());fireEvent.click(screen.getByRole('button',{name:'Activate record'}));
  if(change==='unmount'){view.unmount();render(ui());}else{view.rerender(ui(ctx(true,2)));view.rerender(ui(ctx()));}
  fireEvent.click(screen.getByRole('button',{name:'Activate record'}));expect(m.update).toHaveBeenCalledTimes(2);
  await act(async()=>finishes[0]({success:true,data:receipt}));expect(m.load).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();
  expect((screen.getByRole('button',{name:'Activate record'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Activate record'}));expect(m.update).toHaveBeenCalledTimes(2);
  await act(async()=>finishes[1]({success:true,data:receipt}));expect(m.load).toHaveBeenCalledOnce();expect(m.success).toHaveBeenCalledOnce();
 });
 it('retired authoritative read cannot acknowledge or publish a row',async()=>{
  let finish!:(v:unknown)=>void;m.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=render(ui());edit();save();await waitFor(()=>expect(m.load).toHaveBeenCalledOnce());view.unmount();
  await act(async()=>finish({success:true,data:{...row,workspace_revision:3}}));expect(recovery.ack).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();
 });
 it('StrictMode old finalizer cannot release the legitimate later activation',async()=>{
  const finishes:Array<(v:unknown)=>void>=[];m.update.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));let starts=0;const start=()=>{if(starts++===0)recovery.activate?.();else void recovery.submit?.();};
  render(<StrictMode>{ui()}<Start start={start}/></StrictMode>);expect(m.update).toHaveBeenCalledTimes(2);
  await act(async()=>finishes[0]({success:true,data:receipt}));expect(m.load).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'Activate record'}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>{recovery.activate?.();});expect(m.update).toHaveBeenCalledTimes(2);
  await act(async()=>finishes[1]({success:true,data:receipt}));expect(m.load).toHaveBeenCalledOnce();expect(m.success).toHaveBeenCalledOnce();expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);
 });

 it('entity A→B→A retires the old helper before another row read',async()=>{
  let finish!:(v:unknown)=>void;m.update.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const renderEntity=(entity:'party_service_categories_master'|'party_relationship_types')=><FluentProvider theme={webLightTheme}><PartyAdminMasterTable entity={entity} rows={[entity==='party_service_categories_master'?category:relationship]} authContext={ctx()}/></FluentProvider>;
  const original=kind==='category'?'party_service_categories_master':'party_relationship_types',other=kind==='category'?'party_relationship_types':'party_service_categories_master';
  const view=render(renderEntity(original));fireEvent.click(screen.getByRole('button',{name:'Activate record'}));view.rerender(renderEntity(other));view.rerender(renderEntity(original));
  await act(async()=>finish({success:true,data:receipt}));expect(m.load).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Activate record'}));await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.update).toHaveBeenCalledTimes(2);
 });

 it('captured invalid submit has no validation feedback after permission loss, but ordinary close remains available',async()=>{
  const view=render(ui());fireEvent.click(screen.getByRole('button',{name:/Add Category|Add Type/}));const submit=recovery.submit!,close=recovery.close!;
  view.rerender(ui(ctx(false)));await act(async()=>{await submit();});expect(screen.queryByRole('alert')).toBeNull();expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
  act(()=>close(false));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 });
 it('a retired close callback cannot close the new account activation dialog',async()=>{
  const view=render(ui());edit();const close=recovery.close!;view.rerender(ui(ctx(true,2)));view.rerender(ui(ctx()));edit();
  act(()=>close(false));expect(screen.getByRole('dialog')).toBeTruthy();expect(m.update).not.toHaveBeenCalled();
 });
 it('captured close remains blocked throughout unknown and saved reload recovery',async()=>{
  m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost'});m.load.mockResolvedValueOnce({success:false});render(ui());edit();const close=recovery.close!;save();const retry=await screen.findByRole('button',{name:'Retry pending save'});
  act(()=>close(false));expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(retry);await screen.findByRole('button',{name:'Reload saved record'});
  act(()=>close(false));expect(screen.getByRole('dialog')).toBeTruthy();expect(m.update).toHaveBeenCalledTimes(2);
 });

});
