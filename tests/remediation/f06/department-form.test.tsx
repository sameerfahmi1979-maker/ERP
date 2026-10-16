// @vitest-environment jsdom
// Mounted real controller and F04 memory draft/save hooks; server and shell doubles.
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ERPRecordWorkspaceFormProps} from '@/components/workspace/erp-record-workspace-form';
import type {AuthContext} from '@/lib/rbac/check';
import type {DepartmentRow} from '@/server/actions/common-master-data/departments';
import type {ReactNode} from 'react';
const mock=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,shell:null as ERPRecordWorkspaceFormProps|null,create:vi.fn(),update:vi.fn(),close:vi.fn(),route:vi.fn(),replace:vi.fn(),error:vi.fn(),success:vi.fn(),dispatch:vi.fn(),mark:vi.fn(),invalidate:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/department/new',useRouter:()=>({replace:mock.replace})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'department',tabs:[{id:'department',route:'/department/new'}]},dispatch:mock.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>mock.store}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>({closeTab:mock.close,markDirty:mock.mark,updateTabRoute:mock.route,isTabActive:()=>true})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:mock.invalidate})}));
vi.mock('@/components/erp/organizations/branch-select',()=>({BranchSelect:({value,onValueChange,disabled,required}:{value:number|null;onValueChange:(v:number|null)=>void;disabled:boolean;required:boolean})=><select aria-label="Branch" name="branch_id" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)} disabled={disabled} required={required}><option value="">All branches</option><option value="11">Synthetic branch A1</option><option value="12">Synthetic branch A2</option></select>}));
vi.mock('@/server/actions/common-master-data/departments',()=>({createDepartment:mock.create,updateDepartment:mock.update}));
vi.mock('sonner',()=>({toast:{error:mock.error,success:mock.success}}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:(props:ERPRecordWorkspaceFormProps)=>{mock.shell=props;return <div>{props.children}</div>;},ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
import {DepartmentWorkspaceForm} from '@/features/common-master-data/departments/department-workspace-form';
const existing={id:71,workspace_revision:8,department_code:'F06',department_name_en:'Department',owner_company_id:1,branch_id:null,parent_department_id:null,cost_center_id:null,department_head_user_id:null,is_active:false} as DepartmentRow;
const ctx={profile:{id:1},isAccountActive:true,permissionCodes:['common_md.manage'],globalPermissionCodes:[],roleCodes:[],roleAssignments:[{roleCode:'company_manager',ownerCompanyId:1,branchId:null,permissionCodes:['common_md.manage']}]} as unknown as AuthContext;
const receipt={id:71,revision:'9',replayed:false,changed:true,owner_company_id:1,branch_id:null};
beforeEach(()=>{vi.clearAllMocks();mock.store=createWorkspaceDraftStore();mock.invalidate.mockResolvedValue(undefined);mock.create.mockResolvedValue({success:true,data:{...receipt,revision:'1'}});mock.update.mockResolvedValue({success:true,data:receipt});});afterEach(cleanup);
function mount(mode:'add'|'edit'|'view'='add',authContext=ctx){return render(<DepartmentWorkspaceForm mode={mode} department={mode==='add'?null:existing} authContext={authContext} companies={[{id:1,company_code:'SYN',legal_name_en:'Synthetic'}]}/>);}
function input(name:string,value:string){fireEvent.change(document.querySelector(`[name="${name}"]`)!,{target:{value}});}
function fill(){input('department_code','F06');input('department_name_en','Department');input('owner_company_id','1');}
async function save(){await act(async()=>{await mock.shell?.onSave?.();});}
it('false create adopts its identity and uses update on the next save',async()=>{mount();fill();fireEvent.click(screen.getByRole('checkbox',{name:'Active'}));await save();expect(mock.create.mock.calls[0][0].is_active).toBe(false);expect(mock.shell?.mode).toBe('edit');input('description','Changed');await save();expect(mock.create).toHaveBeenCalledOnce();expect(mock.update.mock.calls[0][0].id).toBe(71);expect(mock.update.mock.calls[0][1].revision).toBe('1');});
it('established company and code are immutable controls',()=>{mount('edit');expect((screen.getByRole('combobox',{name:/Organization/}) as HTMLSelectElement).disabled).toBe(true);expect((screen.getByRole('textbox',{name:/Department Code/}) as HTMLInputElement).disabled).toBe(true);});
it('unknown response freezes fields and repeats exactly the original request',async()=>{mock.create.mockResolvedValueOnce({success:false,uncertain:true});mount();fill();await save();expect((screen.getByRole('textbox',{name:'Description'}) as HTMLTextAreaElement).disabled).toBe(true);await save();expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);});
it('transport exceptions never expose internal details and keep the replay',async()=>{mock.create.mockRejectedValueOnce(Error('private transport detail'));mount();fill();await save();expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private transport');await save();expect(mock.create.mock.calls[1]).toEqual(mock.create.mock.calls[0]);});
it.each([
 ['wrong identity',{...receipt,id:72}],['wrong company',{...receipt,owner_company_id:2}],['wrong branch',{...receipt,branch_id:11}],['bad revision',{...receipt,revision:'oops'}],['missing changed',{...receipt,changed:undefined}],
])('rejects %s without acknowledging the draft',async(_name,data)=>{mock.update.mockResolvedValueOnce({success:true,data});mount('edit');input('description','Keep');await save();expect(mock.shell?.isDirty).toBe(true);expect(mock.route).not.toHaveBeenCalled();expect(mock.success).not.toHaveBeenCalled();expect((screen.getByRole('textbox',{name:'Description'}) as HTMLTextAreaElement).disabled).toBe(true);});
it('date inversion is linked to Effective To without contacting the server',async()=>{mount();fill();input('effective_from','2026-10-02');input('effective_to','2026-10-01');await save();expect(mock.create).not.toHaveBeenCalled();expect(mock.error).toHaveBeenCalledWith('Check the highlighted fields before saving.');});
it('branch-only actor cannot edit a company-wide department',()=>{mount('edit',{...ctx,roleAssignments:ctx.roleAssignments?.map(a=>({...a,branchId:11}))});expect(mock.shell?.onSave).toBeUndefined();});
it('no-op has truthful success feedback',async()=>{mock.update.mockResolvedValueOnce({success:true,data:{...receipt,revision:'8',changed:false}});mount('edit');await save();expect(mock.success).toHaveBeenCalledWith('No changes to save');});
it('post-commit refresh failure keeps the new identity instead of retrying create',async()=>{mock.invalidate.mockRejectedValueOnce(Error('cache failure'));mount();fill();await save();expect(mock.shell?.mode).toBe('edit');input('description','Next');await save();expect(mock.create).toHaveBeenCalledOnce();expect(mock.update.mock.calls[0][0].id).toBe(71);expect(mock.error).toHaveBeenCalledWith(expect.stringContaining('Department saved, but'));});
it('branch-only manager can choose their company and create only their own branch Department',async()=>{
 const branchCtx={...ctx,roleAssignments:ctx.roleAssignments?.map(a=>({...a,branchId:11}))};
 mock.create.mockResolvedValueOnce({success:true,data:{...receipt,revision:'1',branch_id:11}});
 mount('add',branchCtx);expect((screen.getByRole('option',{name:'Synthetic (SYN)'}) as HTMLOptionElement).disabled).toBe(false);fill();
 expect((screen.getByRole('combobox',{name:'Branch'}) as HTMLSelectElement).required).toBe(true);
 input('branch_id','11');await save();expect(mock.create.mock.calls[0][0].branch_id).toBe(11);expect(mock.shell?.mode).toBe('edit');
 expect((screen.getByRole('combobox',{name:'Branch'}) as HTMLSelectElement).disabled).toBe(true);
 input('description','After first save');await save();expect(mock.update.mock.calls[0][0].branch_id).toBe(11);
});
it('branch-only manager cannot submit company-wide or sibling-branch ownership',async()=>{
 mount('add',{...ctx,roleAssignments:ctx.roleAssignments?.map(a=>({...a,branchId:11}))});fill();await save();expect(mock.create).not.toHaveBeenCalled();
 input('branch_id','12');await save();expect(mock.create).not.toHaveBeenCalled();
});
it('changing company clears the previous branch before a new save',()=>{mount();fill();input('branch_id','11');input('owner_company_id','');expect((screen.getByRole('combobox',{name:'Branch'}) as HTMLSelectElement).value).toBe('');});
it('existing branch retains its meaningful label without fetching mutable choices',()=>{render(<DepartmentWorkspaceForm mode="edit" department={{...existing,branch_id:11,branch:{id:11,branch_name_en:'Synthetic branch retained'}}} authContext={ctx}/>);expect((screen.getByRole('textbox',{name:'Branch'}) as HTMLInputElement).value).toBe('Synthetic branch retained');expect((screen.getByRole('textbox',{name:'Branch'}) as HTMLInputElement).disabled).toBe(true);});
