"use server";

import { canStartDocumentEmployee } from "@/lib/hr/numbered-document-employee-contract";
import {
  sharedDocumentEmployeeDraftRequestSchema,
  sharedDocumentEmployeeDraftSchema,
  type SharedDocumentEmployeeDraftResult,
} from "@/lib/hr/shared-document-employee-draft";
import { getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { isSharedDocumentEmployeeDraftEnabled } from "@/server/hr-shared-document-draft-feature";

const failures = {
  disabled: "Shared employee drafts are unavailable.",
  invalid: "Check the draft fields and reviewed documents before trying again.",
  denied: "Current HR access and approval for these exact sources are required.",
  changed: "The saved draft or reviewed documents changed. Reopen the shared draft or review the selected documents again.",
  unconfirmed: "The draft result could not be confirmed. Reopen the shared draft to check its current revision.",
} as const;

function reject(code: keyof typeof failures): SharedDocumentEmployeeDraftResult {
  return { success: false, code, error: failures[code] };
}

function rejectRpc(code: string): SharedDocumentEmployeeDraftResult {
  switch (code) {
    case "42501": return reject("denied");
    case "PT409":
    case "P0409": return reject("changed");
    case "22023": return reject("invalid");
    default: return reject("unconfirmed");
  }
}

const orderSources = (a: { documentId: number }, b: { documentId: number }) => a.documentId - b.documentId;

export async function accessSharedDocumentEmployeeDraft(raw: unknown): Promise<SharedDocumentEmployeeDraftResult> {
  if (!isSharedDocumentEmployeeDraftEnabled()) return reject("disabled");
  const parsed = sharedDocumentEmployeeDraftRequestSchema.safeParse(raw);
  if (!parsed.success) return reject("invalid");

  const request = parsed.data;
  const sources = request.reviewedSources.toSorted(orderSources);

  try {
    // The normal wizard admission checks a current authenticated ERP session.
    // The caller RPC verifies exact scope and source approval in the database.
    const actor = await getAuthContext();
    if (!canStartDocumentEmployee(actor)) return reject("denied");
    const client = await createClient();

    const { data, error } = request.kind === "open"
      ? await client.rpc("open_shared_hr_document_draft", {
        p_document_ids: sources.map(source => source.documentId),
        p_source_fingerprints: sources,
      })
      : await client.rpc("read_shared_hr_document_draft", { p_draft_id: request.draftId });
    if (error) return rejectRpc(error.code);
    const current = sharedDocumentEmployeeDraftSchema.safeParse(data);
    if (!current.success || (request.kind !== "open" && current.data.draftId !== request.draftId)) {
      return reject("unconfirmed");
    }
    const draft = current.data;
    const draftSources = draft.sourceFingerprints.toSorted(orderSources);
    if (!sources.every((source, index) => source.documentId === draftSources[index]?.documentId &&
      source.fingerprint === draftSources[index]?.fingerprint) || sources.length !== draftSources.length) {
      return reject("changed");
    }
    if (request.kind !== "save") return { success: true, data: draft };
    if (request.revision !== draft.revision) return reject("changed");

    // The source witness is immutable on the draft. The write independently
    // locks the current revision and rechecks the live sources and authority.
    const saved = await client.rpc("save_shared_hr_document_draft", {
      p_draft_id: draft.draftId,
      p_expected_revision: request.revision,
      p_payload: request.payload,
    });
    if (saved.error) return rejectRpc(saved.error.code);
    const receipt = sharedDocumentEmployeeDraftSchema.safeParse(saved.data);
    if (!receipt.success || receipt.data.draftId !== draft.draftId || receipt.data.revision !== draft.revision + 1 ||
      receipt.data.ownerCompanyId !== draft.ownerCompanyId || receipt.data.branchId !== draft.branchId ||
      JSON.stringify(receipt.data.sourceFingerprints.toSorted(orderSources)) !== JSON.stringify(draftSources) ||
      Object.keys(receipt.data.payload).length !== Object.keys(request.payload).length ||
      !Object.entries(request.payload).every(([key, value]) => receipt.data.payload[key as keyof typeof request.payload] === value)) {
      return reject("unconfirmed");
    }
    return { success: true, data: receipt.data };
  } catch {
    return reject("unconfirmed");
  }
}
