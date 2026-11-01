import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { searchDocuments, type SearchDocumentRow } from "@/server/ai/search/documents";
import { resolveSearchSubjects, assertSearchPrincipal } from "@/server/ai/search/document-query";
import { verifySearchDelivery } from "@/server/ai/search/security";
import { readSearchApprovalStatus } from "@/server/ai/search/approval-status";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { readAuthorizedAssistantEntity } from "@/lib/ai/common/assistant/entity-access";
import { buildEntityRoute } from "@/lib/ai/common/assistant/route-builder";
import { isBlockedDangerousRequest } from "@/lib/ai/common/assistant/action-registry";
import { getAiDailyDashboard } from "@/server/actions/ai/common/dashboard";
import { questionSchema, questionPlanSchema, policyLibrarySchema, GUIDANCE_VERSION, type GuidanceAnswer, type QuestionInput, type QuestionPlan, type AssistantEvidence } from "@/lib/ai/assistant-guidance/contracts";
import { deterministicPlan, dateRange, dubaiDate, expiryStatus, questionSearchText, isFollowUp } from "@/lib/ai/assistant-guidance/planner";
import type { AiEntityReference } from "@/lib/ai/foundation/contracts";

const id = z.number().int().positive().safe();
type Db = Awaited<ReturnType<typeof createClient>>;
const unavailable = "The current source or its access could not be verified. Open the permitted record or try again; this is not evidence that no records exist.";
function answer(text: string, outcome: GuidanceAnswer["outcome"] = "available", extra: Partial<GuidanceAnswer> = {}): GuidanceAnswer {
  return { version: GUIDANCE_VERSION, outcome, answer: text.slice(0, 4000), links: [], evidence: [], exactTotal: null, completeness: "unknown", asOf: new Date().toISOString(), modelCalls: 0, replayable: false, ...extra };
}
async function featureEnabled(db: Db) {
  const r = await db.from("erp_ai_feature_flags").select("is_enabled").eq("feature_code", "ERP_AI_ASSISTANT").maybeSingle();
  return !r.error && r.data?.is_enabled === true;
}
async function planQuestion(q: string, signal: AbortSignal): Promise<{ plan: QuestionPlan; calls: number }> {
  const known = deterministicPlan(q); if (known) return { plan: known, calls: 0 };
  // Only user wording reaches this classifier. Source text is never executable instructions.
  const attempt = callCommonAiStructuredCompletion(
    'Select one read-only ERP question tool. Return only JSON {"tool":"documents|expiry|dependents|record|policy|report|briefing|guidance|approval|unsupported","groupBy":"none|status|type|expiry|company|branch|site","period":"any|today|this_month|next_month|next_30_days"}. Do not return facts, IDs, SQL, filters, commands or prose. Financial/pay/medical/legal decisions and unknown modules are unsupported.',
    JSON.stringify({ question: q }), { maxTokens: 160, temperature: 0, promptVersion: `${GUIDANCE_VERSION}/planner` });
  let cancel!: () => void;
  const stopped = new Promise<never>((_, reject) => { cancel = () => reject(Error("Question deadline exceeded")); signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel(); });
  // Fences delivery; the existing provider owns upstream cancellation. A late
  // provider completion is ignored, never automatically repeated.
  const r = await Promise.race([attempt, stopped]).finally(() => signal.removeEventListener("abort", cancel));
  if (!r.success) throw Error("Question interpretation unavailable");
  return { plan: questionPlanSchema.parse(JSON.parse(r.rawJson)), calls: 1 };
}
function evidence(ref: AiEntityReference, table: string, field: string | null, version: string, code: string): AssistantEvidence {
  return { reference: ref, sourceTable: table, field, sourceVersion: version, businessReference: code, accessPurpose: "metadata", fileId: null, page: null, snippet: null, observedAt: new Date().toISOString() };
}
async function recheckEvidence(items: readonly AssistantEvidence[]) {
  for (const item of items) {
    const current = await readAuthorizedAssistantEntity(item.reference.entityType, item.reference.entityId);
    if (!current || current.version !== item.sourceVersion) throw Error("Source changed before delivery");
  }
}
async function employeeSubject(db: Db, ctx: AuthContext, q: string, context?: AiEntityReference): Promise<AiEntityReference | null> {
  if (context?.entityType === "employee") return context;
  const text = questionSearchText(q); if (!text) return null;
  const matches = (await resolveSearchSubjects(db, text, ctx)).filter(s => s.type === "employee");
  return matches.length === 1 ? { entityType: "employee", entityId: matches[0].id } : null;
}
function filtersForPeriod(plan: QuestionPlan) { const range = dateRange(plan.period); return range ? { expiryFrom: range.from, expiryTo: range.to } : {}; }
async function owningDocumentGroups(db: Db, ctx: AuthContext, rows: SearchDocumentRow[], by: QuestionPlan["groupBy"], signal: AbortSignal) {
  const groups = new Map<string, number>();
  if (by === "company" || by === "branch") {
    const field = by === "company" ? "owning_company_id" : "owning_branch_id", table = by === "company" ? "owner_companies" : "branches";
    if (!hasPermission(ctx, by === "company" ? "organizations.view" : "branches.view")) throw Error("Permission denied");
    if (rows.some(r => r[field] === undefined)) throw Error("Grouping source is unavailable");
    const ids = [...new Set(rows.flatMap(r => r[field] ? [r[field]!] : []))];
    const r = ids.length ? await db.from(table).select(by === "company" ? "id,company_code,trade_name" : "id,branch_code,branch_name_en").in("id", ids).abortSignal(signal) : { data: [], error: null };
    if (r.error || !Array.isArray(r.data) || r.data.length !== ids.length) throw Error("Grouping source unavailable");
    const labels = new Map(r.data.map(raw => { const v = raw as unknown as Record<string, unknown>; return [id.parse(v.id), `${z.string().parse(v[by === "company" ? "company_code" : "branch_code"])} — ${z.string().parse(v[by === "company" ? "trade_name" : "branch_name_en"])}`]; }));
    for (const row of rows) { const label = row[field] ? labels.get(row[field]!) : "No recorded ownership"; if (!label) throw Error("Grouping source unavailable"); groups.set(label, (groups.get(label) ?? 0) + 1); }
  } else if (by === "site") {
    if (!hasPermission(ctx, "common_md.work_sites.view")) throw Error("Permission denied");
    const links = await db.from("dms_document_links").select("document_id,entity_id", { count: "exact" }).eq("entity_type", "site").in("document_id", rows.map(r => r.id)).is("deleted_at", null).order("id").range(0, 1999).abortSignal(signal);
    if (links.error || links.count === null || !Array.isArray(links.data) || links.data.length !== links.count) throw Error("Site association grouping is incomplete");
    const pairs = z.array(z.object({ document_id: id, entity_id: id }).strip()).parse(links.data);
    if (pairs.some(p => !rows.some(r => r.id === p.document_id))) throw Error("Site grouping source unavailable");
    const ids = [...new Set(pairs.map(p => p.entity_id))];
    const sites = ids.length ? await db.from("work_sites").select("id,site_code,site_name").in("id", ids).is("deleted_at", null).abortSignal(signal) : { data: [], error: null };
    if (sites.error || !Array.isArray(sites.data) || sites.data.length !== ids.length) throw Error("Site grouping source unavailable");
    const labels = new Map(sites.data.map(s => [s.id, `${s.site_code} — ${s.site_name}`]));
    for (const row of rows) { const siteIds = [...new Set(pairs.filter(p => p.document_id === row.id).map(p => p.entity_id))]; if (!siteIds.length) groups.set("No permitted site association", (groups.get("No permitted site association") ?? 0) + 1); for (const siteId of siteIds) { const label = labels.get(siteId); if (!label) throw Error("Site source unavailable"); groups.set(label, (groups.get(label) ?? 0) + 1); } }
  } else for (const row of rows) {
    const key = by === "status" ? row.status ?? "Not recorded" : by === "type" ? row.document_type?.name_en ?? "Type not recorded" : by === "expiry" ? row.expiry_date ? row.expiry_date < dubaiDate() ? "Expired" : "Current" : "Expiry not recorded" : "All matching documents";
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return groups;
}

async function documentQuestion(db: Db, ctx: AuthContext, input: QuestionInput, plan: QuestionPlan, signal: AbortSignal): Promise<GuidanceAnswer> {
  const context = input.context;
  const subject = context && context.entityType !== "dms_document" ? { type: context.entityType === "dependent" ? "employee_dependent" : context.entityType, id: context.entityId } : undefined;
  let query = questionSearchText(input.question).replace(/^what about\s+/i, "");
  if (context?.entityType === "dms_document" && /\b(this|that|it)\b/i.test(input.question)) query = "";
  const result = await searchDocuments({ query, mode: "keyword", pageSize: plan.tool === "report" ? 100 : 10, subject,
    filters: { lifecycle: "current", ...filtersForPeriod(plan), ...(context?.entityType === "dms_document" ? { candidateIds: [context.entityId] } : {}) } }, ctx, signal);
  if (!result.success) throw Error(unavailable);
  const data = result.data;
  if (data.outcome === "clarification_required") return answer(data.message, "clarification_required");
  const resolved: AiEntityReference | undefined = data.subject ? { entityType: data.subject.type === "employee_dependent" ? "dependent" : data.subject.type, entityId: data.subject.id } : context;
  if (!data.rows.length) return answer("No current permitted documents match these criteria.", "no_matches", { exactTotal: data.totalCount, completeness: "complete", subject: resolved });
  if (plan.tool === "report") {
    const rows = [...data.rows]; let cursor = data.nextCursor, reads = 1;
    while (cursor && reads < 5) {
      signal.throwIfAborted(); const page = await searchDocuments({ ...data.criteria, cursor }, ctx, signal); reads++;
      if (!page.success || page.data.outcome === "clarification_required" || page.data.totalCount !== data.totalCount) throw Error("Report source changed");
      rows.push(...page.data.rows); cursor = page.data.nextCursor;
    }
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw Error("Report changed while paging");
    const complete = !cursor && rows.length === data.totalCount;
    const groups = await owningDocumentGroups(db, ctx, rows, plan.groupBy, signal);
    const lines = [...groups].map(([label, count]) => `${label}: ${count}`);
    return answer(`Current authorised documents: ${data.totalCount}. Search: ${query || "all permitted current documents"}. Expiry period: ${plan.period.replaceAll("_", " ")}.\n${complete ? "Complete grouped result" : "Bounded preview; grouped counts are incomplete"}:\n${lines.join("\n")}${plan.groupBy === "site" ? "\nCounts use permitted recorded site associations; a document linked to multiple sites appears once in each site group." : ""}\nNo saved report, schedule or email was created.`, complete ? "available" : "partial", {
      exactTotal: data.totalCount, completeness: complete ? "complete" : "preview", links: [{ label: "Open All Documents (apply the displayed criteria)", route: "/dms/documents" }], subject: resolved,
    });
  }
  const expiry = plan.tool === "expiry";
  if (expiry && data.totalCount > 1) return answer(`There are ${data.totalCount} permitted matching documents. Select the exact record; I cannot choose a pass or expiry for you.\n${data.rows.map(r => `${r.document_no} — ${r.title}`).join("\n")}`, "clarification_required", { exactTotal: data.totalCount, completeness: data.hasMore ? "preview" : "complete", links: data.rows.map(r => ({ label: r.document_no, route: r.route })), evidence: data.rows.map(r => r.provenance), subject: resolved });
  if (expiry && data.rows.length === 1 && hasPermission(ctx, "hr.compliance.view")) {
    const document = data.rows[0];
    for (const table of ["employee_identity_documents", "employee_access_cards"] as const) {
      const related = await db.from(table).select("id,employee_id,expiry_date").eq("dms_document_id", document.id).is("deleted_at", null).limit(2).abortSignal(signal);
      if (related.error || !Array.isArray(related.data)) throw Error("HR expiry comparison unavailable");
      if (related.data.length > 1 || related.data.some(r => r.expiry_date !== null && r.expiry_date !== document.expiry_date)) return answer(`The permitted linked HR evidence and ${document.document_no} need reconciliation. I cannot choose one expiry as authoritative. Review the current HR identity/access-card record and this document; nothing was updated.`, "clarification_required", { links: [{ label: document.document_no, route: document.route }], evidence: [document.provenance], subject: resolved });
    }
  }
  return answer(data.rows.map(r => `${r.document_no} — ${r.title}${expiry ? `\nRecorded DMS expiry: ${r.expiry_date ?? "Unknown"}. ${expiryStatus(r.expiry_date)} (Dubai date ${dubaiDate()}).` : ""}`).join("\n\n"), "available", {
    links: data.rows.map(r => ({ label: `Open ${r.document_no}`, route: r.route })), evidence: data.rows.map(r => ({ ...r.provenance, field: expiry ? "expiry_date" : null })), exactTotal: data.totalCount, completeness: data.hasMore ? "preview" : "complete", subject: resolved, replayable: false,
  });
}
async function dependentQuestion(db: Db, ctx: AuthContext, input: QuestionInput, signal: AbortSignal) {
  if (!hasPermission(ctx, "hr.employees.view")) throw Error("Permission denied");
  const subject = await employeeSubject(db, ctx, input.question, input.context);
  if (!subject) return answer("Choose the exact employee or enter their full name/employee code. Family relationships are never inferred from names.", "clarification_required");
  const parent = await readAuthorizedAssistantEntity("employee", subject.entityId); if (!parent) throw Error(unavailable);
  const r = await db.from("employee_dependents").select("id,employee_id,dependent_name_en,updated_at", { count: "exact" }).eq("employee_id", subject.entityId).eq("is_active", true).is("deleted_at", null).order("id").range(0, 19).abortSignal(signal);
  if (r.error || r.count === null) throw Error(unavailable);
  const rows = z.array(z.object({ id, employee_id: id, dependent_name_en: z.string(), updated_at: z.string() }).strip()).parse(r.data);
  if (rows.some(r => r.employee_id !== subject.entityId) || rows.length !== Math.min(20, r.count)) throw Error(unavailable);
  return answer(rows.length ? `Recorded active dependents for ${parent.label} (${parent.businessCode}):\n${rows.map(r => `• ${r.dependent_name_en}`).join("\n")}` : `No active dependent relationships are recorded in your permitted view for ${parent.businessCode}.`, rows.length ? "available" : "no_matches", {
    evidence: [evidence(subject, "employees", null, parent.version, parent.businessCode ?? parent.label), ...rows.slice(0, 19).map(r => evidence({ entityType: "dependent", entityId: r.id }, "employee_dependents", "employee_id", r.updated_at, r.dependent_name_en))],
    exactTotal: r.count, completeness: r.count > rows.length ? "preview" : "complete", links: [{ label: `Open ${parent.businessCode ?? parent.label}`, route: buildEntityRoute("employee", subject.entityId)! }], subject,
  });
}
async function policyQuestion(db: Db, input: QuestionInput, signal: AbortSignal): Promise<GuidanceAnswer> {
  const selected = input.context;
  if (!selected) return answer("Open the exact company, branch or employee before asking about company policy.", "clarification_required");
  let companyId: number | null = selected.entityType === "company" ? selected.entityId : null, branchId: number | null = null;
  if (["employee", "branch", "site", "dms_document"].includes(selected.entityType)) {
    const table = selected.entityType === "employee" ? "employees" : selected.entityType === "branch" ? "branches" : selected.entityType === "dms_document" ? "dms_documents" : "work_sites";
    const r = await db.from(table).select(selected.entityType === "dms_document" ? "owning_company_id,owning_branch_id" : selected.entityType === "branch" ? "owner_company_id,id" : "owner_company_id,branch_id").eq("id", selected.entityId).maybeSingle();
    if (r.error || !r.data) throw Error(unavailable);
    const scope = r.data as unknown as Record<string, number | null>;
    companyId = selected.entityType === "dms_document" ? scope.owning_company_id : scope.owner_company_id; branchId = selected.entityType === "dms_document" ? scope.owning_branch_id : selected.entityType === "branch" ? selected.entityId : scope.branch_id;
  }
  if (!companyId) return answer("This context has no verified policy applicability. Choose the owning company/branch.", "held");
  const config = await db.from("system_settings").select("value").eq("category", "AI").eq("key", "ERP_AI_APPROVED_POLICY_SOURCES").maybeSingle();
  if (config.error) return answer("The approved policy library is unavailable to this session. No company rule can be inferred.", "held");
  if (!config.data) return answer("No approved policy-source library has been configured. Ask the policy owner to register the applicable approved DMS version.", "held");
  const raw = typeof config.data.value === "string" ? JSON.parse(config.data.value) : config.data.value;
  const library = policyLibrarySchema.parse(raw), today = dubaiDate();
  const date = input.question.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? today;
  if (!z.iso.date().safeParse(date).success) return answer("Choose a valid policy date.", "clarification_required");
  const candidates = library.policies.filter(p => p.companyId === companyId && p.state === "approved" && p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo >= date) && (!p.branchIds.length || branchId !== null && p.branchIds.includes(branchId)));
  if (!candidates.length) return answer("No approved policy version applies to this company, branch and date. Draft or obsolete text is not current guidance.", "held");
  const codes = new Set<string>(); for (const p of candidates) { if (codes.has(p.businessCode)) return answer("Policy versions overlap. The policy owner must resolve applicability before I can give guidance.", "held"); codes.add(p.businessCode); }
  const result: GuidanceAnswer = answer("Approved policy sources (open the source to read its actual rules):", "partial", { completeness: "partial" });
  for (const p of candidates.slice(0, 5)) {
    signal.throwIfAborted();
    const doc = await db.from("dms_documents").select("id,document_no,title,approval_status,owning_company_id,owning_branch_id,current_version_id,updated_at").eq("id", p.documentId).is("deleted_at", null).maybeSingle();
    if (doc.error || !doc.data || doc.data.approval_status !== "approved" || doc.data.owning_company_id !== companyId || doc.data.current_version_id !== p.sourceVersionId || (doc.data.owning_branch_id !== null && doc.data.owning_branch_id !== branchId)) return answer("A registered policy version or its approval/access changed. Policy guidance is held pending review.", "held");
    const authorised = await readAuthorizedAssistantEntity("dms_document", p.documentId); if (!authorised) return answer("The policy source is unavailable in this scope.", "held");
    result.answer += `\n${p.businessCode}, revision ${p.revision}, effective ${p.effectiveFrom}${p.effectiveTo ? ` to ${p.effectiveTo}` : ""}: ${doc.data.title} (${doc.data.document_no}).`;
    result.links.push({ label: `${p.businessCode} — ${doc.data.document_no}`, route: buildEntityRoute("dms_document", p.documentId)! });
    result.evidence.push(evidence({ entityType: "dms_document", entityId: p.documentId }, "dms_documents", "approval_status", doc.data.updated_at, doc.data.document_no));
    const searchText = input.question.replace(/\b(?:what|is|the|our|company|policy|policies|procedure|on|for|about|how|does|do|i|we)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    if (searchText) {
      const excerpt = await db.rpc("ai_mod02_search_excerpts", { document_ids: [p.documentId], search_text: searchText }).abortSignal(signal);
      if (excerpt.error) return answer("The applicable policy source is known, but the supporting passage or content permission could not be verified.", "held");
      const passages = z.array(z.object({ document_id: id, excerpt: z.string().max(120), document_version: z.string(), content_version: z.string().nullable() }).strip()).max(1).parse(excerpt.data);
      const sourceVersion = doc.data.updated_at;
      if (passages.some(e => e.document_id !== p.documentId || e.document_version !== sourceVersion)) throw Error("Policy evidence changed");
      for (const passage of passages) {
        result.answer += `\nSupporting excerpt (bounded, not the complete policy): “${passage.excerpt}”`;
        result.evidence.push({ ...evidence({ entityType: "dms_document", entityId: p.documentId }, "dms_document_content", null, doc.data.updated_at, doc.data.document_no), accessPurpose: "content", snippet: passage.excerpt });
      }
    }
  }
  result.answer += "\nThis source list is not a quotation, legal interpretation or approval of an exception.";
  return result;
}

/** One admitted, bounded informational turn. No model-generated business writes or SQL. */
export async function answerAssistantQuestion(raw: unknown, callerSignal?: AbortSignal): Promise<{ success: true; data: GuidanceAnswer } | { success: false; error: string; modelCalls?: number }> {
  const parsed = questionSchema.safeParse(raw); if (!parsed.success) return { success: false, error: "Invalid assistant question" };
  const signal = AbortSignal.any([...(callerSignal ? [callerSignal] : []), AbortSignal.timeout(30000)]);
  let attemptedCalls = 0;
  try {
    signal.throwIfAborted(); const ctx = await getAuthContext(); assertSearchPrincipal(ctx);
    if (!hasPermission(ctx, "ai.assistant.use") && !hasPermission(ctx, "ai.assistant.admin")) throw Error("Permission denied");
    const db = await createClient(); if (!await featureEnabled(db)) return { success: true, data: answer("The Assistant is disabled or its availability could not be verified.", "held") };
    const input = parsed.data;
    if (input.context && !await readAuthorizedAssistantEntity(input.context.entityType, input.context.entityId)) throw Error("Permission denied");
    if (isBlockedDangerousRequest(input.question)) return { success: true, data: answer("I can explain or prepare a reviewed draft. Performing this action requires its normal authorised workflow; nothing was changed.", "held") };
    if (isFollowUp(input.question) && !input.context) return { success: true, data: answer("Choose the exact person or document before this follow-up. I will not guess who a pronoun refers to.", "clarification_required") };
    attemptedCalls = deterministicPlan(input.question) ? 0 : 1;
    const { plan, calls } = await planQuestion(input.question, signal); signal.throwIfAborted();
    let result: GuidanceAnswer;
    if (plan.tool === "report" && /\b(?:employees|attendance|leave|payroll|salary|invoices?|finance|orders?|stock|wps|medical)\b/i.test(input.question)) result = answer("That aggregate needs its owning domain's reviewed metric adapter. I will not substitute document counts or invent financial, payroll, medical or stock rules.", "unsupported");
    else if (plan.tool === "report" && /\bby currency\b/i.test(input.question)) result = answer("This grouping has no admitted exact aggregate adapter yet. Select a supported document grouping or use the owning report; no guessed join was used.", "unsupported");
    else if (["documents", "expiry", "report"].includes(plan.tool)) result = await documentQuestion(db, ctx, input, plan, signal);
    else if (plan.tool === "dependents") result = await dependentQuestion(db, ctx, input, signal);
    else if (plan.tool === "policy") result = await policyQuestion(db, input, signal);
    else if (plan.tool === "approval") {
      if (input.context?.entityType !== "dms_document") result = answer("Open the exact document to check its recorded approval state.", "clarification_required");
      else { const r = await readSearchApprovalStatus({ documentId: input.context.entityId, pageSize: 5 }, signal); if (!r.success || !("data" in r) || !r.data || !("routing" in r.data)) throw Error(unavailable);
        result = answer(`Recorded approval status: ${r.data.state?.approvalStatus ?? "Unknown"}. Routing: ${r.data.routing.workflow}. Assigned approver: ${r.data.routing.assignees.map(person=>person.label).join(", ")||"No verified assignment"}. Notification delivery: ${r.data.routing.notificationReadiness}.\n${r.data.holds.join("\n")}\nOpen the normal approval screen; this answer cannot approve or assign a reviewer.`, "held", { links: [{ label: "Open document", route: buildEntityRoute("dms_document", input.context.entityId)! }] }); }
    } else if (plan.tool === "briefing") {
      const r = await getAiDailyDashboard({ scope: "today" }); if (!r.success || !r.data) throw Error(unavailable);
      const sections = r.data.sections.filter(s => s.hasPermission && ["risk", "compliance", "duplicates", "field_suggestions", "dms_processing"].includes(s.code));
      const lines = new Set(sections.flatMap(s => s.isLoaded ? s.kpis.map(k => `${s.title}: ${k.label} — ${k.value}`) : [`${s.title}: unavailable; no all-clear conclusion.`]));
      result = answer(`Today's permitted work briefing (existing dashboard, ${r.data.generatedAt}):\n${[...lines].slice(0, 15).join("\n")}\n${r.data.warnings.join("\n")}\nNo new reminders, schedules or messages were created.`, "partial", { completeness: "preview", links: [{ label: "Open AI daily dashboard", route: "/admin/ai/dashboard" }] });
      if (hasPermission(ctx, "dms.documents.view")) {
        const upcoming = await searchDocuments({ query: "", pageSize: 5, filters: { lifecycle: "current", expiryState: "expiring_soon" } }, ctx, signal);
        if (!upcoming.success || upcoming.data.outcome === "clarification_required") result.answer += "\nRenewal information is unavailable; no all-clear conclusion.";
        else {
          const unique = [...new Map(upcoming.data.rows.map(d => [d.id, d])).values()];
          result.answer += `\n${upcoming.data.totalCount} permitted documents expire within 30 days. Showing up to five existing records:\n${unique.map(d => `${d.document_no}: ${d.expiry_date ?? "Unknown"} — ${expiryStatus(d.expiry_date)}`).join("\n")}`;
          result.evidence = unique.map(d => ({ ...d.provenance, field: "expiry_date" })); result.links.push(...unique.map(d => ({ label: d.document_no, route: d.route })));
        }
      }
    } else if (plan.tool === "record" || plan.tool === "guidance") {
      let selected = input.context;
      if (!selected && plan.tool === "record") {
        const hint = input.question.replace(/['’]s\b/gi, "").replace(/\b(?:what|is|who|the|please|tell|me|show|when|did|join|joining date|employment status|employee status|employee details|company details|branch details|site details)\b/gi, " ").replace(/[?؟]/g, " ").replace(/\s+/g, " ").trim();
        if (hint.length >= 2) { const matches = await resolveSearchSubjects(db, hint, ctx, signal); if (matches.length === 1) selected = { entityType: matches[0].type === "employee_dependent" ? "dependent" : matches[0].type, entityId: matches[0].id }; }
      }
      if (!selected) result = answer("Open or select the exact record so I can use its current context.", "clarification_required");
      else { const row = await readAuthorizedAssistantEntity(selected.entityType, selected.entityId); if (!row) throw Error(unavailable);
        const route = buildEntityRoute(row.reference.entityType, row.reference.entityId);
        let fact = "", factField: string | null = null;
        if (plan.tool === "record" && selected.entityType === "employee" && /\b(joining date|employee status|employment status)\b/i.test(input.question)) {
          factField = /joining date/i.test(input.question) ? "joining_date" : "employee_status";
          const read = await db.from("employees").select(`id,updated_at,${factField}`).eq("id", selected.entityId).is("deleted_at", null).maybeSingle();
          const values = read.data as unknown as Record<string, unknown> | null;
          if (read.error || !values || values.id !== selected.entityId || values.updated_at !== row.version) throw Error("Employee fact source changed");
          fact = `\nRecorded ${factField.replaceAll("_", " ")}: ${values[factField] === null ? "Unknown — not recorded" : z.string().max(100).parse(values[factField])}.`;
        }
        result = answer(plan.tool === "guidance" ? `${row.label} (${row.businessCode ?? "Business reference not recorded"}): open the existing record, review its current evidence and any recovery notice, then use the permitted correction/renewal/review action. Keep any retained request until its outcome is confirmed. Company-specific checklist, reviewers and exceptions require configured policy; no approval or renewal was created.` : `Verified record: ${row.label}. Reference: ${row.businessCode ?? "Not recorded"}. Current source version observed ${row.version}. Ask about a supported fact or open the record; missing fields are not inferred.${fact}`, "available", { links: route ? [{ label: `Open ${row.businessCode ?? row.label}`, route }] : [], evidence: [evidence(row.reference, row.reference.entityType === "company" ? "owner_companies" : row.reference.entityType === "employee" ? "employees" : row.reference.entityType === "dependent" ? "employee_dependents" : row.reference.entityType === "site" ? "work_sites" : row.reference.entityType === "branch" ? "branches" : row.reference.entityType === "party" ? "parties" : "dms_documents", factField, row.version, row.businessCode ?? row.label)], subject: row.reference, replayable: true }); }
    } else result = answer("This question has no reviewed factual adapter. Use the owning ERP module; I cannot invent a metric, policy, financial/medical decision or new module capability.", "unsupported");
    signal.throwIfAborted(); await recheckEvidence(result.evidence); await verifySearchDelivery(ctx);
    const session = await db.rpc("f03_current_session_valid").abortSignal(signal); if (session.error || session.data !== true) throw Error("Permission denied");
    return { success: true, data: { ...result, answer: result.answer.slice(0, 4000), modelCalls: calls } };
  } catch (error) { if (signal.aborted) return { success: false, error: "Assistant read cancelled or deadline exceeded", modelCalls: attemptedCalls }; return { success: false, error: error instanceof Error && error.message === "Permission denied" ? error.message : unavailable, modelCalls: attemptedCalls }; }
}
