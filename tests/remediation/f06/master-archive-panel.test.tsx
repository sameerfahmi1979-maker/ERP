// @vitest-environment node
import '../f05/setup';
import {afterAll} from 'vitest';
import {act} from '@testing-library/react';
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
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import type {ReactNode} from 'react';
type ArchiveRow={id:number;name:string};
const mock=vi.hoisted(()=>({read:vi.fn(),restore:vi.fn(),refresh:vi.fn(),success:vi.fn()}));
vi.mock('@/server/actions/common-master-data/archive',()=>({listArchivedMasters:mock.read,restoreArchivedMaster:mock.restore}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh}),usePathname:()=>'/archive-test'}));
vi.mock('sonner',()=>({toast:{success:mock.success}}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns,emptyMessage}:{data:ArchiveRow[];columns:{cell:(context:{row:{original:ArchiveRow}})=>ReactNode}[];emptyMessage:ReactNode})=><div>{data.length?data.map(row=><div key={row.id}>{row.name}{columns.at(-1)?.cell({row:{original:row}})}</div>):emptyMessage}</div>}));
import {MasterArchivePanel} from '@/features/common-master-data/master-archive-panel';
const row={id:7,code:'FSHIFT',name:'Synthetic shift',revision:'3',owner_company_id:1,company_name:'Synthetic A',branch_id:null,branch_name:null,parent_id:8,archived_at:'2026-10-03T18:00:00Z'};
beforeEach(()=>{vi.resetAllMocks();mock.read.mockResolvedValue({success:true,data:[row]});mock.restore.mockResolvedValue({success:true,data:{id:7,revision:'4',replayed:false,archived:false,changed:true,calendar_id:8},archived:false,changed:true});});
afterEach(cleanup);
async function open(onRestored?:()=>Promise<void>){render(<MasterArchivePanel entity="work_shifts" calendarId={8} title="Archived shifts" onRestored={onRestored}/>);fireEvent.click(screen.getByRole('button',{name:'Show archived shifts'}));await screen.findByText('Synthetic shift');fireEvent.click(screen.getByRole('button',{name:'Restore FSHIFT'}));}
it('read failure is visible and retry recovers the catalogue',async()=>{mock.read.mockResolvedValueOnce({success:false,error:'Archive unavailable'});render(<MasterArchivePanel entity="work_shifts" calendarId={8} title="Archived shifts"/>);fireEvent.click(screen.getByRole('button',{name:'Show archived shifts'}));await screen.findByText('Archive unavailable');expect(screen.queryByText(/No archived records/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Refresh archive'}));await screen.findByText('Synthetic shift');});
it('unknown restore cannot be cancelled or redirected to another record and retries its original contract',async()=>{
 mock.restore.mockResolvedValueOnce({success:false,uncertain:true,error:'Restore unconfirmed'});await open();fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText('Restore unconfirmed');
 expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await waitFor(()=>expect(mock.restore).toHaveBeenCalledTimes(2));expect(mock.restore.mock.calls[1]).toEqual(mock.restore.mock.calls[0]);await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(screen.queryByText('Synthetic shift')).toBeNull();
});
it('transport error is secret safe and retains the pending restore',async()=>{mock.restore.mockRejectedValueOnce(Error('private secret'));await open();fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText(/Restore could not be confirmed/);expect(document.body.textContent).not.toContain('private secret');expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);});
it('wrong-identity success does not remove the selected row',async()=>{mock.restore.mockResolvedValueOnce({success:true,data:{id:99,revision:'4'},archived:false});await open();fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText(/Restore could not be confirmed/);expect(screen.getAllByText(/Synthetic shift/).length).toBeGreaterThan(0);expect(mock.success).not.toHaveBeenCalled();});
it('confirmed restore with refresh failure stays a success and does not encourage a second write',async()=>{await open(async()=>{throw Error('display failed');});fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText(/record was restored, but/);expect(mock.restore).toHaveBeenCalledOnce();expect(screen.queryByRole('alertdialog')).toBeNull();expect(mock.success).toHaveBeenCalled();});
it('definitive denial permits cancellation without claiming restoration',async()=>{mock.restore.mockResolvedValue({success:false,error:'Restore parent first'});await open();fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText('Restore parent first');expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);expect(mock.success).not.toHaveBeenCalled();});
it('an open catalogue refreshes after a sibling archive mutation',async()=>{
 mock.read.mockResolvedValueOnce({success:true,data:[]});const view=render(<MasterArchivePanel entity="work_shifts" calendarId={8} title="Archived shifts" refreshVersion={0}/>);
 fireEvent.click(screen.getByRole('button',{name:'Show archived shifts'}));await screen.findByText(/No archived records/);
 view.rerender(<MasterArchivePanel entity="work_shifts" calendarId={8} title="Archived shifts" refreshVersion={1}/>);await screen.findByText('Synthetic shift');expect(mock.read).toHaveBeenCalledTimes(2);
});
it('parent navigation knows when the restore task is open',async()=>{
 const notify=vi.fn();render(<MasterArchivePanel entity="work_shifts" calendarId={8} title="Archived shifts" onTaskOpenChange={notify}/>);
 fireEvent.click(screen.getByRole('button',{name:'Show archived shifts'}));await screen.findByText('Synthetic shift');fireEvent.click(screen.getByRole('button',{name:'Restore FSHIFT'}));await waitFor(()=>expect(notify).toHaveBeenLastCalledWith(true));
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await waitFor(()=>expect(notify).toHaveBeenLastCalledWith(false));
});
for(const entity of ['work_calendars','work_shifts','departments','hr_grades'] as const)it.each([true,false])(`${entity}: changed=%s restore survives notification failure`,async changed=>{
 const data=entity==='hr_grades'?{id:7,revision:'4',replayed:false,changed,entity:'hr_grades'}:
  {id:7,revision:'4',replayed:false,changed,archived:false,calendar_id:entity==='work_shifts'?8:null};
 mock.restore.mockResolvedValue({success:true,data,archived:false,changed});mock.success.mockImplementation(()=>{throw Error('private toast');});
 const restored=vi.fn(),notify=vi.fn();render(<MasterArchivePanel entity={entity} calendarId={entity==='work_shifts'?8:undefined} title="Archived records" onRestored={restored} onTaskOpenChange={notify}/>);
 fireEvent.click(screen.getByRole('button',{name:'Show archived records'}));await screen.findByText('Synthetic shift');fireEvent.click(screen.getByRole('button',{name:'Restore FSHIFT'}));fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(screen.queryByText('Synthetic shift')).toBeNull();expect(screen.getByRole('button',{name:'Hide archived records'})).toHaveProperty('disabled',false);
 expect(mock.success).toHaveBeenCalledWith(changed?'Record restored inactive; review it before activation':'Record already restored');expect(restored).toHaveBeenCalledOnce();expect(mock.refresh).toHaveBeenCalledOnce();expect(notify).toHaveBeenLastCalledWith(false);
 expect(mock.restore).toHaveBeenCalledExactlyOnceWith(entity,7,expect.objectContaining({revision:'3'}));
});
it('notification and parent-refresh failure leave a read-only archive retry, not an unknown restore',async()=>{
 mock.success.mockImplementation(()=>{throw Error('toast');});const restored=vi.fn().mockRejectedValue(Error('view'));
 await open(restored);fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText(/record was restored, but/);
 expect(screen.queryByRole('alertdialog')).toBeNull();expect(screen.getByRole('button',{name:'Hide archived shifts'})).toHaveProperty('disabled',false);
 mock.read.mockResolvedValue({success:true,data:[]});fireEvent.click(screen.getByRole('button',{name:'Refresh archive'}));await screen.findByText(/No archived records/);
 expect(restored).toHaveBeenCalledOnce();expect(mock.refresh).not.toHaveBeenCalled();expect(mock.restore).toHaveBeenCalledOnce();
});
it.each(['40003','08007'])('HR real restore bridge retains unknown through later known %s',async code=>{
 const actual=await vi.importActual<typeof import('@/server/actions/common-master-data/archive')>('@/server/actions/common-master-data/archive');mock.restore.mockImplementation(actual.restoreArchivedMaster);
 recovery.rpc.mockReset().mockResolvedValueOnce({error:{code,message:'PRIVATE_RECOVERY'}}).mockResolvedValueOnce({error:{code:'40P01',message:'PRIVATE_RECOVERY'}}).mockResolvedValueOnce({data:{id:7,entity:'hr_grades',revision:'4',changed:true,replayed:true}});
 render(<MasterArchivePanel entity="hr_grades" title="Archived HR"/>);fireEvent.click(screen.getByRole('button',{name:'Show archived hr'}));await screen.findByText('Synthetic shift');fireEvent.click(screen.getByRole('button',{name:'Restore FSHIFT'}));const retry=()=>fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));retry();await screen.findByText(/unconfirmed/);const first=recovery.rpc.mock.calls[0];retry();await waitFor(()=>expect(recovery.rpc).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByRole('button',{name:'Restore inactive'}).matches(':disabled')).toBe(false));expect(screen.getByRole('button',{name:'Cancel'}).matches(':disabled')).toBe(true);expect(document.body.textContent).not.toMatch(/PRIVATE_RECOVERY|change was rejected/);retry();await waitFor(()=>expect(mock.success).toHaveBeenCalledOnce());expect(recovery.rpc.mock.calls).toEqual([first,first,first]);expect(first[0]).toBe('save_hr_lookup');expect(first[1]).toMatchObject({p_table:'hr_grades',p_id:7,p_revision:'3',p_data:{},p_action:'restore'});expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('disposed restore suppresses completion effects',async()=>{let resolve!:(v:unknown)=>void;mock.restore.mockImplementation(()=>new Promise(r=>{resolve=r;}));await open();fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));cleanup();await act(async()=>resolve({success:true,data:{id:7,revision:'4'},archived:false,changed:true}));expect(mock.success).not.toHaveBeenCalled();expect(mock.refresh).not.toHaveBeenCalled();});
it('catalogue read refresh does not retire a pending restore',async()=>{let resolve!:(v:unknown)=>void;mock.restore.mockImplementation(()=>new Promise(r=>{resolve=r;}));const props={entity:'hr_grades' as const,title:'Archived HR'};const v=render(<MasterArchivePanel {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Show archived hr'}));await screen.findByText('Synthetic shift');fireEvent.click(screen.getByRole('button',{name:'Restore FSHIFT'}));fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));v.rerender(<MasterArchivePanel {...props} refreshVersion={1}/>);await waitFor(()=>expect(mock.read).toHaveBeenCalledTimes(2));await act(async()=>resolve({success:true,data:{id:7,revision:'4'},archived:false,changed:true}));expect(mock.success).toHaveBeenCalledOnce();expect(mock.refresh).toHaveBeenCalledOnce();expect(screen.queryByRole('alertdialog')).toBeNull();});
it('first-known restore denial permits new operation',async()=>{mock.restore.mockResolvedValueOnce({success:false,error:'Restore parent first'});await open();fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await screen.findByText('Restore parent first');const first=mock.restore.mock.calls[0][2];fireEvent.click(screen.getByRole('button',{name:'Restore inactive'}));await waitFor(()=>expect(mock.restore).toHaveBeenCalledTimes(2));expect(mock.restore.mock.calls[1][2].operationId).not.toBe(first.operationId);});
