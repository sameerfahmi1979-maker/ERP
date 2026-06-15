"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartyDocumentSchema,
  updatePartyDocumentSchema,
  type CreatePartyDocumentInput,
  type UpdatePartyDocumentInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyDocument, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyDocuments(partyId: number): Promise<ActionResult<PartyDocument[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_documents")
      .select(`*, party_document_types!document_type_id(name_en), party_document_statuses!document_status_id(name_en)`)
      .eq("party_id", partyId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyDocument),
      document_type_name: (row.party_document_types as { name_en?: string } | null)?.name_en ?? undefined,
      document_status_name: (row.party_document_statuses as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyDocument(input: CreatePartyDocumentInput): Promise<ActionResult<{ id: number; document_code: string }>> {
  try {
    const parsed = createPartyDocumentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_documents")) {
      return { success: false, error: "You do not have permission to manage documents" };
    }

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_DOCUMENT",
      targetTableName: "party_documents",
      generationReason: "Party document creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate document code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_documents")
      .insert({
        ...parsed.data,
        document_code: numberingResult.data.generatedReferenceNumber,
        uploaded_by: ctx.profile?.id ?? null,
        uploaded_at: new Date().toISOString(),
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, document_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_documents",
      entity_id: data.id,
      entity_reference: data.document_code,
      action: "create",
      new_values: parsed.data,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, document_code: data.document_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyDocument(input: UpdatePartyDocumentInput): Promise<ActionResult> {
  try {
    const parsed = updatePartyDocumentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_documents")) {
      return { success: false, error: "You do not have permission to manage documents" };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_documents").select("document_code").eq("id", id).single();

    const { error } = await supabase
      .from("party_documents")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_documents",
      entity_id: id,
      entity_reference: old?.document_code ?? String(id),
      action: "update",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyDocument(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_documents")) {
      return { success: false, error: "You do not have permission to manage documents" };
    }

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_documents").select("document_code").eq("id", id).single();
    const { error } = await supabase.from("party_documents").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_documents",
      entity_id: id,
      entity_reference: old?.document_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
