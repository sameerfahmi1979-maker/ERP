"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import type {
  HrSearchCategory,
  HrSearchResult,
  HrSearchInput,
  HrSearchOutput,
  HrSearchSuggestion,
} from "@/lib/hr/search/types";

// ============================================================================
// Zod Schema
// ============================================================================

const hrSearchInputSchema = z.object({
  query: z.string().trim().max(200).optional(),
  categories: z
    .array(
      z.enum([
        "employees",
        "candidates",
        "compliance",
        "time",
        "payroll",
        "operations",
        "actions",
        "onboarding",
      ])
    )
    .optional(),
  ownerCompanyId: z.coerce.number().optional(),
  branchId: z.coerce.number().optional(),
  departmentId: z.coerce.number().optional(),
  designationId: z.coerce.number().optional(),
  workSiteId: z.coerce.number().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const PER_CATEGORY_LIMIT = 20;

// ============================================================================
// Helpers
// ============================================================================

function maskDocNumber(val: string | null | undefined): string {
  if (!val) return "—";
  if (val.length <= 4) return "****";
  return val.slice(0, 2) + "****" + val.slice(-2);
}

function safeStr(val: string | null | undefined, fallback = "—"): string {
  return val ?? fallback;
}

// Build employee WHERE clauses for filter scope
async function getScopedEmpIds(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  statuses?: string[]
): Promise<number[]> {
  let q = admin.from("employees").select("id").is("deleted_at", null);
  if (input.ownerCompanyId) q = q.eq("owner_company_id", input.ownerCompanyId);
  if (input.branchId) q = q.eq("branch_id", input.branchId);
  if (input.departmentId) q = q.eq("department_id", input.departmentId);
  if (input.designationId) q = q.eq("designation_id", input.designationId);
  if (statuses) q = q.in("employee_status", statuses);
  const res = await q.limit(5000);
  return (res.data ?? []).map((r: { id: number }) => r.id);
}

// ============================================================================
// Category searchers
// ============================================================================

async function searchEmployees(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  let dbq = admin
    .from("employees")
    .select(
      "id, employee_code, full_name_en, full_name_ar, known_name, mobile_number, personal_email, employee_status, joining_date, owner_company_id, branch_id, department_id, designation_id"
    )
    .is("deleted_at", null)
    .or(
      [
        `employee_code.ilike.%${q}%`,
        `full_name_en.ilike.%${q}%`,
        `full_name_ar.ilike.%${q}%`,
        `known_name.ilike.%${q}%`,
        `mobile_number.ilike.%${q}%`,
        `personal_email.ilike.%${q}%`,
      ].join(",")
    )
    .limit(PER_CATEGORY_LIMIT);

  if (input.ownerCompanyId) dbq = dbq.eq("owner_company_id", input.ownerCompanyId);
  if (input.branchId) dbq = dbq.eq("branch_id", input.branchId);
  if (input.departmentId) dbq = dbq.eq("department_id", input.departmentId);
  if (input.designationId) dbq = dbq.eq("designation_id", input.designationId);
  if (input.status) dbq = dbq.eq("employee_status", input.status);

  const { data } = await dbq;
  return (data ?? []).map((e: {
    id: number; employee_code: string; full_name_en: string; full_name_ar?: string | null;
    known_name?: string | null; mobile_number?: string | null; personal_email?: string | null;
    employee_status: string; joining_date?: string | null;
  }) => {
    const matched: string[] = [];
    if (e.employee_code?.toLowerCase().includes(q)) matched.push("Employee Code");
    if (e.full_name_en?.toLowerCase().includes(q)) matched.push("Name (EN)");
    if (e.full_name_ar?.toLowerCase().includes(q)) matched.push("Name (AR)");
    if (e.known_name?.toLowerCase().includes(q)) matched.push("Known Name");
    if (e.mobile_number?.includes(q)) matched.push("Mobile");
    if (e.personal_email?.toLowerCase().includes(q)) matched.push("Email");

    return {
      id: `emp-${e.id}`,
      category: "employees" as HrSearchCategory,
      entityType: "employee",
      entityId: e.id,
      title: e.full_name_en,
      subtitle: e.employee_code,
      description: e.mobile_number ? `Mobile: ${e.mobile_number}` : undefined,
      status: e.employee_status,
      statusVariant:
        e.employee_status === "active" ? "success" :
        e.employee_status === "probation" ? "warning" :
        e.employee_status === "suspended" ? "danger" : "muted",
      employeeId: e.id,
      employeeCode: e.employee_code,
      employeeName: e.full_name_en,
      date: e.joining_date ?? undefined,
      href: `/admin/hr/employees/record/${e.id}`,
      matchedFields: matched,
    } satisfies HrSearchResult;
  });
}

async function searchCandidates(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  let dbq = admin
    .from("hr_candidates")
    .select("id, candidate_code, full_name_en, full_name_ar, mobile_number, email, candidate_status, pipeline_stage, requisition_id, created_at")
    .is("deleted_at", null)
    .or(
      [
        `candidate_code.ilike.%${q}%`,
        `full_name_en.ilike.%${q}%`,
        `full_name_ar.ilike.%${q}%`,
        `mobile_number.ilike.%${q}%`,
        `email.ilike.%${q}%`,
      ].join(",")
    )
    .limit(PER_CATEGORY_LIMIT);

  if (input.status) dbq = dbq.eq("candidate_status", input.status);
  if (input.dateFrom) dbq = dbq.gte("created_at", input.dateFrom);
  if (input.dateTo) dbq = dbq.lte("created_at", input.dateTo);

  const { data } = await dbq;
  return (data ?? []).map((c: {
    id: number; candidate_code?: string | null; full_name_en: string; full_name_ar?: string | null;
    mobile_number?: string | null; email?: string | null; candidate_status: string;
    pipeline_stage?: string | null; created_at: string;
  }) => {
    const matched: string[] = [];
    if (c.candidate_code?.toLowerCase().includes(q)) matched.push("Candidate Code");
    if (c.full_name_en?.toLowerCase().includes(q)) matched.push("Name");
    if (c.mobile_number?.includes(q)) matched.push("Mobile");
    if (c.email?.toLowerCase().includes(q)) matched.push("Email");

    return {
      id: `cand-${c.id}`,
      category: "candidates" as HrSearchCategory,
      entityType: "candidate",
      entityId: c.id,
      title: c.full_name_en,
      subtitle: c.candidate_code ?? undefined,
      description: c.pipeline_stage ? `Stage: ${c.pipeline_stage}` : undefined,
      status: c.candidate_status,
      statusVariant:
        c.candidate_status === "offer" || c.candidate_status === "hired" ? "success" :
        c.candidate_status === "interview" ? "warning" :
        c.candidate_status === "rejected" || c.candidate_status === "withdrawn" ? "danger" : "muted",
      candidateId: c.id,
      candidateCode: c.candidate_code ?? undefined,
      date: c.created_at.split("T")[0],
      href: `/admin/hr/recruitment/candidates/record/${c.id}`,
      matchedFields: matched,
    } satisfies HrSearchResult;
  });
}

async function searchCompliance(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string,
  canMedical: boolean
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  const empIds = await getScopedEmpIds(admin, input);
  if (empIds.length === 0) return [];

  // Get employee lookup map
  const empRes = await admin.from("employees")
    .select("id, employee_code, full_name_en")
    .in("id", empIds)
    .limit(5000);
  const empMap = new Map((empRes.data ?? []).map((e: { id: number; employee_code: string; full_name_en: string }) => [e.id, e]));

  const results: HrSearchResult[] = [];

  // Identity documents
  const { data: idDocs } = await admin.from("employee_identity_documents")
    .select("id, employee_id, document_type, expiry_date, verification_status")
    .in("employee_id", empIds)
    .or(`document_type.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(10);

  for (const doc of (idDocs ?? []) as { id: number; employee_id: number; document_type: string; expiry_date?: string | null; verification_status: string }[]) {
    const emp = empMap.get(doc.employee_id);
    const today = new Date().toISOString().split("T")[0];
    const isExpired = doc.expiry_date && doc.expiry_date < today;
    results.push({
      id: `comp-id-${doc.id}`,
      category: "compliance",
      entityType: "identity_document",
      entityId: doc.id,
      title: doc.document_type,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${doc.employee_id}`,
      description: `Expiry: ${doc.expiry_date ?? "—"} · Status: ${doc.verification_status}`,
      status: isExpired ? "expired" : doc.verification_status,
      statusVariant: isExpired ? "danger" : doc.verification_status === "verified" ? "success" : "warning",
      employeeId: doc.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: doc.expiry_date ?? undefined,
      href: `/admin/hr/employees/record/${doc.employee_id}`,
      matchedFields: ["Document Type"],
    });
  }

  // Access cards
  const { data: cards } = await admin.from("employee_access_cards")
    .select("id, employee_id, card_type, card_status, valid_to")
    .in("employee_id", empIds)
    .or(`card_type.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(8);

  for (const card of (cards ?? []) as { id: number; employee_id: number; card_type: string; card_status: string; valid_to?: string | null }[]) {
    const emp = empMap.get(card.employee_id);
    results.push({
      id: `comp-card-${card.id}`,
      category: "compliance",
      entityType: "access_card",
      entityId: card.id,
      title: `Access Card — ${card.card_type}`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${card.employee_id}`,
      description: `Status: ${card.card_status} · Expiry: ${card.valid_to ?? "—"}`,
      status: card.card_status,
      statusVariant: card.card_status === "active" ? "success" : "muted",
      employeeId: card.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: card.valid_to ?? undefined,
      href: `/admin/hr/employees/record/${card.employee_id}`,
      matchedFields: ["Card Type"],
    });
  }

  // Training certificates
  const { data: certs } = await admin.from("employee_training_certificates")
    .select("id, employee_id, certificate_name, training_category, expiry_date, certificate_status")
    .in("employee_id", empIds)
    .or(`certificate_name.ilike.%${q}%,training_category.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(8);

  for (const cert of (certs ?? []) as { id: number; employee_id: number; certificate_name: string; training_category?: string | null; expiry_date?: string | null; certificate_status: string }[]) {
    const emp = empMap.get(cert.employee_id);
    const today = new Date().toISOString().split("T")[0];
    const isExpired = cert.expiry_date && cert.expiry_date < today;
    results.push({
      id: `comp-cert-${cert.id}`,
      category: "compliance",
      entityType: "training_certificate",
      entityId: cert.id,
      title: cert.certificate_name,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${cert.employee_id}`,
      description: cert.training_category ? `Category: ${cert.training_category}` : undefined,
      status: isExpired ? "expired" : cert.certificate_status,
      statusVariant: isExpired ? "danger" : cert.certificate_status === "valid" ? "success" : "warning",
      employeeId: cert.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: cert.expiry_date ?? undefined,
      href: `/admin/hr/employees/record/${cert.employee_id}`,
      matchedFields: ["Certificate Name"],
    });
  }

  // Medical (only if permitted)
  if (canMedical) {
    const { data: med } = await admin.from("employee_medical_records")
      .select("id, employee_id, record_type, valid_until, medical_status")
      .in("employee_id", empIds)
      .or(`record_type.ilike.%${q}%`)
      .is("deleted_at", null)
      .limit(5);

    for (const m of (med ?? []) as { id: number; employee_id: number; record_type: string; valid_until?: string | null; medical_status: string }[]) {
      const emp = empMap.get(m.employee_id);
      results.push({
        id: `comp-med-${m.id}`,
        category: "compliance",
        entityType: "medical_record",
        entityId: m.id,
        title: `Medical: ${m.record_type}`,
        subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${m.employee_id}`,
        description: `Expiry: ${m.valid_until ?? "—"}`,
        status: m.medical_status,
        statusVariant: m.medical_status === "fit" ? "success" : m.medical_status === "restricted" ? "warning" : "danger",
        employeeId: m.employee_id,
        employeeCode: emp?.employee_code,
        employeeName: emp?.full_name_en,
        date: m.valid_until ?? undefined,
        href: `/admin/hr/employees/record/${m.employee_id}`,
        matchedFields: ["Medical Record Type"],
      });
    }
  }

  return results.slice(0, PER_CATEGORY_LIMIT);
}

async function searchTime(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  const empIds = await getScopedEmpIds(admin, input, ["active", "probation", "on_leave"]);
  if (empIds.length === 0) return [];

  const empRes = await admin.from("employees").select("id, employee_code, full_name_en").in("id", empIds).limit(5000);
  const empMap = new Map((empRes.data ?? []).map((e: { id: number; employee_code: string; full_name_en: string }) => [e.id, e]));

  const results: HrSearchResult[] = [];

  // Leave requests — search by leave type or employee name
  const { data: leaves } = await admin.from("employee_leave_requests")
    .select("id, employee_id, leave_status, start_date, end_date, leave_type_id, hr_leave_types(leave_type_name)")
    .in("employee_id", empIds)
    .is("deleted_at", null)
    .limit(15);

  for (const lv of (leaves ?? []) as { id: number; employee_id: number; leave_status: string; start_date: string; end_date: string; hr_leave_types: { leave_type_name: string }[] | { leave_type_name: string } | null }[]) {
    const emp = empMap.get(lv.employee_id);
    const typeName = Array.isArray(lv.hr_leave_types)
      ? lv.hr_leave_types[0]?.leave_type_name
      : (lv.hr_leave_types as { leave_type_name: string } | null)?.leave_type_name;
    if (!typeName?.toLowerCase().includes(q) && !emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    results.push({
      id: `time-leave-${lv.id}`,
      category: "time",
      entityType: "leave_request",
      entityId: lv.id,
      title: `Leave: ${typeName ?? "—"}`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${lv.employee_id}`,
      description: `${lv.start_date} → ${lv.end_date}`,
      status: lv.leave_status,
      statusVariant: lv.leave_status === "approved" ? "success" : lv.leave_status === "rejected" ? "danger" : "warning",
      employeeId: lv.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: lv.start_date,
      href: `/admin/hr/time/leave`,
      matchedFields: ["Leave Type", "Employee"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  return results.slice(0, PER_CATEGORY_LIMIT);
}

async function searchPayroll(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  const empIds = await getScopedEmpIds(admin, input, ["active", "probation"]);
  if (empIds.length === 0) return [];

  const empRes = await admin.from("employees").select("id, employee_code, full_name_en").in("id", empIds).limit(5000);
  const empMap = new Map((empRes.data ?? []).map((e: { id: number; employee_code: string; full_name_en: string }) => [e.id, e]));

  const results: HrSearchResult[] = [];

  // WPS profiles (no IBAN/salary — just readiness)
  const { data: wps } = await admin.from("employee_wps_profiles")
    .select("id, employee_id, wps_status, bank_id")
    .in("employee_id", empIds)
    .is("deleted_at", null)
    .limit(20);

  for (const w of (wps ?? []) as { id: number; employee_id: number; wps_status?: string | null; bank_id?: number | null }[]) {
    const emp = empMap.get(w.employee_id);
    if (!emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    const status = w.bank_id ? (w.wps_status ?? "enrolled") : "incomplete";
    results.push({
      id: `pay-wps-${w.id}`,
      category: "payroll",
      entityType: "wps_profile",
      entityId: w.id,
      title: `WPS Profile`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${w.employee_id}`,
      description: `Status: ${status}`,
      status,
      statusVariant: w.bank_id ? "success" : "warning",
      employeeId: w.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      href: `/admin/hr/payroll/wps`,
      matchedFields: ["Employee"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  // Payroll holds
  const { data: holds } = await admin.from("employee_payroll_holds")
    .select("id, employee_id, hold_reason, is_active")
    .in("employee_id", empIds)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(10);

  for (const h of (holds ?? []) as { id: number; employee_id: number; hold_reason?: string | null; is_active: boolean }[]) {
    const emp = empMap.get(h.employee_id);
    if (!emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    results.push({
      id: `pay-hold-${h.id}`,
      category: "payroll",
      entityType: "payroll_hold",
      entityId: h.id,
      title: "Payroll Hold — Active",
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${h.employee_id}`,
      status: "on_hold",
      statusVariant: "danger",
      employeeId: h.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      href: `/admin/hr/payroll/salaries`,
      matchedFields: ["Employee"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  return results.slice(0, PER_CATEGORY_LIMIT);
}

async function searchOperations(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  const empIds = await getScopedEmpIds(admin, input);
  if (empIds.length === 0) return [];

  const empRes = await admin.from("employees").select("id, employee_code, full_name_en").in("id", empIds).limit(5000);
  const empMap = new Map((empRes.data ?? []).map((e: { id: number; employee_code: string; full_name_en: string }) => [e.id, e]));

  const results: HrSearchResult[] = [];

  // Assignments
  const { data: assigns } = await admin.from("employee_assignments")
    .select("id, employee_id, assignment_status, effective_from, work_sites(site_name)")
    .in("employee_id", empIds)
    .is("deleted_at", null)
    .limit(15);

  for (const a of (assigns ?? []) as { id: number; employee_id: number; assignment_status: string; effective_from?: string | null; work_sites: { site_name: string }[] | { site_name: string } | null }[]) {
    const emp = empMap.get(a.employee_id);
    const siteName = Array.isArray(a.work_sites) ? a.work_sites[0]?.site_name : (a.work_sites as { site_name: string } | null)?.site_name;
    if (!emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q) && !siteName?.toLowerCase().includes(q)) continue;
    results.push({
      id: `ops-assign-${a.id}`,
      category: "operations",
      entityType: "assignment",
      entityId: a.id,
      title: `Assignment${siteName ? `: ${siteName}` : ""}`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${a.employee_id}`,
      status: a.assignment_status,
      statusVariant: a.assignment_status === "active" ? "success" : "muted",
      employeeId: a.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: a.effective_from ?? undefined,
      href: `/admin/hr/operations/assignments`,
      matchedFields: ["Employee", "Site"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  // Operational blocks
  const { data: blocks } = await admin.from("employee_operational_blocks")
    .select("id, employee_id, block_reason, is_active, effective_from")
    .in("employee_id", empIds)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(10);

  for (const b of (blocks ?? []) as { id: number; employee_id: number; block_reason?: string | null; is_active: boolean; effective_from?: string | null }[]) {
    const emp = empMap.get(b.employee_id);
    if (!emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    results.push({
      id: `ops-block-${b.id}`,
      category: "operations",
      entityType: "operational_block",
      entityId: b.id,
      title: "Operational Block — Active",
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${b.employee_id}`,
      status: "blocked",
      statusVariant: "danger",
      employeeId: b.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: b.effective_from ?? undefined,
      href: `/admin/hr/operations/blocks`,
      matchedFields: ["Employee"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  return results.slice(0, PER_CATEGORY_LIMIT);
}

async function searchActions(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string,
  canEos: boolean
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();
  const empIds = await getScopedEmpIds(admin, input);
  if (empIds.length === 0) return [];

  const empRes = await admin.from("employees").select("id, employee_code, full_name_en").in("id", empIds).limit(5000);
  const empMap = new Map((empRes.data ?? []).map((e: { id: number; employee_code: string; full_name_en: string }) => [e.id, e]));

  const results: HrSearchResult[] = [];

  // PRO processes
  const { data: pros } = await admin.from("employee_pro_processes")
    .select("id, employee_id, process_type, process_status, reference_number, start_date")
    .in("employee_id", empIds)
    .or(`process_type.ilike.%${q}%,reference_number.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(10);

  for (const p of (pros ?? []) as { id: number; employee_id: number; process_type: string; process_status: string; reference_number?: string | null; start_date?: string | null }[]) {
    const emp = empMap.get(p.employee_id);
    if (!p.process_type?.toLowerCase().includes(q) && !p.reference_number?.toLowerCase().includes(q) && !emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    results.push({
      id: `act-pro-${p.id}`,
      category: "actions",
      entityType: "pro_process",
      entityId: p.id,
      title: `PRO: ${p.process_type}`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${p.employee_id}`,
      description: p.reference_number ? `Ref: ${p.reference_number}` : undefined,
      status: p.process_status,
      statusVariant: p.process_status === "completed" ? "success" : p.process_status === "in_progress" ? "warning" : "muted",
      employeeId: p.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: p.start_date ?? undefined,
      href: `/admin/hr/actions/pro`,
      matchedFields: ["PRO Type", "Reference"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  // HR Actions
  const { data: acts } = await admin.from("employee_hr_actions")
    .select("id, employee_id, action_type, action_status, action_date")
    .in("employee_id", empIds)
    .or(`action_type.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(8);

  for (const a of (acts ?? []) as { id: number; employee_id: number; action_type: string; action_status: string; action_date?: string | null }[]) {
    const emp = empMap.get(a.employee_id);
    if (!a.action_type?.toLowerCase().includes(q) && !emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    results.push({
      id: `act-hr-${a.id}`,
      category: "actions",
      entityType: "hr_action",
      entityId: a.id,
      title: `HR Action: ${a.action_type}`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${a.employee_id}`,
      status: a.action_status,
      statusVariant: a.action_status === "completed" ? "success" : a.action_status === "pending" ? "warning" : "muted",
      employeeId: a.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: a.action_date ?? undefined,
      href: `/admin/hr/employees/record/${a.employee_id}`,
      matchedFields: ["Action Type"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  // Disciplinary (counts only, no description text)
  const { data: disc } = await admin.from("employee_disciplinary_records")
    .select("id, employee_id, incident_subject, disciplinary_status, severity, incident_date")
    .in("employee_id", empIds)
    .or(`incident_subject.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(8);

  for (const d of (disc ?? []) as { id: number; employee_id: number; incident_subject?: string | null; disciplinary_status: string; severity?: string | null; incident_date?: string | null }[]) {
    const emp = empMap.get(d.employee_id);
    if (!d.incident_subject?.toLowerCase().includes(q) && !emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
    results.push({
      id: `act-disc-${d.id}`,
      category: "actions",
      entityType: "disciplinary",
      entityId: d.id,
      title: `Disciplinary${d.severity ? ` — ${d.severity}` : ""}`,
      subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${d.employee_id}`,
      description: d.incident_subject ? `Subject: ${d.incident_subject}` : undefined,
      status: d.disciplinary_status,
      statusVariant: d.disciplinary_status === "closed" ? "muted" : "danger",
      employeeId: d.employee_id,
      employeeCode: emp?.employee_code,
      employeeName: emp?.full_name_en,
      date: d.incident_date ?? undefined,
      href: `/admin/hr/actions/disciplinary`,
      matchedFields: ["Subject"],
    });
    if (results.length >= PER_CATEGORY_LIMIT) break;
  }

  // EOS cases
  if (canEos) {
    const { data: eos } = await admin.from("employee_eos_cases")
      .select("id, employee_id, eos_reason, eos_status, exit_date")
      .in("employee_id", empIds)
      .or(`eos_reason.ilike.%${q}%`)
      .is("deleted_at", null)
      .limit(5);

    for (const e of (eos ?? []) as { id: number; employee_id: number; eos_reason?: string | null; eos_status: string; exit_date?: string | null }[]) {
      const emp = empMap.get(e.employee_id);
      if (!e.eos_reason?.toLowerCase().includes(q) && !emp?.full_name_en?.toLowerCase().includes(q) && !emp?.employee_code?.toLowerCase().includes(q)) continue;
      results.push({
        id: `act-eos-${e.id}`,
        category: "actions",
        entityType: "eos_case",
        entityId: e.id,
        title: `EOS: ${e.eos_reason ?? "—"}`,
        subtitle: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${e.employee_id}`,
        status: e.eos_status,
        statusVariant: e.eos_status === "closed" ? "muted" : "warning",
        employeeId: e.employee_id,
        employeeCode: emp?.employee_code,
        employeeName: emp?.full_name_en,
        date: e.exit_date ?? undefined,
        href: `/admin/hr/actions/eos`,
        matchedFields: ["EOS Reason"],
      });
      if (results.length >= PER_CATEGORY_LIMIT) break;
    }
  }

  return results.slice(0, PER_CATEGORY_LIMIT);
}

async function searchOnboarding(
  admin: ReturnType<typeof createAdminClient>,
  input: HrSearchInput,
  query: string
): Promise<HrSearchResult[]> {
  const q = query.toLowerCase();

  let dbq = admin.from("hr_onboarding_tasks")
    .select("id, candidate_id, task_title, task_category, task_status, due_date, hr_candidates(full_name_en, candidate_code)")
    .is("deleted_at", null)
    .or(`task_title.ilike.%${q}%,task_category.ilike.%${q}%`)
    .limit(PER_CATEGORY_LIMIT);

  if (input.status) dbq = dbq.eq("task_status", input.status);
  if (input.dateFrom) dbq = dbq.gte("due_date", input.dateFrom);
  if (input.dateTo) dbq = dbq.lte("due_date", input.dateTo);

  const { data } = await dbq;
  return (data ?? []).map((t: {
    id: number; candidate_id: number; task_title: string; task_category?: string | null;
    task_status: string; due_date?: string | null;
    hr_candidates: { full_name_en: string; candidate_code?: string | null }[] | { full_name_en: string; candidate_code?: string | null } | null;
  }) => {
    const cand = Array.isArray(t.hr_candidates) ? t.hr_candidates[0] : (t.hr_candidates as { full_name_en: string; candidate_code?: string | null } | null);
    return {
      id: `onboard-${t.id}`,
      category: "onboarding" as HrSearchCategory,
      entityType: "onboarding_task",
      entityId: t.id,
      title: t.task_title,
      subtitle: cand ? `${cand.full_name_en}${cand.candidate_code ? ` (${cand.candidate_code})` : ""}` : `Candidate #${t.candidate_id}`,
      description: t.task_category ? `Category: ${t.task_category}` : undefined,
      status: t.task_status,
      statusVariant: t.task_status === "completed" ? "success" : t.task_status === "blocked" ? "danger" : "warning",
      candidateId: t.candidate_id,
      candidateCode: cand?.candidate_code ?? undefined,
      date: t.due_date ?? undefined,
      href: `/admin/hr/recruitment/candidates/record/${t.candidate_id}`,
      matchedFields: ["Task Title", "Category"],
    } satisfies HrSearchResult;
  });
}

// ============================================================================
// Main searchHr action
// ============================================================================

export async function searchHr(input: HrSearchInput): Promise<HrSearchOutput> {
  const ctx = await getAuthContext();
  const validated = hrSearchInputSchema.parse(input);
  const query = (validated.query ?? "").trim();

  if (!query && !validated.status && !validated.dateFrom && !validated.dateTo) {
    return { results: [], totalCount: 0, groupCounts: {}, query, hasMore: false };
  }

  const admin = createAdminClient();

  const canEmployees = hasPermission(ctx, "hr.employees.view");
  const canRecruitment = hasPermission(ctx, "hr.recruitment.view");
  const canCompliance = hasPermission(ctx, "hr.compliance.view");
  const canMedical = hasPermission(ctx, "hr.medical.view");
  const canAttendance = hasPermission(ctx, "hr.attendance.view");
  const canLeave = hasPermission(ctx, "hr.leave.view");
  const canPayroll = hasPermission(ctx, "hr.payroll.view");
  const canAssignments = hasPermission(ctx, "hr.assignments.view");
  const canActions = hasPermission(ctx, "hr.actions.view");
  const canEos = hasPermission(ctx, "hr.eos.view") || canActions;

  const requestedCats = validated.categories ?? [];
  const wantsCat = (cat: HrSearchCategory) =>
    requestedCats.length === 0 || requestedCats.includes(cat);

  const searchPromises: [HrSearchCategory, Promise<HrSearchResult[]>][] = [];

  if (wantsCat("employees") && canEmployees && query) {
    searchPromises.push(["employees", searchEmployees(admin, validated, query)]);
  }
  if (wantsCat("candidates") && canRecruitment) {
    searchPromises.push(["candidates", searchCandidates(admin, validated, query || "")]);
  }
  if (wantsCat("compliance") && canCompliance && query) {
    searchPromises.push(["compliance", searchCompliance(admin, validated, query, canMedical)]);
  }
  if (wantsCat("time") && (canAttendance || canLeave) && query) {
    searchPromises.push(["time", searchTime(admin, validated, query)]);
  }
  if (wantsCat("payroll") && canPayroll && query) {
    searchPromises.push(["payroll", searchPayroll(admin, validated, query)]);
  }
  if (wantsCat("operations") && canAssignments && query) {
    searchPromises.push(["operations", searchOperations(admin, validated, query)]);
  }
  if (wantsCat("actions") && canActions && query) {
    searchPromises.push(["actions", searchActions(admin, validated, query, canEos)]);
  }
  if (wantsCat("onboarding") && canRecruitment) {
    searchPromises.push(["onboarding", searchOnboarding(admin, validated, query || "")]);
  }

  const settled = await Promise.allSettled(searchPromises.map(([, p]) => p));
  const allResults: HrSearchResult[] = [];
  const groupCounts: Partial<Record<HrSearchCategory, number>> = {};

  searchPromises.forEach(([cat], idx) => {
    const result = settled[idx];
    if (result.status === "fulfilled") {
      const catResults = result.value;
      groupCounts[cat] = catResults.length;
      allResults.push(...catResults);
    }
  });

  const totalCount = allResults.length;
  const paginated = allResults.slice(validated.offset, validated.offset + validated.limit);
  const hasMore = validated.offset + validated.limit < totalCount;

  return { results: paginated, totalCount, groupCounts, query, hasMore };
}

// ============================================================================
// getHrSearchSuggestions
// ============================================================================

export async function getHrSearchSuggestions(
  prefix: string
): Promise<HrSearchSuggestion[]> {
  const ctx = await getAuthContext();
  const q = prefix.trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const admin = createAdminClient();
  const suggestions: HrSearchSuggestion[] = [];

  if (hasPermission(ctx, "hr.employees.view")) {
    const { data } = await admin
      .from("employees")
      .select("id, employee_code, full_name_en")
      .or(`employee_code.ilike.${q}%,full_name_en.ilike.%${q}%`)
      .is("deleted_at", null)
      .limit(5);
    for (const e of (data ?? []) as { id: number; employee_code: string; full_name_en: string }[]) {
      suggestions.push({
        label: e.full_name_en,
        sublabel: e.employee_code,
        href: `/admin/hr/employees/record/${e.id}`,
        category: "employees",
      });
    }
  }

  if (hasPermission(ctx, "hr.recruitment.view")) {
    const { data } = await admin
      .from("hr_candidates")
      .select("id, candidate_code, full_name_en")
      .or(`candidate_code.ilike.${q}%,full_name_en.ilike.%${q}%`)
      .is("deleted_at", null)
      .limit(3);
    for (const c of (data ?? []) as { id: number; candidate_code?: string | null; full_name_en: string }[]) {
      suggestions.push({
        label: c.full_name_en,
        sublabel: c.candidate_code ?? undefined,
        href: `/admin/hr/recruitment/candidates/record/${c.id}`,
        category: "candidates",
      });
    }
  }

  return suggestions.slice(0, 8);
}
