import "server-only";
import {dmsBusinessDate} from "@/lib/dms/expiry-calendar";
import {prepareDocumentQuery} from "@/server/ai/search/document-query";
import {getReadAuthContext} from "./read-context";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {logger} from "@/lib/logger";
import {readAllPages} from "./all-pages";
import {dmsReadSchema} from "./dms-document-schema";
import {readDmsPageTags} from "./dms-page-tags";
import type {ActionResult,DmsDocumentRow,DmsDocumentFilters} from "@/server/actions/dms/documents";
export type DmsReadPage={rows:DmsDocumentRow[];totalCount:number;page:number;pageSize:number;updatedAt:number};
const SENSITIVE_LEVELS = ["hr", "finance", "legal", "executive"] as const;
type ConfidentialityLevel = "internal" | "company" | "hr" | "finance" | "legal" | "executive";

/**
 * Returns the set of confidentiality levels the current user may access.
 * Admins/system_admin get all levels.
 * Otherwise, `internal` and `company` are always included (base view permission already checked).
 * Per-sensitive level: included only when the user holds the matching per-level permission.
 */
function getAllowedConfidentialityLevels(
  ctx: Awaited<ReturnType<typeof getAuthContext>>
): ConfidentialityLevel[] {
  const isAdmin =
    hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
  if (isAdmin) return ["internal", "company", "hr", "finance", "legal", "executive"];

  const allowed: ConfidentialityLevel[] = ["internal", "company"];
  for (const level of SENSITIVE_LEVELS) {
    if (hasPermission(ctx, `dms.documents.view.${level}`)) {
      allowed.push(level);
    }
  }
  return allowed;
}

export async function readDmsDocumentPage(input:unknown, context?:AuthContext, signal?:AbortSignal):Promise<ActionResult<DmsReadPage>> {
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getReadAuthContext();
    signal?.throwIfAborted();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed=dmsReadSchema.safeParse(input);
    if(!parsed.success)return {success:false,error:"Invalid document search or page"};
    const {filters,...page}=parsed.data;
    const asOf = Date.now();
    const supabase = await createClient();
    signal?.throwIfAborted();
    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const profileId = ctx.profile?.id ?? null;

    // DMS.3C — build allowed confidentiality levels for this user
    const allowedLevels = getAllowedConfidentialityLevels(ctx);

    const sortByTags = page.sortKey === "tags";
    const tagCount = sortByTags ? ",visible_tag_count" : "";
    // Content search remains database-side and uses the caller's content RLS,
    // then the same F03 protected document projection. No ID-set download.
    const contentSearch=filters.searchMode === "content" && !!filters.search?.trim();
    const projection=`
        id, document_no, legacy_document_code, title, description,
        document_type_id, category_id, status, confidentiality_level,
        owner_user_id, owning_company_id, owning_branch_id, party_id,
        issue_date, expiry_date, reminder_policy_id, ocr_status, ai_status,
        review_status, approval_status, current_version_id, is_archived, archived_at, created_by, created_at,
        updated_by, updated_at, deleted_at, ai_risk_score, ai_risk_level,
        completeness_score, superseded_by_document_id,
        document_type:dms_document_types(type_code, name_en, requires_expiry_tracking, default_confidentiality),
        category:dms_document_categories(category_code, name_en)${tagCount}
      `;
    const prepared = await prepareDocumentQuery(supabase,filters.search?.trim()??"",ctx,{
      content:contentSearch,hasFiles:filters.has_files,hasExtractedText:filters.hasExtractedText,sortByTags,signal,
    });
    signal?.throwIfAborted();
    let query = prepared.query.select(projection).is("deleted_at", null);

    // DMS.3C — enforce confidentiality: show only allowed levels OR docs the user owns/created
    if (!isAdmin) {
      // owner_user_id = profileId OR created_by = profileId OR level in allowed set
      if (profileId) {
        query = query.or(
          `confidentiality_level.in.(${allowedLevels.join(",")}),owner_user_id.eq.${profileId},created_by.eq.${profileId}`
        );
      } else {
        query = query.in("confidentiality_level", allowedLevels);
      }
    }

    // All modes share subject/type/literal constraints from prepareDocumentQuery.

    // ── Standard filters ──────────────────────────────────────────────────────
    if (filters?.document_type_id) {
      query = query.eq("document_type_id", filters.document_type_id);
    }
    if (filters?.category_id) {
      query = query.eq("category_id", filters.category_id);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.confidentiality) {
      query = query.eq("confidentiality_level", filters.confidentiality);
    }
    if (filters?.is_archived !== undefined) {
      query = query.eq("is_archived", filters.is_archived);
    }
    // DMS ARCHIVE.1 — hide archived + superseded docs from the main list
    if (filters?.excludeArchived) {
      query = query.not("status", "in", '("archived","superseded")');
    }
    if (filters?.expiry_from) {
      query = query.gte("expiry_date", filters.expiry_from);
    }
    if (filters?.expiry_to) {
      query = query.lte("expiry_date", filters.expiry_to);
    }
    if (filters?.expired) {
      const today = dmsBusinessDate(asOf);
      query = query.lt("expiry_date", today).not("expiry_date", "is", null);
    }
    if (filters?.expiring_soon) {
      const today = dmsBusinessDate(asOf);
      const in30 = dmsBusinessDate(asOf, 30);
      query = query.gte("expiry_date", today).lte("expiry_date", in30);
    }

    // ── DMS 12.3 — Intelligence filters ──────────────────────────────────────
    if (filters?.riskLevel) {
      query = query.eq("ai_risk_level", filters.riskLevel);
    }
    if (filters?.completenessMin !== undefined) {
      query = query.gte("completeness_score", filters.completenessMin);
    }
    if (filters?.completenessMax !== undefined) {
      query = query.lte("completeness_score", filters.completenessMax);
    }
    if (filters?.hasMissingFields === true) {
      query = query.not("missing_fields_json", "is", null);
    }
    if (filters?.hasAiSummary === true) {
      query = query.eq("ai_summary_status", "complete").not("ai_summary", "is", null);
    }
    if (filters?.hasAiSummary === false) {
      query = query.or("ai_summary.is.null,ai_summary_status.neq.complete");
    }
    if (filters?.expiryState) {
      const today = dmsBusinessDate(asOf);
      const in30 = dmsBusinessDate(asOf, 30);
      if (filters.expiryState === "expired") {
        query = query.lt("expiry_date", today).not("expiry_date", "is", null);
      } else if (filters.expiryState === "expiring_soon") {
        query = query.gte("expiry_date", today).lte("expiry_date", in30);
      } else if (filters.expiryState === "valid") {
        query = query.gt("expiry_date", in30);
      } else if (filters.expiryState === "missing_expiry") {
        query = query.is("expiry_date", null);
      }
    }
    const sortColumns={created_at:"created_at",document_no:"document_no",title:"title",document_type:"document_type(name_en)",status:"status",expiry_date:"expiry_date",tags:"visible_tag_count"};
    const from=(page.page-1)*page.pageSize;
    const ordered = query.order(sortColumns[page.sortKey],{ascending:page.sortDir==="asc",nullsFirst:false}).order("id",{ascending:true});
    const cancellable = signal ? ordered.abortSignal(signal) : ordered;
    let result = await cancellable.range(from,from+page.pageSize-1).returns<DmsDocumentRow[]>();
    signal?.throwIfAborted();
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const first = await cancellable.range(0,0).returns<DmsDocumentRow[]>();
      signal?.throwIfAborted();
      if (!first.error && first.count !== null && first.count <= from && first.data?.length === Math.min(1,first.count)) {
        result = {...first,data:[]};
      }
    }
    const { data, error, count } = result;
    if (error || count===null || !Number.isSafeInteger(count) || count < 0 || !Array.isArray(data) || data.length !== Math.min(page.pageSize, Math.max(0, count-from)) || new Set(data.map(row=>row.id)).size!==data.length) {
      logger.error("DMS document list query failed", { code: error?.code??"COUNT_UNAVAILABLE" });
      return { success: false, error: "Documents could not be loaded. Please try again." };
    }

    const tags = await readDmsPageTags(supabase, data.map(row => row.id), signal);
    signal?.throwIfAborted();
    // Redact ai_summary for confidential documents when user is not admin
    const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];

    const processed = (data ?? []).map((doc) => {
      const {content_match: _content, perf_document_has_extracted_text: _text, visible_tag_count: _tags, ...record} =
        doc as DmsDocumentRow & {content_match?:unknown;perf_document_has_extracted_text?:boolean;visible_tag_count?:number};
      void _content; void _text; void _tags;
      const d = {...record, tags: tags.get(doc.id) ?? []} as DmsDocumentRow;
      if (!isAdmin && CONFIDENTIAL_LEVELS.includes(d.confidentiality_level) && d.ai_summary) {
        return { ...d, ai_summary: "[Summary restricted — confidential document]" };
      }
      return d;
    });

    return { success: true, data: {rows:processed,totalCount:count,page:page.page,pageSize:page.pageSize,updatedAt:Date.now()} };
  } catch {
    signal?.throwIfAborted();
    logger.error("readDmsDocumentPage failed", {code:"READ_UNAVAILABLE"});
    return { success: false, error: "Failed to load documents" };
  }
}

/** Legacy exports/bulk consumers keep complete authorized scope, never the visible page. */
export async function readAllDmsDocuments(filters?:DmsDocumentFilters):Promise<ActionResult<DmsDocumentRow[]>> {
 try {
  const ctx=await getReadAuthContext();
  const rows=await readAllPages<DmsDocumentRow>(async(from)=>{const result=await readDmsDocumentPage({filters:filters??{},page:Math.floor(from/100)+1,pageSize:100},ctx);return{data:result.data?.rows??null,count:result.data?.totalCount??null,error:result.success?null:result.error};},{batchSize:100,identity:row=>row.id,maxRows:10000});
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error("Concurrent result change");
  return{success:true,data:rows};
 }catch{return{success:false,error:"Documents could not be completely loaded. Please retry."};}
}
