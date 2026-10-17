"use server";

import { readAllPages } from "@/server/reads/all-pages";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import {readMetadataSnapshot,saveReviewedMetadata} from "@/server/dms-reviewed-updates";
import {
  DMS_METADATA_DEFINITION_SELECT,
  filterMetadataDefinitionsByContext,
  mapMetadataDefinitionRow,
  type DmsMetadataDefinitionBase,
} from "@/lib/dms/metadata/metadata-definition-shared";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  uncertain?: boolean;
  snapshot?: string;
  sourceSnapshot?: string | null;
};

export type DmsMetadataDefinitionRow = DmsMetadataDefinitionBase;

export type DmsMetadataValueInput = {
  definition_id: number;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_datetime?: string | null;
  value_boolean?: boolean | null;
  value_json?: unknown;
};

export type DmsMetadataValueRow = {
  id: number;
  document_id: number;
  definition_id: number;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_datetime: string | null;
  value_boolean: boolean | null;
  value_json: unknown;
  definition?: DmsMetadataDefinitionRow | null;
};

// ── getMetadataDefinitionsForType ─────────────────────────────────────────────

export async function getMetadataDefinitionsForType(
  documentTypeId: number,
  context: "all" | "intake" | "detail" = "intake",
  documentId?: number,
): Promise<ActionResult<DmsMetadataDefinitionRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.isAccountActive || ctx.profile?.must_change_password || (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin"))) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    // Type configuration has global-admin policies. An existing authorized
    // document may hydrate its own definitions without granting catalog access.
    let reader = supabase;
    if (documentId !== undefined) {
      if (!Number.isSafeInteger(documentId) || documentId <= 0) return { success: false, error: "Document unavailable" };
      const { data: document, error: documentError } = await supabase.from("dms_documents")
        .select("id,document_type_id").eq("id", documentId).is("deleted_at", null).maybeSingle();
      if (documentError || !document || document.document_type_id !== documentTypeId) return { success: false, error: "Document unavailable" };
      reader = createAdminClient();
    }
    const data = await readAllPages(async(from,to)=>await reader
      .from("dms_metadata_definitions")
      .select(DMS_METADATA_DEFINITION_SELECT,{count:"exact"})
      .eq("document_type_id", documentTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order").order("id").range(from,to),{identity:row=>row.id,maxRows:10000});


    const mapped = (data ?? []).map((row) =>
      mapMetadataDefinitionRow(row as Record<string, unknown>)
    );
    const filtered = context === "detail" ? mapped.filter(row => row.show_in_detail) : filterMetadataDefinitionsByContext(mapped, context === "intake" ? "intake" : "all");

    return { success: true, data: filtered };
  } catch (err) {
    logger.error("getMetadataDefinitionsForType error", err);
    return { success: false, error: "Failed to load metadata definitions" };
  }
}

// ── getDmsDocumentMetadataValues ──────────────────────────────────────────────

export async function getDmsDocumentMetadataValues(
 documentId:number,aiResultId?:number
):Promise<ActionResult<DmsMetadataValueRow[]>>{
 const result=await readMetadataSnapshot(documentId,aiResultId);
 if(!result.success||!result.data)return {success:false,error:result.error};
 return {success:true,data:result.data.values as DmsMetadataValueRow[],snapshot:result.data.snapshot,sourceSnapshot:result.data.sourceSnapshot};
}

export async function saveDmsDocumentMetadataValues(
 documentId:number,values:DmsMetadataValueInput[],review?:{requestId:string;snapshot:string}
):Promise<ActionResult>{
 const result=await saveReviewedMetadata(documentId,values,review);
 if(result.success){try{revalidatePath(`/dms/documents/record/${documentId}`);}catch{logger.warn("Metadata committed; display refresh unavailable");}}
 return result;
}
