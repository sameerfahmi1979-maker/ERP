"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {AiFeedback} from '@/features/ai/quality/ai-feedback';
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { useReadCacheOwner, type ReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { DmsAiIntakeReviewForm } from "@/features/dms/intake/dms-ai-intake-review-form";
import { preparationCandidatesSchema, type PreparationCandidates } from "@/lib/dms/preparation/candidates";
import type { PreparationSnapshot } from "@/lib/dms/preparation/contracts";
import { getDocumentPreparationSnapshot, recoverDocumentPreparation, getDocumentPreparationStatus, startDocumentPreparation, applyDocumentPreparation, cancelDocumentPreparation } from "@/server/actions/dms/document-preparation";

type Start = Parameters<typeof startDocumentPreparation>[0];
type Apply = { documentId: number; jobId: number; requestId: string; snapshot: string; selections: string[]; edits: Record<string, string>; humanReviewConfirmed: true; replaceExistingConfirmed: boolean; refreshDerivedConfirmed:boolean };
export function DmsDocumentPreparationPanel({ documentId, canRun, onApplied }: { documentId: number; canRun: boolean; onApplied?: () => void }) {
  const owner = useReadCacheOwner();
  if (!canRun || !owner?.identity || !owner.isLive()) return null;
  return <PreparationSession key={`${documentId}:${owner.identity.authUserId}:${owner.identity.scopeVersion}:${owner.generation}`} documentId={documentId} owner={owner} onApplied={onApplied} />;
}
function PreparationSession({ documentId, owner, onApplied }: { documentId: number; owner: ReadCacheOwner; onApplied?: () => void }) {
  const [source, setSource] = useState<PreparationSnapshot | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"reuse_text" | "reread_files">("reuse_text"), [fileIds, setFileIds] = useState<number[]>([]);
  const [job, setJob] = useState<number | null>(null), [message, setMessage] = useState<string | null>(null), [sourceCurrent, setSourceCurrent] = useState(false);
  const [candidate, setCandidate] = useState<PreparationCandidates | null>(null), [selections, setSelections] = useState<string[]>([]), [edits, setEdits] = useState<Record<string, string>>({});
  const [preparedText,setPreparedText]=useState<Array<{fileId:number;name:string;text:string|null;truncated:boolean|null}>>([]);
  const [refreshDerived,setRefreshDerived]=useState(false);
  const [hasApplyRequest,setHasApplyRequest]=useState(false);
  const [confirm, setConfirm] = useState(false), [replace, setReplace] = useState(false), [uncertain, setUncertain] = useState(false);
  const startRequest = useRef<Start | null>(null), applyRequest = useRef<Apply | null>(null), mounted = useRef(true), pending = useRef(false);
  const live = () => mounted.current && owner.isLive() && owner.admits(owner.identity);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const readStatus = async (jobId: number) => {
    const result = await getDocumentPreparationStatus(documentId, jobId);
    if (!live()) return;
    if (!result.success || !result.data) { setMessage(result.error ?? "Preparation status is unavailable. Retain the original request."); setSourceCurrent(false); return; }
    setPreparedText(result.data.preparedText??[]);
    setSourceCurrent(result.data.sourceCurrent);
    const parsed = preparationCandidatesSchema.safeParse(result.data.candidate);
    setCandidate(result.data.state === "review_required" && parsed.success ? parsed.data : null);
    setMessage(result.data.state === "applied" ? "The retained review was applied successfully." : result.data.state === "cancelled" ? "Preparation cancelled; accepted data is unchanged." :
      !result.data.sourceCurrent ? "The source or current values changed. This candidate cannot be applied." : result.data.queueStatus === "failed" ? "Preparation is held. Its original request and any uncertain provider work are retained for reconciliation." :
      parsed.success ? "Review the proposed changes below." : "Preparation is queued. It uses the existing worker; no provider or worker was enabled by this request.");
    if (result.data.state === "applied" || result.data.state === "cancelled") { applyRequest.current = null; setHasApplyRequest(false); startRequest.current = null; setUncertain(false); setJob(null); setSource(null); }
  };
  const load = async () => {
    if (pending.current) return; pending.current = true; setBusy(true);
    try {
      const [snapshot, recovered] = await Promise.all([getDocumentPreparationSnapshot(documentId), recoverDocumentPreparation(documentId)]);
      if (!live()) return;
      if (!snapshot.success || !snapshot.data || !recovered.success || !recovered.data) { setMessage("Current source or recovery status is unavailable. No new request was created."); return; }
      setSource(snapshot.data); setFileIds(snapshot.data.files.slice(0, 10).map(f => f.id));
      const original = recovered.data.recovery;
      if (original && !["applied", "cancelled"].includes(original.state)) {
        setJob(original.jobId); setMode(original.mode); setFileIds(original.fileIds);
        startRequest.current = { documentId, requestId: original.requestId, snapshot: original.snapshot, mode: original.mode, fileIds: original.fileIds };
        await readStatus(original.jobId);
      } else { setJob(null); startRequest.current = null; setUncertain(false); setSourceCurrent(true); }
    } catch { if (live()) setMessage("Preparation source is unavailable. No new request was created."); }
    finally { if (live()) setBusy(false); pending.current = false; }
  };
  const run = async (action: () => Promise<void>) => {
    if (pending.current || !live()) return; pending.current = true; setBusy(true);
    try { await action(); } catch { if (live()) { setUncertain(true); setMessage("The result is unconfirmed. Recover or retry the retained request; do not start another one."); } }
    finally { pending.current = false; if (live()) setBusy(false); }
  };
  return <div className="rounded border border-border p-3 space-y-3">
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setOpen(true); if (!source) void load(); }}>Re-review existing document</Button>
    <ERPChildDialogForm open={open} onOpenChange={setOpen} title="Re-review existing document" mode="edit" size="workbench" isSubmitting={busy}
      closeDisabled={busy || uncertain || hasApplyRequest} isDirty={selections.length > 0 || Object.keys(edits).length > 0}
      onSubmit={candidate ? () => run(async () => {
          if (!job) return;
          applyRequest.current ??= { documentId, jobId: job, requestId: crypto.randomUUID(), snapshot: candidate.sourceSnapshot, selections: [...selections], edits: Object.fromEntries(Object.entries(edits).filter(([key]) => selections.includes(key))), humanReviewConfirmed: true, replaceExistingConfirmed: replace, refreshDerivedConfirmed:refreshDerived };
          setHasApplyRequest(true);
          const result = await applyDocumentPreparation(applyRequest.current); if (!live()) return;
          if (result.success) { setCandidate(null); setJob(null); setSource(null); setUncertain(false); applyRequest.current = null; setHasApplyRequest(false); startRequest.current = null; setMessage(`Reviewed values applied. Original files and number retained. Derived refresh: ${String(result.data?.derivedReadiness?.state??"not selected")}.`); onApplied?.(); }
          else { setUncertain(result.uncertain === true); if (!result.uncertain) {applyRequest.current = null; setHasApplyRequest(false);} setMessage(result.error ?? "The reviewed changes were not applied."); }
        }) : undefined}
      submitLabel={hasApplyRequest ? "Recover the same reviewed save" : "Apply selected changes"}
      submitDisabled={busy || !job || !sourceCurrent || (!hasApplyRequest && (!confirm || (!selections.length && !refreshDerived) || selections.length > 50))}
      onCancel={() => { setSelections([]); setEdits({}); setConfirm(false); setReplace(false); }} cancelLabel="Close review">
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Prepare suggestions from retained originals. This keeps the same record, number and files and does not change employee data.</p>
      {message && <p role="status" className="text-sm">{message}</p>}
      {job!==null&&candidate&&sourceCurrent&&<AiFeedback source={{kind:'preparation',id:job,documentId}}/>}
      <Button type="button" size="sm" variant="outline" disabled={busy || hasApplyRequest} onClick={() => void load()}>Refresh source and recover original request</Button>
      {source && <fieldset disabled={busy || job !== null || uncertain} className="space-y-2">
        <legend className="text-sm font-medium">Selected files</legend>
        {source.files.map(file => <label key={file.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fileIds.includes(file.id)} onChange={e => setFileIds(ids => e.target.checked ? [...ids, file.id] : ids.filter(id => id !== file.id))} />{file.name}</label>)}
        <label className="text-sm block">Processing method<select aria-label="Re-review processing method" className="block rounded border bg-background text-foreground p-2" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="reuse_text">Use retained text</option><option value="reread_files">Read original files again</option></select></label>
        <Button type="button" size="sm" disabled={!fileIds.length || fileIds.length > 10} onClick={() => void run(async () => {
          startRequest.current ??= { documentId, requestId: crypto.randomUUID(), snapshot: source.snapshot, mode, fileIds: [...fileIds] };
          const result = await startDocumentPreparation(startRequest.current);
          if (!live()) return;
          if (result.success && result.data) { setJob(result.data.jobId); setUncertain(false); await readStatus(result.data.jobId); }
          else { setUncertain(result.uncertain === true); setMessage(result.error ?? "Preparation was not admitted."); }
        })}>Prepare review</Button>
      </fieldset>}
      {job !== null && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => readStatus(job))}>Refresh retained preparation</Button><Button type="button" size="sm" variant="ghost" disabled={busy || hasApplyRequest} onClick={() => void run(async () => {
        const result = await cancelDocumentPreparation(documentId, job); if (!live()) return;
        if (result.success) { setCandidate(null); setJob(null); startRequest.current = null; setUncertain(false); setMessage("Preparation cancelled; accepted data is unchanged."); }
        else setMessage(result.error ?? "Cancellation is unconfirmed. Retain this request.");
      })}>Cancel preparation</Button></div>}
      {candidate && <>
        {candidate.tagIds.length>0&&<p className="text-sm">Suggested registered tags: {source?.existingTags.filter(t=>candidate.tagIds.includes(t.id)).map(t=>t.name).join(", ")||"Review current registered tags"}.</p>}
        {preparedText.map(file=><details key={file.fileId} className="rounded border border-border p-2 text-sm"><summary>Prepared text — {file.name}{file.truncated?" (preview truncated)":""}</summary><a className="text-primary underline" href={`/api/dms/file?fileId=${file.fileId}&disposition=inline`} target="_blank" rel="noopener noreferrer">Open permitted original</a><p className="whitespace-pre-wrap break-words" dir="auto">{file.text??"No prepared text — no content inferred."}</p></details>)}
        <DmsAiIntakeReviewForm mode="existing_document" candidate={candidate} selections={selections} edits={edits} onSelectionChange={keys => { setSelections(keys); setConfirm(false); }} onEdit={(key, value) => { setEdits(old => ({ ...old, [key]: value })); setConfirm(false); }} disabled={busy || uncertain || hasApplyRequest || !sourceCurrent} />
        {candidate.applicability!=="portrait"&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={refreshDerived} disabled={busy||uncertain} onChange={e=>{setRefreshDerived(e.target.checked);setConfirm(false);}}/>Accept the displayed prepared summary, registered tag suggestions and selected original-file text; refresh derived search data. Original source bytes and prior output history remain retained.</label>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirm} disabled={busy || uncertain} onChange={e => setConfirm(e.target.checked)} />I reviewed the selected values and their original sources.</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} disabled={busy || uncertain} onChange={e => setReplace(e.target.checked)} />Replace the existing values I selected.</label>

      </>}
    </div>
    </ERPChildDialogForm>
  </div>;
}
