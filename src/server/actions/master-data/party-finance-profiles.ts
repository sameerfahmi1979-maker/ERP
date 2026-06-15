"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import {
  upsertPartyFinanceProfileSchema,
  type UpsertFinanceProfileInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyFinanceProfile, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyFinanceProfile(partyId: number): Promise<ActionResult<PartyFinanceProfile | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_finance_profiles")
      .select("*")
      .eq("party_id", partyId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as PartyFinanceProfile | null) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function upsertPartyFinanceProfile(input: UpsertFinanceProfileInput): Promise<ActionResult> {
  try {
    const parsed = upsertPartyFinanceProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.edit")) {
      return { success: false, error: "You do not have permission to manage finance profiles" };
    }

    const supabase = await createClient();
    const { party_id, ...fields } = parsed.data;

    // Check if profile exists
    const { data: existing } = await supabase
      .from("party_finance_profiles")
      .select("id")
      .eq("party_id", party_id)
      .maybeSingle();

    let profileId: number;
    if (existing) {
      const { error } = await supabase
        .from("party_finance_profiles")
        .update({ ...fields, updated_by: ctx.profile?.id ?? null })
        .eq("id", existing.id);
      if (error) return { success: false, error: error.message };
      profileId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("party_finance_profiles")
        .insert({ party_id, ...fields, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      profileId = data.id;
    }

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_finance_profiles",
      entity_id: profileId,
      entity_reference: `party_${party_id}_finance`,
      action: existing ? "update" : "create",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
