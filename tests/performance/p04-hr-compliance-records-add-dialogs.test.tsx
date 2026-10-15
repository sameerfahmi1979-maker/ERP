// @vitest-environment jsdom
import "../remediation/f05/setup";
import React, {useLayoutEffect, useState} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {ComplianceDmsAddDialog} from "@/features/hr/employees/compliance/compliance-dms-add-dialog";
import {IdentityDocumentAddDialog} from "@/features/hr/employees/compliance/identity-document-add-dialog";
import {useComplianceReadAdmission} from "@/features/hr/employees/compliance/compliance-read-admission";
import {createEmptyIdentityDocumentForm} from "@/lib/hr/compliance/identity-document-form";
import type {HrIdentityDocTypeRow} from "@/server/actions/hr/settings";

const state = vi.hoisted(() => ({documents: vi.fn(), library: vi.fn(), prefill: vi.fn(), identityPrefill: vi.fn(), save: vi.fn(), identitySave: vi.fn(), saved: vi.fn(), error: vi.fn(), success: vi.fn(),
  submits: new Map<string, (() => unknown) | undefined>(), privateForm: {} as Record<string, unknown>}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("@/server/actions/dms/entity-documents", () => ({getDmsDocumentsByEntity: state.documents, getAvailableDmsDocumentsForLink: state.library}));
vi.mock("@/lib/reads/client",async original=>({...await original<typeof import("@/lib/reads/client")>(),readJson:async(route:string,p:{employeeId:number;dependentId?:number|null})=>{
 if(route!=="hr-linked-documents")throw Error("Unexpected read route");
 const r=await state.documents();if(!r.success)throw Error(r.error);return {success:true,data:{employeeId:p.employeeId,dependentId:p.dependentId??null,rows:r.data.map((d:typeof documents[number])=>({...d,link_id:d.id}))}};
}}));
vi.mock("@/server/actions/hr/compliance-dms-prefill", () => ({prefillComplianceRecordFromDms: state.prefill}));
vi.mock("@/server/actions/hr/ai/identity-document-ai-fill", () => ({prefillIdentityDocumentFromDms: state.identityPrefill}));
vi.mock("@/server/actions/hr/compliance", () => ({createEmployeeIdentityDocument: state.identitySave}));
vi.mock("@/components/erp/erp-child-dialog-form", async original => {
  const actual = await original<typeof import("@/components/erp/erp-child-dialog-form")>();
  return {...actual, ERPChildDialogForm: (props: React.ComponentProps<typeof actual.ERPChildDialogForm>) => {
    state.submits.set(props.title, props.onSubmit); return <actual.ERPChildDialogForm {...props} />;
  }};
});
// Actual add wrapper, local admission, QueryClient and shared portaled form.
// Only the identity field catalog and external Server Actions are synthetic.
vi.mock("@/features/hr/employees/compliance/identity-document-form-fields", () => ({IdentityDocumentFormFields: ({form, setForm}: {
  form: ReturnType<typeof createEmptyIdentityDocumentForm>; setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof createEmptyIdentityDocumentForm>>>;
}) => <><input aria-label="Synthetic type" value={form.document_type_id ?? ""} onChange={e => setForm(p => ({...p, document_type_id: Number(e.target.value)}))} />
  <input aria-label="Synthetic number" value={form.document_number} onChange={e => setForm(p => ({...p, document_number: e.target.value}))} /></>}));
type Kind = "identity" | "generic";
type Form = {dms_document_id: number | null; name: string; notes: string; medical_insurance_provider: string; medical_insurance_policy: string; medical_insurance_card: string; medical_insurance_expiry: string};
const empty = (): Form => ({dms_document_id: null, name: "", notes: "", medical_insurance_provider: "", medical_insurance_policy: "", medical_insurance_card: "", medical_insurance_expiry: ""});
const medicalKeys = ["medical_insurance_provider", "medical_insurance_policy", "medical_insurance_card", "medical_insurance_expiry"] as const;
const documents = [1, 2].map(id => ({document_id: id, id, document_no: `SYNTH-DMS-${id}`, title: `Synthetic document ${id}`, status: "approved", document_type_name: "Synthetic", expiry_date: null}));
const prefill = (id = 1) => ({success: true, data: {dms_document_id: id, linkedToEmployee: true, sourceDocument: {document_no: `SYNTH-DMS-${id}`, title: `Synthetic document ${id}`}, prefillSource: "dms_metadata", fields: {name: "Synthetic dependent", notes: "SYNTHETIC_NOTE", medical_insurance_provider: "PRIVATE_PROVIDER", medical_insurance_policy: "PRIVATE_POLICY", medical_insurance_card: "PRIVATE_CARD", medical_insurance_expiry: "2027-01-01"}}});
const identityPrefill = (id = 1) => ({success: true, data: {form: {...createEmptyIdentityDocumentForm(), dms_document_id: id, document_type_id: 1, document_number: `SYNTH-ID-${id}`}, fieldConfidence: {}, sourceDocument: {document_no: `SYNTH-DMS-${id}`, title: `Synthetic document ${id}`}, prefillSource: "dms_metadata", linkedToEmployee: true}});
type Props = {kind: Kind; ready?: boolean; owner?: string; retired?: boolean; revision?: number; withAdmission?: boolean};
function ReviewProbe({form, setForm}: {form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>}) {
  useLayoutEffect(() => {state.privateForm = form;}, [form]);
  return <>{Object.keys(form).filter(key => key !== "dms_document_id").map(key => <input key={key} aria-label={key}
    value={form[key as Exclude<keyof Form, "dms_document_id">]} onChange={e => setForm(p => ({...p, [key]: e.target.value}))} />)}</>;
}
function Harness({kind, ready = true, owner = "A", retired = false, revision = 0, withAdmission = true}: Props) {
  const [open, setOpen] = useState(true); const admission = useComplianceReadAdmission(ready, [], owner);
  return kind === "identity" ? <IdentityDocumentAddDialog open={open} onOpenChange={setOpen} employeeId={7} admission={withAdmission ? admission : undefined}
    docTypes={[{id: 1, name_en: "Synthetic type"}] as HrIdentityDocTypeRow[]} onSaved={state.saved} /> :
    <ComplianceDmsAddDialog open={open} onOpenChange={setOpen} employeeId={7} admission={withAdmission ? admission : undefined}
      recordKind="dependent" recordLabel="Dependent" submitLabel="Save dependent" icon={<span />} createEmptyForm={empty} validate={f => !f.name ? "Name required" : null}
      save={state.save} onSaved={state.saved} privacyRevision={revision} redactForm={f => retired ? {...f, ...Object.fromEntries(medicalKeys.map(key => [key, ""]))} : f}
      renderReview={({form, setForm}) => <ReviewProbe form={form} setForm={setForm} />} />;
}
const clients: QueryClient[] = [];
function mount(props: Props) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}}); clients.push(client);
  const tree = (next: Props) => <QueryClientProvider client={client}><Harness {...next} /></QueryClientProvider>;
  const view = render(tree(props)); return {...view, client, replace: (patch: Partial<Props>) => {props = {...props, ...patch}; view.rerender(tree(props));}};
}
beforeEach(() => {
  state.documents.mockResolvedValue({success: true, data: documents}); state.library.mockResolvedValue({success: true, data: documents});
  state.prefill.mockImplementation(async (_: number, id: number) => prefill(id)); state.identityPrefill.mockImplementation(async (_: number, id: number) => identityPrefill(id));
  state.save.mockResolvedValue({success: true, data: {dmsLinkCreated: true}}); state.identitySave.mockResolvedValue({success: true, data: {id: 17, dmsLinkCreated: true}});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); state.submits.clear(); state.privateForm = {}; for (const fn of [state.documents, state.library, state.prefill, state.identityPrefill, state.save, state.identitySave, state.saved, state.error, state.success]) fn.mockReset();});
const save = (kind: Kind) => kind === "identity" ? state.identitySave : state.save;
const pf = (kind: Kind) => kind === "identity" ? state.identityPrefill : state.prefill;
const result = (kind: Kind) => kind === "identity" ? identityPrefill() : prefill();
function deferred<T>() {let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;}); return {promise, resolve, reject};}
async function manual(kind: Kind) {
  fireEvent.click(await screen.findByRole("button", {name: /Enter Manually/}));
  const dialog = screen.getByRole("dialog");
  if (kind === "identity") {fireEvent.change(within(dialog).getByLabelText("Synthetic type"), {target: {value: "1"}}); fireEvent.change(within(dialog).getByLabelText("Synthetic number"), {target: {value: "SYNTH-NEW"}});}
  else fireEvent.change(within(dialog).getByLabelText("name"), {target: {value: "Synthetic new dependent"}});
  return dialog;
}
async function pick(count = 1) {
  fireEvent.click(await screen.findByRole("button", {name: /From DMS Document/}));
  for (let id = 1; id <= count; id++) fireEvent.click(await screen.findByRole("button", {name: new RegExp(`Synthetic document ${id}`)}));
  const dialog = screen.getByRole("dialog"), button = within(dialog).getByRole("button", {name: count === 1 ? "Continue" : `Create ${count} Records`});
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); return {dialog, button};
}
it.each(["identity", "generic"] as const)("%s defaults remain compatible and an admitted manual save dispatches once", async kind => {
  mount({kind, withAdmission: false}); const dialog = await manual(kind); fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(save(kind)).toHaveBeenCalledTimes(1)); expect(state.saved).toHaveBeenCalledTimes(1);
});
it.each(["identity", "generic"] as const)("%s retains its real manual draft during parent pause and blocks direct retained dispatch", async kind => {
  const view = mount({kind}); const dialog = await manual(kind), submit = [...state.submits.values()].filter(Boolean).at(-1)!;
  view.replace({ready: false});
  expect((within(dialog).getByRole("button", {name: /^Save/}) as HTMLButtonElement).disabled).toBe(true);
  expect(within(dialog).getByRole("button", {name: "Retry required checks"})).toBeTruthy(); await act(async () => {submit();}); expect(save(kind)).not.toHaveBeenCalled();
  expect((within(dialog).getByLabelText(kind === "identity" ? "Synthetic number" : "name") as HTMLInputElement).value).toBe(kind === "identity" ? "SYNTH-NEW" : "Synthetic new dependent");
  view.replace({ready: true}); fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(save(kind)).toHaveBeenCalledTimes(1));
});
it.each(["identity", "generic"] as const)("%s own document read failure cannot become empty success or allow a retained Continue", async kind => {
  const {client} = mount({kind}); const {dialog} = await pick(); const retained = state.submits.get("Choose DMS Documents")!;
  state.documents.mockResolvedValue({success: false, error: "Synthetic unavailable"});
  await act(async () => {await client.invalidateQueries();});
  await waitFor(() => expect((within(dialog).getByRole("button", {name: "Continue"}) as HTMLButtonElement).disabled).toBe(true));
  await act(async () => {retained();}); expect(pf(kind)).not.toHaveBeenCalled(); expect(save(kind)).not.toHaveBeenCalled();
  state.documents.mockResolvedValue({success: true, data: documents}); fireEvent.click(within(dialog).getByRole("button", {name: "Retry required checks"}));
  await waitFor(() => expect((within(dialog).getByRole("button", {name: "Continue"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole("button", {name: "Continue"})); await waitFor(() => expect(pf(kind)).toHaveBeenCalledTimes(1));
});
it.each(["identity", "generic"] as const)("%s an initial own-document failure is not labelled an empty library", async kind => {
  state.documents.mockResolvedValue({success: false, error: "Synthetic unavailable"}); mount({kind});
  fireEvent.click(await screen.findByRole("button", {name: /From DMS Document/}));
  const dialog = screen.getByRole("dialog"); await waitFor(() => expect(state.documents).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(within(dialog).getByRole("button", {name: "Retry required checks"})).toBeTruthy());
  expect(within(dialog).queryByText(/No documents on this employee/)).toBeNull();
  expect((within(dialog).getByRole("button", {name: "Continue"}) as HTMLButtonElement).disabled).toBe(true);
});
it.each(["identity", "generic"] as const)("%s a paused dirty form keeps Cancel and the F04 discard confirmation usable", async kind => {
  const view = mount({kind}); const dialog = await manual(kind); view.replace({ready: false});
  fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"})); expect(within(dialog).getByText("Discard unsaved changes?")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", {name: "Discard changes"})); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(save(kind)).not.toHaveBeenCalled();
});
it.each(["identity", "generic"] as const)("%s a late old-owner prefill never reopens the new owner's review", async kind => {
  const view = mount({kind}), pending = deferred<ReturnType<typeof result>>(); pf(kind).mockReturnValue(pending.promise);
  const {button} = await pick(); fireEvent.click(button); await waitFor(() => expect(pf(kind)).toHaveBeenCalledTimes(1));
  view.replace({owner: "B"}); await act(async () => {pending.resolve(result(kind));});
  expect(screen.getByRole("button", {name: /Enter Manually/})).toBeTruthy(); expect(save(kind)).not.toHaveBeenCalled();
});
it("generic verified medical loss scrubs the actual private form while ordinary pause and manage-only preservation do not", async () => {
  const view = mount({kind: "generic"}); const dialog = await manual("generic");
  for (const key of medicalKeys) fireEvent.change(within(dialog).getByLabelText(key), {target: {value: "SYNTHETIC_PRIVATE_DRAFT"}});
  fireEvent.change(within(dialog).getByLabelText("notes"), {target: {value: "SAFE_NONMEDICAL_DRAFT"}});
  const retained = state.submits.get("Review & Save Dependent")!;
  view.replace({ready: false}); expect(state.privateForm.medical_insurance_provider).toBe("SYNTHETIC_PRIVATE_DRAFT");
  view.replace({ready: true, retired: true, revision: 1});
  for (const key of medicalKeys) {expect(state.privateForm[key]).toBe(""); expect((within(dialog).getByLabelText(key) as HTMLInputElement).value).toBe("");}
  expect(state.privateForm.notes).toBe("SAFE_NONMEDICAL_DRAFT");
  view.replace({retired: false, revision: 2}); expect(state.privateForm.medical_insurance_provider).toBe("");
  await act(async () => {retained();}); await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(JSON.stringify(state.save.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_DRAFT");
});
it("generic verifies medical redaction again after an already-running prefill resolves", async () => {
  const view = mount({kind: "generic"}), pending = deferred<ReturnType<typeof prefill>>(); state.prefill.mockReturnValue(pending.promise);
  const {button} = await pick(); fireEvent.click(button); await waitFor(() => expect(state.prefill).toHaveBeenCalledTimes(1));
  view.replace({retired: true, revision: 1}); await act(async () => {pending.resolve(prefill());});
  await screen.findByRole("button", {name: "Save dependent"}); for (const key of medicalKeys) expect(state.privateForm[key]).toBe("");
  fireEvent.click(screen.getByRole("button", {name: "Save dependent"})); await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(JSON.stringify(state.save.mock.calls)).not.toContain("PRIVATE_PROVIDER");
});
it.each(["identity", "generic"] as const)("%s paused batch truthfully distinguishes unsent records from failed or successful writes", async kind => {
  const view = mount({kind}), pending = deferred<ReturnType<typeof result>>(); pf(kind).mockReturnValue(pending.promise);
  const {button} = await pick(2); fireEvent.click(button); await waitFor(() => expect(pf(kind)).toHaveBeenCalledTimes(1));
  view.replace({ready: false}); await act(async () => {pending.resolve(result(kind));});
  await screen.findByRole("button", {name: "Done"}); expect(save(kind)).not.toHaveBeenCalled();
  expect(screen.getByText(/0 created.*0 failed.*2 not submitted/)).toBeTruthy(); expect(state.saved).not.toHaveBeenCalled();
});
it.each(["identity", "generic"] as const)("%s retains a real dispatched batch success during pause and never duplicates it on read retry", async kind => {
  const view = mount({kind}), pending = deferred<{success: true; data: {dmsLinkCreated: boolean}}>(); save(kind).mockReturnValue(pending.promise);
  const {button} = await pick(2); fireEvent.click(button); await waitFor(() => expect(save(kind)).toHaveBeenCalledTimes(1));
  view.replace({ready: false}); await act(async () => {pending.resolve({success: true, data: {dmsLinkCreated: true}});});
  await screen.findByRole("button", {name: "Done"}); expect(screen.getByText(/1 created.*0 failed.*1 not submitted/)).toBeTruthy(); expect(state.saved).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", {name: "Retry required checks"})); view.replace({ready: true}); await act(async () => {}); expect(save(kind)).toHaveBeenCalledTimes(1);
});
it.each(["identity", "generic"] as const)("%s retains one confirmed batch fact when the next prefill retires through ABA", async kind => {
  const view = mount({kind}), next = deferred<ReturnType<typeof result>>();
  pf(kind).mockResolvedValueOnce(result(kind)).mockReturnValueOnce(next.promise);
  const {button} = await pick(2); fireEvent.click(button);
  await waitFor(() => expect(pf(kind)).toHaveBeenCalledTimes(2)); expect(save(kind)).toHaveBeenCalledTimes(1);
  expect(state.saved).not.toHaveBeenCalled(); view.replace({owner: "B"}); view.replace({owner: "A"});
  await act(async () => {next.resolve(result(kind));});
  expect(save(kind)).toHaveBeenCalledTimes(1); expect(state.saved).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", {name: /Enter Manually/})).toBeTruthy(); expect(state.success).not.toHaveBeenCalled();
});
it.each(["identity", "generic"] as const)("%s a retired manual success delivers its captured fact without closing the replacement form", async kind => {
  const view = mount({kind}), pending = deferred<{success: true; data: {id: number}}>(); save(kind).mockReturnValue(pending.promise);
  const dialog = await manual(kind); fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(save(kind)).toHaveBeenCalledTimes(1)); view.replace({owner: "B"});
  await act(async () => {pending.resolve({success: true, data: {id: 17}});});
  expect(state.saved).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: /Enter Manually/})).toBeTruthy();
});
it.each(["identity", "generic"] as const)("%s actual manual uncertainty survives a mounted parent ABA and read retry", async kind => {
  const view = mount({kind}), pending = deferred<never>(); save(kind).mockReturnValue(pending.promise);
  const dialog = await manual(kind), retained = [...state.submits.values()].filter(Boolean).at(-1)!;
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(save(kind)).toHaveBeenCalledTimes(1));
  view.replace({owner: "B"}); view.replace({owner: "A"});
  await act(async () => {pending.reject(new Error("Synthetic response lost"));});
  const next = await manual(kind); await act(async () => {retained();});
  fireEvent.click(within(next).getByRole("button", {name: /^Save/}));
  view.replace({ready: false}); fireEvent.click(screen.getByRole("button", {name: "Retry required checks"})); view.replace({ready: true});
  await act(async () => {state.submits.get(kind === "identity" ? "Review & Save Legal Document" : "Review & Save Dependent")?.();});
  expect(save(kind)).toHaveBeenCalledTimes(1); expect(state.saved).not.toHaveBeenCalled();
});
