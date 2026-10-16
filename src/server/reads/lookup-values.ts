import "server-only";
import { z } from "zod";
import { hasGlobalPermission, type AuthContext } from "@/lib/rbac/check";
import { getReadAuthContext } from "./read-context";
import { createClient } from "@/lib/supabase/server";
import type { LookupChoice as LookupValue } from "@/lib/reads/lookup-contract";
import { pageParameters } from "@/lib/reads/page-contract";
import { readAllPages } from "./all-pages";

const code = z.string().trim().min(1).max(100).transform(value => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_]+$/));
const selected = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), code]).optional();
export const lookupReadSchema = z.object({
  categoryCode: code, parentValueCode: code.nullable().optional(),
  includeInactive: z.boolean().default(false), selected,
  valueField: z.enum(["id", "code"]).default("id"),
}).strict().superRefine((p, ctx) => {
  if (p.valueField === "id" && typeof p.selected === "string" &&
      (!/^[1-9][0-9]*$/.test(p.selected) || !Number.isSafeInteger(Number(p.selected)))) {
    ctx.addIssue({ code: "custom", path: ["selected"], message: "Invalid selected choice" });
  }
});
export const lookupBatchSchema = z.object({
  categoryCodes: z.array(code).min(1).max(40), includeInactive: z.boolean().default(false),
}).strict();

export const lookupSearchSchema = pageParameters.extend({
  categoryCode: code, parentValueCode: code.nullable().optional(),
  language: z.enum(["en", "ar"]).default("en"),
}).strict();
type Result<T> = { success: boolean; data?: T; error?: string };
// Only the existing F06 shared-choice projection. Never management metadata or
// a raw-table fallback, including for selected historical values.
const columns = "id,category_id,value_code,value_label_en,value_label_ar,color_hex,icon_name,badge_variant,sort_order,is_default,parent_value_id,is_active";
function usable(ctx: AuthContext) {
  return !!ctx.profile && ctx.isAccountActive && ctx.profile.must_change_password !== true;
}
function canManageCatalogue(ctx: AuthContext) {
  return ["master_data.lookups.view", "master_data.lookups.manage", "master_data.lookups.lock"]
    .some(permission => hasGlobalPermission(ctx, permission));
}

/** Bounded, user-scoped label search for larger configuration pickers.
 * Selected inactive values use the separate exact-value reader, not this list.
 */
export async function readLookupSearch(input: unknown) {
  const parsed = lookupSearchSchema.safeParse(input);
  if (!parsed.success) return {success:false, error:"Invalid lookup parameters"};
  try {
    const ctx = await getReadAuthContext();
    if (!usable(ctx)) return {success:false, error:"Permission denied"};
    const p = parsed.data, db = await createClient();
    const category = await db.from("erp_lookup_category_choices").select("id,is_active").eq("category_code",p.categoryCode).maybeSingle();
    if (category.error || !category.data) return {success:false, error:"Lookup category is unavailable"};
    const empty = {success:true, data:{rows:[],totalCount:0,page:p.page,pageSize:p.pageSize}};
    if (!category.data.is_active) return empty;
    let parentId:number|null = null;
    if (p.parentValueCode) {
      const parent = await db.from("erp_lookup_value_choices").select("id").eq("category_id",category.data.id).eq("value_code",p.parentValueCode).maybeSingle();
      if (parent.error) throw Error("Parent read failed");
      if (!parent.data) return {success:false,error:"Lookup parent is unavailable"};
      parentId = parent.data.id;
    }
    const label = p.language === "ar" ? "value_label_ar" : "value_label_en";
    let query = db.from("erp_lookup_value_choices").select(columns,{count:"exact"})
      .eq("category_id",category.data.id).eq("is_active",true).order(label).order("id");
    query = parentId === null ? query.is("parent_value_id",null) : query.eq("parent_value_id",parentId);
    // Literal substring; no dynamic columns, raw OR expressions or wildcard widening.
    if (p.search) query = query.ilike(label, `%${p.search.replace(/[\\%_]/g, character => `\\${character}`)}%`);
    const from = (p.page - 1) * p.pageSize;
    const result = await query.range(from,from+p.pageSize-1);
    if (result.error || !Number.isSafeInteger(result.count) || result.count === null || !Array.isArray(result.data) || result.data.length > p.pageSize) throw Error("Incomplete read");
    return {success:true,data:{rows:result.data as unknown as LookupValue[],totalCount:result.count,page:p.page,pageSize:p.pageSize}};
  } catch { return {success:false,error:"Choices could not be loaded. Please retry."}; }
}

export async function readLookupValues(input: unknown, signal?: AbortSignal): Promise<Result<LookupValue[]>> {
  const parsed = lookupReadSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid lookup parameters" };
  try {
    signal?.throwIfAborted();
    // No caller-supplied permission context: every HTTP read reloads live authority.
    const ctx = await getReadAuthContext();
    if (!usable(ctx)) return { success: false, error: "Permission denied" };
    signal?.throwIfAborted();
    const p = parsed.data, db = await createClient(), isAdmin = canManageCatalogue(ctx);
    let categoryQuery = db.from("erp_lookup_category_choices").select("id,is_active")
      .eq("category_code", p.categoryCode);
    if (signal) categoryQuery = categoryQuery.abortSignal(signal);
    const category = await categoryQuery.maybeSingle();
    signal?.throwIfAborted();
    if (category.error) throw Error("Category read failed");
    if (!category.data) return { success: false, error: "Lookup category is unavailable" };
    if (!category.data.is_active && !isAdmin) return { success: true, data: [] };
    const categoryId = category.data.id;
    let parentId: number | null = null;
    if (p.parentValueCode) {
      let parentQuery = db.from("erp_lookup_value_choices").select("id")
        .eq("category_id", categoryId).eq("value_code", p.parentValueCode);
      if (signal) parentQuery = parentQuery.abortSignal(signal);
      const parent = await parentQuery.maybeSingle();
      signal?.throwIfAborted();
      if (parent.error) throw Error("Parent read failed");
      if (!parent.data) return { success: false, error: "Lookup parent is unavailable" };
      parentId = parent.data.id;
    }
    const data = await readAllPages<LookupValue>(async (from, to) => {
      signal?.throwIfAborted();
      let q = db.from("erp_lookup_value_choices").select(columns, { count: "exact" })
        .eq("category_id", categoryId).order("sort_order").order("value_label_en").order("id");
      q = parentId === null ? q.is("parent_value_id", null) : q.eq("parent_value_id", parentId);
      // Omit only the active filter for this exact selected value. The F06 view
      // still enforces live visibility/effective dates; this is no extra grant.
      if (p.selected !== undefined) q = p.valueField === "code"
        ? q.eq("value_code", String(p.selected)) : q.eq("id", Number(p.selected));
      else if (!(p.includeInactive && isAdmin)) q = q.eq("is_active", true);
      q = q.range(from, to);
      if (signal) q = q.abortSignal(signal);
      const r = await q;
      signal?.throwIfAborted();
      return { ...r, data: r.data as unknown as LookupValue[] | null };
    }, { identity: row => row.id, maxRows: 5000 });
    return { success: true, data };
  } catch {
    return { success: false, error: "Choices could not be completely loaded. Please retry." };
  }
}

export async function readLookupBatch(input: unknown, signal?: AbortSignal): Promise<Result<Record<string, LookupValue[]>>> {
  const parsed = lookupBatchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid lookup parameters" };
  try {
    signal?.throwIfAborted();
    const ctx = await getReadAuthContext();
    if (!usable(ctx)) return { success: false, error: "Permission denied" };
    signal?.throwIfAborted();
    const p = parsed.data, db = await createClient();
    const includeInactive = p.includeInactive && canManageCatalogue(ctx);
    const codes = [...new Set(p.categoryCodes)], result: Record<string, LookupValue[]> = {};
    for (const category of codes) result[category] = [];
    const categories = await readAllPages<{ id: number; category_code: string; is_active: boolean }>(async (from, to) => {
      signal?.throwIfAborted();
      let q = db.from("erp_lookup_category_choices").select("id,category_code,is_active", { count: "exact" })
        .in("category_code", codes).order("id").range(from, to);
      if (signal) q = q.abortSignal(signal);
      const r = await q;
      signal?.throwIfAborted();
      return { ...r, data: r.data as { id: number; category_code: string; is_active: boolean }[] | null };
    }, { identity: row => row.id, maxRows: 5000 });
    // Hidden/unknown categories cannot establish a successful empty catalogue.
    if (categories.length !== codes.length || codes.some(code => !categories.some(category => category.category_code === code))) {
      return { success: false, error: "One or more lookup categories are unavailable. Please retry or contact your administrator." };
    }
    const map = new Map(categories.filter(c => includeInactive || c.is_active).map(c => [c.id, c.category_code]));
    if (!map.size) return { success: true, data: result };
    const values = await readAllPages<LookupValue>(async (from, to) => {
      signal?.throwIfAborted();
      let q = db.from("erp_lookup_value_choices").select(columns, { count: "exact" })
        .in("category_id", [...map.keys()]).is("parent_value_id", null)
        .order("sort_order").order("value_label_en").order("id");
      if (!includeInactive) q = q.eq("is_active", true);
      q = q.range(from, to);
      if (signal) q = q.abortSignal(signal);
      const r = await q;
      signal?.throwIfAborted();
      return { ...r, data: r.data as unknown as LookupValue[] | null };
    }, { identity: row => row.id, maxRows: 5000 });
    for (const value of values) {
      const category = map.get(value.category_id);
      if (!category) throw Error("Unexpected category");
      result[category].push(value);
    }
    return { success: true, data: result };
  } catch {
    return { success: false, error: "Choices could not be completely loaded. Please retry." };
  }
}
