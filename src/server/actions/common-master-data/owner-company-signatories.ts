"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { canReadCompanySignatories, canManageCompanySignatories, signatoryId, signatoryContract, signatoryReceipt, signatoryRow, createSignatoryInput, updateSignatoryInput, type CreateSignatoryInput, type UpdateSignatoryInput, type SignatoryReceipt, type OwnerCompanySignatoryRow } from "@/lib/administration/company-signatory-contract";

export type { OwnerCompanySignatoryRow } from "@/lib/administration/company-signatory-contract";
export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string; uncertain?: boolean };
const denied = "Global signatory read and management permission is required to make this change.";
const readError = "Company signatories could not be loaded. Check access and try again.";

export async function listCompanySignatories(company_id: number): Promise<ActionResult<OwnerCompanySignatoryRow[]>> {
  if (!signatoryId.safeParse(company_id).success) return { success: false, error: "The company is unavailable." };
  try {
    if (!canReadCompanySignatories(await getAuthContext())) return { success: false, error: "Global signatory read permission is required. Scoped company access does not include this shared child register." };
    const client = await createClient();
    const rows: OwnerCompanySignatoryRow[] = [];
    let after = 0;
    // Bounded existing-query pagination, not a competing shared cache/collector.
    // Continue to an empty page even when an API cap returns fewer than requested.
    for (let page = 0; page < 10000; page++) {
      const { data, error } = await client.rpc("read_company_signatories", { p_company_id: company_id, p_after: after, p_limit: 200 });
      if (error || !Array.isArray(data)) return { success: false, error: readError };
      if (!data.length) return { success: true, data: rows.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.full_name.localeCompare(b.full_name) || a.id - b.id) };
      for (const item of data) {
        const parsed = signatoryRow.safeParse(item);
        if (!parsed.success || parsed.data.company_id !== company_id || parsed.data.id <= after) return { success: false, error: readError };
        rows.push(parsed.data); after = parsed.data.id;
      }
    }
    return { success: false, error: "The signatory register is incomplete. Try again before making changes." };
  } catch { return { success: false, error: readError }; }
}

async function mutate(action: "save" | "archive" | "restore", companyId: number, id: number | null, fields: Record<string, unknown>, contract?: WorkspaceSaveContract): Promise<ActionResult<SignatoryReceipt>> {
  const attempt = signatoryContract.safeParse(contract);
  if (!signatoryId.safeParse(companyId).success || (id !== null && !signatoryId.safeParse(id).success) || !attempt.success || (id === null) !== (attempt.data.revision === null)) return { success: false, error: "Reopen the signatory before saving. Its save identity or revision is unavailable." };
  let dispatched = false;
  try {
    if (!canManageCompanySignatories(await getAuthContext())) return { success: false, error: denied };
    const client = await createClient();
    dispatched = true;
    const { data, error } = await client.rpc("save_company_signatory", { p_operation: attempt.data.operationId, p_company_id: companyId, p_id: id, p_revision: attempt.data.revision, p_action: action, p_data: fields });
    if (error) {
      const rollback = (typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01','55P03','57014'].includes(error.code)));
      return { success: false, uncertain: !rollback, error:
        error.code === "PT409" || error.code === "40001" ? "The signatory changed after you opened it. Your entries are retained; reopen and compare before saving." :
        error.code === "PT404" ? "The company or signatory is unavailable. No change was made." :
        error.code === "42501" ? denied :
        rollback ? "The signatory change was rejected. Check the name, dates and selected user before retrying." :
        "Save unconfirmed. Retry the same unchanged signatory request to recover its result." };
    }
    const receipt = signatoryReceipt.safeParse(data);
    if (!receipt.success || (id !== null && receipt.data.id !== id)) return { success: false, uncertain: true, error: "Save response incomplete. Retry the unchanged signatory request." };
    try { revalidatePath(`/admin/organizations/record/${companyId}`); } catch { /* A confirmed database receipt is independent of cache refresh. */ }
    return { success: true, data: receipt.data };
  } catch { return { success: false, uncertain: dispatched, error: dispatched ? "Save unconfirmed. Retry the unchanged signatory request." : "The signatory save could not start. Check your session and try again." }; }
}
export async function createCompanySignatory(input: CreateSignatoryInput, contract?: WorkspaceSaveContract): Promise<ActionResult<SignatoryReceipt>> {
  const parsed = createSignatoryInput.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check the signatory fields, full name and date range." };
  const { company_id, ...fields } = parsed.data;
  return mutate("save", company_id, null, fields, contract);
}
export async function updateCompanySignatory(input: UpdateSignatoryInput, contract?: WorkspaceSaveContract): Promise<ActionResult<SignatoryReceipt>> {
  const parsed = updateSignatoryInput.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check the signatory fields, full name and date range." };
  const { id, company_id, ...fields } = parsed.data;
  return mutate("save", company_id, id, fields, contract);
}
/** Compatibility name: retains the record and history; never physically deletes. */
export async function softDeleteCompanySignatory(id: number, company_id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<SignatoryReceipt>> {
  return mutate("archive", company_id, id, {}, contract);
}
export async function restoreCompanySignatory(id: number, company_id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<SignatoryReceipt>> {
  return mutate("restore", company_id, id, {}, contract);
}
