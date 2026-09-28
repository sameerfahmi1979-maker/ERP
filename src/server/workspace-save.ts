import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSaveContract, WorkspaceSaveReceipt } from "@/lib/workspace/save-contract";
import type { WorkspaceFieldErrors } from "@/lib/workspace/field-errors";

const contractSchema = z.object({operationId: z.string().uuid(), revision: z.string().regex(/^[1-9]\d*$/).nullable()});
const receiptSchema = z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()});
export type WorkspaceSaveResult = { success: boolean; data?: WorkspaceSaveReceipt; error?: string; uncertain?: boolean; fieldErrors?: WorkspaceFieldErrors };

export async function saveWorkspaceRecord(entity: "departments" | "employees" | "hr_candidates", id: number | null, payload: object, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = contractSchema.safeParse(contract);
  if (!parsed.success || (id !== null && (!Number.isSafeInteger(id) || id <= 0 || !parsed.data.revision))) {
    return {success:false,error:"Reopen this record before saving. Its save identity or revision is missing."};
  }
  try {
    const client = await createClient();
    const {data,error} = await client.rpc("save_workspace_record", {
      p_entity:entity,p_operation:parsed.data.operationId,p_id:id,p_revision:parsed.data.revision,p_data:payload,
    });
    if (error) {
      if (error.code === "P0409" || error.code === "40001") return {success:false,error:"Someone changed this record after you opened it. Your draft is retained. Reopen the latest record and compare your changes before saving."};
      if (error.code === "42501") return {success:false,error:"This record is unavailable or you no longer have permission to save it."};
      if (error.code === "23505") return {success:false,error:"A record with this unique code already exists. Check the existing record before retrying."};
      // PostgreSQL errors mean the entire transaction rolled back. Transport errors do not.
      const knownRollback = /^(22|23|42|P0|40)/.test(error.code ?? "");
      return {success:false,uncertain:!knownRollback,error:knownRollback ? "The save was rejected. Check the entered values and try again." : "Save unconfirmed. Keep the same values and retry safely to recover its result."};
    }
    const receipt = receiptSchema.safeParse(data);
    return receipt.success ? {success:true,data:receipt.data} : {success:false,uncertain:true,error:"Save response incomplete. Retry with the same values to recover the result."};
  } catch {
    return {success:false,uncertain:true,error:"Save unconfirmed. Keep the same values and retry safely to recover its result."};
  }
}
