// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {EmployeeWorkspaceForm} from "@/features/hr/employees/employee-workspace-form";
import type {EmployeeListRow} from "@/server/actions/hr/employees";
import type {AuthContext} from "@/lib/rbac/check";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {createEmptyIdentityDocumentForm} from "@/lib/hr/compliance/identity-document-form";
import {ReadError} from "@/lib/reads/client";
import {complianceReadIdentity, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";
import {syntheticAuthContext} from "./fixtures/auth-context";
import {complianceFixture, complianceFixtureReply} from "./fixtures/compliance-record-fixture";

const state = vi.hoisted(() => ({read: vi.fn(), mutate: vi.fn(), settings: vi.fn(), prefill: vi.fn(), genericPrefill: vi.fn(), docs: vi.fn(), error: vi.fn(), success: vi.fn(), dispatch: vi.fn(), markDirty: vi.fn(), profileSave: vi.fn(), reconcile:vi.fn(),
  store: null as ReturnType<typeof createWorkspaceDraftStore> | null, mounts: 0, dialogs: new Map<string, {submit?: () => unknown; close: (open: boolean) => void}>(),
  legacy: undefined as ((open: boolean) => void) | undefined, leases: undefined as ((token: object, open: boolean) => void) | undefined}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/employees/record/7", useRouter: () => ({replace: vi.fn(), refresh: vi.fn()})}));
vi.mock("@/components/workspace/workspace-provider", () => ({useWorkspaceContext: () => ({state: {activeTabId: "owner", tabs: [{id: "owner", route: "/admin/hr/employees/record/7"}]}, dispatch: state.dispatch})}));
vi.mock("@/server/actions/hr/child-mutation",()=>({
 readComplianceChildRevision:async()=>({success:true,revision:"1"}),
 mutateHrChild:async(request:import("@/lib/hr/child-save-contract").ChildMutation,contract:import("@/lib/hr/child-save-contract").ChildSaveContract)=>{
  const names:Record<string,string>={"identity-document":"IdentityDocument","medical-insurance":"MedicalInsurance","access-card":"AccessCard","training-certificate":"TrainingCertificate","medical-record":"MedicalRecord"};
  const action=request.action==='create'?'create':request.action==='archive'?'archive':request.action==='verify'?'verify':'update';
  const args=action==='archive'||action==='verify'?[request.id,contract,request.employeeId]:[request.id??request.employeeId,request.values,contract];
  const r=await state.mutate(action+"Employee"+names[request.kind],args);
  return r.success?{...r,data:{kind:request.kind,id:r.data.id,employee_id:request.employeeId,operation_id:contract.operationId,revision:String(Number(request.revision??0)+1),replayed:false}}:r;
 },reconcileHrChild:state.reconcile,
}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => state.store}));
vi.mock("@/hooks/use-workspace", () => ({useWorkspace: () => ({closeTab: vi.fn(), markDirty: state.markDirty, updateTabRoute: vi.fn(), isTabActive: () => true})}));
vi.mock("sonner", () => ({toast: {error: state.error, success: state.success, warning: vi.fn()}}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/server/actions/hr/employees", () => ({createEmployee: state.profileSave, updateEmployee: state.profileSave}));
// Ordinary synthetic atomic transport; real owned draft/recovery controller and
// parent leases remain mounted. No separate evidence mutation is dispatched.
vi.mock('@/server/actions/hr/dependent-mutation',()=>({
 mutateEmployeeDependent:async(request:import('@/lib/hr/dependent-contract').DependentMutation,contract:import('@/lib/hr/dependent-contract').DependentSaveContract)=>{
  const name=request.kind==='archive'?'archiveEmployeeDependent':request.id===null?'createEmployeeDependent':'updateEmployeeDependent';
  const result=await state.mutate(name,[request.id??request.employeeId,request.values,contract]);
  return result.success?{success:true,data:{id:result.data.id,employee_id:request.employeeId,operation_id:contract.operationId,revision:String(Number(request.revision??0)+1),replayed:false}}:result;
 },reconcileDependentMutation:vi.fn(),
}));
vi.mock("@/server/actions/hr/compliance", () => Object.fromEntries([
  "createEmployeeIdentityDocument", "updateEmployeeIdentityDocument", "archiveEmployeeIdentityDocument", "verifyEmployeeIdentityDocument",
  "createEmployeeMedicalInsurance", "updateEmployeeMedicalInsurance", "archiveEmployeeMedicalInsurance", "verifyEmployeeMedicalInsurance",
  "createEmployeeDependent", "updateEmployeeDependent", "archiveEmployeeDependent", "applyEmployeeDependentDocumentLinks",
  "createEmployeeAccessCard", "updateEmployeeAccessCard", "archiveEmployeeAccessCard", "createEmployeeTrainingCertificate", "updateEmployeeTrainingCertificate", "archiveEmployeeTrainingCertificate", "verifyEmployeeTrainingCertificate",
  "createEmployeeMedicalRecord", "updateEmployeeMedicalRecord", "archiveEmployeeMedicalRecord",
].map(name => [name, (...args: unknown[]) => state.mutate(name, args)])));
vi.mock("@/lib/reads/hr-record-choice-client", () => Object.fromEntries(["listHrIdentityDocumentTypes", "listHrRelationshipTypes", "listHrAccessCardTypes", "listHrTrainingCategories", "listHrTrainingTypes", "listHrMedicalRecordTypes"].map(name => [name, state.settings])));
vi.mock("@/server/actions/hr/document-to-record", () => ({checkHrDocumentToRecordEnabled: async () => ({success: true, data: {enabled: false}})}));
vi.mock("@/server/actions/hr/ai/identity-document-ai-fill", () => ({prefillIdentityDocumentFromDms: state.prefill}));
vi.mock("@/server/actions/hr/compliance-dms-prefill", () => ({prefillComplianceRecordFromDms: state.genericPrefill}));
vi.mock("@/server/actions/dms/entity-documents", () => ({getDmsDocumentsByEntity: state.docs, getAvailableDmsDocumentsForLink: state.docs}));
vi.mock("@/components/erp/erp-child-dialog-form", async original => {
  const actual = await original<typeof import("@/components/erp/erp-child-dialog-form")>();
  return {...actual, ERPChildDialogForm: (props: React.ComponentProps<typeof actual.ERPChildDialogForm>) => {
    state.dialogs.set(props.title, {submit: props.onSubmit, close: props.onOpenChange}); return <actual.ERPChildDialogForm {...props}/>;
  }};
});
vi.mock("@/features/hr/employees/tabs/employee-compliance-tab", async original => {
  const actual = await original<typeof import("@/features/hr/employees/tabs/employee-compliance-tab")>();
  return {...actual, EmployeeComplianceTab: (props: React.ComponentProps<typeof actual.EmployeeComplianceTab>) => {
    React.useLayoutEffect(() => {state.leases = (props as typeof props & {onChildLeaseChange?: typeof state.leases}).onChildLeaseChange;});
    return <actual.EmployeeComplianceTab {...props}/>;
  }};
});
vi.mock("@/features/hr/employees/compliance/identity-document-add-dialog", async original => {
  const actual = await original<typeof import("@/features/hr/employees/compliance/identity-document-add-dialog")>();
  return {...actual, IdentityDocumentAddDialog: (props: React.ComponentProps<typeof actual.IdentityDocumentAddDialog>) => {
    React.useEffect(() => {state.mounts++;}, []); return <actual.IdentityDocumentAddDialog {...props}/>;
  }};
});
vi.mock("@/features/hr/employees/compliance/identity-document-form-fields", () => ({IdentityDocumentFormFields: ({form, setForm}: {form: ReturnType<typeof createEmptyIdentityDocumentForm>; setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof createEmptyIdentityDocumentForm>>>}) => <>
  <input aria-label="Identity type" value={form.document_type_id ?? ""} onChange={e => setForm(p => ({...p, document_type_id: Number(e.target.value)}))}/>
  <input aria-label="Identity number" value={form.document_number} onChange={e => setForm(p => ({...p, document_number: e.target.value}))}/>
  <input aria-label="Notes" value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))}/>
</>}));
vi.mock("@/components/erp/combobox", () => ({ERPCombobox: ({ariaLabel, value, options, onValueChange}: {ariaLabel: string; value: unknown; options: {value: unknown; label: string}[]; onValueChange: (value: string) => void}) => <select aria-label={ariaLabel} value={String(value ?? "")} onChange={e => onValueChange(e.target.value)}><option value=""/>{options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>}));
vi.mock("@/components/erp/geography/country-select", () => ({CountrySelect: () => null}));
vi.mock("@/features/hr/employees/compliance/dependent-document-links-section", () => ({EMPTY_DEP_LINK_CHANGES: {addDocumentIds: [], removeDocumentIds: []}, DependentDocumentLinksSection: ({onChangesChange}: {onChangesChange: (value: {addDocumentIds: number[]; removeDocumentIds: number[]}) => void}) => <button type="button" onClick={() => onChangesChange({addDocumentIds: [41], removeDocumentIds: []})}>Stage synthetic link</button>}));
vi.mock("@/features/hr/employees/document-to-record/hr-doc-to-record-wizard", () => ({HrDocumentToRecordWizard: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-profile-tab", () => ({EmployeeProfileTab: ({form, setForm}: {form: {full_name_en: string}; setForm: React.Dispatch<React.SetStateAction<{full_name_en: string}>>}) => <input name="full_name_en" aria-label="Profile name" value={form.full_name_en} onChange={e => setForm(p => ({...p, full_name_en: e.target.value}))}/>}));
vi.mock("@/features/hr/employees/tabs/employee-time-tab", () => ({EmployeeTimeTab: ({onChildOpen}: {onChildOpen: (open: boolean) => void}) => {React.useLayoutEffect(() => {state.legacy = onChildOpen;}, [onChildOpen]); return null;}}));
vi.mock("@/features/hr/employees/tabs/employee-overview-tab", () => ({EmployeeOverviewTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-payroll-tab", () => ({EmployeePayrollTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-operations-tab", () => ({EmployeeOperationsTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-hr-actions-tab", () => ({EmployeeHrActionsTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-placeholder-tab", () => ({EmployeePlaceholderTab: () => null}));
vi.mock("@/features/dms/entity-documents", () => ({DmsEntityDocumentsTab: () => null}));
vi.mock("@/features/hr/ai/hr-ai-review-tab", () => ({HrAiReviewTab: () => null}));
vi.mock("@/features/hr/employees/employee-letters-forms", () => ({EmployeeLettersForms: () => null}));

const auth = syntheticAuthContext(["hr.employees.view", "hr.compliance.view", "hr.compliance.manage", "hr.medical.view", "hr.medical.manage"], {id: 7, auth_user_id: "compliance-parent"});
const scopedB: AuthContext = {...auth, permissionCodes: auth.permissionCodes.filter(p => p !== "hr.medical.manage")};
const employee = {id: 7, employee_code: "SYNTH-7", full_name_en: "Synthetic employee", employee_status: "active", workspace_revision: 4} as EmployeeListRow;
const documents = [1, 2].map(id => ({document_id: id, id, document_no: `SYNTH-${id}`, title: `Synthetic document ${id}`, status: "approved", document_type_name: "Synthetic", expiry_date: null}));
const prefill = (id = 1) => ({success: true, data: {form: {...createEmptyIdentityDocumentForm(), document_type_id: 1, document_number: `SYNTH-${id}`, dms_document_id: id}, fieldConfidence: {}, sourceDocument: {document_no: `SYNTH-${id}`, title: `Synthetic document ${id}`}, prefillSource: "dms_metadata", linkedToEmployee: true}});
const clients: QueryClient[] = [];
function deferred<T>() {let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;}); return {promise, resolve, reject};}
beforeEach(() => {
  state.store = createWorkspaceDraftStore(); state.store.setViewState("draft:tab:owner:section:employee-workspace-form", "compliance");
  state.reconcile.mockResolvedValue({success:false,uncertain:true,error:'Synthetic receipt remains unconfirmed'});
  state.mounts = 0; state.leases = undefined; state.legacy = undefined;
  state.read.mockImplementation(normalRead);
  state.settings.mockResolvedValue({success: true, data: {data: [{id: 1, name_en: "Synthetic type", code: "SYNTH", is_active: true}]}});
  state.mutate.mockResolvedValue({success: true, data: {id: 17}}); state.docs.mockResolvedValue({success: true, data: documents});
  state.prefill.mockImplementation(async (_: number, id: number) => prefill(id));
  state.genericPrefill.mockImplementation(async (_: number, id: number) => ({success: true, data: {dms_document_id: id, linkedToEmployee: true, sourceDocument: {document_no: `SYNTH-${id}`, title: `Synthetic document ${id}`}, prefillSource: "dms_metadata", fields: {dependent_name_en: `Synthetic dependent ${id}`, relationship_type_id: 1}}}));
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.dialogs.clear(); vi.restoreAllMocks(); for (const fn of [state.read, state.mutate, state.settings, state.prefill, state.genericPrefill, state.docs, state.error, state.success, state.dispatch, state.markDirty, state.profileSave,state.reconcile]) fn.mockReset();});
function mount() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const tree = (ctx: AuthContext) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><EmployeeWorkspaceForm employee={employee} mode="edit" authContext={ctx}/></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree(auth)); return {...view, client, replace: (ctx: AuthContext) => view.rerender(tree(ctx))};
}
function collection(label = "Legal Documents") {return screen.getByText(label, {selector: "span.font-semibold"}).closest("div.mb-8") as HTMLElement;}
async function add(label = "Legal Documents") {
  await waitFor(() => expect((within(collection(label)).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(collection(label)).getByRole("button", {name: "Add"}));
  return screen.findByRole("dialog");
}
async function manual(label = "Legal Documents") {
  await add(label); fireEvent.click(screen.getByRole("button", {name: /Enter Manually/})); const dialog = screen.getByRole("dialog");
  if (label === "Legal Documents") {fireEvent.change(within(dialog).getByLabelText("Identity type"), {target: {value: "1"}}); fireEvent.change(within(dialog).getByLabelText("Identity number"), {target: {value: "PRIVATE-A"}});}
  else {fireEvent.change(within(dialog).getByLabelText("Name (English)"), {target: {value: "Synthetic dependent"}}); fireEvent.change(within(dialog).getByLabelText("Relationship"), {target: {value: "1"}});}
  return dialog;
}
const locked = () => screen.getByLabelText("Profile name").closest("[inert]") !== null;
const shadowKey = (kind: ComplianceKind, id = 7) => ["hr", "compliance-records", id, kind, complianceReadIdentity({...auth, permissionCodes: ["hr.compliance.view"]}), "page", '{"page":2,"pageSize":25}'];
const primaryCalls = (name: string) => state.mutate.mock.calls.filter(([action]) => action === name);

const remainingCreates = [
  {kind: "insurance", label: "Medical Insurance", action: "createEmployeeMedicalInsurance", legacy: "medical-insurances", fields: [["Insurance Provider", "Synthetic provider"], ["Policy Number", "POLICY-1"], ["Expiry Date", "2027-01-01"]], payload: {insurance_provider: "Synthetic provider", policy_number: "POLICY-1", expiry_date: "2027-01-01"}},
  {kind: "cards", label: "Access Cards & Passes", action: "createEmployeeAccessCard", legacy: "access-cards", fields: [["Access Type", "1"]], payload: {access_type_id: 1}},
  {kind: "training", label: "Training & Certifications", action: "createEmployeeTrainingCertificate", legacy: "training-certificates", fields: [["Training Type", "1"]], payload: {training_type_id: 1}},
  {kind: "medical", label: "Medical & Health Records", action: "createEmployeeMedicalRecord", legacy: "medical-records", fields: [["Medical Record Type", "1"], ["Examination Date", "2026-10-01"]], payload: {medical_record_type_id: 1, examination_date: "2026-10-01"}},
] as const;
it.each(remainingCreates)("real $kind manual create bridge sends one confirmed kind notification through its parent save closure", async item => {
  const view = mount(); await screen.findByText("Synthetic identity"); const key = shadowKey(item.kind), other = shadowKey(item.kind, 8);
  view.client.setQueryData(key, {marker: "original"}); view.client.setQueryData(other, {marker: "other employee"}); const spy = vi.spyOn(view.client, "invalidateQueries");
  await add(item.label); fireEvent.click(screen.getByRole("button", {name: /Enter Manually/})); const dialog = screen.getByRole("dialog");
  for (const [label, value] of item.fields) fireEvent.change(within(dialog).getByLabelText(label), {target: {value}});
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "SYNTHETIC_CREATE_NOTE"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(item.action, [7, expect.objectContaining({...item.payload, dms_document_id: null, notes: "SYNTHETIC_CREATE_NOTE"}),expect.objectContaining({operationId:expect.any(String),revision:null})]));
  expect(state.mutate).toHaveBeenCalledTimes(1); await waitFor(() => expect(view.client.getQueryState(key)?.isInvalidated).toBe(true));
  expect(view.client.getQueryState(other)?.isInvalidated).toBe(false);
  expect(spy.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(["hr", "compliance", item.legacy, 7]))).toHaveLength(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(locked()).toBe(false);
});

it("actual form retires private scope state without remounting or losing its profile draft, and old closes cannot unlock B", async () => {
  const view = mount(); await screen.findByText("Synthetic identity");
  fireEvent.change(screen.getByLabelText("Profile name"), {target: {value: "RETAINED_PROFILE_DRAFT"}});
  const saveSession = state.store!.getViewState("draft:tab:owner:employee-workspace-form:actor:7:compliance-parent:save");
  expect(saveSession).toBeDefined();
  await manual(); const old = state.dialogs.get("Review & Save Legal Document")!; expect(locked()).toBe(true);
  view.replace(scopedB); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(locked()).toBe(false); expect((screen.getByLabelText("Profile name") as HTMLInputElement).value).toBe("RETAINED_PROFILE_DRAFT");
  expect(state.store!.getViewState("draft:tab:owner:employee-workspace-form:actor:7:compliance-parent:save")).toBe(saveSession); expect(state.mounts).toBe(1);
  const b = await manual(); fireEvent.change(within(b).getByLabelText("Identity number"), {target: {value: "PRIVATE-B"}});
  await act(async () => {old.close(false); old.close(true); old.submit?.();});
  expect(locked()).toBe(true); expect((screen.getByLabelText("Identity number") as HTMLInputElement).value).toBe("PRIVATE-B"); expect(state.mutate).not.toHaveBeenCalled();
});
it.each(["success","unknown"] as const)("actual identity pending %s keeps the opaque ABA gate until explicit reconciliation",async outcome=>{
 const pending=deferred<{success:true;data:{id:number}}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const key=shadowKey("identity");view.client.setQueryData(key,{marker:"old"});
 const dialog=await manual(),old=state.dialogs.get("Review & Save Legal Document")!;fireEvent.click(within(dialog).getByRole("button",{name:/^Save/}));
 await waitFor(()=>expect(primaryCalls("createEmployeeIdentityDocument")).toHaveLength(1));const op=primaryCalls("createEmployeeIdentityDocument")[0][1][2].operationId;
 view.replace(scopedB);view.replace(auth);await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 fireEvent.click(within(collection()).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();expect(locked()).toBe(false);
 await act(async()=>{old.submit?.();if(outcome==="success")pending.resolve({success:true,data:{id:17}});else pending.reject(Error("Synthetic response lost"));});
 expect(screen.queryByRole("dialog")).toBeNull();expect(state.success).not.toHaveBeenCalled();expect(primaryCalls("createEmployeeIdentityDocument")).toHaveLength(1);
 expect(view.client.getQueryState(key)?.isInvalidated??false).toBe(outcome==="success");
 if(outcome==="success")state.reconcile.mockResolvedValue({success:true,data:{kind:"identity-document",id:17,employee_id:7,operation_id:op,revision:"1",replayed:true}});
 const check=await screen.findByRole("button",{name:"Check earlier result"});fireEvent.click(check);await waitFor(()=>expect(state.reconcile).toHaveBeenCalledWith(op));
 if(outcome==="success"){await waitFor(()=>expect(screen.queryByRole("button",{name:"Check earlier result"})).toBeNull());await add();expect(screen.getByRole("button",{name:/Enter Manually/})).toBeTruthy();}
 else{await screen.findByText("Synthetic receipt remains unconfirmed");fireEvent.click(within(collection()).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();}
 expect(primaryCalls("createEmployeeIdentityDocument")).toHaveLength(1);expect(state.mounts).toBe(1);
});
it("actual identity pending prefill cannot publish into a reopened same-principal ABA generation", async () => {
  const pending = deferred<ReturnType<typeof prefill>>(); state.prefill.mockReturnValue(pending.promise); const view = mount(); await screen.findByText("Synthetic identity");
  await add(); fireEvent.click(screen.getByRole("button", {name: /From DMS Document/})); fireEvent.click(await screen.findByRole("button", {name: /Synthetic document 1/})); fireEvent.click(screen.getByRole("button", {name: "Continue"}));
  await waitFor(() => expect(state.prefill).toHaveBeenCalledTimes(1)); view.replace(scopedB); view.replace(auth);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await add(); await act(async () => {pending.resolve(prefill());});
  expect(screen.getByRole("button", {name: /Enter Manually/})).toBeTruthy(); expect(locked()).toBe(true); expect(state.mounts).toBe(1); expect(state.mutate).not.toHaveBeenCalled();
});
it("actual parent aggregates exact leases independently of a surviving legacy child lock", async () => {
  mount(); await screen.findByText("Synthetic identity"); fireEvent.click(screen.getAllByRole("button", {name: "Time"})[0]);
  expect(state.legacy).toBeTypeOf("function"); expect(state.leases).toBeTypeOf("function"); const a = {}, b = {};
  act(() => {state.leases!(a, true); state.leases!(b, true); state.leases!(a, false); state.leases!(a, false);}); expect(locked()).toBe(true);
  act(() => {state.legacy!(true); state.leases!(b, false);}); expect(locked()).toBe(true);
  act(() => {state.legacy!(false);}); expect(locked()).toBe(false);
});
it("terminal read denial retires the actual portal and releases the actual shell lock", async () => {
  const view = mount(); await screen.findByText("Synthetic identity"); await manual(); const old = state.dialogs.get("Review & Save Legal Document")!;
  state.read.mockRejectedValue(new ReadError("Synthetic denied", 403)); await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "compliance-records"]});});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(locked()).toBe(false); await act(async () => {old.close(true); old.submit?.();}); expect(locked()).toBe(false); expect(state.mutate).not.toHaveBeenCalled();
});
it.each(["Legal Documents", "Dependents"])("real %s parent admits both batch items and sends one settled kind notification", async label => {
  const view = mount(); await screen.findByText("Synthetic identity"); const spy = vi.spyOn(view.client, "invalidateQueries");
  await add(label); fireEvent.click(screen.getByRole("button", {name: /From DMS Document/}));
  for (const id of [1, 2]) fireEvent.click(await screen.findByRole("button", {name: new RegExp(`Synthetic document ${id}`)}));
  fireEvent.click(screen.getByRole("button", {name: "Create 2 Records"})); await screen.findByRole("button", {name: "Done"});
  expect(primaryCalls(label === "Dependents" ? "createEmployeeDependent" : "createEmployeeIdentityDocument")).toHaveLength(2);
  const legacy = label === "Dependents" ? "dependents" : "identity-documents";
  expect(spy.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(["hr", "compliance", legacy, 7]))).toHaveLength(1);
  expect(screen.getByText(/2 created.*0 failed.*0 not submitted/)).toBeTruthy();
});
it.each(["add","edit"] as const)("atomic dependent %s retains record/evidence operation through response loss and reconciles once",async mode=>{
 const pending=deferred<{success:true;data:{id:number}}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const key=shadowKey("dependents");view.client.setQueryData(key,{marker:"old"});
 const dialog=mode==="add"?await manual("Dependents"):await openEdit(editKinds[2]);
 fireEvent.click(within(dialog).getByRole("button",{name:"Stage synthetic link"}));fireEvent.click(within(dialog).getByRole("button",{name:/^Save/}));
 const action=mode==="add"?"createEmployeeDependent":"updateEmployeeDependent";await waitFor(()=>expect(primaryCalls(action)).toHaveLength(1));
 const original=structuredClone(primaryCalls(action)[0]);expect(original[1][2]).toMatchObject({addDocumentIds:[41],removeDocumentIds:[]});
 expect(primaryCalls("applyEmployeeDependentDocumentLinks")).toHaveLength(0);expect(view.client.getQueryState(key)?.isInvalidated).toBe(false);
 await act(async()=>{pending.reject(Error("Synthetic atomic response lost"));});
 expect(view.client.getQueryState(key)?.isInvalidated).toBe(false);expect(state.success).not.toHaveBeenCalled();
 state.mutate.mockResolvedValue({success:true,data:{id:17}});
 fireEvent.click(await screen.findByRole("button",{name:"Retry original dependent save"}));
 await waitFor(()=>expect(primaryCalls(action)).toHaveLength(2));expect(primaryCalls(action)[1]).toEqual(original);
 await waitFor(()=>expect(view.client.getQueryState(key)?.isInvalidated).toBe(true));expect(primaryCalls("applyEmployeeDependentDocumentLinks")).toHaveLength(0);
});

it("an actual principal session remount releases only its own lease and late success cannot unlock the replacement", async () => {
  const pending = deferred<{success: true; data: {id: number}}>(); state.mutate.mockReturnValue(pending.promise);
  const view = mount(); await screen.findByText("Synthetic identity"); const key = shadowKey("identity"); view.client.setQueryData(key, {marker: "old"});
  const dialog = await manual(), old = state.dialogs.get("Review & Save Legal Document")!;
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  view.replace({...auth, profile: {...auth.profile, id: 8, auth_user_id: "compliance-parent-b"}});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(locked()).toBe(false);
  const replacement = await manual(); fireEvent.change(within(replacement).getByLabelText("Identity number"), {target: {value: "PRINCIPAL_B"}});
  await act(async () => {pending.resolve({success: true, data: {id: 17}}); old.close(false);});
  expect(locked()).toBe(true); expect((screen.getByLabelText("Identity number") as HTMLInputElement).value).toBe("PRINCIPAL_B");
  expect(view.client.getQueryState(key)?.isInvalidated).toBe(true); expect(state.success).not.toHaveBeenCalled(); expect(state.mutate).toHaveBeenCalledTimes(1);
});

it("a retired dependent atomic receipt cannot borrow a replacement scope's links or acknowledge its editor",async()=>{
 const pending=deferred<{success:true;data:{id:number}}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const key=shadowKey("dependents");view.client.setQueryData(key,{marker:"old"});
 const first=await manual("Dependents");fireEvent.click(within(first).getByRole("button",{name:"Stage synthetic link"}));fireEvent.click(within(first).getByRole("button",{name:/^Save/}));
 await waitFor(()=>expect(primaryCalls("createEmployeeDependent")).toHaveLength(1));view.replace(scopedB);await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 const replacementAdd=within(collection("Dependents")).queryByRole("button",{name:"Add"});if(replacementAdd)fireEvent.click(replacementAdd);expect(screen.queryByRole("dialog")).toBeNull();
 const original=primaryCalls("createEmployeeDependent")[0];expect(original[1][2]).toMatchObject({addDocumentIds:[41]});state.error.mockClear();
 await act(async()=>{pending.resolve({success:true,data:{id:17}});});
 expect(primaryCalls("createEmployeeDependent")).toHaveLength(1);expect(primaryCalls("applyEmployeeDependentDocumentLinks")).toHaveLength(0);
 expect(view.client.getQueryState(key)?.isInvalidated).toBe(true);expect(screen.queryByRole("dialog")).toBeNull();expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
 expect(state.store!.getViewState("draft:tab:owner:f11-dependent:7:7:editor")).not.toContain("Synthetic dependent");
});

it.each(["false","unknown"] as const)("retired dependent atomic %s outcome cannot invent a partial saved fact",async outcome=>{
 const pending=deferred<{success:false;error:string}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const key=shadowKey("dependents");view.client.setQueryData(key,{marker:"old"});
 const first=await manual("Dependents");fireEvent.click(within(first).getByRole("button",{name:"Stage synthetic link"}));fireEvent.click(within(first).getByRole("button",{name:/^Save/}));
 await waitFor(()=>expect(primaryCalls("createEmployeeDependent")).toHaveLength(1));view.replace(scopedB);await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 await act(async()=>{if(outcome==="unknown")pending.reject(Error("Synthetic unknown atomic outcome"));else pending.resolve({success:false,error:"Rejected atomic operation"});});
 expect(view.client.getQueryState(key)?.isInvalidated).toBe(false);expect(primaryCalls("applyEmployeeDependentDocumentLinks")).toHaveLength(0);expect(state.success).not.toHaveBeenCalled();
 fireEvent.click(within(collection("Dependents")).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();expect(primaryCalls("createEmployeeDependent")).toHaveLength(1);
});

it.each(["Legal Documents", "Dependents"])("real %s parent flushes an earlier batch commit after the next prefill retires", async label => {
  const next = deferred<ReturnType<typeof prefill>>(), genericNext = deferred<{success: true; data: {fields: {dependent_name_en: string; relationship_type_id: number}}}>();
  if (label === "Legal Documents") state.prefill.mockResolvedValueOnce(prefill()).mockReturnValueOnce(next.promise);
  else state.genericPrefill.mockResolvedValueOnce({success: true, data: {dms_document_id: 1, fields: {dependent_name_en: "Synthetic first", relationship_type_id: 1}}}).mockReturnValueOnce(genericNext.promise);
  const view = mount(); await screen.findByText("Synthetic identity"); const key = shadowKey(label === "Dependents" ? "dependents" : "identity"); view.client.setQueryData(key, {marker: "old"});
  const spy = vi.spyOn(view.client, "invalidateQueries"); await add(label); fireEvent.click(screen.getByRole("button", {name: /From DMS Document/}));
  for (const id of [1, 2]) fireEvent.click(await screen.findByRole("button", {name: new RegExp(`Synthetic document ${id}`)}));
  fireEvent.click(screen.getByRole("button", {name: "Create 2 Records"}));
  await waitFor(() => expect(label === "Dependents" ? state.genericPrefill : state.prefill).toHaveBeenCalledTimes(2));
  expect(view.client.getQueryState(key)?.isInvalidated).toBe(false); view.replace(scopedB); view.replace(auth);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await add(label);
  await act(async () => {if (label === "Dependents") genericNext.resolve({success: true, data: {fields: {dependent_name_en: "Retired second", relationship_type_id: 1}}}); else next.resolve(prefill(2));});
  expect(primaryCalls(label === "Dependents" ? "createEmployeeDependent" : "createEmployeeIdentityDocument")).toHaveLength(1);
  const legacy = label === "Dependents" ? "dependents" : "identity-documents";
  expect(spy.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(["hr", "compliance", legacy, 7]))).toHaveLength(1);
  expect(view.client.getQueryState(key)?.isInvalidated).toBe(true); expect(locked()).toBe(true); expect(state.success).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: /Enter Manually/})).toBeTruthy();
});

const editKinds = [
  {kind: "identity", label: "Legal Documents", title: "Edit Identity Document", action: "updateEmployeeIdentityDocument", legacy: "identity-documents"},
  {kind: "insurance", label: "Medical Insurance", title: "Edit Medical Insurance", action: "updateEmployeeMedicalInsurance", legacy: "medical-insurances"},
  {kind: "dependents", label: "Dependents", title: "Edit Dependent", action: "updateEmployeeDependent", legacy: "dependents"},
  {kind: "cards", label: "Access Cards & Passes", title: "Edit Access Card", action: "updateEmployeeAccessCard", legacy: "access-cards"},
  {kind: "training", label: "Training & Certifications", title: "Edit Certificate", action: "updateEmployeeTrainingCertificate", legacy: "training-certificates"},
  {kind: "medical", label: "Medical & Health Records", title: "Edit Medical Record", action: "updateEmployeeMedicalRecord", legacy: "medical-records"},
] as const;
type EditKind = typeof editKinds[number];
it.each(["cold", "retained unavailable"] as const)("retry episode: one actual %s Edit click opens after 503 then automatic successful retry", async cacheState => {
  const item = editKinds[0], view = mount(); await screen.findByText("Synthetic identity");
  if (cacheState === "retained unavailable") {await openEdit(item); await retireDetailOpening(view, item);}
  const queryKey = ["hr", "compliance-records", 7, item.kind, complianceReadIdentity(auth), "detail", 17];
  const retained = view.client.getQueryCache().find({queryKey, exact: true}), held = deferred<ReturnType<typeof complianceFixtureReply>>();
  if (cacheState === "retained unavailable") {expect(retained?.getObserversCount()).toBe(0); expect(retained?.state.data).toMatchObject({data: {availability: "unavailable"}});}
  let dispatches = 0; const episodes: Array<Promise<unknown> | undefined> = [];
  state.read.mockImplementation(async (_: string, p: {kind: ComplianceKind; employeeId: number; operation: string; recordId?: number}) => {
    if (p.kind === item.kind && p.operation === "detail" && p.recordId === 17) {
      dispatches++; episodes.push(view.client.getQueryCache().find({queryKey, exact: true})?.promise);
      if (dispatches === 1) throw new ReadError("Synthetic transient first attempt", 503);
      return held.promise;
    }
    return normalRead(_, p);
  });
  const button = within(collection(item.label)).getByRole("button", {name: "Edit"});
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
  await waitFor(() => expect(dispatches).toBe(2)); await act(async () => {});
  expect(episodes[0]).toBeDefined(); expect(episodes[1]).toBe(episodes[0]);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
  await act(async () => {held.resolve(complianceFixtureReply({operation: "detail", kind: item.kind, employeeId: 7, recordId: 17}, [complianceFixture(item.kind, 17, 7, {notes: "AUTOMATIC_RETRY_FRESH_NOTE"})]));});
  expect(view.client.getQueryData(queryKey)).toMatchObject({data: {row: {notes: "AUTOMATIC_RETRY_FRESH_NOTE"}}});
  const dialog = await screen.findByRole("dialog", {name: item.title});
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("AUTOMATIC_RETRY_FRESH_NOTE");
  await waitFor(() => expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(false));
  expect(dispatches).toBe(2); expect(locked()).toBe(true); expect(state.mutate).not.toHaveBeenCalled();
  if (retained) expect(view.client.getQueryCache().find({queryKey, exact: true})).toBe(retained);
});
it.each(editKinds)("retained-cache first reopen: one $kind Edit click waits for and admits its own fresh verification", async item => {
  const view = mount(); await screen.findByText("Synthetic identity");
  const initial = await openEdit(item); expect((within(initial).getByLabelText("Notes") as HTMLInputElement).value).toBe("INITIAL_PRIVATE_NOTE");
  await retireDetailOpening(view, item);
  const queryKey = ["hr", "compliance-records", 7, item.kind, complianceReadIdentity(auth), "detail", 17];
  const retained = view.client.getQueryCache().find({queryKey, exact: true})!;
  expect(retained.getObserversCount()).toBe(0); expect(retained.state.data).toMatchObject({data: {availability: "unavailable"}});
  const unavailableData = retained.state.data, held = deferred<ReturnType<typeof complianceFixtureReply>>(); let signal: AbortSignal | undefined, dispatches = 0;
  const otherKey = ["hr", "compliance-records", 8, item.kind, "synthetic-sibling", "detail", 17];
  view.client.setQueryData(otherKey, {marker: "UNRELATED_EMPLOYEE"});
  state.read.mockImplementation(async (_: string, p: {kind: ComplianceKind; employeeId: number; operation: string; recordId?: number}, requestSignal: AbortSignal) => {
    if (p.kind === item.kind && p.operation === "detail" && p.recordId === 17) {dispatches++; signal = requestSignal; return held.promise;}
    return normalRead(_, p);
  });
  const button = within(collection(item.label)).getByRole("button", {name: item.kind === "identity" ? "Edit" : "Edit record"});
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
  await waitFor(() => expect(dispatches).toBe(1)); await act(async () => {});
  expect(retained.state.data).toBe(unavailableData); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
  expect(view.client.getQueryCache().find({queryKey, exact: true})).toBe(retained);
  await act(async () => {held.resolve(complianceFixtureReply({operation: "detail", kind: item.kind, employeeId: 7, recordId: 17}, [complianceFixture(item.kind, 17, 7, {notes: "FRESH_SINGLE_CLICK_NOTE"})]));});
  const reopened = await screen.findByRole("dialog", {name: item.title});
  expect((within(reopened).getByLabelText("Notes") as HTMLInputElement).value).toBe("FRESH_SINGLE_CLICK_NOTE");
  await waitFor(() => expect((within(reopened).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(false));
  expect(signal!.aborted).toBe(false); expect(locked()).toBe(true); expect(dispatches).toBe(1); expect(state.mutate).not.toHaveBeenCalled();
  expect(view.client.getQueryData(otherKey)).toEqual({marker: "UNRELATED_EMPLOYEE"});
  expect(view.client.getQueryCache().find({queryKey, exact: true})).toBe(retained);
});
const normalRead = async (route: string, p: {kind: ComplianceKind; employeeId: number;dependentId?:number|null}) => {
 if(route==="hr-linked-documents"){const r=await state.docs();if(!r.success)throw Error(r.error);return {success:true,data:{employeeId:p.employeeId,dependentId:p.dependentId??null,rows:r.data.map((d:typeof documents[number])=>({...d,link_id:d.id}))}};}
 return complianceFixtureReply(p,[complianceFixture(p.kind,17,p.employeeId)]);
};
async function openEdit(item: EditKind) {
  const button = within(collection(item.label)).getByRole("button", {name: item.kind === "identity" ? "Edit" : "Edit record"});
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
  const dialog = await screen.findByRole("dialog", {name: item.title});
  // Opening a saved record verifies its historical selected lookup separately.
  // A visible dialog is not permission to submit while that read is pending.
  await waitFor(() => expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(false));
  return dialog;
}
async function retireDetailOpening(view: ReturnType<typeof mount>, item: EditKind) {
  state.read.mockImplementation(async (_: string, p: {kind: ComplianceKind; employeeId: number; operation: string; recordId?: number}) =>
    complianceFixtureReply(p, p.kind === item.kind && p.operation === "detail" && p.recordId === 17 ? [] : [complianceFixture(p.kind, 17, p.employeeId)]));
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "compliance-records", 7, item.kind, complianceReadIdentity(auth), "detail", 17], exact: true});});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(locked()).toBe(false);
  // Keep the same auth, provider, store and section. The real reader initiates
  // page recovery after the explicit unavailable detail, not a test remount.
  state.read.mockImplementation(normalRead);
  await waitFor(() => expect((within(collection(item.label)).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false));
}
async function replacementAdd(item: EditKind) {
  await add(item.label); fireEvent.click(screen.getByRole("button", {name: /Enter Manually/}));
  const dialog = screen.getByRole("dialog"), notes = within(dialog).getByLabelText("Notes");
  expect(notes.closest("[inert]")).toBeNull();
  fireEvent.change(notes, {target: {value: "REPLACEMENT_ADD_DRAFT"}});
  expect((notes as HTMLInputElement).value).toBe("REPLACEMENT_ADD_DRAFT"); expect(locked()).toBe(true);
  return dialog;
}
function watchEditNotification(view: ReturnType<typeof mount>, item: EditKind) {
  const key = shadowKey(item.kind), other = shadowKey(item.kind, 8);
  view.client.setQueryData(key, {marker: "original employee"}); view.client.setQueryData(other, {marker: "unrelated employee"});
  const spy = vi.spyOn(view.client, "invalidateQueries");
  return {key, other, count: () => spy.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(["hr", "compliance", item.legacy, 7])).length};
}
function assertReplacement(dialog: HTMLElement) {
  expect(document.body.contains(dialog)).toBe(true);
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("REPLACEMENT_ADD_DRAFT");
  expect(locked()).toBe(true);
}
async function cancelReplacement(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
  fireEvent.click(await screen.findByRole("button", {name: "Discard changes"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
async function reopenRetainedDetail(view: ReturnType<typeof mount>, item: EditKind) {
  const queryKey = ["hr", "compliance-records", 7, item.kind, complianceReadIdentity(auth), "detail", 17];
  const query = view.client.getQueryCache().find({queryKey, exact: true});
  expect(query?.getObserversCount()).toBe(0);
  expect((query?.state.data as {data?: {availability?: string}})?.data?.availability).toBe("unavailable");
  const previous = query?.state.data, held = deferred<ReturnType<typeof complianceFixtureReply>>(); let dispatches = 0;
  state.read.mockImplementation(async (_: string, p: {kind: ComplianceKind; employeeId: number; operation: string; recordId?: number}) => {
    if (p.kind === item.kind && p.operation === "detail" && p.recordId === 17) {dispatches++; return held.promise;}
    return normalRead(_, p);
  });
  const button = within(collection(item.label)).getByRole("button", {name: item.kind === "identity" ? "Edit" : "Edit record"});
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
  await waitFor(() => expect(dispatches).toBe(1)); await act(async () => {});
  expect(query?.state.data).toBe(previous); expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => {held.resolve(complianceFixtureReply({operation: "detail", kind: item.kind, employeeId: 7, recordId: 17}, [complianceFixture(item.kind)]));});
  state.read.mockImplementation(normalRead);
  const dialog = await screen.findByRole("dialog", {name: item.title});
  expect(view.client.getQueryCache().find({queryKey, exact: true})).toBe(query); expect(dispatches).toBe(1);
  return dialog;
}

it.each(editKinds)("same-owner opening: retired $kind save blocks replacement until its original outcome settles",async item=>{
 const pending=deferred<{success:true;data:{id:number}}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");fireEvent.change(screen.getByLabelText("Profile name"),{target:{value:"RETAINED_PROFILE_DRAFT"}});
 const dialog=await openEdit(item);fireEvent.change(within(dialog).getByLabelText("Notes"),{target:{value:"ORIGINAL_EDIT_DRAFT"}});fireEvent.click(within(dialog).getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(primaryCalls(item.action)).toHaveLength(1));expect(primaryCalls(item.action)[0][1][2]).toMatchObject({operationId:expect.any(String),revision:"1"});
 await retireDetailOpening(view,item);const notice=watchEditNotification(view,item);
 fireEvent.click(within(collection(item.label)).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();
 await act(async()=>{pending.resolve({success:true,data:{id:17}});});await waitFor(()=>expect(notice.count()).toBe(1));
 expect(view.client.getQueryState(notice.key)?.isInvalidated).toBe(true);expect(view.client.getQueryState(notice.other)?.isInvalidated).toBe(false);
 expect(screen.queryByRole("dialog")).toBeNull();expect((screen.getByLabelText("Profile name")as HTMLInputElement).value).toBe("RETAINED_PROFILE_DRAFT");
 expect(state.success).not.toHaveBeenCalled();expect(primaryCalls(item.action)).toHaveLength(1);expect(state.mounts).toBe(1);
});
it.each(editKinds)("same-owner opening: ordinary $kind edit success still closes its own opening and confirms once", async item => {
  const pending = deferred<{success: true; data: {id: number}}>(); state.mutate.mockReturnValue(pending.promise);
  const view = mount(); await screen.findByText("Synthetic identity"); const dialog = await openEdit(item), notice = watchEditNotification(view, item);
  fireEvent.click(within(dialog).getByRole("button", {name: "Save"})); await waitFor(() => expect(primaryCalls(item.action)).toHaveLength(1));
  expect(locked()).toBe(true); expect(notice.count()).toBe(0);
  await act(async () => {pending.resolve({success: true, data: {id: 17}});});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(locked()).toBe(false);
  expect(notice.count()).toBe(1); expect(view.client.getQueryState(notice.key)?.isInvalidated).toBe(true);
  expect(view.client.getQueryState(notice.other)?.isInvalidated).toBe(false); expect(state.success).toHaveBeenCalledTimes(1); expect(state.mutate).toHaveBeenCalledTimes(1);
});

it("same-owner opening: an unresolved edit cannot reopen or revive its older completion",async()=>{
 const item=editKinds[0],pending=deferred<{success:true;data:{id:number}}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const first=await openEdit(item);fireEvent.click(within(first).getByRole("button",{name:"Save"}));await waitFor(()=>expect(primaryCalls(item.action)).toHaveLength(1));
 await retireDetailOpening(view,item);const notice=watchEditNotification(view,item);
 fireEvent.click(within(collection(item.label)).getByRole("button",{name:"Edit"}));expect(screen.queryByRole("dialog")).toBeNull();
 await act(async()=>{pending.resolve({success:true,data:{id:17}});});await waitFor(()=>expect(notice.count()).toBe(1));
 expect(screen.queryByRole("dialog")).toBeNull();expect(locked()).toBe(false);expect(state.success).not.toHaveBeenCalled();expect(primaryCalls(item.action)).toHaveLength(1);
});
it.each(["rejected","unknown"]as const)("same-owner opening: old edit %s never replaces an unresolved operation",async outcome=>{
 const item=editKinds[0],pending=deferred<{success:false;error:string}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const first=await openEdit(item);fireEvent.click(within(first).getByRole("button",{name:"Save"}));await waitFor(()=>expect(primaryCalls(item.action)).toHaveLength(1));
 await retireDetailOpening(view,item);const notice=watchEditNotification(view,item);fireEvent.click(within(collection(item.label)).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();
 await act(async()=>{if(outcome==="unknown")pending.reject(Error("Synthetic response lost"));else pending.resolve({success:false,error:"Original opening rejected"});});
 expect(notice.count()).toBe(0);expect(view.client.getQueryState(notice.key)?.isInvalidated).toBe(false);expect(state.success).not.toHaveBeenCalled();expect(primaryCalls(item.action)).toHaveLength(1);
 if(outcome==="unknown"){
  const keep=await screen.findByRole("button",{name:"Keep recovery for later"});fireEvent.click(keep);
  fireEvent.click(await screen.findByRole("button",{name:"Check earlier result"}));await screen.findByText("Synthetic receipt remains unconfirmed");
  fireEvent.click(within(collection(item.label)).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();expect(primaryCalls(item.action)).toHaveLength(1);
 }
});
it("same-owner retired dependent keeps its original evidence contract and blocks a second operation",async()=>{
 const item=editKinds[2],pending=deferred<{success:true;data:{id:number}}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const first=await openEdit(item);
 fireEvent.click(within(first).getByRole("button",{name:"Stage synthetic link"}));fireEvent.click(within(first).getByRole("button",{name:"Save"}));await waitFor(()=>expect(primaryCalls(item.action)).toHaveLength(1));
 const original=structuredClone(primaryCalls(item.action)[0]);await retireDetailOpening(view,item);const notice=watchEditNotification(view,item);
 fireEvent.click(within(collection(item.label)).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();state.error.mockClear();
 await act(async()=>{pending.resolve({success:true,data:{id:17}});});expect(notice.count()).toBe(1);expect(primaryCalls("applyEmployeeDependentDocumentLinks")).toHaveLength(0);
 expect(primaryCalls(item.action)).toEqual([original]);expect(screen.queryByRole("dialog")).toBeNull();expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
});

// F11 replaces the old independently-dispatched record/link phases. Exercise
// the same success/rejection/unknown matrix as ONE revision-bound operation.
it.each(["success","rejected","unknown"] as const)("same-owner atomic record/evidence settles %s without replacing a retired editor",async outcome=>{
 const item=editKinds[2],pending=deferred<{success:boolean;data?:{id:number};error?:string}>();state.mutate.mockReturnValue(pending.promise);
 const view=mount();await screen.findByText("Synthetic identity");const first=await openEdit(item);
 fireEvent.click(within(first).getByRole("button",{name:"Stage synthetic link"}));fireEvent.click(within(first).getByRole("button",{name:"Save"}));await waitFor(()=>expect(primaryCalls(item.action)).toHaveLength(1));
 await retireDetailOpening(view,item);const notice=watchEditNotification(view,item);fireEvent.click(within(collection(item.label)).getByRole("button",{name:"Add"}));expect(screen.queryByRole("dialog")).toBeNull();state.error.mockClear();
 await act(async()=>{if(outcome==="unknown")pending.reject(Error("Synthetic response lost"));else pending.resolve(outcome==="success"?{success:true,data:{id:17}}:{success:false,error:"Atomic save rejected"});});
 expect(notice.count()).toBe(outcome==="success"?1:0);expect(primaryCalls("applyEmployeeDependentDocumentLinks")).toHaveLength(0);expect(primaryCalls(item.action)).toHaveLength(1);expect(state.success).not.toHaveBeenCalled();expect(screen.queryByRole("dialog")).toBeNull();
});
