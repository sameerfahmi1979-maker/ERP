"use server";

import { createClient } from "@/lib/supabase/server";
import { remainingDmsCount, verifiedDmsCount } from "@/server/reads/dms-admin-count";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsAdminOverviewStats = {
  categories_total: number | null;
  categories_active: number | null;
  document_types_total: number | null;
  document_types_active: number | null;
  document_types_system: number | null;
  document_types_custom: number | null;
  metadata_definitions_total: number | null;
  tags_total: number | null;
  tags_active: number | null;
  retention_policies_total: number | null;
  retention_policies_active: number | null;
  approval_workflows_total: number | null;
  approval_workflows_active: number | null;
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

    const typesTotal = verifiedDmsCount(typesAll);
    const typesSystemCount = verifiedDmsCount(typesSystem);

    return {
      success: true,
      data: {
        categories_total: verifiedDmsCount(catAll),
        categories_active: verifiedDmsCount(catActive),
        document_types_total: typesTotal,
        document_types_active: verifiedDmsCount(typesActive),
        document_types_system: typesSystemCount,
        document_types_custom: remainingDmsCount(typesTotal, typesSystemCount),
        metadata_definitions_total: verifiedDmsCount(metaAll),
        tags_total: verifiedDmsCount(tagsAll),
        tags_active: verifiedDmsCount(tagsActive),
        retention_policies_total: verifiedDmsCount(retAll),
        retention_policies_active: verifiedDmsCount(retActive),
        approval_workflows_total: verifiedDmsCount(wfAll),
        approval_workflows_active: verifiedDmsCount(wfActive),
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
