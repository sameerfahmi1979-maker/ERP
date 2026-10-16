"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { upsertPartyFinanceProfileSchema, type UpsertFinanceProfileInput } from "@/features/master-data/parties/party-schemas";
import type { PartyFinanceProfile, ActionResult } from "@/features/master-data/parties/party-types";
import { partySaveReceipt, type PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";

const contractSchema = z.object({ operationId: z.string().uuid(), revision: z.string().regex(/^[1-9]\d*$/).nullable() }).strict();
const profileFields = "id,party_id,workspace_revision,default_currency_id,default_payment_term_id,default_payment_method_id,credit_limit,credit_currency_id,finance_hold,finance_hold_reason,finance_hold_by,finance_hold_at,finance_remarks,created_at,updated_at";

export async function getPartyFinanceProfile(partyId: number): Promise<ActionResult<PartyFinanceProfile | null>> {
  try {
    const admitted = await authorizePartyChildRead(partyId);
    if (!admitted.success) return { success: false, error: admitted.error };
    const { data, error } = await admitted.client.from("party_finance_profiles").select(profileFields).eq("party_id", partyId).maybeSingle();
    if (error) return { success: false, error: "Finance details could not be loaded. Try again." };
    return { success: true, data: data as PartyFinanceProfile | null };
  } catch { return { success: false, error: "Finance details could not be loaded. Try again." }; }
}

export async function upsertPartyFinanceProfile(input: UpsertFinanceProfileInput, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  const parsed = upsertPartyFinanceProfileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check the finance fields. Protected fields cannot be changed." };
  const attempt = contractSchema.safeParse(contract);
  if (!attempt.success) return { success: false, error: "Reopen the finance profile before saving. Its save identity or revision is unavailable." };
  let dispatched = false;
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "master_data.parties.edit") || !hasGlobalPermission(ctx, "master_data.parties.view")) {
      return { success: false, error: "You do not have permission to view and change shared party finance details." };
    }
    const client = await createClient();
    const { party_id, ...fields } = parsed.data;
    dispatched = true;
    const { data, error } = await client.rpc("save_party_finance_profile", {
      p_operation: attempt.data.operationId, p_party_id: party_id, p_revision: attempt.data.revision, p_data: fields,
    });
    if (error) {
      const rollback = (typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01','55P03','57014'].includes(error.code)));
      return { success: false, uncertain: !rollback, error:
        error.code === "PT409" || error.code === "40001" ? "Finance details changed after you opened them. Your draft is retained; reopen and compare before saving." :
        error.code === "42501" ? "The party is unavailable or your finance permission has changed." :
        error.code === "23503" ? "Choose active references and an active party before changing finance details." :
        rollback ? "The finance change was rejected. Check the fields and provide a reason for a finance hold." :
        "Save unconfirmed. Retry the same unchanged finance entries to recover its result." };
    }
    const receipt = partySaveReceipt.safeParse(data);
    if (!receipt.success) return { success: false, uncertain: true, error: "Save response incomplete. Retry the same unchanged finance entries." };
    try { revalidatePath("/admin/master-data/parties"); } catch { /* The database receipt confirms the commit. */ }
    return { success: true, data: receipt.data };
  } catch {
    return { success: false, uncertain: dispatched, error: dispatched ? "Save unconfirmed. Retry the same unchanged finance entries." : "The finance save could not start. Check your session and try again." };
  }
}
