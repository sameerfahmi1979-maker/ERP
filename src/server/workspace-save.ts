import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSaveContract, WorkspaceSaveReceipt } from "@/lib/workspace/save-contract";
import type { WorkspaceFieldErrors } from "@/lib/workspace/field-errors";
import {calendarSaveReceiptSchema} from '@/lib/master-data/calendar-save-receipt';
import {departmentSaveReceiptSchema} from '@/lib/master-data/department-save-receipt';

const contractSchema = z.object({operationId: z.string().uuid(), revision: z.string().regex(/^[1-9]\d*$/).nullable()});
const receiptSchema = z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean(),changed:z.boolean().optional(),owner_company_id:z.number().int().positive().nullable().optional(),calendar_id:z.number().int().positive().nullable().optional()});
export type WorkspaceSaveResult = { success: boolean; data?: WorkspaceSaveReceipt; error?: string; uncertain?: boolean; fieldErrors?: WorkspaceFieldErrors };

export async function saveWorkspaceRecord(entity: "departments" | "employees" | "hr_candidates" | "work_calendars" | "work_shifts", id: number | null, payload: object, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = contractSchema.safeParse(contract);
  if (!parsed.success || (id !== null && (!Number.isSafeInteger(id) || id <= 0 || !parsed.data.revision))) {
    return {success:false,error:"Reopen this record before saving. Its save identity or revision is missing."};
  }
  try {
    const client = await createClient();
    const {data,error} = await client.rpc(entity === "work_calendars" || entity === "work_shifts" ? "save_master_record" : "save_workspace_record", {
      p_entity:entity,p_operation:parsed.data.operationId,p_id:id,p_revision:parsed.data.revision,p_data:payload,
    });
    if (error) {
      if (error.code === "P0409" || error.code === "40001") return {success:false,error:"Someone changed this record after you opened it. Your draft is retained. Reopen the latest record and compare your changes before saving."};
      if (error.code === "42501") return {success:false,error:"This record is unavailable or you no longer have permission to save it."};
      if (error.code === "23505") return {success:false,error:"A record with this unique code already exists. Check the existing record before retrying."};
      if (error.code === "P0601" && (entity === "work_calendars" || entity === "work_shifts")) return {success:false,error:entity === "work_calendars"
        ? "This calendar has employee assignment history. Create a new calendar for different schedule rules; existing history is unchanged."
        : "This shift has employee assignment history. Create a new shift for different working times; existing history is unchanged."};
      // Recognized rejection is definite for this invocation only; completion-unknown,
      // unsupported/malformed codes and transport failures remain unconfirmed.
      const code = error.code;
      const knownRollback = typeof code === "string" && code.length === 5 && (
        /^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(code) ||
        code === "40000" || code === "40001" || code === "40002" || code === "40P01"
      );
      return {success:false,uncertain:!knownRollback,error:knownRollback ? "The save was rejected. Check the entered values and try again." : "Save unconfirmed. Keep the same values and retry safely to recover its result."};
    }
    if(entity==='work_calendars'||entity==='work_shifts'){
      const receipt=calendarSaveReceiptSchema.safeParse(data);
      const values=payload as {owner_company_id?:number|null;calendar_id?:number};
      const matches=receipt.success&&(id===null||receipt.data.id===id)&&
        (entity==='work_calendars'
          ?receipt.data.calendar_id===null&&(values.owner_company_id===undefined||receipt.data.owner_company_id===values.owner_company_id)
          :receipt.data.calendar_id!==null&&(values.calendar_id===undefined||receipt.data.calendar_id===values.calendar_id));
      return matches&&receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Save response incomplete. Retry with the same values to recover the result.'};
    }
    if(entity==='departments'){
      const receipt=departmentSaveReceiptSchema.safeParse(data),values=payload as {owner_company_id?:number;branch_id?:number|null};
      const matches=receipt.success&&(id===null||receipt.data.id===id)&&(values.owner_company_id===undefined||receipt.data.owner_company_id===values.owner_company_id)&&(values.branch_id===undefined||receipt.data.branch_id===values.branch_id);
      return receipt.success&&matches?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Save response incomplete. Retry with the same values to recover the result.'};
    }
    const receipt = receiptSchema.safeParse(data);
    return receipt.success ? {success:true,data:receipt.data} : {success:false,uncertain:true,error:"Save response incomplete. Retry with the same values to recover the result."};
  } catch {
    return {success:false,uncertain:true,error:"Save unconfirmed. Keep the same values and retry safely to recover its result."};
  }
}
