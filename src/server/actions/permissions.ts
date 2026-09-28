"use server";
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, assertAccountActive } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { z } from "zod";
export type PermissionDraftChangeInput = {
  permissionId: number;
  permissionCode: string;
  permissionName: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  action: "grant" | "revoke";
  expectedAssigned?: boolean;
};

export type BatchChangeResult = {
  permissionId: number;
  roleId: number;
  action: "grant" | "revoke";
  success: boolean;
  error?: string;
};

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


const batchSchema = z.array(z.object({
  roleId: z.number().int().positive(), permissionId: z.number().int().positive(), action: z.enum(["grant","revoke"]),
  expectedAssigned: z.boolean().optional(),
})).max(500);

export async function saveRolePermissionDraftChanges(changes: PermissionDraftChangeInput[]): Promise<{ success: boolean; results: BatchChangeResult[]; error?: string }> {
  const parsed = batchSchema.safeParse(changes);
  if (!parsed.success) return { success: false, results: [], error: "Invalid permission change batch." };
  try {
    const ctx = await getAuthContext(); assertAccountActive(ctx);
    if (!hasPermission(ctx,"roles.manage")) return { success: false, results: [], error: "Permission denied." };
    if (!parsed.data.length) return { success: true, results: [] };
    if (new Set(parsed.data.map(c => c.roleId + ":" + c.permissionId)).size !== parsed.data.length) return { success: false, results: [], error: "Duplicate permission changes are not allowed." };
    const { data, error } = await (await createClient()).rpc("f03_apply_permission_batch", { changes: parsed.data });
    if (error) return { success: false, results: parsed.data.map(c => ({ ...c, success: false, error: "No changes applied. Permission validation or audit persistence failed." })), error: "The batch was not applied. Reload and review access before retrying." };
    revalidatePath("/admin/permissions"); revalidatePath("/admin/roles");
    return { success: true, results: data as BatchChangeResult[] };
  } catch { return { success: false, results: [], error: "No permission changes were confirmed. Please reload and review." }; }
}

export async function assignPermissionToRole(roleId: number, permissionId: number): Promise<ActionResult> {
  const result = await saveRolePermissionDraftChanges([{ roleId,permissionId,action:"grant",permissionCode:"",permissionName:"",roleCode:"",roleName:"" }]);
  return { success: result.success, error: result.error };
}
export async function removePermissionFromRole(roleId: number, permissionId: number): Promise<ActionResult> {
  const result = await saveRolePermissionDraftChanges([{ roleId,permissionId,action:"revoke",permissionCode:"",permissionName:"",roleCode:"",roleName:"" }]);
  return { success: result.success, error: result.error };
}
