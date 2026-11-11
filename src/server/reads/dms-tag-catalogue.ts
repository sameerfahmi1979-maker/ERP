import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, type AuthContext } from "@/lib/rbac/check";
import { literalContains } from "@/lib/reads/search";

const querySchema = z.object({
  page: z.number().int().min(1).max(100_000),
  search: z.string().trim().max(200),
  kind: z.enum(["all", "system", "custom"]),
}).strict();

export type DmsTagCatalogueQuery = z.input<typeof querySchema>;
export type DmsCatalogueTag = { id: number; tag_name: string; tag_code: string | null; is_system: boolean };
export type DmsTagCatalogueResult =
  | { success: true; data: { tags: DmsCatalogueTag[]; total: number } }
  | { success: false; error: string };

export async function readDmsTagCatalogue(input: unknown, context: AuthContext): Promise<DmsTagCatalogueResult> {
  if (!context.profile || !context.isAccountActive || context.profile.must_change_password ||
    (!hasPermission(context, "dms.documents.view") && !hasPermission(context, "dms.admin"))) {
    return { success: false, error: "Permission denied" };
  }
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid tag search" };
  try {
    const { page, search, kind } = parsed.data;
    const client = await createClient();
    let query = client.from("dms_tags").select("id,tag_name,tag_code,is_system", { count: "exact" })
      .eq("is_active", true).is("deleted_at", null).order("tag_name").order("id");
    if (kind !== "all") query = query.eq("is_system", kind === "system");
    if (search) {
      const pattern = literalContains(search);
      query = query.or(`tag_name.ilike.${pattern},tag_code.ilike.${pattern}`);
    }
    const offset = (page - 1) * 25;
    const { data, count, error } = await query.range(offset, offset + 24);
    if (error || count === null || !data) return { success: false, error: "Tags could not be loaded" };
    return { success: true, data: { tags: data, total: count } };
  } catch {
    return { success: false, error: "Tags could not be loaded" };
  }
}
