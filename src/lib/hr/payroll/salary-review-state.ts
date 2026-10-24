import {z} from "zod";
import type {WorkspaceDraftStoreApi} from "@/lib/workspace/workspace-draft-types";
import {salaryReviewSubject, salaryReviewRequest, salaryReviewMarker, salaryReviewReceipt, matchesSalaryReviewReceipt, type SalaryReviewRequest} from "./salary-review-contract";

const saved = z.object({namespace: z.string(), authority: z.string(), pending: salaryReviewRequest.nullable(), retired: salaryReviewMarker.nullable(), receipt: salaryReviewReceipt.nullable()}).strict();
/** Sensitive reason/source pin in F04 memory only; authority retirement retains opaque identifiers. */
export function createSalaryReviewState(store: WorkspaceDraftStoreApi | null, actor: string, owner: string, authority: string, rawSubject: z.infer<typeof salaryReviewSubject>) {
  const subject = salaryReviewSubject.parse(rawSubject);
  const key = `draft:tab:${owner}:f12-salary-review:${actor}:${subject.employee_id}:${subject.revision_id}`;
  let state: z.infer<typeof saved> = {namespace: key, authority, pending: null, retired: null, receipt: null};
  let blocked = !store || !actor.trim() || !owner.trim() || !authority.trim();
  const belongs = (value: z.infer<typeof salaryReviewSubject>) => value.employee_id === subject.employee_id && value.revision_id === subject.revision_id;
  const opaque = (request: SalaryReviewRequest) => salaryReviewMarker.parse({employee_id: request.employee_id, revision_id: request.revision_id, operation_id: request.operation_id, action: request.action, review_revision: request.review_revision});
  const persist = () => {if (!store || blocked) throw Error("Recovery memory unavailable"); store.setViewState(key, JSON.stringify(state));};
  const verify = () => {
    try {if (blocked || !store || JSON.stringify(saved.parse(JSON.parse(store.getViewState(key) ?? "null"))) !== JSON.stringify(state)) throw Error();}
    catch {blocked = true; throw Error("Original recovery memory changed");}
  };
  const retire = () => {
    verify(); state = {namespace: key, authority, pending: null, retired: state.pending ? opaque(state.pending) : state.retired, receipt: null}; persist();
  };
  try {
    const raw = store?.getViewState(key);
    if (raw !== undefined) state = saved.parse(JSON.parse(raw));
    if (state.namespace !== key || [state.pending, state.retired, state.receipt].some(value => value && !belongs(value))) throw Error("Recovery identity mismatch");
    if (state.authority !== authority) state = {namespace: key, authority, pending: null, retired: state.pending ? opaque(state.pending) : state.retired, receipt: null};
    persist();
  } catch {blocked = true;}
  return {
    key, get blocked() {return blocked;},
    get pending() {return blocked || !state.pending ? null : structuredClone(state.pending);},
    get retired() {return blocked || !state.retired ? null : structuredClone(state.retired);},
    get receipt() {return blocked || !state.receipt ? null : structuredClone(state.receipt);},
    prepare(raw: SalaryReviewRequest) {
      verify(); if (state.retired || state.receipt) throw Error("Reconcile the original operation first");
      const request = salaryReviewRequest.parse(raw);
      if (!belongs(request) || state.pending && JSON.stringify(state.pending) !== JSON.stringify(request)) throw Error("Edited uncertain retry forbidden");
      state.pending = request; persist(); return structuredClone(request);
    },
    reject(wasUncertain = false) {verify(); if (wasUncertain) throw Error("Earlier uncertain operation must be reconciled"); state.pending = null; persist();},
    startNew() {verify(); if (state.pending || state.retired) throw Error("Resolve the original operation first"); state.receipt = null; persist();},
    retire,
    accept(raw: unknown) {
      verify(); const receipt = salaryReviewReceipt.parse(raw);
      if (!state.pending || !belongs(receipt) || !matchesSalaryReviewReceipt(receipt, state.pending)) throw Error("Original receipt mismatch");
      state = {namespace: key, authority, pending: null, retired: null, receipt}; persist();
    },
    reconcile(raw: unknown) {
      verify(); const receipt = salaryReviewReceipt.parse(raw);
      if (!state.retired || !belongs(receipt) || !matchesSalaryReviewReceipt(receipt, state.retired)) throw Error("Earlier receipt mismatch");
      state = {namespace: key, authority, pending: null, retired: null, receipt}; persist();
    },
  };
}
