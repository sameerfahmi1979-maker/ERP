// @vitest-environment jsdom
// Mounted pilot controllers with explicit UI/server doubles: not browser or database acceptance.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { ERPRecordWorkspaceFormProps } from "@/components/workspace/erp-record-workspace-form";
import type { AuthContext } from "@/lib/rbac/check";
import type { DepartmentRow } from "@/server/actions/common-master-data/departments";
import type { EmployeeListRow } from "@/server/actions/hr/employees";
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { createWorkspaceDraftStore } from "@/lib/workspace/workspace-draft-store";

const mock = vi.hoisted(() => ({
  pathname: "", active: "owner", store: null as ReturnType<typeof createWorkspaceDraftStore> | null,
  shell: null as ERPRecordWorkspaceFormProps | null,
  dispatch: vi.fn(), closeTab: vi.fn(), markDirty: vi.fn(), updateTabRoute: vi.fn(),
  replace: vi.fn(), refresh: vi.fn(), create: vi.fn(), update: vi.fn(), error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mock.pathname, useRouter: () => ({replace: mock.replace, refresh: mock.refresh}) }));
vi.mock("@/components/workspace/workspace-provider", () => ({
  useWorkspaceContext: () => ({state: {activeTabId: mock.active, tabs: [{id: "owner", route: mock.pathname}, {id:"destination", route:"/dashboard"}]}, dispatch:mock.dispatch}),
}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => mock.store}));
vi.mock("@/hooks/use-workspace", () => ({ useWorkspace: () => ({
  closeTab:mock.closeTab, markDirty:mock.markDirty, updateTabRoute:mock.updateTabRoute, isTabActive: (id:string) => id === mock.active,
})}));
vi.mock("sonner", () => ({ toast: {error:mock.error, success:vi.fn()} }));
vi.mock("@tanstack/react-query", () => ({useQuery: () => ({data: undefined})}));
vi.mock("@/server/actions/common-master-data/departments", () => ({createDepartment:mock.create, updateDepartment:mock.update}));
vi.mock("@/server/actions/hr/employees", () => ({createEmployee:mock.create, updateEmployee:mock.update}));
vi.mock("@/server/actions/hr/recruitment", () => ({createCandidate:mock.create, updateCandidate:mock.update, getRecruitmentSalaryAccess:vi.fn()}));
vi.mock("@/components/workspace/erp-record-workspace-form", () => ({
  ERPRecordWorkspaceForm: (props: ERPRecordWorkspaceFormProps) => {
    mock.shell = props;
    return <div data-testid="shell" data-dirty={props.isDirty}>
      <button onClick={() => {void props.onSave?.();}}>Save</button>
      <button onClick={() => {void props.onSaveAndClose?.();}}>Save and close</button>
      <button onClick={props.onRequestClose}>Cancel</button>
      <button onClick={() => props.onSectionChange("profile")}>Profile</button>
      {props.children}
    </div>;
  },
  ERPRecordSectionPanel: ({children}: {children:React.ReactNode}) => <div>{children}</div>,
}));
vi.mock("@/components/ui/input", () => ({Input: (props:ComponentProps<"input">) => <input {...props}/>}));
vi.mock("@/components/ui/textarea", () => ({Textarea: (props:ComponentProps<"textarea">) => <textarea {...props}/>}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({checked, onCheckedChange, ...props}: ComponentProps<"input"> & {onCheckedChange:(checked:boolean)=>void}) =>
    <input {...props} type="checkbox" checked={checked} onChange={e => onCheckedChange(e.target.checked)}/>,
}));
vi.mock("@/features/hr/recruitment/tabs/candidate-profile-tab", () => ({
  CandidateProfileTab: ({form, setForm, mode}: {form:{full_name_en:string;requisition_id:number|null}; setForm:(fn:(p:typeof form)=>typeof form)=>void; mode:string}) => <>
    <input aria-label="Pilot name" value={form.full_name_en} disabled={mode==="view"} onChange={e=>setForm(p=>({...p,full_name_en:e.target.value}))}/>
    <input aria-label="Pilot nullable" value={form.requisition_id ?? ""} onChange={e=>setForm(p=>({...p,requisition_id:e.target.value?Number(e.target.value):null}))}/>
  </>,
}));
vi.mock("@/features/hr/employees/tabs/employee-profile-tab", () => ({
  EmployeeProfileTab: ({form, setForm, mode}: {form:{full_name_en:string;owner_company_id:number|null;gender:string;employee_category_id:number|null};setForm:(fn:(p:typeof form)=>typeof form)=>void;mode:string}) => <>
    <input aria-label="Pilot name" name="full_name_en" required disabled={mode==="view"} value={form.full_name_en} onChange={e=>setForm(p=>({...p,full_name_en:e.target.value}))}/>
    <button type="button" onClick={()=>setForm(p=>({...p,owner_company_id:1,gender:"female",employee_category_id:1}))}>Fill selections</button>
  </>,
}));
vi.mock("@/features/hr/recruitment/tabs/candidate-conversion-tab", () => ({CandidateConversionTab: () => null}));
vi.mock("@/features/hr/recruitment/tabs/candidate-documents-tab", () => ({CandidateDocumentsTab: () => null}));
vi.mock("@/features/hr/recruitment/tabs/candidate-interviews-tab", () => ({CandidateInterviewsTab: () => null}));
vi.mock("@/features/hr/recruitment/tabs/candidate-offers-tab", () => ({CandidateOffersTab: () => null}));
vi.mock("@/features/hr/recruitment/tabs/candidate-onboarding-tab", () => ({CandidateOnboardingTab: () => null}));
vi.mock("@/features/hr/recruitment/tabs/candidate-overview-tab", () => ({CandidateOverviewTab: () => null}));
vi.mock("@/features/dms/entity-documents", () => ({DmsEntityDocumentsTab: () => null}));
vi.mock("@/features/hr/ai/hr-ai-review-tab", () => ({HrAiReviewTab: () => null}));
vi.mock("@/features/hr/employees/employee-letters-forms", () => ({EmployeeLettersForms: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-compliance-tab", () => ({EmployeeComplianceTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-hr-actions-tab", () => ({EmployeeHrActionsTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-operations-tab", () => ({EmployeeOperationsTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-overview-tab", () => ({EmployeeOverviewTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-payroll-tab", () => ({EmployeePayrollTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-placeholder-tab", () => ({EmployeePlaceholderTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-time-tab", () => ({EmployeeTimeTab: () => null}));

import { DepartmentWorkspaceForm } from "@/features/common-master-data/departments/department-workspace-form";
import { CandidateWorkspaceForm } from "@/features/hr/recruitment/candidate-workspace-form";
import { EmployeeWorkspaceForm } from "@/features/hr/employees/employee-workspace-form";

const auth = {permissionCodes:["hr.recruitment.manage"], roleCodes:[]} as AuthContext;
beforeEach(() => {
  vi.clearAllMocks();
  mock.store = createWorkspaceDraftStore();
  mock.active = "owner";
  mock.shell = null;
  mock.create.mockResolvedValue({success:true,data:{id:7001,revision:"1",replayed:false}});
  mock.update.mockResolvedValue({success:true,data:{id:7001,revision:"1",replayed:false}});
});
afterEach(cleanup);
const save = async (close=false) => {await act(async()=>{await (close ? mock.shell?.onSaveAndClose?.() : mock.shell?.onSave?.());});};
const department = {id:11,workspace_revision:1,owner_company_id:1,department_code:"TEST",department_name_en:"Saved",is_active:true,
  branch_id:7,parent_department_id:8,cost_center_id:9,department_head_user_id:10} as DepartmentRow;
function mountDepartment(mode:"add"|"edit"|"view"="add") {
  mock.pathname = "/admin/common-master-data/departments/record/" + (mode==="add" ? "new" : "11");
  return render(<DepartmentWorkspaceForm mode={mode} department={mode==="add"?null:department} authContext={auth} companies={[{id:1,legal_name_en:"Test",company_code:"TEST"}]}/>);
}
function fillDepartment() {
  fireEvent.change(screen.getByLabelText(/Organization/), {target:{value:"1"}});
  fireEvent.change(screen.getByLabelText(/Department Code/), {target:{value:"TEST"}});
  fireEvent.change(screen.getByLabelText(/Name \(English\)/), {target:{value:"Synthetic Department"}});
}
function delayed() {
  let resolve!: (value:{success:boolean;data:{id:number;revision:string;replayed:boolean}})=>void;
  const promise = new Promise<{success:boolean;data:{id:number;revision:string;replayed:boolean}}>(r=>{resolve=r;});
  mock.create.mockReturnValueOnce(promise);
  return resolve;
}
describe("Department pilot", () => {
  it("does not submit missing required data and selects its section", async()=>{
    mountDepartment();await save();
    expect(mock.create).not.toHaveBeenCalled();expect(mock.shell?.activeSection).toBe("basic");
  });
  it("submits false explicitly and adopts returned identity before another save", async()=>{
    mountDepartment();fillDepartment();fireEvent.click(screen.getByLabelText("Active"));await save();
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({is_active:false,department_code:"TEST"}),expect.objectContaining({operationId:expect.any(String),revision:null}));
    expect(mock.shell?.isDirty).toBe(false);
    fireEvent.change(screen.getByLabelText(/Name \(English\)/),{target:{value:"Updated"}});await save();
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({id:7001,department_code:"TEST",is_active:false}),expect.objectContaining({revision:"1"}));
  });
  it("keeps disabled edit code and associations not owned by this form", async()=>{
    mountDepartment("edit");await save();
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({id:11,department_code:"TEST",branch_id:7,parent_department_id:8,cost_center_id:9,department_head_user_id:10}),expect.objectContaining({revision:"1"}));
  });
  it("prevents same-tick double creation and retains newer text on save-and-close", async()=>{
    const resolve=delayed();mountDepartment();fillDepartment();
    let first:unknown;
    act(()=>{const callback=mock.shell?.onSaveAndClose; first=callback?.();void callback?.();});
    expect(mock.create).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/Name \(English\)/),{target:{value:"Newer"}});
    await act(async()=>{resolve({success:true,data:{id:7001,revision:"1",replayed:false}});await first;});
    expect(mock.closeTab).not.toHaveBeenCalled();expect(mock.shell?.isDirty).toBe(true);
    expect(mock.store?.getDraft("draft:tab:owner:department-workspace-form")?.department_name_en).toBe("Newer");
  });
  it("a rejected save keeps input and never closes",async()=>{
    mock.create.mockResolvedValueOnce({success:false,error:"Rejected"});mountDepartment();fillDepartment();await save(true);
    expect(mock.closeTab).not.toHaveBeenCalled();expect(mock.shell?.isDirty).toBe(true);
    expect((screen.getByLabelText(/Name \(English\)/) as HTMLInputElement).value).toBe("Synthetic Department");
  });
});
for (const pilot of ["candidate","employee"] as const) {
  function mount(mode:"add"|"edit"|"view"="add") {
    mock.pathname=pilot==="candidate"?"/admin/hr/recruitment/candidates/record/new":"/admin/hr/employees/record/new";
    return pilot==="candidate" ? render(<CandidateWorkspaceForm mode={mode} authContext={auth} candidate={mode==="add"?null:{id:31,workspace_revision:1,full_name_en:"Saved",candidate_status:"new"} as CandidateRow}/>)
      : render(<EmployeeWorkspaceForm mode={mode} authContext={auth} employee={mode==="add"?null:{id:31,workspace_revision:1,full_name_en:"Saved",gender:"female",owner_company_id:1,employee_category_id:1} as EmployeeListRow}/>);
  }
  function fill() {fireEvent.change(screen.getByLabelText("Pilot name"),{target:{value:"Synthetic Person"}});if(pilot==="employee")fireEvent.click(screen.getByText("Fill selections"));}
  describe(pilot+" pilot",()=>{
    it("validates before calling the server", async()=>{mount();await save();expect(mock.create).not.toHaveBeenCalled();expect(mock.shell?.activeSection).toBe("profile");});
    it("tracks edits and Cancel closes only the owner through its guard",()=>{mount();fill();expect(mock.shell?.isDirty).toBe(true);mock.active="destination";fireEvent.click(screen.getByText("Cancel"));expect(mock.closeTab).toHaveBeenCalledWith("owner");});
    it("restores values and selected section after unmount",()=>{const first=mount();fill();fireEvent.click(screen.getByText("Profile"));first.unmount();mount();expect((screen.getByLabelText("Pilot name") as HTMLInputElement).value).toBe("Synthetic Person");expect(mock.shell?.isDirty).toBe(true);expect(mock.shell?.activeSection).toBe("profile");});
    it("creates once then updates returned identity in the same mounted form",async()=>{mount();fill();await save();await save();expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.update).toHaveBeenCalledWith(7001,expect.objectContaining({full_name_en:"Synthetic Person"}),expect.objectContaining({revision:"1"}));});
    it("blocks double submission without dropping edits made during the request",async()=>{
      const resolve=delayed();mount();fill();let first:unknown;
      act(()=>{const callback=mock.shell?.onSaveAndClose;first=callback?.();void callback?.();});
      expect(mock.create).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText("Pilot name"),{target:{value:"Newer edit"}});
      await act(async()=>{resolve({success:true,data:{id:7001,revision:"1",replayed:false}});await first;});
      expect(mock.closeTab).not.toHaveBeenCalled();expect(mock.shell?.isDirty).toBe(true);
      expect((screen.getByLabelText("Pilot name") as HTMLInputElement).value).toBe("Newer edit");
    });
    it("does not redirect or refresh a destination when its earlier save finishes",async()=>{
      const resolve=delayed();mount();fill();let first:unknown;act(()=>{first=mock.shell?.onSave?.();});mock.active="destination";
      await act(async()=>{resolve({success:true,data:{id:7001,revision:"1",replayed:false}});await first;});
      expect(mock.replace).not.toHaveBeenCalled();expect(mock.refresh).not.toHaveBeenCalled();
      expect(mock.updateTabRoute.mock.calls[0]?.[0]).toBe("owner");
    });
    it("failed transport keeps a dirty draft and never closes",async()=>{mock.create.mockRejectedValueOnce(new Error("offline"));mount();fill();await save(true);expect(mock.shell?.isDirty).toBe(true);expect(mock.closeTab).not.toHaveBeenCalled();expect(mock.error).toHaveBeenCalledWith("offline");});
    it("view mode exposes no save callbacks and ignores old draft values",()=>{mock.store?.writeField("draft:tab:owner:"+pilot+"-workspace-form","full_name_en","Private draft");mount("view");expect(mock.shell?.onSave).toBeUndefined();expect(mock.shell?.isDirty).toBe(false);expect((screen.getByLabelText("Pilot name") as HTMLInputElement).value).toBe("Saved");});
    it("unchanged Save and Close closes its captured owner only",async()=>{mount();fill();await save(true);expect(mock.closeTab).toHaveBeenCalledWith("owner",{force:true});expect(mock.replace).not.toHaveBeenCalled();});
  });
}
