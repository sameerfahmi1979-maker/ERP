// @vitest-environment node
import '../f05/setup';
import {afterAll} from 'vitest';
import {act} from '@testing-library/react';
import {saveHrLookup} from '@/server/hr-lookup-save';
const recoveryDom=await vi.hoisted(async()=>{
 const {builtinEnvironments}=await import('vitest/runtime');
 return await builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});
});
// Radix schedules unmount autofocus on a zero-delay timer; drain it before restoring DOM globals.
afterAll(async()=>{await act(async()=>{await new Promise<void>(resolve=>setTimeout(resolve,0));});recoveryDom.teardown(globalThis);});
const recovery=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>({profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:[],globalPermissionCodes:['hr.settings.manage'],roleAssignments:[]})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:recovery.rpc})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {useState} from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const m=vi.hoisted(()=>({archive:vi.fn(),success:vi.fn(),changed:vi.fn(),busy:vi.fn()}));
vi.mock('@/server/actions/hr/settings',()=>({archiveHrSettingsRow:m.archive}));
vi.mock('@/features/common-master-data/master-archive-panel',()=>({MasterArchivePanel:()=>null}));
vi.mock('sonner',()=>({toast:{success:m.success}}));
import {HrSettingsLifecycle,type HrArchiveTarget} from '@/features/hr/settings/hr-settings-lifecycle';
const target={id:8,code:'F06_ARCHIVE',name:'Synthetic grade',revision:'3'};
function View({revision='3',closeThrows=false}:{revision?:string;closeThrows?:boolean}){const [row,setRow]=useState<HrArchiveTarget|null>({...target,revision});return <HrSettingsLifecycle entity="hr_grades" target={row} onTargetChange={next=>{setRow(next);if(closeThrows)throw Error('PRIVATE_CLOSE');}} onChanged={m.changed} onBusyChange={m.busy}/>;}
const good=()=>({success:true,data:{id:8,entity:'hr_grades',revision:'4',changed:true,replayed:false}});
beforeEach(()=>{vi.resetAllMocks();m.archive.mockResolvedValue(good());});afterEach(cleanup);
const submit=()=>fireEvent.click(screen.getByRole('button',{name:'Archive record'}));
it('confirmation uses the loaded identity/revision then refreshes once',async()=>{render(<View/>);expect(m.archive).not.toHaveBeenCalled();submit();await waitFor(()=>expect(m.changed).toHaveBeenCalledOnce());expect(m.archive.mock.calls[0]).toEqual(['hr_grades',8,'F06_ARCHIVE',{operationId:expect.any(String),revision:'3'}]);expect(screen.queryByRole('alertdialog')).toBeNull();});
it('missing revision never sends a mutation',async()=>{render(<View revision=""/>);submit();await screen.findByText(/current revision is unavailable/);expect(m.archive).not.toHaveBeenCalled();});
it('response loss retains the exact attempt and blocks cancellation',async()=>{m.archive.mockRejectedValueOnce(Error('PRIVATE'));render(<View/>);submit();await screen.findByRole('button',{name:'Retry same archive'});expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);expect(document.body.textContent).not.toContain('PRIVATE');const first=m.archive.mock.calls[0];fireEvent.click(screen.getByRole('button',{name:'Retry same archive'}));await waitFor(()=>expect(m.changed).toHaveBeenCalledOnce());expect(m.archive.mock.calls[1]).toEqual(first);});
it('wrong-entity receipt never marks the archive successful',async()=>{m.archive.mockResolvedValue({...good(),data:{...good().data,entity:'hr_leave_types'}});render(<View/>);submit();await screen.findByText(/Archive response incomplete/);expect(m.success).not.toHaveBeenCalled();});
it('dependency rejection is safe and permits cancellation',async()=>{m.archive.mockResolvedValue({success:false,error:'A selected record is unavailable, or current records still use this setting.'});render(<View/>);submit();await screen.findByText(/current records still use/);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(m.changed).not.toHaveBeenCalled();});
it('duplicate clicks admit one pending request',async()=>{let resolve!:(r:ReturnType<typeof good>)=>void;m.archive.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(<View/>);submit();fireEvent.click(screen.getByRole('button',{name:'Archiving…'}));expect(m.archive).toHaveBeenCalledOnce();resolve(good());await waitFor(()=>expect(m.changed).toHaveBeenCalledOnce());});
it('refresh failure after commit does not offer a repeated archive',async()=>{m.changed.mockRejectedValue(Error('PRIVATE'));render(<View/>);submit();await screen.findByText(/Archived. The related list could not refresh/);expect(screen.queryByRole('alertdialog')).toBeNull();expect(m.success).toHaveBeenCalledOnce();});
it.each(['40003','08007'])('archive real helper retains unknown after later known %s',async code=>{
 recovery.rpc.mockReset().mockResolvedValueOnce({error:{code,message:'PRIVATE_RECOVERY'}}).mockResolvedValueOnce({error:{code:'40001',message:'PRIVATE_RECOVERY'}}).mockResolvedValueOnce({data:{...good().data,replayed:true}});m.archive.mockImplementation((entity,id,_code,contract)=>saveHrLookup(entity,id,{},contract,'archive'));render(<View/>);submit();await screen.findByRole('button',{name:'Retry same archive'});const first=recovery.rpc.mock.calls[0],publicFirst=m.archive.mock.calls[0];
 fireEvent.click(screen.getByRole('button',{name:'Retry same archive'}));await waitFor(()=>expect(recovery.rpc).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByRole('button',{name:'Retry same archive'}).matches(':disabled')).toBe(false));expect(screen.getByRole('button',{name:'Cancel'}).matches(':disabled')).toBe(true);expect(document.body.textContent).not.toMatch(/PRIVATE_RECOVERY|not archived|change was rejected/);
 fireEvent.click(screen.getByRole('button',{name:'Retry same archive'}));await waitFor(()=>expect(m.changed).toHaveBeenCalledOnce());expect(recovery.rpc.mock.calls).toEqual([first,first,first]);expect(m.archive.mock.calls).toEqual([publicFirst,publicFirst,publicFirst]);expect(first[0]).toBe('save_hr_lookup');expect(first[1]).toMatchObject({p_table:'hr_grades',p_id:8,p_revision:'3',p_data:{},p_action:'archive'});
});
it.each(['toast','close'])('confirmed archive contains %s failure without another write',async failure=>{if(failure==='toast')m.success.mockImplementation(()=>{throw Error('PRIVATE_EFFECT');});const close=vi.fn(()=>{throw Error('PRIVATE_EFFECT');});if(failure==='close')render(<HrSettingsLifecycle entity="hr_grades" target={target} onTargetChange={close} onChanged={m.changed} onBusyChange={m.busy}/>);else render(<View/>);submit();await waitFor(()=>expect(m.changed).toHaveBeenCalledOnce());expect(document.body.textContent).not.toMatch(/Archive unconfirmed|PRIVATE_EFFECT/);const action=screen.queryByRole('button',{name:'Archive record'});if(action){expect(action.matches(':disabled')).toBe(true);fireEvent.click(action);}expect(m.archive).toHaveBeenCalledOnce();});
it('disposed archive suppresses completion effects',async()=>{let resolve!:(v:unknown)=>void;m.archive.mockImplementation(()=>new Promise(r=>{resolve=r;}));const v=render(<View/>);submit();v.unmount();await act(async()=>resolve(good()));expect(m.success).not.toHaveBeenCalled();expect(m.changed).not.toHaveBeenCalled();});
it('archive close-then-throw preserves confirmation and independent effects',async()=>{render(<View closeThrows/>);submit();await waitFor(()=>expect(m.changed).toHaveBeenCalledOnce());expect(m.success).toHaveBeenCalledOnce();expect(screen.queryByRole('alertdialog')).toBeNull();expect(document.body.textContent).not.toMatch(/Archive unconfirmed|PRIVATE_CLOSE/);expect(m.archive).toHaveBeenCalledOnce();});
it('first-known archive rejection releases identity for an explicit new attempt',async()=>{m.archive.mockResolvedValueOnce({success:false,error:'The change was rejected.'});render(<View/>);submit();await screen.findByText('The change was rejected.');expect(screen.getByRole('button',{name:'Cancel'}).matches(':disabled')).toBe(false);const first=m.archive.mock.calls[0][3];submit();await waitFor(()=>expect(m.archive).toHaveBeenCalledTimes(2));expect(m.archive.mock.calls[1][3].operationId).not.toBe(first.operationId);});
