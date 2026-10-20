// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {EmployeeComplianceTab} from "@/features/hr/employees/tabs/employee-compliance-tab";
import {ReadError} from "@/lib/reads/client";
import {complianceFixture, complianceFixtureReply} from "./fixtures/compliance-record-fixture";
import {COMPLIANCE_KINDS, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";
import {syntheticAuthContext} from "./fixtures/auth-context";


// F05 compact forms have no worklist criteria controls. Capture the real
// collection adapter without replacing its renderer, read hook or authority.
// Criteria-injection cases below test controller compatibility, not visible UI.
const embeddedAdapters = vi.hoisted(() => new Map<string, import("@/components/erp/table/erp-table-types").ERPTableServerRead<unknown>>());
vi.mock("@/components/erp/table/record-collection", async original => {
  const actual = await original<typeof import("@/components/erp/table/record-collection")>();
  return {...actual, RecordCollection: (props: React.ComponentProps<typeof actual.RecordCollection>) => {
    if (props.serverRead) embeddedAdapters.set(props.id, props.serverRead);
    return <actual.RecordCollection {...props} />;
  }};
});
function controller(fragment: string) {
  const found = [...embeddedAdapters].find(([id]) => id.includes(fragment))?.[1];
  if (!found) throw Error("Real embedded adapter missing: " + fragment);
  return found;
}
beforeEach(() => embeddedAdapters.clear());

const state = vi.hoisted(() => ({read: vi.fn(), list: vi.fn(), mutate: vi.fn(), settings: vi.fn(), failed: false, store: null as ReturnType<typeof createWorkspaceDraftStore>|null, error: vi.fn(), success: vi.fn(), submits: new Map<string, (() => unknown) | undefined>()}));
// Model the new atomic dependent transport at the existing synthetic mutation
// sink. The real owned-memory session, operation/revision and parent handlers run.
vi.mock("@/server/actions/hr/child-mutation",()=>({
 readComplianceChildRevision:async()=>({success:true,revision:"1"}),
 mutateHrChild:async(request:import("@/lib/hr/child-save-contract").ChildMutation,contract:import("@/lib/hr/child-save-contract").ChildSaveContract)=>{
  const names:Record<string,string>={"identity-document":"IdentityDocument","medical-insurance":"MedicalInsurance","access-card":"AccessCard","training-certificate":"TrainingCertificate","medical-record":"MedicalRecord"};
  const action=request.action==='create'?'create':request.action==='archive'?'archive':request.action==='verify'?'verify':'update';
  const args=action==='archive'||action==='verify'?[request.id,contract,request.employeeId]:[request.id??request.employeeId,request.values,contract];
  const r=await state.mutate(action+"Employee"+names[request.kind],args);
  return r.success?{...r,data:{kind:request.kind,id:r.data.id,employee_id:request.employeeId,operation_id:contract.operationId,revision:String(Number(request.revision??0)+1),replayed:false}}:r;
 },reconcileHrChild:vi.fn(),
}));
vi.mock("@/components/workspace/workspace-draft-provider",()=>({useWorkspaceDraftStoreContext:()=>state.store}));
vi.mock("@/hooks/use-workspace-form-owner",()=>({useWorkspaceFormOwner:()=>({id:"owner"})}));
vi.mock("@/server/actions/hr/dependent-mutation",()=>({
 mutateEmployeeDependent:async(request:import("@/lib/hr/dependent-contract").DependentMutation,contract:import("@/lib/hr/dependent-contract").DependentSaveContract)=>{
  const name=request.kind==="archive"?"archiveEmployeeDependent":request.id===null?"createEmployeeDependent":"updateEmployeeDependent";
  const result=await state.mutate(name,request.kind==="archive"?[request.id,contract,request.employeeId]:[request.id??request.employeeId,request.values,contract]);
  return result.success?{success:true,data:{id:result.data.id,employee_id:request.employeeId,operation_id:contract.operationId,revision:String(Number(request.revision??0)+1),replayed:false}}:result;
 },reconcileDependentMutation:vi.fn(),
}));
vi.mock("@/components/erp/erp-child-dialog-form", async original => {
  const actual = await original<typeof import("@/components/erp/erp-child-dialog-form")>();
  return {...actual, ERPChildDialogForm: (props: React.ComponentProps<typeof actual.ERPChildDialogForm>) => {
    state.submits.set(props.title, props.onSubmit); return <actual.ERPChildDialogForm {...props} />;
  }};
});
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("sonner", () => ({toast: {error: state.error, success: state.success}}));
vi.mock("@/server/actions/hr/compliance", () => Object.fromEntries([
  "listEmployeeIdentityDocuments", "listEmployeeMedicalInsurances", "listEmployeeDependents", "listEmployeeAccessCards", "listEmployeeTrainingCertificates", "listEmployeeMedicalRecords",
  "createEmployeeIdentityDocument", "updateEmployeeIdentityDocument", "archiveEmployeeIdentityDocument", "verifyEmployeeIdentityDocument",
  "createEmployeeMedicalInsurance", "updateEmployeeMedicalInsurance", "archiveEmployeeMedicalInsurance", "verifyEmployeeMedicalInsurance",
  "createEmployeeDependent", "updateEmployeeDependent", "archiveEmployeeDependent", "applyEmployeeDependentDocumentLinks",
  "createEmployeeAccessCard", "updateEmployeeAccessCard", "archiveEmployeeAccessCard",
  "createEmployeeTrainingCertificate", "updateEmployeeTrainingCertificate", "archiveEmployeeTrainingCertificate", "verifyEmployeeTrainingCertificate",
  "createEmployeeMedicalRecord", "updateEmployeeMedicalRecord", "archiveEmployeeMedicalRecord",
].map(name => [name, (...args: unknown[]) => name.startsWith("list") ? state.list(name, args) : state.mutate(name, args)])));
vi.mock("@/lib/reads/hr-record-choice-client", () => Object.fromEntries([
  "listHrIdentityDocumentTypes", "listHrRelationshipTypes", "listHrAccessCardTypes", "listHrTrainingCategories", "listHrTrainingTypes", "listHrMedicalRecordTypes",
].map(name => [name, (...args: unknown[]) => state.settings(name, args)])));
vi.mock("@/server/actions/hr/document-to-record", () => ({checkHrDocumentToRecordEnabled: async () => ({success: true, data: {enabled: false}})}));
// The page, table and shared portaled form are real. Unrelated document/AI flows,
// geography controls and form-field catalog rendering are not acceptance here.
vi.mock("@/features/hr/employees/document-to-record/hr-doc-to-record-wizard", () => ({HrDocumentToRecordWizard: () => null}));
vi.mock("@/features/hr/employees/compliance/identity-document-add-dialog", () => ({IdentityDocumentAddDialog: () => null}));
vi.mock("@/features/hr/employees/compliance/compliance-dms-add-dialog", () => ({ComplianceDmsAddDialog: () => null}));
vi.mock("@/features/hr/employees/compliance/dependent-document-links-section", () => ({DependentDocumentLinksSection: () => null, EMPTY_DEP_LINK_CHANGES: {addDocumentIds: [], removeDocumentIds: []}}));
vi.mock("@/components/erp/geography/country-select", () => ({CountrySelect: () => null}));
vi.mock("@/features/hr/employees/compliance/identity-document-form-fields", () => ({IdentityDocumentFormFields: ({form, setForm}: {form: {document_number: string; notes: string}; setForm: React.Dispatch<React.SetStateAction<{document_number: string; notes: string}>>}) => <>
  <input aria-label="Document Number" value={form.document_number} onChange={event => setForm(previous => ({...previous, document_number: event.target.value}))} />
  <input aria-label="Notes" value={form.notes} onChange={event => setForm(previous => ({...previous, notes: event.target.value}))} />
</>}));

const auth = syntheticAuthContext(["hr.employees.view", "hr.compliance.view", "hr.compliance.manage", "hr.medical.view", "hr.medical.manage"], {id: 7, auth_user_id: "compliance-synthetic-a"});
const clients: QueryClient[] = [];
const identity = {workspace_revision:1,id: 17, employee_id: 7, document_type_id: 1, document_number: "SYNTHETIC-ID-001", issue_date: null, expiry_date: "2027-01-01", issuing_authority: null,
  issuing_authority_party_id: null, issue_country_id: null, issuing_emirate_id: null, issue_city_id: null, status: "active", verification_status: "unverified", verified_by: null, verified_at: null,
  dms_document_id: null, renewal_status: "not_required", emirates_id_application_no: null, visa_file_number: null, uid_number: null, labour_card_number: null, work_permit_number: null,
  mohre_person_code: null, profession_on_document: null, sponsor_company_id: null, place_of_issue: null, notes: "INITIAL_PRIVATE_NOTE", created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z",
  document_type: {id: 1, name_en: "Synthetic identity"}, issue_country: null, issuing_emirate: null, issue_city: null, issuing_authority_party: null, sponsor_company: null};
const access = {canManage: true, medicalView: true, medicalManage: true};
function page(input: Record<string, unknown>) {
  const rows = [input.kind === "identity" ? {...identity, employee_id: input.employeeId} : complianceFixture(input.kind as ComplianceKind, 17, input.employeeId as number)];
  return complianceFixtureReply(input, rows, access);
}
beforeEach(() => {
  state.failed = false; state.store=createWorkspaceDraftStore();
  state.list.mockImplementation(async (name: string) => state.failed ? {success: false, error: "Synthetic read unavailable"} : {success: true, data: name === "listEmployeeIdentityDocuments" ? [identity] : []});
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => {
    if (state.failed) throw new ReadError("Synthetic read unavailable", 503);
    return page(input);
  });
  state.mutate.mockResolvedValue({success: true, data: {id: 17}});
  state.settings.mockResolvedValue({success: true, data: {data: [{id: 1, name_en: "Synthetic type", code: "SYNTH", is_active: true}]}});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.submits.clear(); for (const fn of [state.read, state.list, state.mutate, state.settings, state.error, state.success]) fn.mockReset();});
function mount(context = auth, employeeId = 7) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const tree = (ctx: AuthContext, id: number, cache = client) => <QueryClientProvider client={cache}><WorkspaceUiMemoryProvider><EmployeeComplianceTab employeeId={id} authContext={ctx} /></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree(context, employeeId));
  return {...view, client, replace: (ctx: AuthContext, id = employeeId) => view.rerender(tree(ctx, id)), replaceClient: (cache: QueryClient) => view.rerender(tree(context, employeeId, cache))};
}
function section() {return screen.getByText("Legal Documents", {selector: "span.font-semibold"}).closest("div.mb-8") as HTMLElement;}
async function edit() {
  await screen.findByText("Synthetic identity"); fireEvent.click(within(section()).getByRole("button", {name: "Edit"}));
  return screen.findByRole("dialog", {name: "Edit Identity Document"});
}
const kinds = [
  ["identity", "Legal Documents", "Edit Identity Document", "IdentityDocument"],
  ["insurance", "Medical Insurance", "Edit Medical Insurance", "MedicalInsurance"],
  ["dependents", "Dependents", "Edit Dependent", "Dependent"],
  ["cards", "Access Cards & Passes", "Edit Access Card", "AccessCard"],
  ["training", "Training & Certifications", "Edit Certificate", "TrainingCertificate"],
  ["medical", "Medical & Health Records", "Edit Medical Record", "MedicalRecord"],
] as const;
function collection(label: string) {return screen.getByText(label, {selector: "span.font-semibold"}).closest("div.mb-8") as HTMLElement;}
async function openKind(item: typeof kinds[number]) {
  const root = collection(item[1]);
  await waitFor(() => expect((within(root).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(root).getByRole("button", {name: /^Edit( record)?$/}));
  const dialog = await screen.findByRole("dialog", {name: item[2]});
  await waitFor(() => expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(false));
  return dialog;
}
async function refresh(client: QueryClient, kind: ComplianceKind, part?: "page" | "detail") {
  await act(async () => {await client.invalidateQueries({predicate: q => q.queryKey[0] === "hr" && q.queryKey[1] === "compliance-records" && q.queryKey[3] === kind && (!part || q.queryKey[5] === part)});});
}
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}
it("uses a counted request-bound page in the actual Compliance tab rather than the legacy full array action", async () => {
  mount(); await screen.findByText("Synthetic identity");
  expect(state.read.mock.calls.some(([resource, input]) => resource === "hr-compliance-records" && input.operation === "page" && input.kind === "identity" && input.employeeId === 7 && input.pageSize === 25)).toBe(true);
  expect(state.list).not.toHaveBeenCalled();
});
it("loads selected full detail before admitting the real edit dialog", async () => {
  mount(); const dialog = await edit();
  expect(state.read.mock.calls.some(([resource, input]) => resource === "hr-compliance-records" && input.operation === "detail" && input.recordId === 17)).toBe(true);
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("INITIAL_PRIVATE_NOTE");
});
it("retains a real edit draft but blocks portal dispatch and exposes retry after a failed collection read", async () => {
  const {client} = mount(); const dialog = await edit();
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "UNSAVED_PRIVATE_NOTE"}});
  state.failed = true; await act(async () => {await client.invalidateQueries({predicate: query => query.queryKey[0] === "hr" && query.queryKey.includes(7)});});
  await waitFor(() => expect(client.getQueryCache().getAll().some(query => query.state.status === "error")).toBe(true));
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("UNSAVED_PRIVATE_NOTE");
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  expect(state.mutate).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("button", {name: /Retry.*checks/})).toBeTruthy();
});
it("keeps the existing admitted edit payload and successful save behavior", async () => {
  mount(); const dialog = await edit();
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "Synthetic changed note"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith("updateEmployeeIdentityDocument", [17, expect.objectContaining({document_number: "SYNTHETIC-ID-001", notes: "Synthetic changed note"}),expect.objectContaining({operationId:expect.any(String),revision:'1'})]));
});
it.each(kinds.map(item => ({kind: item[0], item})))("$kind admits exactly one selected detail and one existing update payload", async ({item}) => {
  mount(); const dialog = await openKind(item);
  expect(state.read.mock.calls.filter(([, p]) => p.kind === item[0] && p.operation === "detail")).toHaveLength(1);
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "SYNTHETIC_EDIT_DRAFT"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(`updateEmployee${item[3]}`, [17, expect.objectContaining({notes: "SYNTHETIC_EDIT_DRAFT"}),...(item[0]==='dependents'?[expect.objectContaining({operationId:expect.any(String),revision:'1',addDocumentIds:[],removeDocumentIds:[]})]:[expect.objectContaining({operationId:expect.any(String),revision:'1'})])]));
  expect(state.mutate).toHaveBeenCalledTimes(1);
});
it.each(kinds.map(item => ({kind: item[0], item})))("$kind retains its draft, blocks retained direct submit during a 503 and can recover through its real portal", async ({item}) => {
  const {client} = mount(); const dialog = await openKind(item), retainedSubmit = state.submits.get(item[2])!;
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "PAUSED_DRAFT"}});
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => {if (p.kind === item[0]) throw new ReadError("Synthetic unavailable", 503); return page(p);});
  await refresh(client, item[0]);
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("PAUSED_DRAFT");
  expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {retainedSubmit();}); expect(state.mutate).not.toHaveBeenCalled();
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => page(p));
  fireEvent.click(within(dialog).getByRole("button", {name: "Retry required checks"}));
  await waitFor(() => expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(false));
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("PAUSED_DRAFT");
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(`updateEmployee${item[3]}`, [17, expect.objectContaining({notes: "PAUSED_DRAFT"}),...(item[0]==='dependents'?[expect.objectContaining({operationId:expect.any(String),revision:'1',addDocumentIds:[],removeDocumentIds:[]})]:[expect.objectContaining({operationId:expect.any(String),revision:'1'})])]));
  expect(state.mutate).toHaveBeenCalledTimes(1);
});
it.each(kinds.map(item => ({kind: item[0], item})))("$kind cancels an ordinary unavailable edit without dispatching", async ({item}) => {
  const {client} = mount(); const dialog = await openKind(item);
  state.failed = true; await refresh(client, item[0], "detail");
  fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
  await waitFor(() => expect(screen.queryByRole("dialog", {name: item[2]})).toBeNull()); expect(state.mutate).not.toHaveBeenCalled();
});
it.each([401, 403])("a terminal %s retires all Compliance private content and retained dispatch", async status => {
  const {client} = mount(); await openKind(kinds[0]); const retained = state.submits.get(kinds[0][2])!;
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => {if (p.kind === "identity") throw new ReadError("Permission denied", status); return page(p);});
  await refresh(client, "identity");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText("Synthetic dependent")).toBeNull();
  expect(client.getQueryCache().getAll().some(q => q.queryKey[1] === "compliance-records")).toBe(false);
  await act(async () => {retained();}); expect(state.mutate).not.toHaveBeenCalled();
});
it("a missing child detail retires only its editor and keeps permitted sibling collections", async () => {
  const {client} = mount(); await openKind(kinds[0]); const retained = state.submits.get(kinds[0][2])!;
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "identity" && p.operation === "detail" ? {success: true, data: {...p, availability: "unavailable"}} : page(p));
  await refresh(client, "identity", "detail");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getAllByText("Synthetic dependent").length).toBeGreaterThan(0);
  await waitFor(() => expect((within(section()).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {retained();}); expect(state.mutate).not.toHaveBeenCalled();
  await openKind(kinds[2]);
});
it.each(kinds.map(item => ({kind: item[0], item})))("$kind a closed editor's retained callback cannot dispatch after collection admission recovers", async ({item}) => {
  mount(); const dialog = await openKind(item), retained = state.submits.get(item[2])!;
  fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect((within(collection(item[1])).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {retained();}); expect(state.mutate).not.toHaveBeenCalled();
});
it.each(kinds.map(item => ({kind: item[0], item})))("$kind same-principal scoped ABA retires its edit draft and old direct submit without a session remount", async ({item}) => {
  const view = mount(); const dialog = await openKind(item), retained = state.submits.get(item[2])!;
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "RETIRED_SCOPE_A"}});
  view.replace({...auth, permissionCodes: [...auth.permissionCodes, "hr.compliance.view.team"]});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); view.replace(auth);
  await waitFor(() => expect((within(collection(item[1])).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false));
  const replacement = await openKind(item); fireEvent.change(within(replacement).getByLabelText("Notes"), {target: {value: "REPLACEMENT_SCOPE_A"}});
  await act(async () => {retained();}); expect(state.mutate).not.toHaveBeenCalled();
  expect((within(replacement).getByLabelText("Notes") as HTMLInputElement).value).toBe("REPLACEMENT_SCOPE_A");
});
it("a QueryClient lifetime replacement synchronizes the unchanged criteria snapshot before a new edit", async () => {
  const view = mount(); await screen.findByText("Synthetic identity");
  const replacement = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(replacement);
  const selectedRead = vi.spyOn(replacement, "fetchQuery");
  view.replaceClient(replacement); await screen.findByText("Synthetic identity");
  const dialog = await openKind(kinds[0]); expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("INITIAL_PRIVATE_NOTE");
  expect(replacement.getQueryCache().getAll().some(q => q.queryKey[5] === "detail" && q.queryKey[6] === 17 && q.state.status === "success")).toBe(true);
  expect(selectedRead).toHaveBeenCalledTimes(1);
  // This checks the recreated committed snapshot, not QueryObserver rebinding:
  // provider replacement alone does not remount TanStack's existing observers.
});
it("a kind-only restriction does not retire other authorized collections", async () => {
  const {client} = mount(); await openKind(kinds[5]);
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "medical" ? {success: true, data: {operation: p.operation, kind: p.kind, employeeId: p.employeeId, availability: "restricted"}} : page(p));
  await refresh(client, "medical");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(screen.getByText("Synthetic identity")).toBeTruthy();
  await openKind(kinds[0]);
});
it.each(["account", "employee"] as const)("ignores a late prior %s detail reply and retires its queries", async rotation => {
  const {client, replace} = mount(); await screen.findByText("Synthetic identity");
  const pending = deferred<ReturnType<typeof complianceFixtureReply>>();
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.employeeId === 7 && p.operation === "detail" ? pending.promise : page(p));
  fireEvent.click(within(section()).getByRole("button", {name: "Edit"})); await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.operation === "detail")).toBe(true));
  const oldKeys = client.getQueryCache().getAll().filter(q => q.queryKey[1] === "compliance-records").map(q => q.queryKey);
  replace(rotation === "account" ? {...auth, profile: {...auth.profile!, id: 8, auth_user_id: "compliance-synthetic-b"}} : auth, rotation === "employee" ? 8 : 7);
  await screen.findByText("Synthetic identity");
  await act(async () => {pending.resolve(complianceFixtureReply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}, [identity]));});
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(oldKeys.some(key => client.getQueryState(key))).toBe(false);
  expect(client.getQueryCache().getAll().some(q => q.queryKey[1] === "compliance-records" && q.state.status === "success")).toBe(true);
});
it("verified medical-manage-only loss preserves readable fields but omits them from the dependent payload", async () => {
  const {client} = mount(); const dialog = await openKind(kinds[2]);
  fireEvent.change(within(dialog).getByLabelText("Insurance Provider"), {target: {value: "READABLE_UNSAVED_PROVIDER"}});
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "dependents" ? complianceFixtureReply(p, [complianceFixture("dependents")], {...access, medicalManage: false}) : page(p));
  await refresh(client, "dependents");
  expect((within(dialog).getByLabelText("Insurance Provider") as HTMLInputElement).value).toBe("READABLE_UNSAVED_PROVIDER");
  await waitFor(() => expect((within(dialog).getByLabelText("Insurance Provider") as HTMLInputElement).disabled).toBe(true));
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(state.mutate.mock.calls[0][1][1]).not.toHaveProperty("medical_insurance_provider");
});
it("verified medical-view loss retires dependent private draft/cache and authority restoration does not resurrect it", async () => {
  const {client} = mount(); const dialog = await openKind(kinds[2]);
  fireEvent.change(within(dialog).getByLabelText("Insurance Provider"), {target: {value: "PRIVATE_RETIRED_DRAFT"}});
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "PRESERVED_NONMEDICAL_DRAFT"}});
  const retained = state.submits.get(kinds[2][2])!;
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "dependents" ? complianceFixtureReply(p, [complianceFixture("dependents", 17, 7, {medical_insurance_provider: null, medical_insurance_policy: null, medical_insurance_card: null, medical_insurance_expiry: null})], {...access, medicalView: false, medicalManage: false}) : page(p));
  await refresh(client, "dependents", "page");
  await waitFor(() => expect(within(dialog).queryByLabelText("Insurance Provider")).toBeNull());
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("PRESERVED_NONMEDICAL_DRAFT");
  const privateCache = client.getQueryCache().getAll().filter(q => q.queryKey[1] === "compliance-records" && q.queryKey[3] === "dependents");
  expect(JSON.stringify(privateCache.map(q => q.state.data))).not.toMatch(/SENSITIVE (PROVIDER|POLICY|CARD)|PRIVATE_RETIRED_DRAFT/);
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => page(p)); await refresh(client, "dependents");
  await waitFor(() => expect(within(dialog).getByLabelText("Insurance Provider")).toBeTruthy());
  expect((within(dialog).getByLabelText("Insurance Provider") as HTMLInputElement).value).toBe("");
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("PRESERVED_NONMEDICAL_DRAFT");
  await waitFor(() => expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {retained();}); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(JSON.stringify(state.mutate.mock.calls)).not.toMatch(/PRIVATE_RETIRED_DRAFT|SENSITIVE (PROVIDER|POLICY|CARD)/);
});
it("DL-C actual dependent editor keeps Notes while a held detail refetch loses medical view and cannot restore private draft/cache", async () => {
  const {client} = mount(), dialog = await openKind(kinds[2]);
  fireEvent.change(within(dialog).getByLabelText("Insurance Provider"), {target: {value: "PRIVATE_OVERLAP_DRAFT"}});
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "RETAINED_OVERLAP_NOTES"}});
  const held = deferred<ReturnType<typeof complianceFixtureReply>>(); let signal: AbortSignal | undefined;
  const masked = complianceFixture("dependents", 17, 7, {medical_insurance_provider: null, medical_insurance_policy: null, medical_insurance_card: null, medical_insurance_expiry: null});
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (p.kind !== "dependents") return page(p);
    if (p.operation === "detail") {signal = requestSignal; return held.promise;}
    return complianceFixtureReply(p, [masked], {...access, medicalView: false, medicalManage: false});
  });
  let pending!: Promise<void>;
  act(() => {pending = client.invalidateQueries({predicate: query => query.queryKey[3] === "dependents" && query.queryKey[5] === "detail"});});
  await waitFor(() => expect(signal).toBeTruthy()); expect(signal!.aborted).toBe(false);
  await refresh(client, "dependents", "page");
  await waitFor(() => expect(within(dialog).queryByLabelText("Insurance Provider")).toBeNull());
  expect(signal!.aborted).toBe(true); expect(document.body.contains(dialog)).toBe(true);
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("RETAINED_OVERLAP_NOTES");
  await act(async () => {await pending; held.resolve(complianceFixtureReply({operation: "detail", kind: "dependents", employeeId: 7, recordId: 17}, [complianceFixture("dependents")]));});
  expect(JSON.stringify(client.getQueryCache().getAll().filter(query => query.queryKey[3] === "dependents").map(query => query.state.data))).not.toMatch(/SENSITIVE (PROVIDER|POLICY|CARD)|PRIVATE_OVERLAP_DRAFT/);
  expect(within(dialog).queryByLabelText("Insurance Provider")).toBeNull();
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "dependents" ? complianceFixtureReply(p, [masked], {...access, medicalView: false, medicalManage: false}) : page(p));
  await refresh(client, "dependents"); expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("RETAINED_OVERLAP_NOTES");
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => page(p)); await refresh(client, "dependents");
  await waitFor(() => expect(within(dialog).getByLabelText("Insurance Provider")).toBeTruthy());
  expect((within(dialog).getByLabelText("Insurance Provider") as HTMLInputElement).value).toBe("");
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("RETAINED_OVERLAP_NOTES"); expect(state.mutate).not.toHaveBeenCalled();
});
it("ordinary medical read failure preserves a dependent medical draft instead of classifying it as revoked", async () => {
  const {client} = mount(); const dialog = await openKind(kinds[2]);
  fireEvent.change(within(dialog).getByLabelText("Insurance Provider"), {target: {value: "TEMPORARILY_PAUSED_MEDICAL_DRAFT"}});
  state.failed = true; await refresh(client, "dependents");
  expect((within(dialog).getByLabelText("Insurance Provider") as HTMLInputElement).value).toBe("TEMPORARILY_PAUSED_MEDICAL_DRAFT");
  expect(state.mutate).not.toHaveBeenCalled();
});
it("all six kinds preserve the ordinary entered values after a returned save failure", async () => {
  mount(); state.mutate.mockResolvedValue({success: false, error: "Synthetic save rejected"});
  for (const item of kinds) {
    const dialog = await openKind(item); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: `FAILED_${item[0]}_DRAFT`}});
    fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
    await waitFor(() => expect(state.mutate.mock.calls.some(([name]) => name === `updateEmployee${item[3]}`)).toBe(true));
    expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe(`FAILED_${item[0]}_DRAFT`);
    await waitFor(() => expect((within(dialog).getByRole("button", {name: "Cancel"}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
    fireEvent.click(await screen.findByRole("button", {name: "Discard changes"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
  expect(state.mutate).toHaveBeenCalledTimes(COMPLIANCE_KINDS.length);
});
it("injected immediate criteria stay correctable and are never sent through delayed reads or Retry", async () => {
  mount(); await screen.findByText("Synthetic identity"); const root = section();
  act(() => controller("IdentityDocumentsSection").onGlobalFilterChange("x".repeat(201)));
  await screen.findByText("Review the filters, search length and page criteria. Invalid criteria were not sent.");
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 300));});
  expect(state.read.mock.calls.some(([, p]) => p.search?.length > 200)).toBe(false);
  expect(within(root).getByRole("button", {name: "Clear list criteria"}).closest("[inert]")).toBeNull();
  act(() => controller("IdentityDocumentsSection").onGlobalFilterChange("SYNTHETIC"));
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.kind === "identity" && p.search === "SYNTHETIC")).toBe(true));
  await waitFor(() => expect(within(root).queryByText(/Invalid criteria were not sent/)).toBeNull());
});
it("retained controller sorting sends ordered supported priorities and compact Next remains server paged", async () => {
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "identity"
    ? complianceFixtureReply(p, Array.from({length: 1001}, (_, index) => complianceFixture("identity", index + 1, 7, {document_number: `SYNTH-${index + 1}`}))) : page(p));
  mount(); const root = section(); await waitFor(() => expect(within(root).getByText("Page 1 of 41")).toBeTruthy());
  fireEvent.click(within(root).getByRole("button", {name: "Next"}));
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.kind === "identity" && p.page === 2 && p.pageSize === 25)).toBe(true));
  await waitFor(() => expect((within(root).getByRole("button", {name: "Next"}) as HTMLButtonElement).disabled).toBe(false));
  act(() => controller("IdentityDocumentsSection").onSortingChange([{id: "document_number", desc: false}]));
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.sorting?.[0]?.id === "document_number")).toBe(true));
  await waitFor(() => expect((within(root).getByRole("button", {name: "Next"}) as HTMLButtonElement).disabled).toBe(false));
  act(() => controller("IdentityDocumentsSection").onSortingChange([{id: "document_number", desc: false}, {id: "expiry_date", desc: false}]));
  await waitFor(() => expect(state.read.mock.calls.filter(([, p]) => p.kind === "identity").at(-1)?.[1]).toMatchObject({page: 1, sorting: [{id: "document_number", desc: false}, {id: "expiry_date", desc: false}]}));
});
it("late canceled search data cannot overwrite the current list", async () => {
  const old = deferred<ReturnType<typeof complianceFixtureReply>>(); let oldSignal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>, signal: AbortSignal) => {
    if (p.kind !== "identity" || !p.search) return page(p);
    if (p.search === "OLDER") {oldSignal = signal; return old.promise;}
    return complianceFixtureReply(p, [complianceFixture("identity", 19, 7, {document_number: "CURRENT_RECORD"})]);
  });
  mount(); await screen.findByText("Synthetic identity"); const root = section();
  act(() => controller("IdentityDocumentsSection").onGlobalFilterChange("OLDER")); await waitFor(() => expect(oldSignal).toBeTruthy());
  act(() => controller("IdentityDocumentsSection").onGlobalFilterChange("NEWER")); await waitFor(() => expect(within(root).getAllByText("CURRENT_RECORD").length).toBeGreaterThan(0));
  expect(oldSignal!.aborted).toBe(true);
  await act(async () => {old.resolve(complianceFixtureReply({operation: "page", kind: "identity", employeeId: 7, search: "OLDER"}, [complianceFixture("identity", 18, 7, {document_number: "OLD_RETIRED_RECORD"})]));});
  expect(within(root).queryByText("OLD_RETIRED_RECORD")).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
});
it("a malformed page is unavailable with an unknown count, not an accepted empty list", async () => {
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => p.kind === "identity" ? {success: true, data: {operation: "page", kind: p.kind, employeeId: 7, page: 1, pageSize: 25, totalCount: 0}} : page(p));
  mount(); const root = section(); await waitFor(() => expect(within(root).getByText("Records could not yet be verified. Check the read status or retry.")).toBeTruthy());
  expect(within(root).queryByText(/0 permitted records/)).toBeNull(); expect(within(root).queryByText(/No permitted records match/)).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
});
it("partial selected detail never creates an incomplete edit form and can be explicitly retried", async () => {
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => {
    const result = page(p); if (p.kind === "identity" && p.operation === "detail" && "row" in result.data) delete (result.data.row as Partial<typeof identity>).notes; return result;
  });
  mount(); await screen.findByText("Synthetic identity"); fireEvent.click(within(section()).getByRole("button", {name: "Edit"}));
  await screen.findByText("The complete record could not be verified. Retry before making changes."); expect(screen.queryByRole("dialog")).toBeNull();
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => page(p)); fireEvent.click(screen.getByRole("button", {name: "Retry loading"}));
  await waitFor(() => expect(screen.queryByText("The complete record could not be verified. Retry before making changes.")).toBeNull());
  await openKind(kinds[0]); expect(state.mutate).not.toHaveBeenCalled();
});
it.each(["self", "team"] as const)("established .%s read hints request the authoritative reader without acquiring edit or type-setting authority", async scope => {
  state.settings.mockResolvedValue({success: false, error: "No settings authority"});
  state.read.mockImplementation(async (_: string, p: Record<string, unknown>) => complianceFixtureReply(p, [complianceFixture(p.kind as ComplianceKind)], {...access, canManage: false, medicalManage: false}));
  mount({...auth, permissionCodes: [`hr.employees.view.${scope}`, `hr.compliance.view.${scope}`, `hr.medical.view.${scope}`]});
  await waitFor(() => expect(new Set(state.read.mock.calls.map(([, p]) => p.kind))).toEqual(new Set(COMPLIANCE_KINDS)));
  await waitFor(() => expect(screen.getAllByText("Synthetic dependent").length).toBeGreaterThan(0));
  expect(screen.queryByRole("button", {name: /^Edit( record)?$/})).toBeNull(); expect(screen.queryByRole("button", {name: "Add"})).toBeNull();
  expect(state.settings).not.toHaveBeenCalled(); expect(state.mutate).not.toHaveBeenCalled();
});
it("a self/team hint never turns an authoritative denied-other response into an allowed record", async () => {
  state.read.mockRejectedValue(new ReadError("Permission denied", 403));
  mount({...auth, permissionCodes: ["hr.employees.view.team", "hr.compliance.view.team"]});
  await screen.findByText("You do not have permission to view compliance records. Please contact your administrator.");
  expect(state.read).toHaveBeenCalled();
  expect(screen.queryByText("Synthetic identity")).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
});
it("suspended self-service hints never initiate compliance collection reads", async () => {
  mount({...auth, isAccountActive: false, permissionCodes: ["hr.employees.view.self", "hr.compliance.view.self", "hr.medical.view.self"]});
  await screen.findByText("You do not have permission to view compliance records. Please contact your administrator."); expect(state.read).not.toHaveBeenCalled();
});
