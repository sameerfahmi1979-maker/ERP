import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { WorkspaceSaveResult } from "@/server/workspace-save";
import type { Json } from "@/types/database";

const paths = { designations: "designations", approval_roles: "approval-roles", dms_required_document_rules: "dms-required-documents" } as const;
const opening = z.object({ operationId: z.uuid(), revision: z.string().regex(/^[1-9]\d*$/).max(19).nullable() });
const receipt = z.object({ id: z.number().int().positive(), revision: z.string().regex(/^[1-9]\d*$/), replayed: z.boolean() });

export async function saveCommonCatalogue(relation: keyof typeof paths, id: number | null, values: object, contract: WorkspaceSaveContract | undefined, archive = false): Promise<WorkspaceSaveResult> {
  const parsed = opening.safeParse(contract);
  if (!parsed.success || (id === null) !== (parsed.data.revision === null)) return { success: false, error: "Reopen the record to obtain its current revision." };
  const unknown: WorkspaceSaveResult = { success: false, uncertain: true, error: "Save unconfirmed. Retry with the same values to recover its result." };
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("phase3_save_catalogue", { p_relation: relation, p_id: id,
      p_revision: parsed.data.revision, p_operation: parsed.data.operationId, p_data: values as Json, p_archive: archive });
    if (error?.code === "42501") return { success: false, error: "This record is unavailable or you no longer have permission to edit it." };
    if (error?.code === "P0409") return { success: false, error: "The record changed after you opened it. Reopen the record to compare your draft." };
    if (/^(22|23)/.test(error?.code ?? "")) return { success: false, error: "The record was rejected. Review the entered values before retrying." };
    const saved = receipt.safeParse(data);
    if (error || !saved.success || (id !== null && saved.data.id !== id)) return unknown;
    const base = `/admin/common-master-data/${paths[relation]}`;
    revalidatePath(base);
    revalidatePath(`${base}/record/${saved.data.id}`);
    return { success:true, data:saved.data };
  } catch { return unknown; }
}
