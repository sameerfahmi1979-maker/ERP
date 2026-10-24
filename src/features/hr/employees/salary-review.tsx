"use client";
import {useId, useLayoutEffect, useMemo, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {ERPChildDialogForm} from "@/components/erp/erp-child-dialog-form";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {useWorkspaceFormOwner} from "@/hooks/use-workspace-form-owner";
import {useWorkspaceFormDraft} from "@/hooks/use-workspace-form-draft";
import {useWorkspaceDraftStoreContext} from "@/components/workspace/workspace-draft-provider";
import {useReadLifetime} from "@/hooks/use-read-lifetime";
import {useHrChildOwnerLifetime} from "./use-hr-child-owner-lifetime";
import {hrReadIdentity} from "@/lib/reads/hr-read-identity";
import type {AuthContext} from "@/lib/rbac/check";
import {invalidateHrEmployeePayroll, invalidateHrEmployeeSalaryRevisions} from "@/lib/query/invalidation";
import {createSalaryReviewState} from "@/lib/hr/payroll/salary-review-state";
import {salaryReviewActions, type SalaryReviewRequest, type SalaryReviewReceipt} from "@/lib/hr/payroll/salary-review-contract";
import {openSalaryReview, saveSalaryReview, reconcileSalaryReview, readRecentSalaryReviews, readSalaryReviewHistory} from "@/server/actions/hr/salary-review";

type Props = {employeeId: number; revisionId: number; authContext: AuthContext; canDispatch: () => boolean; onChildOpen?: (open: boolean) => void; onDenied?: () => void};
const labels = {approve: "Approve proposal", reject: "Reject proposal", withdraw: "Withdraw proposal", apply: "Apply dated salary"} as const;
/** Compact action within the existing revision section; never a main-list toolbar. */
export function SalaryReviewButton(props: Props) {
  const [open, setOpen] = useState(false);
  const change = (value: boolean) => {setOpen(value); props.onChildOpen?.(value);};
  return <><Button type="button" size="sm" variant="outline" disabled={!props.canDispatch()} onClick={() => {if (props.canDispatch()) change(true);}}>Review salary proposal</Button>
    {open && <SalaryReviewDialog key={`${hrReadIdentity(props.authContext)}:${props.revisionId}`} {...props} onClose={() => change(false)}/>}</>;
}
function SalaryReviewDialog(props: Props & {onClose: () => void}) {
  const identity = hrReadIdentity(props.authContext), actor = `${props.authContext.profile?.id ?? "none"}:${props.authContext.profile?.auth_user_id ?? "none"}`;
  const workspace = useWorkspaceFormOwner(), store = useWorkspaceDraftStoreContext();
  const subject = useMemo(() => ({employee_id: props.employeeId, revision_id: props.revisionId}), [props.employeeId, props.revisionId]);
  const controller = useMemo(() => createSalaryReviewState(store, actor, workspace?.id ?? "", identity, subject), [store, actor, workspace?.id, identity, subject]);
  const lifetime = useReadLifetime(`${actor}:${identity}:${props.employeeId}:${props.revisionId}:salary-review`), owner = useHrChildOwnerLifetime(`${actor}:${identity}:${props.employeeId}:${props.revisionId}:salary-review`);
  const draft = useWorkspaceFormDraft({formId: `f12-salary-review:${actor}:${identity}:${props.employeeId}:${props.revisionId}`});
  const [reason, setReason] = useState(() => draft.getDraftDefault("reason")), [action, setAction] = useState<SalaryReviewRequest["action"] | null>(null);
  const [busy, setBusy] = useState(false), [denied, setDenied] = useState(false), [message, setMessage] = useState<string | null>(null), [, redraw] = useState(0);
  const [after, setAfter] = useState(0), [recent, setRecent] = useState<SalaryReviewReceipt[]>([]), [recentCursor, setRecentCursor] = useState<{before: string; cursor: string} | null>(null);
  const flight = useRef(false), mounted = useRef(false), id = useId(), qc = useQueryClient(), retireDraft = draft.retireDraft;
  useLayoutEffect(() => {mounted.current = true; return () => {mounted.current = false; queueMicrotask(() => {if (!owner.active) {try {controller.retire(); retireDraft();} catch {/* Never overwrite unverified recovery memory. */}}});};}, [owner, controller, retireDraft]);
  const opening = useQuery({queryKey: ["hr", "f12-salary-opening", identity, subject], enabled: lifetime.enabled && !denied && !controller.retired, staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => {if (!lifetime.active || !props.canDispatch()) throw Error("Current payroll list unavailable."); const result = await openSalaryReview(subject); if (!lifetime.active) throw Error("Opening retired."); if (!result.success) {if (result.denied) retireAccess(); throw Error(result.error);} return result.data;}});
  const history = useQuery({queryKey: ["hr", "f12-salary-history", identity, subject, after], enabled: lifetime.enabled && !denied, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false,
    queryFn: async () => {if (!lifetime.active || !props.canDispatch()) throw Error("Current salary history unavailable."); const result = await readSalaryReviewHistory({...subject, after}); if (!lifetime.active) throw Error("History retired."); if (!result.success) {if (result.denied) retireAccess(); throw Error(result.error);} return result;}});
  function retireAccess() {try {controller.retire(); draft.retireDraft();} catch {/* Corrupt memory remains blocked. */} setReason(""); setAction(null); setRecent([]); setDenied(true); props.onDenied?.();}
  const refresh = (applied: boolean) => {invalidateHrEmployeeSalaryRevisions(qc, props.employeeId); if (applied) invalidateHrEmployeePayroll(qc, props.employeeId); void qc.invalidateQueries({queryKey: ["hr", "f12-salary-history", identity, subject]});};
  async function dispatch(request: SalaryReviewRequest) {
    if (flight.current || !lifetime.active || !props.canDispatch() || controller.blocked || denied) return;
    const wasPending = controller.pending !== null; flight.current = true; setBusy(true);
    try {
      const original = controller.prepare(request), result = await saveSalaryReview(original);
      if (!lifetime.active) return;
      if (!result.success) {if (result.denied) retireAccess(); else if (!wasPending && !result.uncertain) controller.reject(); setMessage(result.error); return;}
      controller.accept(result.data); draft.clearDraft(); setReason(""); setAction(null); setMessage(result.data.status === "applied" ? "Dated salary applied. No bank file, payment or Finance acknowledgement was created." : "Salary decision recorded. Approval alone does not apply pay."); refresh(result.data.status === "applied");
    } catch {if (lifetime.active) setMessage("Outcome unconfirmed. Keep the original operation; check its receipt or retry unchanged.");}
    finally {flight.current = false; if (mounted.current) {setBusy(false); redraw(value => value + 1);}}
  }
  function submit() {
    if (controller.pending) {void dispatch(controller.pending); return;}
    if (!opening.data || !action || !reason.trim() || !salaryReviewActions(opening.data, props.authContext.profile?.id ?? -1).includes(action)) {setMessage("Choose a currently permitted decision and enter its reason."); return;}
    void dispatch({...subject, operation_id: crypto.randomUUID(), action, reason, fingerprint: opening.data.fingerprint, review_revision: opening.data.review_revision});
  }
  async function reconcile() {
    const marker = controller.retired ?? controller.pending;
    if (!marker || flight.current || !lifetime.active || !props.canDispatch()) return;
    flight.current = true; setBusy(true);
    try {const result = await reconcileSalaryReview(marker.operation_id); if (!lifetime.active) return; if (!result.success) {if (result.denied) retireAccess(); setMessage(result.error); return;} if (controller.retired) controller.reconcile(result.data); else controller.accept(result.data); draft.clearDraft(); setReason(""); setMessage("Original salary result confirmed. Review current state before another action."); refresh(result.data.status === "applied");}
    catch {if (lifetime.active) setMessage("Original result remains unresolved; no replacement sent.");}
    finally {flight.current = false; if (mounted.current) {setBusy(false); redraw(value => value + 1);}}
  }
  async function recentResults(earlier = false) {
    if (flight.current || !lifetime.active || !props.canDispatch() || denied || earlier && !recentCursor) return;
    flight.current = true; setBusy(true);
    try {const result = await readRecentSalaryReviews({employee_id: props.employeeId, ...(earlier ? recentCursor : {})}); if (!lifetime.active) return; if (!result.success) {if (result.denied) retireAccess(); setMessage(result.error); return;} const rows = result.rows.map(row => row.receipt), next = earlier ? [...recent, ...rows] : rows; if (new Set(next.map(row => row.operation_id)).size !== next.length) {setMessage("Confirmation pages overlapped. Refresh before continuing."); return;} setRecent(next); const last = result.rows.at(-1); setRecentCursor(result.hasMore && last ? {before: last.created_at, cursor: last.operation_id} : null); setMessage("Confirmed original operations only. An absent receipt is not proof an earlier request failed.");}
    catch {if (lifetime.active) setMessage("Original confirmations unavailable.");}
    finally {flight.current = false; if (mounted.current) setBusy(false);}
  }
  const locked = busy || denied || controller.blocked || !!controller.pending || !!controller.retired || !!controller.receipt;
  if (!lifetime.enabled) return null;
  return <ERPChildDialogForm open title="Salary proposal review" size="lg" isDirty={!!reason || draft.hasDraft} isSubmitting={busy} closeDisabled={busy || !!controller.pending}
    submitDisabled={controller.blocked || denied || !!controller.retired || !!controller.receipt || !props.canDispatch() || !controller.pending && (opening.isError || !opening.data || !action)}
    submitLabel={controller.pending ? "Retry unchanged salary decision" : action ? `Confirm: ${labels[action]}` : "Choose a decision"} onSubmit={submit} onOpenChange={value => {if (!value && lifetime.active && !busy && !controller.pending) props.onClose();}}
    recoveryActions={<><Button type="button" variant="outline" disabled={busy || !controller.pending && !controller.retired} onClick={() => void reconcile()}>Check original salary result</Button>{controller.pending && <Button type="button" variant="outline" disabled={busy} onClick={() => {try {controller.retire(); draft.retireDraft(); props.onClose();} catch {setMessage("Recovery memory unavailable; original operation retained.");}}}>Close and check later</Button>}</>}>
    {message && <p role="status">{message}</p>}{controller.blocked && <p role="alert">Private recovery memory unavailable. No salary decision will be sent.</p>}{denied && <p role="alert">Access changed. Private salary-review fields have been retired.</p>}
    {!denied && !controller.retired && <>
      {opening.isPending ? <p>Loading current permitted salary proposal…</p> : opening.isError ? <p role="alert">Current salary review unavailable. No decision is assumed.</p> : opening.data && <div className="space-y-2">
        <p>Revision #{props.revisionId} · {opening.data.status} · Effective {opening.data.effective_date}</p><p>New Basic: {opening.data.currency} {opening.data.new_basic}</p>
        <p className="text-sm text-muted-foreground">A different authorized payroll manager must approve. Application is explicit and cannot occur before the effective Dubai date. Original salary components and revision history are retained.</p>
        {!opening.data.source_current && ["pending", "approved"].includes(opening.data.status) && <p role="alert">Salary sources changed. This original can be rejected or withdrawn, but cannot be approved or applied; record a fresh proposal after reviewing current facts.</p>}
        <div className="flex flex-wrap gap-2">{salaryReviewActions(opening.data, props.authContext.profile?.id ?? -1).map(value => <Button key={value} type="button" size="sm" variant={action === value ? "default" : "outline"} disabled={locked || !props.canDispatch()} aria-pressed={action === value} onClick={() => setAction(value)}>{labels[value]}</Button>)}</div>
      </div>}
      <Label htmlFor={`${id}-reason`}>Decision reason *</Label><Textarea id={`${id}-reason`} name="reason" required maxLength={1000} disabled={locked} value={reason} onChange={event => {if (!locked && lifetime.active) {draft.writeDraftField("reason", event.target.value); setReason(event.target.value);}}}/>
      <Button type="button" variant="outline" disabled={busy || !!controller.pending || !!controller.retired || denied} onClick={() => {try {controller.startNew(); setReason(""); setAction(null); draft.clearDraft(); void opening.refetch(); redraw(value => value + 1);} catch {setMessage("Reconcile the original operation before refreshing.");}}}>Review latest state</Button>
      <div className="space-y-2"><h3 className="font-medium">Decision history</h3>{history.isPending ? <p>Loading permitted history…</p> : history.isError ? <p role="alert">Salary history unavailable.</p> : history.data?.rows.map(row => <p key={row.id}>#{row.id} · {row.action} · Actor #{row.actor_id} · {row.created_at} · {row.reason}</p>)}
        {history.data?.hasMore && <Button type="button" variant="outline" disabled={busy} onClick={() => setAfter(history.data.rows.at(-1)!.id)}>Next history page</Button>}{after > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => setAfter(0)}>First history page</Button>}
      </div>
    </>}
    <Button type="button" variant="outline" disabled={busy || denied} onClick={() => void recentResults()}>Find recent confirmed salary decisions</Button>{recent.map(row => <p key={row.operation_id}>Revision #{row.revision_id} · {row.action} · {row.status} · Operation {row.operation_id}</p>)}{recentCursor && <Button type="button" variant="outline" disabled={busy || denied} onClick={() => void recentResults(true)}>Earlier confirmed salary decisions</Button>}
  </ERPChildDialogForm>;
}
