"use server";

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import {
  getDmsDocumentsByEntity,
  linkDmsDocumentToEntity,
  unlinkDmsDocumentFromEntity,
  getAvailableDmsDocumentsForLink,
  type DmsEntityDocumentRow,
  type AvailableDmsDocumentOption,
  type ActionResult,
} from "@/server/actions/dms/entity-documents";

const REVALIDATE_PATH = "/admin/master-data/parties";

// ── getPartyDmsDocuments ───────────────────────────────────────────────────────

export async function getPartyDmsDocuments(
  partyId: number
): Promise<ActionResult<DmsEntityDocumentRow[]>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "master_data.parties.view") &&
    !hasPermission(ctx, "master_data.parties.manage")
  ) {
    return { success: false, error: "Permission denied" };
  }
  return getDmsDocumentsByEntity("party", partyId);
}

// ── attachExistingDmsDocumentToParty ───────────────────────────────────────────

export async function attachExistingDmsDocumentToParty(
  partyId: number,
  documentId: number
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "master_data.parties.manage_documents") &&
    !hasPermission(ctx, "dms.admin")
  ) {
    return { success: false, error: "Permission denied" };
  }

  const result = await linkDmsDocumentToEntity(documentId, "party", partyId, {
    is_primary: false,
  });

  if (result.success) {
    revalidatePath(REVALIDATE_PATH);
  }
  return result;
}

// ── unlinkDmsDocumentFromParty ─────────────────────────────────────────────────

export async function unlinkDmsDocumentFromParty(
  partyId: number,
  linkId: number,
  documentId: number
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "master_data.parties.manage_documents") &&
    !hasPermission(ctx, "dms.admin")
  ) {
    return { success: false, error: "Permission denied" };
  }

  const result = await unlinkDmsDocumentFromEntity(linkId, documentId, "party", partyId);
  if (result.success) {
    revalidatePath(REVALIDATE_PATH);
  }
  return result;
}

// ── getAvailableDmsDocumentsForPartyLink ───────────────────────────────────────

export async function getAvailableDmsDocumentsForPartyLink(
  partyId: number,
  search?: string
): Promise<ActionResult<AvailableDmsDocumentOption[]>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "master_data.parties.view") &&
    !hasPermission(ctx, "master_data.parties.manage")
  ) {
    return { success: false, error: "Permission denied" };
  }
  return getAvailableDmsDocumentsForLink("party", partyId, search);
}
