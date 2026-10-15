import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains} from "@/lib/reads/search";
import {canReadDmsApprovals, dmsApprovalRequestSchema, dmsApprovalQueuePageSchema, dmsApprovalStateResponseSchema, dmsApprovalHistoryPageSchema} from "@/lib/reads/dms-approvals-schema";

const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable(), nullableId = id.nullable();
const label = z.object({display_name: text}).nullable(), typeLabel = z.object({name_en: text}).nullable();
const document = z.object({id, document_no: z.string(), title: z.string(), approval_status: text, submitted_by: nullableId, submitted_at: text,
  owner_user_id: nullableId, created_by: nullableId, document_type: typeLabel, submitter: label});
const queueDocument = document.extend({confidentiality_level: text, owner: label});
const stateDocument = document.extend({status: z.string(), document_type_id: nullableId});
const currentApproval = z.object({id, action: z.string(), workflow_id: nullableId, step_id: nullableId, reason: text, comments: text});
const historyRow = z.object({id, document_id: id, action: z.string(), actioned_by: nullableId, actioned_at: z.string(), submitted_by: nullableId,
  submitted_at: text, reason: text, comments: text, is_current: z.boolean(), workflow_id: nullableId, step_id: nullableId, created_at: z.string(),
  actioned_by_profile: label, submitted_by_profile: label});
// SQL three-valued expressions can legitimately yield NULL (for example a
// removed submitter). Preserve the original reader's explicit true-only grant.
const capability = z.object({document_id: id, can_act: z.boolean().nullable(), can_withdraw: z.boolean().nullable()});
const denied = () => ({success: false as const, kind: "forbidden" as const, error: "Permission denied"});
const admin = (ctx: AuthContext) => hasPermission(ctx, "dms.admin") || hasPermission(ctx, "dms.approvals.admin");
const act = (ctx: AuthContext) => admin(ctx) || hasPermission(ctx, "dms.approvals.act") || hasPermission(ctx, "dms.documents.approve");
const submitPermissions = ["dms.approvals.submit", "dms.documents.edit", "dms.admin"] as const;
const docColumns = "id,document_no,title,approval_status,submitted_by,submitted_at,owner_user_id,created_by,document_type:dms_document_types!document_type_id(name_en),submitter:user_profiles!submitted_by(display_name)";
const historyColumns = "id,document_id,action,actioned_by,actioned_at,submitted_by,submitted_at,reason,comments,is_current,workflow_id,step_id,created_at,actioned_by_profile:user_profiles!actioned_by(display_name),submitted_by_profile:user_profiles!submitted_by(display_name)";

/** Read-only equivalent of the existing approval readers. Native document and
 * approval RLS plus existing F05 capabilities remain authoritative. */
export async function readDmsApprovals(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = dmsApprovalRequestSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, kind: "invalid_input" as const, error: "Invalid approval criteria"};
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(), p = parsed.data; signal?.throwIfAborted();
    if (!ctx.profile?.id || !ctx.isAccountActive || ctx.profile.must_change_password) return denied();
    const canView = canReadDmsApprovals(ctx), canViewDocument = hasPermission(ctx, "dms.documents.view");
    if (p.mode === "queue" && !canView || p.mode === "state" && !canView && !canViewDocument) return denied();
    const db = await createClient(); signal?.throwIfAborted();
    const attach = <T extends {abortSignal: (value: AbortSignal) => unknown}>(query: T): T => signal ? query.abortSignal(signal) as T : query;
    const readCapabilities = async (documentIds: number[]) => {
      const result = documentIds.length ? await attach(db.rpc("f05_document_approval_capabilities", {document_ids: documentIds})) : {data: [], error: null};
      signal?.throwIfAborted();
      if (result.error) throw Error("Approval capabilities unavailable");
      const access = z.array(capability).parse(result.data);
      if (access.length !== documentIds.length || new Set(access.map(a => a.document_id)).size !== documentIds.length || access.some(a => !documentIds.includes(a.document_id)))
        throw Error("Incomplete approval capabilities");
      return new Map(access.map(a => [a.document_id, a]));
    };
    if (p.mode === "state") {
      const docResult = await attach(db.from("dms_documents").select(docColumns + ",status,document_type_id", {count: "exact"})
        .eq("id", p.documentId).is("deleted_at", null).range(0, 0)); signal?.throwIfAborted();
      if (docResult.error) throw Error("Approval subject read failed");
      if (docResult.count === 0 && Array.isArray(docResult.data) && docResult.data.length === 0) return denied();
      if (docResult.count !== 1 || !Array.isArray(docResult.data) || docResult.data.length !== 1) throw Error("Approval subject incomplete");
      const d = stateDocument.parse(docResult.data[0]); if (d.id !== p.documentId) throw Error("Approval subject mismatch");
      const current = await attach(db.from("dms_document_approvals").select("id,action,workflow_id,step_id,reason,comments", {count: "exact"})
        .eq("document_id", p.documentId).eq("is_current", true).range(0, 1)); signal?.throwIfAborted();
      if (current.error || !Array.isArray(current.data) || ![0, 1].includes(current.count ?? -1) || current.data.length !== current.count) throw Error("Current approval unverified");
      const ca = current.data[0] ? currentApproval.parse(current.data[0]) : null;
      const actionable = !!ca && ca.action === "submitted";
      const mutable = !["archived", "deleted"].includes(d.status);
      const submittable = mutable && !ca && ["draft", "rejected", "withdrawn", null].includes(d.approval_status);
      // The context provides coarse route admission, not a grant on this subject.
      // Reuse the existing F03/F05 predicates used by the atomic transition.
      const [access, submission] = await Promise.all([
        readCapabilities(actionable ? [p.documentId] : []),
        Promise.all((submittable ? submitPermissions.filter(code => hasPermission(ctx, code)) : []).map(async permission_code => {
          const result = await attach(db.rpc("f03_has_document_permission", {document_id: p.documentId, permission_code}));
          signal?.throwIfAborted();
          if (result.error || result.data !== null && typeof result.data !== "boolean") throw Error("Submission capability unverified");
          return result.data === true;
        })),
      ]);
      signal?.throwIfAborted();
      const canActOnStep = access.get(p.documentId)?.can_act === true;
      const self = d.submitted_by !== null && d.submitted_by === ctx.profile.id && !canActOnStep;
      return {success: true as const, data: dmsApprovalStateResponseSchema.parse({criteria: p, record: {
        documentId: d.id, documentNo: d.document_no, title: d.title, documentTypeId: d.document_type_id, documentTypeName: d.document_type?.name_en ?? null,
        documentStatus: d.status, approvalStatus: d.approval_status, submittedBy: d.submitted_by, submittedByName: d.submitter?.display_name ?? null, submittedAt: d.submitted_at,
        currentApprovalId: ca?.id ?? null, currentApprovalAction: ca?.action ?? null, currentWorkflowId: ca?.workflow_id ?? null, currentStepId: ca?.step_id ?? null,
        canSubmit: submittable && submission.some(Boolean),
        canApprove: mutable && actionable && canActOnStep && d.approval_status === "pending_approval",
        canReject: mutable && actionable && canActOnStep && d.approval_status === "pending_approval",
        canWithdraw: mutable && actionable && d.approval_status === "pending_approval" && access.get(p.documentId)?.can_withdraw === true,
        actionUnavailableReason: d.approval_status === "pending_approval" && !actionable ? "The current approval request is unavailable. Refresh or ask your administrator to check approval access before taking action." : null,
        canViewHistory: canView, selfApprovalBlocked: self && d.approval_status === "pending_approval",
        selfApprovalBlockReason: self ? "You submitted this document for approval and cannot act on it." : null,
        latestComments: ca?.comments ?? null, latestReason: ca?.reason ?? null,
      }})};
    }
    if (p.mode === "history") {
      // Child RLS returns zero rows for both a hidden parent and an empty history.
      // Admit the exact parent first, without fetching its confidential content or
      // distinguishing a missing document from one outside the caller's scope.
      const subject = await attach(db.from("dms_documents").select("id", {count: "exact"})
        .eq("id", p.documentId).is("deleted_at", null).range(0, 0)); signal?.throwIfAborted();
      if (subject.error) throw Error("History subject unavailable");
      if (subject.count === 0 && Array.isArray(subject.data) && subject.data.length === 0) return denied();
      if (subject.count !== 1 || !Array.isArray(subject.data) || subject.data.length !== 1 || z.object({id}).parse(subject.data[0]).id !== p.documentId)
        throw Error("History subject unverified");
      if (!canView && !canViewDocument) {
        const own = await attach(db.from("dms_document_approvals").select("id").eq("document_id", p.documentId)
          .or(`submitted_by.eq.${ctx.profile.id},actioned_by.eq.${ctx.profile.id}`).limit(1)); signal?.throwIfAborted();
        if (own.error || !Array.isArray(own.data)) throw Error("History eligibility unavailable");
        if (!own.data.length) return denied(); z.array(z.object({id})).max(1).parse(own.data);
      }
      const query = (head = false) => attach(db.from("dms_document_approvals").select(historyColumns, {count: "exact", head}).eq("document_id", p.documentId));
      const start = (p.page - 1) * p.pageSize;
      const result = await query().order("created_at", {ascending: false}).order("id", {ascending: false}).range(start, start + p.pageSize - 1); signal?.throwIfAborted();
      let data = result.data, total = result.count, error = result.error;
      if (start > 0 && result.status === 416 && error?.code === "PGRST103") {
        const recounted = await query(true); signal?.throwIfAborted();
        if (recounted.error || recounted.count === null || !Number.isSafeInteger(recounted.count) || recounted.count < 0 || recounted.count > start) throw Error("History count unverified");
        data = []; total = recounted.count; error = null;
      }
      if (error) throw Error("Approval history unavailable");
      const rows = z.array(historyRow).parse(data).map(r => ({id: r.id, documentId: r.document_id, action: r.action, actionedBy: r.actioned_by,
        actionedByName: r.actioned_by_profile?.display_name ?? null, actionedAt: r.actioned_at, submittedBy: r.submitted_by,
        submittedByName: r.submitted_by_profile?.display_name ?? null, submittedAt: r.submitted_at, reason: r.reason, comments: r.comments,
        isCurrent: r.is_current, workflowId: r.workflow_id, stepId: r.step_id, createdAt: r.created_at}));
      return {success: true as const, data: dmsApprovalHistoryPageSchema.parse({criteria: p, rows, totalCount: total})};
    }
    const query = (head = false) => {
      const q = attach(db.from("dms_documents").select(docColumns + ",confidentiality_level,owner:user_profiles!owner_user_id(display_name)", {count: "exact", head})
        .is("deleted_at", null).not("approval_status", "is", null));
      if (p.status !== "all") q.eq("approval_status", p.status);
      if (p.documentTypeId) q.eq("document_type_id", p.documentTypeId);
      if (p.search !== "") q.or(`title.ilike.${literalContains(p.search)},document_no.ilike.${literalContains(p.search)}`);
      return q;
    };
    const start = (p.page - 1) * p.pageSize;
    const result = await query().order(p.sortBy, {ascending: p.sortDirection === "asc"}).order("id", {ascending: true})
      .range(start, start + p.pageSize - 1); signal?.throwIfAborted();
    let data = result.data, total = result.count, error = result.error;
    if (start > 0 && result.status === 416 && error?.code === "PGRST103") {
      const recounted = await query(true); signal?.throwIfAborted();
      if (recounted.error || recounted.count === null || !Number.isSafeInteger(recounted.count) || recounted.count < 0 || recounted.count > start) throw Error("Queue count unverified");
      data = []; total = recounted.count; error = null;
    }
    if (error) throw Error("Approval queue unavailable");
    const documents = z.array(queueDocument).max(p.pageSize).parse(data), ids = documents.map(d => d.id);
    // An embedded child filter on the protected RPC projection is not a valid
    // native PostgREST filter. Read only current children of this bounded page,
    // retaining their ordinary RLS and rejecting missing/duplicate coverage.
    const current = ids.length ? await attach(db.from("dms_document_approvals").select("id,document_id,is_current", {count:"exact"})
      .in("document_id", ids).eq("is_current", true).range(0, ids.length)) : {data:[],count:0,error:null};
    signal?.throwIfAborted();
    const currentRows = z.array(z.object({id,document_id:id,is_current:z.literal(true)})).parse(current.data);
    if(current.error || current.count!==currentRows.length || currentRows.length>ids.length || new Set(currentRows.map(r=>r.document_id)).size!==currentRows.length || currentRows.some(r=>!ids.includes(r.document_id)))
      throw Error("Current approval page unverified");
    const currentIds = new Map(currentRows.map(r=>[r.document_id,r.id]));
    const allowed = await readCapabilities(ids), now = Date.now();
    const rows = documents.map(d => {
      const own = d.submitted_by === ctx.profile!.id, owner = d.owner_user_id === ctx.profile!.id || d.created_by === ctx.profile!.id;
      const level = d.confidentiality_level ?? "internal", sensitive = ["hr", "finance", "legal", "executive"].includes(level);
      const visible = !sensitive || admin(ctx) || owner || hasPermission(ctx, `dms.documents.view.${level}`) || act(ctx) && d.approval_status === "pending_approval" && !own;
      const days = d.submitted_at ? Math.floor((now - Date.parse(d.submitted_at)) / 86400000) : null;
      return {documentId: d.id, documentNo: visible ? d.document_no : "—", title: visible ? d.title : "[Restricted Document]",
        documentTypeName: visible ? d.document_type?.name_en ?? null : null, ownerName: d.owner?.display_name ?? null, submittedByName: d.submitter?.display_name ?? null,
        submittedAt: d.submitted_at, approvalStatus: d.approval_status, currentApprovalId: currentIds.get(d.id) ?? null,
        daysPending: days, canAct: allowed.get(d.id)!.can_act === true, canWithdraw: allowed.get(d.id)!.can_withdraw === true, isRedacted: !visible};
    });
    return {success: true as const, data: dmsApprovalQueuePageSchema.parse({criteria: p, rows, totalCount: total})};
  } catch {
    signal?.throwIfAborted();
    return {success: false as const, kind: "unavailable" as const, error: "Approval information could not be verified. Please retry."};
  }
}
