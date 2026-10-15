// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider, QueryObserver} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {EmployeeComplianceTab} from "@/features/hr/employees/tabs/employee-compliance-tab";
import {ReadError} from "@/lib/reads/client";
import {queryKeys} from "@/lib/query/query-keys";
import {syntheticAuthContext} from "./fixtures/auth-context";
import {complianceFixture, complianceFixtureReply} from "./fixtures/compliance-record-fixture";
import {type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";

const state = vi.hoisted(() => ({read: vi.fn(), list: vi.fn(), mutate: vi.fn(), settings: vi.fn(), failed: false, error: vi.fn(), success: vi.fn(), submits: new Map<string, (() => unknown) | undefined>()}));
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
// Direct edit/archive/verify coverage: real parent, table and portaled edit form.
// Actual add adapters and EmployeeWorkspaceForm are covered in the parent-lifetime suite.
// Unrelated document/AI flows,
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
const identity = {id: 17, employee_id: 7, document_type_id: 1, document_number: "SYNTHETIC-ID-001", issue_date: null, expiry_date: "2027-01-01", issuing_authority: null,
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
  state.failed = false;
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
  const tree = (ctx: AuthContext, id: number) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><EmployeeComplianceTab employeeId={id} authContext={ctx} /></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree(context, employeeId));
  return {...view, client, replace: (ctx: AuthContext, id = employeeId) => view.rerender(tree(ctx, id))};
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
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}

const shadow = (kind: ComplianceKind, employeeId = 7) => ["hr", "compliance-records", employeeId, kind, "independent-synthetic-observer", "page", '{"page":2,"pageSize":25}'];
const operations = kinds.flatMap(item => (["edit", "archive", ...(["identity", "insurance", "training"].includes(item[0]) ? ["verify"] : [])] as const).map(verb => ({item, verb})));
it.each(operations)("$item.0 $verb actual confirmed handler reaches its kind/detail/search family exactly once", async ({item, verb}) => {
  const {client} = mount(); await screen.findByText("Synthetic identity");
  const key = shadow(item[0]), detail = [...key.slice(0, 5), "detail", 17], other = shadow(item[0], 8);
  for (const target of [key, detail, other]) client.setQueryData(target, {marker: "retained"});
  const searchKey = ["hr", "search", "results", "synthetic-current", JSON.stringify({mode: "results", query: "Synthetic", categories: ["compliance"], page: 1, pageSize: 50})];
  const suggestions = ["hr", "search", "suggestions", "synthetic-current", "{}"];
  client.setQueryData(searchKey, {revision: 0}); client.setQueryData(suggestions, {revision: 0});
  const searchRead = vi.fn(async () => ({revision: 1})), observer = new QueryObserver(client, {queryKey: searchKey, queryFn: searchRead, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    const spy = vi.spyOn(client, "invalidateQueries");
    if (verb === "edit") {const dialog = await openKind(item); fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));}
    else {await waitFor(() => expect((within(collection(item[1])).getByRole("button", {name: "Add"}) as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(within(collection(item[1])).getByRole("button", {name: verb === "verify" ? /^Verify( record)?$/ : /^Archive( record)?$/}));}
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.mutate.mock.calls[0][0]).toBe(`${verb === "edit" ? "update" : verb}Employee${item[3]}`);
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(detail)?.isInvalidated).toBe(true); expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    await act(async () => {}); expect(searchRead).toHaveBeenCalledTimes(["identity", "cards", "training", "medical"].includes(item[0]) ? 1 : 0);
    expect(client.getQueryState(suggestions)?.isInvalidated).toBe(false);
    const suffix = {identity: "identity-documents", insurance: "medical-insurances", dependents: "dependents", cards: "access-cards", training: "training-certificates", medical: "medical-records"}[item[0]];
    expect(spy.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(["hr", "compliance", suffix, 7]))).toHaveLength(1);
  } finally {stop();}
});
it.each(kinds.filter(item => ["insurance", "cards", "training", "medical"].includes(item[0])).map(item => ({kind: item[0], item})))("$kind direct document-linked edit preserves the entity-document dependency", async ({item}) => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture(input.kind as ComplianceKind, 17, 7, {dms_document_id: 41})]));
  const {client} = mount(); await screen.findByText("Synthetic identity"); const docs = queryKeys.dms.entityDocuments("employee", 7); client.setQueryData(docs, [{id: 41}]);
  const dialog = await openKind(item); fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(state.mutate.mock.calls[0][1][1]).toMatchObject({dms_document_id: 41}); await waitFor(() => expect(client.getQueryState(docs)?.isInvalidated).toBe(true));
});
it("a returned failure never invents a confirmed-write notification and keeps the entered draft", async () => {
  state.mutate.mockResolvedValue({success: false, error: "Synthetic rejected"});
  const {client} = mount(); await screen.findByText("Synthetic identity"); const key = shadow("identity"); client.setQueryData(key, {marker: "old"});
  const dialog = await openKind(kinds[0]); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "RETAINED"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(client.getQueryState(key)?.isInvalidated).toBe(false); expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("RETAINED"); expect(state.success).not.toHaveBeenCalled();
});
it("a late direct edit confirms the original employee but has no replacement-employee UI effect", async () => {
  const pending = deferred<{success: true; data: {id: number}}>(); state.mutate.mockReturnValue(pending.promise);
  const {client, replace} = mount(); await screen.findByText("Synthetic identity"); const old = shadow("identity"), replacement = shadow("identity", 8);
  client.setQueryData(old, {marker: "old"}); client.setQueryData(replacement, {marker: "replacement"});
  const dialog = await openKind(kinds[0]); fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  replace(auth, 8); await screen.findByText("Synthetic identity"); await act(async () => {pending.resolve({success: true, data: {id: 17}});});
  await waitFor(() => expect(client.getQueryState(old)?.isInvalidated).toBe(true)); expect(client.getQueryState(replacement)?.isInvalidated).toBe(false);
  expect(state.success).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.mutate).toHaveBeenCalledTimes(1);
});
