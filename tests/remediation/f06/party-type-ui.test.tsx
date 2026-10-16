// @vitest-environment jsdom
// Real Fluent dialog/controls and F04 attempt. List rendering, actions and router
// are doubled; actual browser/database acceptance is recorded separately.
import '../f05/setup';
import {afterEach,beforeEach,expect,it,vi,afterAll} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {StrictMode,useEffect,type ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {PartyTypeAdminRow} from '@/server/actions/master-data/party-admin-masters';
const recovery=vi.hoisted(()=>({ackFault:null as null|'before'|'after',ack:vi.fn(),submit:null as null|(()=>void|Promise<unknown>),activate:null as null|(()=>unknown),close:null as null|((open:boolean)=>void)}));
vi.mock('@/components/erp/erp-child-dialog-form',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/components/erp/erp-child-dialog-form')>();
 return {...actual,ERPChildDialogForm:(props:Parameters<typeof actual.ERPChildDialogForm>[0])=>{recovery.submit=props.onSubmit??null;recovery.close=props.onOpenChange;return <actual.ERPChildDialogForm {...props}/>;}};
});
vi.mock('@/components/ui/button',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/components/ui/button')>();
 return {...actual,Button:(props:Parameters<typeof actual.Button>[0])=>{if(props['aria-label']==='Activate record')recovery.activate=()=>props.onClick?.({} as Parameters<NonNullable<typeof props.onClick>>[0]);return <actual.Button {...props}/>;}};
});
vi.mock('@/lib/master-data/party-type-attempt',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@/lib/master-data/party-type-attempt')>();
 return {...actual,createPartyTypeAttempt:()=>{const attempt=actual.createPartyTypeAttempt();return {...attempt,acknowledged(){recovery.ack();if(recovery.ackFault==='before')throw Error('private ack');attempt.acknowledged();if(recovery.ackFault==='after')throw Error('private ack');}};}};
});
afterAll(async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});});
function Start({start}:{start:()=>void}){useEffect(()=>{start();},[start]);return null;}
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),load:vi.fn(),refresh:vi.fn(),success:vi.fn()}));
vi.mock('@/server/actions/master-data/party-admin-masters',()=>({createPartyType:m.create,updatePartyType:m.update,getPartyTypeAdminById:m.load}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:vi.fn()}}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:{data:PartyTypeAdminRow[];columns:{id?:string;cell?:(p:{row:{original:PartyTypeAdminRow}})=>ReactNode}[]})=><div>{data.map(row=><section key={row.id} aria-label={row.type_code}><span>{row.type_name}</span>{columns.find(c=>c.id==='actions')?.cell?.({row:{original:row}})}</section>)}</div>}));
import {PartyTypesAdminTable} from '@/features/master-data/parties/admin/party-types-admin-table';
const permission='master_data.parties.manage_types';
const ctx=(global=true,id=1)=>({profile:{id},isAccountActive:true,permissionCodes:[permission],globalPermissionCodes:global?[permission]:[],roleCodes:[],roleAssignments:[]} as unknown as AuthContext);
const row={id:7,workspace_revision:2,type_code:'SYNTHETIC',type_name:'Synthetic type',type_name_ar:null,description:null,icon_name:null,color_token:null,is_system:false,is_active:false,sort_order:0} as PartyTypeAdminRow;
const receipt={id:7,revision:'3',changed:true,replayed:false};
const ui=(context=ctx(),record=row)=><FluentProvider theme={webLightTheme}><PartyTypesAdminTable rows={[record]} authContext={context}/></FluentProvider>;
const edit=()=>fireEvent.click(screen.getByRole('button',{name:'Edit record'}));
const save=()=>fireEvent.click(screen.getByRole('button',{name:'Save'}));
beforeEach(()=>{vi.resetAllMocks();recovery.ackFault=null;recovery.submit=null;recovery.activate=null;recovery.close=null;m.create.mockResolvedValue({success:true,data:receipt});m.update.mockResolvedValue({success:true,data:receipt});m.load.mockResolvedValue({success:true,data:{...row,workspace_revision:3,type_name:'Server confirmed'}});});afterEach(cleanup);
it('scoped aggregate capabilities do not expose shared catalogue mutations',()=>{render(ui(ctx(false)));expect(screen.queryByRole('button',{name:'Add Type'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit record'})).toBeNull();});
it('saves false and zero using the opening revision and displays the authoritative row',async()=>{render(ui());edit();save();await screen.findByText('Server confirmed');expect(m.update.mock.calls[0][1]).toMatchObject({is_active:false,sort_order:0});expect(m.update.mock.calls[0][2].revision).toBe('2');expect(screen.queryByRole('dialog')).toBeNull();});
it('empty required fields show linked validation and focus the missing code',()=>{render(ui());fireEvent.click(screen.getByRole('button',{name:'Add Type'}));fireEvent.click(screen.getByRole('button',{name:'Add'}));expect(screen.getByRole('alert').textContent).toContain('Code');expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Code'}));expect(m.create).not.toHaveBeenCalled();});
it('fractional sort order is rejected instead of silently rounded',()=>{render(ui());edit();fireEvent.change(screen.getByRole('spinbutton',{name:'Sort Order'}),{target:{value:'1.5'}});save();expect(m.update).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Sort Order');});
it('no-op feedback remains truthful',async()=>{m.update.mockResolvedValue({success:true,data:{...receipt,changed:false}});render(ui());edit();save();await waitFor(()=>expect(m.success).toHaveBeenCalledWith('No changes to save'));});
it('uncertain save freezes editing and retains its operation through retry',async()=>{m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed test'});render(ui());edit();save();await screen.findByText('Unconfirmed test');const button=screen.getByRole('button',{name:'Retry pending save'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));expect((screen.getByRole('textbox',{name:'Name'}) as HTMLInputElement).closest('fieldset')?.disabled).toBe(true);fireEvent.click(button);await screen.findByText('Server confirmed');expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);});
it('confirmed-save reload failure retries only the read',async()=>{m.load.mockResolvedValueOnce({success:false});render(ui());edit();save();const retry=await screen.findByRole('button',{name:'Reload saved record'});await waitFor(()=>expect((retry as HTMLButtonElement).disabled).toBe(false));fireEvent.click(retry);await screen.findByText('Server confirmed');expect(m.update).toHaveBeenCalledTimes(1);expect(m.load).toHaveBeenCalledTimes(2);});
it('a same-user prop refresh preserves the dirty form and original revision',async()=>{const view=render(ui());edit();fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'My draft'}});view.rerender(ui(ctx(),{...row,type_name:'Remote change',workspace_revision:9}));save();await waitFor(()=>expect(m.update).toHaveBeenCalled());expect(m.update.mock.calls[0][1].type_name).toBe('My draft');expect(m.update.mock.calls[0][2].revision).toBe('2');});
it('account switch discards the prior account form and pending attempt',()=>{const view=render(ui());edit();fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'Private draft'}});view.rerender(ui(ctx(false,2)));expect(screen.queryByDisplayValue('Private draft')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();});
it('duplicate status clicks submit once and never invert an uncertain attempt',async()=>{let finish!:(v:unknown)=>void;m.update.mockReturnValue(new Promise(resolve=>{finish=resolve;}));render(ui());const activate=screen.getByRole('button',{name:'Activate record'});fireEvent.click(activate);fireEvent.click(activate);expect(m.update).toHaveBeenCalledTimes(1);await act(async()=>finish({success:true,data:receipt}));expect(m.success).toHaveBeenCalledTimes(1);});
it('refresh failure after receipt never becomes a mutation retry',async()=>{m.refresh.mockImplementation(()=>{throw Error('Offline');});render(ui());edit();save();await screen.findByText(/Saved. The list refresh/);expect(m.update).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Retry pending change'})).toBeNull();expect(screen.getByText('Server confirmed')).toBeTruthy();});

 it.each(['edit','create','toggle'] as const)('keeps %s unknown→known recovery frozen through permission restoration',async(mode)=>{
  const fn=mode==='create'?m.create:m.update;fn.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost response'}).mockResolvedValueOnce({success:false,error:'Check fields'});
  const view=render(ui());
  if(mode==='edit'){edit();save();}else if(mode==='create'){fireEvent.click(screen.getByRole('button',{name:'Add Type'}));fireEvent.change(screen.getByRole('textbox',{name:'Code'}),{target:{value:'NEW'}});fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'New record'}});fireEvent.click(screen.getByRole('button',{name:/^Add$/}));}else fireEvent.click(screen.getByRole('button',{name:'Activate record'}));
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
  expect((screen.getByRole('button',{name:'Add Type'}) as HTMLButtonElement).disabled).toBe(true);expect(m.update).toHaveBeenCalledOnce();
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

it('a first-known rejection permits a corrected fresh operation',async()=>{
 m.update.mockResolvedValueOnce({success:false,error:'Rejected'});render(ui());edit();save();await screen.findByText('Rejected');expect(screen.getByRole('textbox',{name:'Name'}).closest('fieldset')?.disabled).toBe(false);
 fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'Corrected'}});save();await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1][2].operationId).not.toBe(m.update.mock.calls[0][2].operationId);expect(m.update.mock.calls[1][1].type_name).toBe('Corrected');
});
it('live StrictMode completion still saves and refreshes normally',async()=>{render(<StrictMode>{ui()}</StrictMode>);edit();save();await waitFor(()=>expect(m.success).toHaveBeenCalledOnce());expect(m.refresh).toHaveBeenCalledOnce();});


 it('captured invalid submit has no validation feedback after permission loss, but ordinary close remains available',async()=>{
  const view=render(ui());fireEvent.click(screen.getByRole('button',{name:'Add Type'}));const submit=recovery.submit!,close=recovery.close!;
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
