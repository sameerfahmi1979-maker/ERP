import { z } from 'zod';
import type { WorkspaceDraftStoreApi } from '@/lib/workspace/workspace-draft-types';
import { workforceRequest, workforceReceipt, workforceOpeningRequest, matchesWorkforceReceipt, type WorkforceRequest, type WorkforceReceipt } from './workforce-review-contract';

const subjectSchema = workforceOpeningRequest.pick({ employee_id: true, source_kind: true, source_id: true });
const marker = subjectSchema.extend({ operation_id: workforceRequest.shape.operation_id, action: workforceRequest.shape.action, review_id: workforceRequest.shape.review_id, review_revision: workforceRequest.shape.review_revision }).strip();
const saved = z.object({ namespace: z.string(), authority: z.string(), pending: workforceRequest.nullable(), retired: marker.nullable(), receipt: workforceReceipt.nullable() }).strict();

/** F04 memory only. Corrupt or cross-account state blocks writes. */
export function createWorkforceReviewState(store: WorkspaceDraftStoreApi | null, actor: string, owner: string, authority: string, rawSubject: z.infer<typeof subjectSchema>) {
  const subject = subjectSchema.parse(rawSubject);
  const key = `draft:tab:${owner}:f12-workforce:${actor}:${subject.employee_id}:${subject.source_kind}:${subject.source_id}`;
  let state: z.infer<typeof saved> = { namespace: key, authority, pending: null, retired: null, receipt: null };
  let blocked = !store || !actor.trim() || !owner.trim() || !authority.trim();
  const belongs = (v: z.infer<typeof subjectSchema>) => v.employee_id === subject.employee_id && v.source_kind === subject.source_kind && v.source_id === subject.source_id;
  const persist = () => { if (!store || blocked) throw Error('Recovery memory unavailable'); store.setViewState(key, JSON.stringify(state)); };
  const verify = () => {
    try { if (blocked || !store || JSON.stringify(saved.parse(JSON.parse(store.getViewState(key) ?? 'null'))) !== JSON.stringify(state)) throw Error(); }
    catch { blocked = true; throw Error('Original recovery memory changed'); }
  };
  const retire = () => { verify(); state = { namespace: key, authority, pending: null, retired: state.pending ? marker.parse(state.pending) : state.retired, receipt: null }; persist(); };
  try {
    const raw = store?.getViewState(key);
    if (raw !== undefined) state = saved.parse(JSON.parse(raw));
    if (state.namespace !== key || [state.pending, state.retired, state.receipt].some(v => v && !belongs(v))) throw Error('Recovery identity mismatch');
    if (state.authority !== authority) state = { namespace: key, authority, pending: null, retired: state.pending ? marker.parse(state.pending) : state.retired, receipt: null };
    persist();
  } catch { blocked = true; }
  const match = (r: WorkforceReceipt, p: z.infer<typeof marker>) => belongs(r) && matchesWorkforceReceipt(r,p);
  return {
    key, get blocked() { return blocked; },
    get pending() { return blocked ? null : state.pending ? structuredClone(state.pending) : null; },
    get retired() { return blocked ? null : state.retired ? structuredClone(state.retired) : null; },
    get receipt() { return blocked ? null : state.receipt ? structuredClone(state.receipt) : null; },
    prepare(raw: WorkforceRequest) {
      verify(); if (state.retired || state.receipt) throw Error('Resolve the original operation before a new review');
      const p = workforceRequest.parse(raw);
      if (!belongs(p) || state.pending && JSON.stringify(state.pending) !== JSON.stringify(p)) throw Error('Original outcome unknown; edited retry forbidden');
      state.pending = p; persist(); return structuredClone(p);
    },
    reject(wasUncertain = false) { verify(); if (wasUncertain) throw Error('Earlier uncertain outcome must be reconciled'); state.pending = null; persist(); },
    startNew() { verify(); if (state.pending || state.retired) throw Error('Resolve the original operation first'); state.receipt = null; persist(); },
    retire,
    accept(raw: unknown) { verify(); const r = workforceReceipt.parse(raw); if (!state.pending || !match(r, state.pending)) throw Error('Original receipt mismatch'); state = { namespace: key, authority, pending: null, retired: null, receipt: r }; persist(); },
    reconcile(raw: unknown) { verify(); const r = workforceReceipt.parse(raw); if (!state.retired || !match(r, state.retired)) throw Error('Earlier receipt mismatch'); state = { namespace: key, authority, pending: null, retired: null, receipt: r }; persist(); },
  };
}
