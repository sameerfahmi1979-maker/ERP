"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsDocumentsByDay = {
  date: string; // "YYYY-MM-DD"
  count: number;
};

export type DmsByCategory = {
  name: string;
  count: number;
};

export type DmsAiPipelineSlice = {
  status: string;
  label: string;
  count: number;
};

export type DmsExpiryBucket = {
  label: string;
  days: number;
  count: number;
};

export type DmsInboxPendingRow = {
  id: number;
  original_filename: string;
  status: string;
  intake_status: string | null;
  created_at: string;
  session_code: string;
};

export type DmsExpiringRow = {
  id: number;
  document_no: string;
  title: string;
  expiry_date: string;
  document_type_name: string | null;
};

export type DmsRenewalRow = {
  id: number;
  renewal_no: string;
  document_title: string;
  status: string;
  priority: string | null;
  assigned_to_name: string | null;
};

export type DmsDashboardStats = {
  // KPI cards
  total_documents: number;
  added_this_month: number;
  added_last_month: number;
  inbox_pending: number;
  expiring_30_days: number;
  review_queue_pending: number;
  storage_bytes: number;

  // Charts
  documents_by_day: DmsDocumentsByDay[];
  documents_by_category: DmsByCategory[];
  ai_pipeline: DmsAiPipelineSlice[];
  expiry_buckets: DmsExpiryBucket[];

  // Action panels
  inbox_items: DmsInboxPendingRow[];
  expiring_items: DmsExpiringRow[];
  renewal_items: DmsRenewalRow[];
};

export async function getDmsDashboardStats(
  rangeDays: 7 | 30 | 90 = 30
): Promise<ActionResult<DmsDashboardStats>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (
      !hasPermission(ctx, "dms.documents.view") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = monthStart;
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
    const in90 = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];
    const rangeStart = new Date(Date.now() - rangeDays * 86400000).toISOString();

    const [
      totalRes,
      addedThisMonthRes,
      addedLastMonthRes,
      inboxPendingRes,
      expiring30Res,
      reviewQueueRes,
      storageRes,
      docsByDayRaw,
      docsByCategoryRaw,
      ocrPendingRes,
      ocrDoneRes,
      aiExtractedRes,
      aiReviewRes,
      expiry7Res,
      expiry14Res,
      expiry30Res,
      expiry60Res,
      expiry90Res,
      inboxItemsRes,
      expiringItemsRes,
      renewalItemsRes,
    ] = await Promise.all([
      // KPI: total documents
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("status", "archived"),

      // KPI: added this month
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", monthStart),

      // KPI: added last month (for trend %)
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthEnd),

      // KPI: inbox pending (exclude discarded sessions — user explicitly discarded them)
      supabase
        .from("dms_upload_sessions")
        .select("id", { count: "exact", head: true })
        .in("status", ["uploaded", "processing"])
        .not("intake_status", "eq", "discarded")
        .is("deleted_at", null),

      // KPI: expiring in ≤30 days
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null)
        .gte("expiry_date", today)
        .lte("expiry_date", in30)
        .is("deleted_at", null)
        .neq("status", "superseded"),

      // KPI: review queue pending (open + assigned + in_review)
      supabase
        .from("dms_review_queue")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "assigned", "in_review"])
        .is("deleted_at", null),

      // KPI: storage used (sum of file sizes)
      supabase
        .from("dms_document_files")
        .select("file_size_bytes")
        .not("file_size_bytes", "is", null),

      // Chart: documents by day over selected range
      supabase
        .from("dms_documents")
        .select("created_at")
        .is("deleted_at", null)
        .gte("created_at", rangeStart)
        .order("created_at", { ascending: true }),

      // Chart: documents by category (top 8)
      supabase
        .from("dms_documents")
        .select("category_id, dms_document_categories!inner(name_en)")
        .is("deleted_at", null)
        .neq("status", "archived")
        .not("category_id", "is", null),

      // AI pipeline: OCR pending
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("ocr_status", ["pending", "queued"]),

      // AI pipeline: OCR done, AI not started
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("ocr_status", ["complete", "skipped"])
        .in("ai_status", ["pending", "not_applicable", "skipped"]),

      // AI pipeline: AI extracted, review complete
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_status", "complete"),

      // AI pipeline: pending human review
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("review_status", ["pending", "in_review"]),

      // Expiry buckets (cumulative: 0→7, 7→14, 14→30, 30→60, 60→90)
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null)
        .gte("expiry_date", today)
        .lte("expiry_date", in7)
        .is("deleted_at", null)
        .neq("status", "superseded"),
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null)
        .gt("expiry_date", in7)
        .lte("expiry_date", in14)
        .is("deleted_at", null)
        .neq("status", "superseded"),
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null)
        .gt("expiry_date", in14)
        .lte("expiry_date", in30)
        .is("deleted_at", null)
        .neq("status", "superseded"),
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null)
        .gt("expiry_date", in30)
        .lte("expiry_date", in60)
        .is("deleted_at", null)
        .neq("status", "superseded"),
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null)
        .gt("expiry_date", in60)
        .lte("expiry_date", in90)
        .is("deleted_at", null)
        .neq("status", "superseded"),

      // Action panel: inbox items needing processing (latest 5, exclude discarded)
      supabase
        .from("dms_upload_sessions")
        .select("id, original_filename, status, intake_status, created_at, session_code")
        .in("status", ["uploaded", "processing"])
        .not("intake_status", "eq", "discarded")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),

      // Action panel: documents expiring soonest (next 7 days, max 5)
      supabase
        .from("dms_documents")
        .select("id, document_no, title, expiry_date, dms_document_types(name_en)")
        .not("expiry_date", "is", null)
        .gte("expiry_date", today)
        .lte("expiry_date", in7)
        .is("deleted_at", null)
        .neq("status", "superseded")
        .order("expiry_date", { ascending: true })
        .limit(5),

      // Action panel: active renewals (latest 5)
      supabase
        .from("dms_renewal_requests")
        .select("id, renewal_no, status, priority, dms_documents(title), profiles(full_name_en)")
        .in("status", ["draft", "requested", "in_progress", "waiting_for_document"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Aggregate storage bytes
    const storageBytes = (storageRes.data ?? []).reduce(
      (sum, row) => sum + (row.file_size_bytes ?? 0),
      0
    );

    // Bucket documents by day for chart
    const dayBuckets: Record<string, number> = {};
    for (const row of docsByDayRaw.data ?? []) {
      const day = row.created_at?.slice(0, 10);
      if (day) dayBuckets[day] = (dayBuckets[day] ?? 0) + 1;
    }
    const documents_by_day: DmsDocumentsByDay[] = Object.entries(dayBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Aggregate documents by category
    const catCounts: Record<string, number> = {};
    for (const row of docsByCategoryRaw.data ?? []) {
      const cat = (row.dms_document_categories as { name_en?: string } | null)?.name_en ?? "Other";
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    }
    const documents_by_category: DmsByCategory[] = Object.entries(catCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Build AI pipeline slices
    const totalDocs = totalRes.count ?? 0;
    const ocrPending = ocrPendingRes.count ?? 0;
    const ocrDoneNotAi = ocrDoneRes.count ?? 0;
    const aiComplete = aiExtractedRes.count ?? 0;
    const pendingReview = aiReviewRes.count ?? 0;
    const notProcessed = Math.max(0, totalDocs - ocrPending - ocrDoneNotAi - aiComplete - pendingReview);

    const ai_pipeline: DmsAiPipelineSlice[] = [
      { status: "ai_complete", label: "AI Complete", count: aiComplete },
      { status: "ocr_done", label: "OCR Done", count: ocrDoneNotAi },
      { status: "pending_review", label: "Pending Review", count: pendingReview },
      { status: "ocr_pending", label: "OCR Pending", count: ocrPending },
      { status: "not_processed", label: "Not Processed", count: notProcessed },
    ].filter((s) => s.count > 0);

    // Expiry buckets
    const expiry_buckets: DmsExpiryBucket[] = [
      { label: "≤7d", days: 7, count: expiry7Res.count ?? 0 },
      { label: "8–14d", days: 14, count: expiry14Res.count ?? 0 },
      { label: "15–30d", days: 30, count: expiry30Res.count ?? 0 },
      { label: "31–60d", days: 60, count: expiry60Res.count ?? 0 },
      { label: "61–90d", days: 90, count: expiry90Res.count ?? 0 },
    ];

    // Inbox action panel
    const inbox_items: DmsInboxPendingRow[] = (inboxItemsRes.data ?? []).map((r) => ({
      id: r.id,
      original_filename: r.original_filename ?? "",
      status: r.status,
      intake_status: r.intake_status ?? null,
      created_at: r.created_at,
      session_code: r.session_code,
    }));

    // Expiring items action panel
    const expiring_items: DmsExpiringRow[] = (expiringItemsRes.data ?? []).map((r) => ({
      id: r.id,
      document_no: r.document_no ?? "",
      title: r.title ?? "",
      expiry_date: r.expiry_date ?? "",
      document_type_name:
        (r.dms_document_types as { name_en?: string } | null)?.name_en ?? null,
    }));

    // Renewal items action panel
    const renewal_items: DmsRenewalRow[] = (renewalItemsRes.data ?? []).map((r) => ({
      id: r.id,
      renewal_no: r.renewal_no ?? "",
      document_title: (r.dms_documents as { title?: string } | null)?.title ?? "—",
      status: r.status,
      priority: r.priority ?? null,
      assigned_to_name:
        (r.profiles as { full_name_en?: string } | null)?.full_name_en ?? null,
    }));

    return {
      success: true,
      data: {
        total_documents: totalDocs,
        added_this_month: addedThisMonthRes.count ?? 0,
        added_last_month: addedLastMonthRes.count ?? 0,
        inbox_pending: inboxPendingRes.count ?? 0,
        expiring_30_days: expiring30Res.count ?? 0,
        review_queue_pending: reviewQueueRes.count ?? 0,
        storage_bytes: storageBytes,
        documents_by_day,
        documents_by_category,
        ai_pipeline,
        expiry_buckets,
        inbox_items,
        expiring_items,
        renewal_items,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
