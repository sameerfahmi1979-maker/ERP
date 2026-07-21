"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsAdminOverviewStats = {
  categories_total: number;
  categories_active: number;
  document_types_total: number;
  document_types_active: number;
  document_types_system: number;
  document_types_custom: number;
  metadata_definitions_total: number;
  tags_total: number;
  tags_active: number;
  retention_policies_total: number;
  retention_policies_active: number;
  approval_workflows_total: number;
  approval_workflows_active: number;
};

export async function getDmsAdminOverviewStats(): Promise<ActionResult<DmsAdminOverviewStats>> {
  try {
    const supabase = await createClient();

    const [
      catAll,
      catActive,
      typesAll,
      typesActive,
      typesSystem,
      metaAll,
      tagsAll,
      tagsActive,
      retAll,
      retActive,
      wfAll,
      wfActive,
    ] = await Promise.all([
      supabase.from("dms_document_categories").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("dms_document_categories").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_active", true),
      supabase.from("dms_document_types").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("dms_document_types").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_active", true),
      supabase.from("dms_document_types").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_system", true),
      supabase.from("dms_metadata_definitions").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("dms_tags").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("dms_tags").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_active", true),
      supabase.from("dms_retention_policies").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("dms_retention_policies").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_active", true),
      supabase.from("dms_document_workflows").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("dms_document_workflows").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_active", true),
    ]);

    const typesTotal = typesAll.count ?? 0;
    const typesSystemCount = typesSystem.count ?? 0;

    return {
      success: true,
      data: {
        categories_total: catAll.count ?? 0,
        categories_active: catActive.count ?? 0,
        document_types_total: typesTotal,
        document_types_active: typesActive.count ?? 0,
        document_types_system: typesSystemCount,
        document_types_custom: typesTotal - typesSystemCount,
        metadata_definitions_total: metaAll.count ?? 0,
        tags_total: tagsAll.count ?? 0,
        tags_active: tagsActive.count ?? 0,
        retention_policies_total: retAll.count ?? 0,
        retention_policies_active: retActive.count ?? 0,
        approval_workflows_total: wfAll.count ?? 0,
        approval_workflows_active: wfActive.count ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
