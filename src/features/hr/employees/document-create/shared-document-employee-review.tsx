"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentEmployeeReview } from "@/lib/hr/numbered-document-employee-contract";
import {
  sharedDocumentEmployeeFormSchema,
  type SharedDocumentEmployeeDraft,
  type SharedDocumentEmployeeDraftRequest,
} from "@/lib/hr/shared-document-employee-draft";
import { accessSharedDocumentEmployeeDraft } from "@/server/actions/hr/shared-document-employee-draft";
import { HrDocumentEmployeeReviewStep, type EmployeeFormState } from "./hr-document-employee-review-step";

type Props = {
  review: ComponentProps<typeof HrDocumentEmployeeReviewStep>;
  reviewedSources: DocumentEmployeeReview["reviewedSources"];
  initialForm: EmployeeFormState;
};

export function SharedDocumentEmployeeReview({ review, reviewedSources, initialForm }: Props) {
  const [draft, setDraft] = useState<SharedDocumentEmployeeDraft | null>(null);
  const [form, setForm] = useState(initialForm);
  const [conflicts, setConflicts] = useState(review.draft.conflicts);
  const [busy, setBusy] = useState(false);
  const [reopenDraftId, setReopenDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const flight = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function clearDraft(idToReopen: string | null = null) {
    setDraft(null);
    setForm(initialForm);
    setConflicts(review.draft.conflicts);
    setReopenDraftId(idToReopen);
    setSaved(false);
    setError(null);
  }

  async function act(request: SharedDocumentEmployeeDraftRequest) {
    if (flight.current || !mounted.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await accessSharedDocumentEmployeeDraft(request);
      if (!mounted.current) return;
      if (!result.success) {
        if (result.code === "denied" || result.code === "disabled") clearDraft();
        // A revision conflict can also indicate invalidated source authority.
        // Keep only its opaque ID until a new authenticated read succeeds.
        if (result.code === "changed" || result.code === "unconfirmed") {
          clearDraft(request.kind === "open" ? null : request.draftId);
        }
        setError(result.error);
        return;
      }
      setDraft(result.data);
      if (request.kind !== "save") {
        setForm({
          ...initialForm,
          ...result.data.payload,
          owner_company_id: result.data.ownerCompanyId,
          branch_id: result.data.branchId,
        });
        setConflicts(review.draft.conflicts);
      }
      setReopenDraftId(null);
      setSaved(request.kind === "save");
    } catch {
      if (!mounted.current) return;
      clearDraft(request.kind === "open" ? null : request.draftId);
      setError("The draft result could not be confirmed. Reopen the shared draft to check its current revision.");
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const edit = (patch: Partial<EmployeeFormState>) => {
    setSaved(false);
    setForm(current => ({
      ...current, ...patch, owner_company_id: current.owner_company_id, branch_id: current.branch_id,
    }));
  };

  function saveDraft() {
    if (!draft) return;
    const payload = sharedDocumentEmployeeFormSchema.safeParse(form);
    if (!payload.success) {
      setError("Check the draft fields. Text fields can contain up to 500 characters.");
      return;
    }
    void act({ kind: "save", draftId: draft.draftId, revision: draft.revision, reviewedSources, payload: payload.data });
  }

  return (
    <fieldset disabled={busy} className="min-w-0 space-y-3" aria-busy={busy}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {draft ? <>
        <p role="status" className="text-sm text-muted-foreground">
          {saved ? `Shared draft saved at revision ${draft.revision}.` : `Shared draft revision ${draft.revision}`}
        </p>
        <HrDocumentEmployeeReviewStep
          {...review}
          form={form}
          setForm={edit}
          conflicts={conflicts}
          onResolveConflict={(fieldName, value, docId) => {
            setConflicts(current => current.map(conflict => conflict.fieldName === fieldName
              ? { ...conflict, resolvedValue: value, resolvedSourceDocumentId: docId } : conflict));
            edit({ [fieldName]: fieldName === "nationality_id" ? Number(value) : value });
          }}
          onNext={undefined}
          onBack={undefined}
          fixedScope
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => clearDraft()}>Return to employee review</Button>
          <Button type="button" onClick={saveDraft}>Save shared draft</Button>
        </div>
      </> : <>
        <Button type="button" variant="outline" onClick={() => void act(reopenDraftId
          ? { kind: "read", draftId: reopenDraftId, reviewedSources }
          : { kind: "open", reviewedSources })}>
          {reopenDraftId ? "Reopen shared draft" : "Open shared draft"}
        </Button>
        <HrDocumentEmployeeReviewStep {...review} />
      </>}
    </fieldset>
  );
}
