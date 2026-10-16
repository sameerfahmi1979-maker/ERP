// @vitest-environment jsdom
// Mounted actual controller/F04 draft+save hooks. Actions/navigation are doubles.
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import type {AuthContext} from '@/lib/rbac/check';
import type {WorkCalendarRow} from '@/server/actions/common-master-data/work-calendars';
import type {ReactNode} from 'react';
const mock=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,shell:null as ERPRecordWorkspaceFormProps|null,create:vi.fn(),update:vi.fn(),close:vi.fn(),route:vi.fn(),replace:vi.fn(),error:vi.fn(),success:vi.fn(),invalidate:vi.fn(),dispatch:vi.fn(),mark:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/calendar/new',useRouter:()=>({replace:mock.replace})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'calendar',tabs:[{id:'calendar',route:'/calendar/new'}]},dispatch:mock.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>mock.store}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:{id:'calendar'},closeTab:mock.close,markDirty:mock.mark,updateTabRoute:mock.route,isTabActive:()=>true})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:[]}),useQueryClient:()=>({invalidateQueries:mock.invalidate})}));
vi.mock('@/server/actions/common-master-data/work-calendars',()=>({createWorkCalendar:mock.create,updateWorkCalendar:mock.update,createWorkShift:vi.fn(),updateWorkShift:vi.fn(),softDeleteWorkShift:vi.fn(),getWorkCalendarById:vi.fn()}));
vi.mock('sonner',()=>({toast:{error:mock.error,success:mock.success}}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({
 ERPRecordWorkspaceForm:(props:ERPRecordWorkspaceFormProps)=>{mock.shell=props;return <div>{props.children}</div>;},
 ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>,
}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:()=>null}));
import {WorkCalendarWorkspaceForm} from '@/features/common-master-data/work-calendars/work-calendar-workspace-form';
const existing={id:71,workspace_revision:8,calendar_code:'F06',calendar_name:'Calendar',calendar_type:'standard',owner_company_id:1,working_days:['mon'],weekend_days:['tue','wed','thu','fri','sat','sun'],is_active:false,has_ramadan_timing:false,has_summer_timing:false} as WorkCalendarRow;
beforeEach(()=>{vi.resetAllMocks();mock.store=createWorkspaceDraftStore();mock.invalidate.mockResolvedValue(undefined);mock.create.mockResolvedValue({success:true,data:{id:71,revision:'1',replayed:false,changed:true,owner_company_id:1,calendar_id:null}});mock.update.mockResolvedValue({success:true,data:{id:71,revision:'9',replayed:false,changed:true,owner_company_id:1,calendar_id:null}});});
afterEach(cleanup);
function mount(mode:'add'|'edit'|'view'='add',context?:AuthContext){return render(<WorkCalendarWorkspaceForm mode={mode} calendar={mode==='add'?null:existing} authContext={context??{profile:{id:1},isAccountActive:true,permissionCodes:['common_md.work_calendars.manage'],globalPermissionCodes:['common_md.work_calendars.manage'],roleCodes:[],roleAssignments:[{roleCode:'test_calendar_manager',ownerCompanyId:null,branchId:null,permissionCodes:['common_md.work_calendars.manage']}]} as unknown as AuthContext} companies={[{id:1,company_code:'SYN',legal_name_en:'Synthetic'}]}/>);}
function input(name:string,value:string){fireEvent.change(document.querySelector(`[name="${name}"]`)!,{target:{value}});}
function fill(){input('calendar_code','F06');input('calendar_name','Calendar');input('owner_company_id','1');}
async function save(close=false){let result:unknown;await act(async()=>{result=await (close?mock.shell?.onSaveAndClose?.():mock.shell?.onSave?.());});return result;}
it('preserves unchecked Active on create and switches subsequent Save to edit',async()=>{
 mount();fill();fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));await save();
 expect(mock.create).toHaveBeenCalledOnce();expect(mock.create.mock.calls[0][0].is_active).toBe(false);
 expect(mock.shell?.mode).toBe('edit');expect(mock.replace).toHaveBeenCalledWith('/admin/common-master-data/work-calendars/record/71?mode=edit');
 input('notes','Second save');await save();expect(mock.create).toHaveBeenCalledOnce();expect(mock.update.mock.calls[0][0].id).toBe(71);expect(mock.update.mock.calls[0][1].revision).toBe('1');
});
it('edit keeps immutable code and false flags instead of serializing disabled control as null',async()=>{mount('edit');input('notes','Note only');await save();expect(mock.update.mock.calls[0][0]).toMatchObject({calendar_code:'F06',is_active:false,has_ramadan_timing:false});expect(mock.update.mock.calls[0][1].revision).toBe('8');});
it('uncertain create replay retains operation ID and input',async()=>{mock.create.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed'});mount();fill();await save();await save();expect(mock.create).toHaveBeenCalledTimes(2);expect(mock.create.mock.calls[0]).toEqual(mock.create.mock.calls[1]);});
it('different values cannot replace an unconfirmed request',async()=>{mock.create.mockResolvedValue({success:false,uncertain:true});mount();fill();await save();expect((screen.getByRole('textbox',{name:'Notes'}) as HTMLTextAreaElement).disabled).toBe(true);input('notes','Different');await save();expect(mock.create).toHaveBeenCalledOnce();expect(mock.error).toHaveBeenLastCalledWith(expect.stringContaining('Retry its unchanged values'));});
it('simultaneous save admission makes only one action request',async()=>{let resolve!:(r:unknown)=>void;mock.create.mockImplementation(()=>new Promise(r=>{resolve=r;}));mount();fill();await act(async()=>{const a=mock.shell!.onSave!();const b=mock.shell!.onSave!();resolve({success:true,data:{id:71,revision:'1',replayed:false}});await Promise.all([a,b]);});expect(mock.create).toHaveBeenCalledOnce();});
it('weekday and checkbox drafts restore without losing the opening revision',async()=>{
 const view=mount('edit');fireEvent.click(screen.getByRole('button',{name:'TUE'}));fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));view.unmount();mount('edit');
 expect(screen.getByRole('button',{name:'TUE'}).getAttribute('aria-pressed')).toBe('true');expect((document.querySelector('[name="is_active"]') as HTMLInputElement).checked).toBe(true);
 await save();expect(mock.update.mock.calls[0][0].working_days).toEqual(['mon','tue']);expect(mock.update.mock.calls[0][1].revision).toBe('8');
});
it('date inversion does not call a server action',async()=>{mount();fill();input('effective_from','2026-10-02');input('effective_to','2026-10-01');await save();expect(mock.create).not.toHaveBeenCalled();expect(mock.error).toHaveBeenCalledWith('Check the highlighted fields before saving.');});
it('view mode has no save action',()=>{mount('view');expect(mock.shell?.onSave).toBeUndefined();expect(mock.shell?.onSaveAndClose).toBeUndefined();});
const scopedManager=(branchId:number|null)=>({profile:{id:1},isAccountActive:true,permissionCodes:['common_md.work_calendars.manage'],globalPermissionCodes:[],roleCodes:[],roleAssignments:[{roleId:1,roleCode:'calendar_manager',ownerCompanyId:1,branchId,permissionCodes:['common_md.work_calendars.manage']}]} as unknown as AuthContext);
it('branch-only new form exposes no Save or Save and Close and cannot submit',async()=>{
 mount('add',scopedManager(10));expect(mock.shell?.mode).toBe('view');expect(mock.shell?.onSave).toBeUndefined();expect(mock.shell?.onSaveAndClose).toBeUndefined();
 expect((screen.getByRole('textbox',{name:'Calendar Name'}) as HTMLInputElement).disabled).toBe(true);
 await act(async()=>{fireEvent.submit(document.getElementById('work-calendar-workspace-form')!);});
 expect(mock.create).not.toHaveBeenCalled();expect(mock.update).not.toHaveBeenCalled();
});
it('company manager still selects its company and creates through the existing retained save',async()=>{
 mount('add',scopedManager(null));expect(mock.shell?.mode).toBe('add');expect(mock.shell?.onSave).toBeDefined();fill();await save();
 expect(mock.create).toHaveBeenCalledOnce();expect(mock.create.mock.calls[0][0].owner_company_id).toBe(1);
});
it.each([
 ['wrong identity',{id:72,revision:'9',changed:true,replayed:false,owner_company_id:1,calendar_id:null}],
 ['wrong company',{id:71,revision:'9',changed:true,replayed:false,owner_company_id:2,calendar_id:null}],
 ['invalid revision',{id:71,revision:'not-a-revision',changed:true,replayed:false,owner_company_id:1,calendar_id:null}],
 ['missing change result',{id:71,revision:'9',replayed:false,owner_company_id:1,calendar_id:null}],
])('rejects %s without adopting identity or clearing the draft',async(_label,data)=>{
 mock.update.mockResolvedValueOnce({success:true,data});mount('edit');input('notes','Keep this draft');await save();
 expect(mock.route).not.toHaveBeenCalled();expect(mock.shell?.isDirty).toBe(true);expect(mock.error).toHaveBeenCalled();
 expect((screen.getByRole('textbox',{name:'Notes'}) as HTMLTextAreaElement).disabled).toBe(true);
});
it('transport exception is secret-safe, freezes submitted fields and retains the replay',async()=>{
 mock.create.mockRejectedValueOnce(Error('private transport credential detail'));mount();fill();await save();
 expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private transport');
 expect((screen.getByRole('textbox',{name:'Calendar Name'}) as HTMLInputElement).disabled).toBe(true);
 await save();expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);
});
vi.mock('@/server/actions/common-master-data/archive',()=>({listArchivedMasters:vi.fn(),restoreArchivedMaster:vi.fn()}));
it('confirmed create remains acknowledged despite notification failure and next explicit save updates once',async()=>{
 mock.success.mockImplementation(()=>{throw Error('private notification');});mount();fill();fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));
 expect(await save()).toBe(true);expect(mock.shell?.mode).toBe('edit');expect(mock.shell?.isDirty).toBe(false);
 expect(screen.queryByText(/last calendar save is unconfirmed/)).toBeNull();expect(screen.getByRole('textbox',{name:'Notes'})).toHaveProperty('disabled',false);
 expect(mock.replace).toHaveBeenCalledOnce();expect(mock.invalidate).toHaveBeenCalledOnce();
 input('notes','Next explicit edit');expect(await save()).toBe(true);expect(mock.create).toHaveBeenCalledOnce();expect(mock.update).toHaveBeenCalledOnce();
 expect(mock.update.mock.calls[0][0]).toMatchObject({id:71,calendar_code:'F06',is_active:false});expect(mock.update.mock.calls[0][1].revision).toBe('1');
 expect(mock.update.mock.calls[0][1].operationId).not.toBe(mock.create.mock.calls[0][1].operationId);
});
it.each([{changed:true,replayed:false},{changed:false,replayed:false},{changed:true,replayed:true}])('confirmed edit %j survives notification failure with exact revision',async flags=>{
 mock.update.mockResolvedValueOnce({success:true,data:{id:71,revision:'9',owner_company_id:1,calendar_id:null,...flags}});
 mock.success.mockImplementation(()=>{throw Error('notification');});mount('edit');input('notes','First edit');expect(await save()).toBe(true);
 expect(mock.shell?.isDirty).toBe(false);expect(mock.route).toHaveBeenCalled();expect(screen.queryByText(/last calendar save is unconfirmed/)).toBeNull();
 input('notes','Next edit');expect(await save()).toBe(true);expect(mock.update.mock.calls[1][1].revision).toBe('9');
 expect(mock.success.mock.calls[0][0]).toBe(flags.changed?'Calendar updated':'No changes to save');
});
it('confirmed save survives both display refresh and its warning notification failure',async()=>{
 mock.invalidate.mockRejectedValue(Error('private cache'));mock.error.mockImplementation(()=>{throw Error('private toast');});
 mount();fill();expect(await save()).toBe(true);expect(mock.shell?.isDirty).toBe(false);
 expect(screen.queryByText(/last calendar save is unconfirmed/)).toBeNull();expect(mock.create).toHaveBeenCalledOnce();
 expect(mock.error).toHaveBeenCalledExactlyOnceWith('Calendar saved, but its display could not refresh. Reopen the list before continuing.');
});
it.each(['route','replace','close'] as const)('synchronous %s display failure does not revoke confirmed save',async boundary=>{
 mock[boundary].mockImplementation(()=>{throw Error('private navigation');});mount();fill();expect(await save(boundary==='close')).toBe(true);
 expect(mock[boundary]).toHaveBeenCalledOnce();expect(mock.create).toHaveBeenCalledOnce();expect(screen.queryByText(/last calendar save is unconfirmed/)).toBeNull();
});
it('save and close still closes once after a confirmed receipt despite notification failure',async()=>{
 mock.success.mockImplementation(()=>{throw Error('notification');});mount();fill();expect(await save(true)).toBe(true);
 expect(mock.close).toHaveBeenCalledExactlyOnceWith('calendar',{force:true});expect(mock.replace).not.toHaveBeenCalled();
});
it('a draft changed during a pending save is retained and not force-closed after notification failure',async()=>{
 let resolve!:(value:unknown)=>void;mock.create.mockImplementation(()=>new Promise(done=>{resolve=done;}));mock.success.mockImplementation(()=>{throw Error('notification');});mount();fill();
 let pending:unknown;await act(async()=>{pending=mock.shell!.onSaveAndClose!();});input('notes','Changed while pending');
 await act(async()=>{resolve({success:true,data:{id:71,revision:'1',changed:true,replayed:false,owner_company_id:1,calendar_id:null}});expect(await pending).toBe(true);});
 expect(mock.close).not.toHaveBeenCalled();expect(mock.shell?.isDirty).toBe(true);expect(screen.getByRole('textbox',{name:'Notes'})).toHaveProperty('value','Changed while pending');
});
it('definitive rejection allows a corrected payload and new operation rather than artificial uncertainty',async()=>{
 mock.create.mockResolvedValueOnce({success:false,error:'Known rejection'});mount();fill();expect(await save()).toBe(false);
 expect(screen.getByRole('textbox',{name:'Notes'})).toHaveProperty('disabled',false);input('notes','Corrected');expect(await save()).toBe(true);
 expect(mock.create.mock.calls[1][0].notes).toBe('Corrected');expect(mock.create.mock.calls[1][1].operationId).not.toBe(mock.create.mock.calls[0][1].operationId);
});
