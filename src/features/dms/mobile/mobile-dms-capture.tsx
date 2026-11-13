"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { createClient } from "@/lib/supabase/client";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";
import { sameSingleUploadRequest, singleUploadRequestSchema, type UploadOwningScope } from "@/lib/dms/single-upload-admission";
import { startAiIntakeFromUploadSession } from "@/server/actions/dms/ai-intake";
import { acknowledgeDmsSingleUpload, completeDmsTempUpload, createDmsUploadSession } from "@/server/actions/dms/upload-sessions";
import { DmsUploadScopePicker } from "@/features/dms/upload/dms-upload-scope-picker";
import { DMS_MAX_FILE_SIZE_BYTES } from "@/features/dms/upload/dms-upload-constants";
import { buildMobileDocument, mobileDraftStorage, normalizeMobileFile, type MobileDraft } from "./mobile-dms-draft";

const empty = { files: [] };
type UploadedDocument = NonNullable<MobileDraft["uploaded"]>;
const reviewReady = (status: string | null) => status === "review_pending" || status === "review_in_progress";
const processing = (status: string | null) => status !== null &&
  ["ocr_pending", "ocr_processing", "ai_pending", "ai_processing"].includes(status);

async function readIntakeStatus(upload: UploadedDocument, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`/api/dms/intake-status?sessionId=${upload.id}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("The current intake status is unavailable. Check your connection and try again.");
  const result = await response.json();
  if (result.sessionCode !== upload.code || typeof result.intakeStatus !== "string") {
    throw new Error("The intake could not be matched to this upload.");
  }
  return result.intakeStatus;
}

async function transferOriginal(file: File, path: string, token: string, mime: string) {
  const timeoutMs = Math.min(60_000 + Math.round(file.size / (1024 * 1024) * 30_000), 600_000);
  const upload = createClient().storage.from("dms-temp").uploadToSignedUrl(path, token, file, {
    contentType: mime,
    upsert: false,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([upload, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Transfer timed out. Retry this draft when your connection is stable.")), timeoutMs);
    })]);
    if (result.error) throw new Error("The transfer was not confirmed. Retry this draft when the connection is stable.");
  } finally {
    clearTimeout(timer);
  }
}

function MobileDraftPreview({ file }: { file: File }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    link.current?.setAttribute("href", url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <a ref={link} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm underline">Preview {file.name}</a>;
}

export function MobileDmsCapture({ user, context, canStartAi }: {
  user: string;
  context: { entityType: string; entityId: number } | null;
  canStartAi: boolean;
}) {
  const key = `${user}:${context?.entityType ?? "inbox"}:${context?.entityId ?? ""}`;
  const owner = useReadCacheOwner();
  const flight = useRef(false);
  const [draft, setDraft] = useState<MobileDraft>(empty);
  const [scope, setScope] = useState<UploadOwningScope | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{ id: number; value: string | null } | null>(null);
  const uploaded = draft.uploaded;
  const intakeStatus = uploaded && status?.id === uploaded.id ? status.value : null;
  const active = () => !!owner?.identity && owner.identity.authUserId === user && owner.isLive() && owner.admits(owner.identity);

  useEffect(() => {
    let live = true;
    mobileDraftStorage(key).then((saved) => {
      if (!live || !owner?.identity || owner.identity.authUserId !== user || !owner.admits(owner.identity)) return;
      setDraft(saved ?? empty);
      setScope(saved?.submission?.request.scope ?? null);
      setLoaded(true);
    }).catch(() => {
      if (live) setError("This browser could not open local draft storage.");
    });
    return () => { live = false; };
  }, [key, owner, user]);

  useEffect(() => {
    if (!uploaded || uploaded.duplicate || !owner?.identity || owner.identity.authUserId !== user || !owner.admits(owner.identity)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      let next: string | null = null;
      try {
        next = await readIntakeStatus(uploaded, controller.signal);
      } catch {
        // A lost status read cannot confirm that the start failed.
      }
      if (controller.signal.aborted || !owner.admits(owner.identity)) return;
      setStatus({ id: uploaded.id, value: next });
      if (!next || next === "uploaded" || processing(next)) timer = setTimeout(() => void refresh(), 5000);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [owner, uploaded, user]);

  const save = async (next: MobileDraft | null) => {
    if (!active()) throw new Error("Your ERP session changed. Reopen Mobile DMS.");
    const revised = next && { ...next, revision: crypto.randomUUID() };
    await mobileDraftStorage(key, revised);
    if (active()) setDraft(revised ?? empty);
  };

  const run = async (task: () => Promise<void>) => {
    if (flight.current || !active()) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!navigator.locks) throw new Error("Open Mobile DMS over HTTPS in a current browser to save or upload drafts.");
      await navigator.locks.request(`algt-mobile-dms:${key}`, async () => {
        if (!active()) return;
        const saved = await mobileDraftStorage(key);
        if (saved?.revision !== draft.revision) {
          setDraft(saved ?? empty);
          setScope(saved?.submission?.request.scope ?? null);
          throw new Error("This draft changed in another tab. Check the updated draft and try again.");
        }
        await task();
      });
    } catch (reason) {
      if (active()) setError(reason instanceof Error ? reason.message : "The operation could not be confirmed. Retry the same draft.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  const select = (files: File[]) => run(async () => {
    if (!files.length) return;
    const selected = [...draft.files, ...files];
    const totalBytes = (selection: File[]) => selection.reduce((size, file) => size + file.size, 0);
    if (selected.length > 10 || files.some((file) => file.size === 0) || totalBytes(selected) > DMS_MAX_FILE_SIZE_BYTES) {
      throw new Error("Choose up to ten supported photos or one PDF, with a total size of 50 MB or less.");
    }
    const next = [...draft.files];
    for (const file of files) next.push(await normalizeMobileFile(file));
    if (totalBytes(next) > DMS_MAX_FILE_SIZE_BYTES) throw new Error("The prepared photos exceed 50 MB. Select fewer or smaller photos.");
    if (next.length > 1 && next.some((file) => file.type === "application/pdf")) {
      throw new Error("Use one PDF or a set of photos for this document.");
    }
    await save({ files: next });
    setMessage("Draft saved on this device.");
  });

  const startReview = async (upload: UploadedDocument) => {
    const current = await readIntakeStatus(upload);
    if (!active()) return;
    setStatus({ id: upload.id, value: current });
    if (current !== "uploaded") return;
    setMessage("Starting AI processing…");
    let result;
    try {
      result = await startAiIntakeFromUploadSession({ uploadSessionId: upload.id, onlyIfUploaded: true });
    } catch {
      throw new Error("The start response was interrupted. Check this upload’s status before trying again.");
    }
    if (!active()) return;
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "AI start could not be confirmed. Check this upload’s status.");
    }
    setStatus({ id: upload.id, value: result.data.status });
  };

  const upload = () => run(async () => {
    if (!navigator.onLine) throw new Error("Your draft is saved. Retry when you have a connection.");
    let submission = draft.submission;
    if (!submission) {
      const file = await buildMobileDocument(draft.files);
      if (file.size === 0 || file.size > DMS_MAX_FILE_SIZE_BYTES) {
        throw new Error("The prepared document exceeds the 50 MB upload limit. Remove a page or choose a smaller file.");
      }
      const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const request = singleUploadRequestSchema.parse({
        version: 1, operationId: crypto.randomUUID(), authUserId: user, context,
        ...(scope && !context ? { scope } : {}),
        metadata: {
          original_filename: file.name, mime_type: file.type, file_size_bytes: file.size,
          sha256_hash: Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""),
        },
      });
      submission = { file, request };
      await save({ files: [], submission });
    }
    let { request } = submission;
    const admit = () => createDmsUploadSession(
      { ...request.metadata, context: request.context ?? undefined, scope: request.scope },
      { operationId: request.operationId, authUserId: request.authUserId },
    );
    setMessage("Checking the upload session…");
    let result = await admit();
    if (!active()) return;
    if (result.recovery) {
      const recovered = singleUploadRequestSchema.parse(result.recovery);
      if (!sameSingleUploadRequest({ ...recovered, operationId: request.operationId }, request)) {
        throw new Error("The original upload could not be matched. Open the Upload Inbox to reconcile it.");
      }
      request = recovered;
      await save({ files: [], submission: { ...submission, request } });
      result = await admit();
      if (!active()) return;
    }
    if (result.cancelled?.operationId === request.operationId) {
      await save({ files: [submission.file] });
      throw new Error("The earlier upload was cancelled. Submit the saved file again to start a new upload.");
    }
    if (!result.success || !result.data) throw new Error(result.error ?? "Upload could not be confirmed. Retry the same draft.");
    const { session, path, token, uploadRequired, isDuplicate } = result.data;
    if (uploadRequired) {
      setMessage("Uploading document…");
      await transferOriginal(submission.file, path, token, session.mime_type);
      if (!active()) return;
      setMessage("Verifying the original file…");
      const verified = await completeDmsTempUpload(session.id);
      if (!active()) return;
      if (!verified.success || !verified.data) throw new Error(verified.error ?? "The stored file could not be verified. Retry this draft.");
    }
    if (!active()) return;
    setMessage("Confirming upload…");
    const acknowledged = await acknowledgeDmsSingleUpload(request, session.id);
    if (!active()) return;
    if (!acknowledged.success) throw new Error(acknowledged.error ?? "Upload confirmation is pending. Retry the same draft.");
    const uploaded = { id: session.id, code: session.session_code, duplicate: isDuplicate };
    await save({ files: [], uploaded });
    setMessage("");
  });

  const files = draft.submission ? [draft.submission.file] : draft.files;
  const disabled = !loaded || busy;
  const canOpenIntake = reviewReady(intakeStatus) || intakeStatus === "approved" || intakeStatus === "failed";
  if (!active()) return <p role="alert">Your ERP session changed. Reopen Mobile DMS.</p>;
  return <section aria-label="Capture document" className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Capture document</h2>
    {!draft.uploaded && <p className="text-sm text-muted-foreground">Draft files are kept in this browser until upload is confirmed. Use a trusted device.</p>}
    {context && <p className="text-sm">Upload for {getDmsEntityTypeLabel(context.entityType)} #{context.entityId}</p>}
    {!context && !draft.submission && !draft.uploaded && <DmsUploadScopePicker value={scope} onChange={setScope} disabled={disabled} />}
    {!draft.submission && !draft.uploaded && <div className="grid gap-3">
      <label className="text-sm font-medium">Take a photo
        <input type="file" accept="image/*" capture="environment" className="block max-w-full py-2" disabled={disabled} onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void select(files);
        }} />
      </label>
      <label className="text-sm font-medium">Choose a PDF or photos
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif" multiple className="block max-w-full py-2" disabled={disabled} onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void select(files);
        }} />
      </label>
    </div>}
    {files.length > 0 && <ol className="space-y-2">{files.map((file, index) => <li key={index} className="flex flex-wrap items-center gap-2 break-all">
      <span className="text-sm">Page {index + 1}</span>
      <MobileDraftPreview file={file} />
      {!draft.submission && index > 0 && <Button type="button" variant="outline" aria-label={`Move page ${index + 1} up`} className="min-h-11" disabled={disabled} onClick={() => void run(() => {
        const reordered = [...draft.files];
        [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
        return save({ files: reordered });
      })}>Move up</Button>}
      {!draft.submission && index < files.length - 1 && <Button type="button" variant="outline" aria-label={`Move page ${index + 1} down`} className="min-h-11" disabled={disabled} onClick={() => void run(() => {
        const reordered = [...draft.files];
        [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
        return save({ files: reordered });
      })}>Move down</Button>}
      {!draft.submission && <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => void run(() => {
        const remaining = draft.files.filter((_, position) => position !== index);
        return save(remaining.length ? { files: remaining } : null);
      })}>Remove page {index + 1}</Button>}
    </li>)}</ol>}
    <div className="flex flex-wrap gap-2">
      {!draft.uploaded && files.length > 0 && <Button className="min-h-11" type="button" disabled={disabled || (!context && !scope && !draft.submission)} onClick={() => void upload()}>
        {draft.submission ? "Retry upload" : "Upload document"}
      </Button>}
      {uploaded && <>
        {!uploaded.duplicate && canStartAi && intakeStatus === "uploaded" && (
          <Button className="min-h-11" type="button" disabled={disabled} onClick={() => void run(() => startReview(uploaded))}>Start AI processing</Button>
        )}
        {canOpenIntake ? (
          <Link className="inline-flex min-h-11 items-center px-2 underline" href={`/dms/intake/${encodeURIComponent(uploaded.code)}`}>
            {reviewReady(intakeStatus) ? "Review document" : intakeStatus === "approved" ? "Open document" : "Open intake"}
          </Link>
        ) : (
          <Link className="inline-flex min-h-11 items-center px-2 underline" href="/dms/inbox">Open Upload Inbox</Link>
        )}
        <Button className="min-h-11" type="button" variant="outline" disabled={disabled} onClick={() => void run(() => save(null))}>Capture another document</Button>
      </>}
    </div>
    {uploaded && !uploaded.duplicate && <p role="status" className="text-sm">
      {reviewReady(intakeStatus) ? "Ready for review." : processing(intakeStatus) ? "AI is processing this document." :
        intakeStatus === "approved" ? "Approved." : intakeStatus === "failed" ? "AI processing failed. Open the intake for next steps." :
        intakeStatus === "discarded" ? "Intake discarded." : intakeStatus === "uploaded" ? message || "Document uploaded." : "Checking intake status…"}
    </p>}
    {uploaded?.duplicate && <p role="status" className="text-sm">DMS found a possible duplicate. Check the Upload Inbox before continuing.</p>}
    {!uploaded && message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
